# -*- coding: utf-8 -*-
"""兑现申请单据查询 —— TOF 接口直连版（替代 tof_cash_export.py 的浏览器 RPA）。

流程：表单 POST /api/settlement/v1/{t}/feeCashMain/getPage 翻页拉数
      → openpyxl 写 xlsx 到本地。
不点页面上的"导出"按钮（该按钮在调查手册里标记为写操作），数据全部来自查询接口，
天然绕开 ZIP 下载/解压链路；单次请求秒级返回，无需等待浏览器渲染。

无参运行（平台 toolScripts 调用方式）使用默认口径：宁波法人 + 近 90 天；
手动运行可用参数覆盖：
  python cash_query.py --start 2026-09-28 --end 2026-10-27 --company-code 0528
  python cash_query.py --dry-run          # 只打印最终请求，不发

已知边界（详见同目录 README.md）：
  * 审批状态筛选的参数名未抓包确认，暂不传该筛选 —— 结果会混入非"审批中"单据，
    xlsx 已含审批状态列，本地筛即可；
  * 日期区间必填且 ≤ 3 个月，超限服务端不报错、只返回空结果；
  * companyCode=0528 实测会带出"宁波"与"惠州酷友"两个法人名，口径与页面核对后可再收紧。
"""
import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

from client import AuthExpired, GATEWAY, TENANT_ID, TofClient, TofError

ENDPOINT = '/api/settlement/v1/{t}/feeCashMain/getPage'


def build_url(path):
    """与 TofClient.url 相同的占位符替换，供 --dry-run 免凭据使用。"""
    for ph in ('{t}', '{p}'):
        if ph in path:
            path = path.replace(ph, TENANT_ID, 1)
            break
    return GATEWAY + path

# (xlsx 列名, 响应字段)
COLUMNS = [
    ('单据编号', 'docNumber'),
    ('标题', 'docSubject'),
    ('法人', 'companyName'),
    ('审批状态', 'processStatusName'),
    ('结算客户', 'settleCustName'),
    ('申请金额', 'applyMoney'),
    ('审批金额', 'agreeMoney'),
    ('创建时间', 'creationDate'),
    ('创建人', 'creatorName'),
    ('营销组织', 'salesOrgName'),
    ('当前处理人', 'currentProcessor'),
    ('单据ID', 'id'),
]

# RPA 版的固定口径：法人 TCL智能科技（宁波）有限公司
DEFAULT_COMPANY_CODE = '0528'
MAX_SPAN_DAYS = 89          # 服务端约束：时间区间不可超 3 个月
PAGE_SIZE = 100             # 服务端会按自己的规则收敛，响应里以实际 size 为准


def parse_args(argv=None):
    today = date.today()
    p = argparse.ArgumentParser(description='兑现申请单据查询（TOF 接口直连）')
    p.add_argument('--company-code', default=DEFAULT_COMPANY_CODE,
                   help=f'法人编码（默认 {DEFAULT_COMPANY_CODE}）')
    p.add_argument('--product-line-code', default='',
                   help='产品线编码（页面抓包确认的筛选参数，可选）')
    p.add_argument('--sales-org-code', default='',
                   help='营销组织编码（页面抓包确认的筛选参数，可选）')
    p.add_argument('--start', default=(today - timedelta(days=MAX_SPAN_DAYS)).isoformat(),
                   help='填单日期起 YYYY-MM-DD（默认近 90 天）')
    p.add_argument('--end', default=today.isoformat(),
                   help='填单日期止 YYYY-MM-DD（默认今天）')
    p.add_argument('--max-pages', type=int, default=50,
                   help=f'最多翻页数（默认 50 页 × {PAGE_SIZE} 条，防止意外全量）')
    p.add_argument('--out', default='',
                   help='输出 xlsx 路径（默认 兑现申请单据查询_<时间戳>.xlsx）')
    p.add_argument('--auth-file', default='',
                   help='auth.json 路径（默认读环境变量 TOF_AUTH_JSON / TOF_BEARER_TOKEN）')
    p.add_argument('--dry-run', action='store_true',
                   help='只打印最终请求参数，不实际发请求')
    return p.parse_args(argv)


def validate_dates(start: date, end: date):
    if start > end:
        raise SystemExit(f'[参数错误] --start {start} 晚于 --end {end}')
    if (end - start).days > MAX_SPAN_DAYS:
        raise SystemExit(
            f'[参数错误] 日期区间 {(end - start).days} 天超过服务端 3 个月上限；'
            f'超限时服务端不报错、只返回空结果，请缩小区间后分批查询')


def build_form(args, page):
    form = {
        'startDate': args.start,
        'endDate': args.end,
        'page': page,
        'size': PAGE_SIZE,
    }
    if args.company_code:
        form['companyCode'] = args.company_code
    if args.product_line_code:
        form['productLineCode'] = args.product_line_code
    if args.sales_org_code:
        form['salesOrgCode'] = args.sales_org_code
    return form


def fetch_all(client, form, max_pages):
    """翻页拉全量。返回 (rows, total)。进度写 stderr，stdout 保持纯数据。"""
    rows, total = [], None
    for page in range(max_pages):
        data = client.post_form(ENDPOINT, {**form, 'page': page})
        if not isinstance(data, dict) or 'content' not in data:
            raise TofError(f'响应不是分页结构（第 {page} 页）：{str(data)[:200]}')
        total = data.get('totalElements', total)
        batch = data.get('content') or []
        rows.extend(batch)
        print(f'[page {page}] 本页 {len(batch)} 条 / 累计 {len(rows)} / 服务端总数 {total}',
              file=sys.stderr)
        if len(batch) < (data.get('size') or PAGE_SIZE):
            break                      # 最后一页
    return rows, total


def write_xlsx(rows, out_path):
    wb = Workbook()
    ws = wb.active
    ws.title = '兑现申请单据'
    ws.append([name for name, _ in COLUMNS])
    for c in ws[1]:
        c.font = Font(bold=True)
    for row in rows:
        ws.append([row.get(field) for _, field in COLUMNS])
    for idx, (name, _) in enumerate(COLUMNS, start=1):
        width = max(10, min(60, len(name) * 2 + 4))
        ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = width
    wb.save(out_path)


def main(argv=None):
    args = parse_args(argv)
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    validate_dates(start, end)
    form = build_form(args, page=0)

    if args.dry_run:
        print(f'POST {build_url(ENDPOINT)}')
        print(f'请求体(表单): {form}')
        return 0

    client = TofClient(auth_file=args.auth_file or None)
    t0 = time.time()
    rows, total = fetch_all(client, form, args.max_pages)
    if total is not None and len(rows) < total:
        print(f'[提示] 已按 --max-pages={args.max_pages} 截断：'
              f'拉到 {len(rows)} / 总数 {total}，需要全量请调大 --max-pages',
              file=sys.stderr)

    out = Path(args.out) if args.out else Path(
        f'兑现申请单据查询_{end.strftime("%Y%m%d")}_{time.strftime("%H%M%S")}.xlsx')
    write_xlsx(rows, out)
    print(f'完成：{len(rows)} 条 → {out.resolve()}（耗时 {time.time() - t0:.1f}s）')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except AuthExpired as e:
        print(f'[认证失效] {e}', file=sys.stderr)
        sys.exit(3)
    except TofError as e:
        print(f'[接口错误] {e}', file=sys.stderr)
        sys.exit(4)
