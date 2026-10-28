# -*- coding: utf-8 -*-
"""帆软报表 UI 驱动引擎（fr-report-http.py 模式的通用化）。

为什么是 UI 驱动而不是纯 HTTP：xfz-survey 2026-10-23 实测定论 ——
帆软 para/submit 纯 HTTP 直连不可行（服务端会话注册/粘滞无法在浏览器外复刻，
page/data 过不了 Fine-Core_Invalid_CID 校验）。与人工操作完全一致的
「iframe 内真实键入参数 → 点查询 → 捕获 page/data 响应 → 离线解析」是唯一可行路径。

两种运行模式（按 reports.py 里是否配 cpt 自动选择）：
  * cpt 直连（平台 4 张结算报表都用这个）：直接打开帆软 cpt 地址，
    参数走 URL query 直传（帆软原生能力），绕开参数面板 DOM 差异；
  * wrapper 嵌入（BASELINE 基线报表）：打开 TOF 菜单页，按标签定位输入框填参。

直连模式为什么走「大数据集导出」而不是翻页抓 page/data（2026-10-28 实测定论）：
  这几张明细表数据量极大 —— 客户费用明细表单日 1924 行，2 天 1873 行还只是
  翻到第 50 页的中途（按日期倒序，30 页只覆盖到 5 天），整月要几百页、20 分钟
  以上。而报表工具栏自带「大数据集导出」按钮，一次 POST
  /webroot/decision/url/report/v10/direct/export（sessionID 取自当前会话）
  就能把整张表按参数全量导出成 xlsx（单日实测 1924 行 = 全量，不是当前页）。
  所以直连 = 「点查询 → 点大数据集导出 → 收下载文件」，不再解析分页响应。

  注意：直连打开 URL 只预填参数、不会自动查询；必须点「查询」建立带参数的
  会话，否则导出按钮点了没反应（实测 5.4s 过早点击 → 300s 无下载）。
  参数面板要等报表渲染完才出现（约 30-40s），所以查询超时给到 90s。

wrapper 模式的数据通道有两类（同一张报表固定走其中一种）：
  * /v10/page/data   —— 新版前端，JSON 里 pageResult 是单元格组，见 data_rows()
  * op=page_content  —— 经典前端，JSON 里 html 字段是渲染好的表格，见 page_content_rows()

用法：
  python runner.py --list                     # 列出已注册报表
  python runner.py --report settlement-freeze --out x.xlsx
  python runner.py --report settlement-freeze --dry-run
  python runner.py --report settlement-freeze --start-date 2026-10-01 --end-date 2026-10-28

凭据：依赖已登录 SSO 的 Chromium 配置档（默认 ../xfz-survey/browser-profile，
可用 --profile 或环境变量 FR_BROWSER_PROFILE 覆盖）。SSO 失效时特征是
「NO PANGU FRAME」，重跑一次 xfz-survey/survey.py capture 即可。

身份参数 userId/userName（帆软用来算产品线默认值与数据权限）：
  --user-id / --user-name 或环境变量 FR_USER_ID / FR_USER_NAME。
  ⚠️ userId 必须是 TOF 登录名（如 yiming7.xu），不能传工号/数字 ID：帆软按
  userId 做数据权限过滤，2026-10-28 实测同一张表同一个日期，数字 ID 导出 0 行、
  登录名 2968 行，且导出文件仍是「正常表头 + 0 数据行」，不报错，极易误判为
  「报表没数据」。
"""
import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font


# ---------- 浏览器内 JS（与 fr-report-http.py 实测版一致，报表无关） ----------

JS_FIND_INPUT = """
(labels) => {
  const inputs = [...document.querySelectorAll('input')];
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    const r = inp.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    let node = inp;
    for (let up = 0; up < 6 && node; up++) {
      node = node.parentElement;
      if (!node) break;
      const sib = node.previousElementSibling;
      if (sib) {
        const t = (sib.innerText || '').replace(/\\s/g, '');
        for (const L of labels) {
          if (t.includes(L)) return i;
        }
      }
    }
  }
  return -1;
}
"""

JS_CLICK_QUERY = """() => {
  const els = [...document.querySelectorAll('div,span,button')];
  const hit = els.filter(e => (e.innerText || '').trim() === '查询'
                            && e.children.length <= 2);
  if (!hit.length) return false;
  hit[hit.length - 1].click();
  return true;
}"""

JS_CLICK_NEXT = """() => {
  const els = [...document.querySelectorAll('div,span,button,a')];
  const hit = els.filter(e => (e.innerText || '').trim() === '下一页'
                            && e.children.length <= 2);
  if (!hit.length) return false;
  hit[hit.length - 1].click();
  return true;
}"""

JS_CLICK_EXPORT = """() => {
  const els = [...document.querySelectorAll('div,span,button,a')];
  const hit = els.filter(e => (e.innerText || '').trim() === '大数据集导出');
  // 只点可见的那个：按钮容器和文字节点都会命中，不可见的点了不生效
  const vis = hit.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!vis.length) return false;
  vis[vis.length - 1].click();
  return true;
}"""


# ---------- 配置模型 ----------

@dataclass
class ParamSpec:
    """一个报表参数。

    labels：参数面板标签的候选写法（wrapper 模式按标签定位输入框用）；
    key：帆软参数名（cpt 直连模式拼 URL query 用，如 STARTDATE）；
    value 支持占位符 {today} / {month_start}。
    """
    labels: tuple = ()
    value: str = ''
    optional: bool = False          # 定位不到时跳过（报表改版容错）
    key: str = ''                   # 帆软参数名；空则只在 wrapper 模式按标签填


@dataclass
class ReportConfig:
    id: str
    name: str
    page_url: str = ''              # wrapper 模式：TOF 菜单页地址
    params: list = field(default_factory=list)
    notes: str = ''
    cpt: str = ''                   # 直连模式：帆软 cpt 路径（含 FRoutnet/ 前缀）
    data_mode: str = 'bulk'         # 直连取数方式：bulk=大数据集导出，pages=翻页抓响应
    max_pages: int = 30             # pages 模式最多翻多少页（防死循环）


class RunnerError(Exception):
    pass


# ---------- page/data 响应解析（fr-report-http.py 实测版，报表无关） ----------

def cell_value(c):
    raw = c.get('value')
    if not raw:
        return ''
    try:
        return str(json.loads(raw).get('value', '')).strip()
    except Exception:                                        # noqa: BLE001
        return str(raw)


def data_rows(d):
    """把 page/data 响应 dict 解析成 [ {表头名: 值} ]（不含表头/合计/空行）。

    pageResult 每组是一条独立渲染块：行1组=表头，行2组起为数据（帆软扩展
    行多实例复用同一行号坐标，必须按组逐条取，不能按行号合并字典）。
    """
    def cells_map(g):
        m = {}
        for c in g:
            if isinstance(c, dict) and 'cell' in c:
                m[c['cell']] = cell_value(c)
        return m

    def col(k):
        return ''.join(ch for ch in k if ch.isalpha())

    header, data_groups = {}, []
    for g in d.get('pageResult', []):
        if not isinstance(g, list):
            continue
        m = cells_map(g)
        if not m:
            continue
        rowno = int(''.join(ch for ch in next(iter(m)) if ch.isdigit()))
        if rowno == 1:
            for coord, v in m.items():
                header.setdefault(col(coord), v)
        else:
            data_groups.append((rowno, m))

    out = []
    for rowno, m in data_groups:
        if str(m.get(f'A{rowno}', '')).startswith('合计'):
            continue
        row = {header.get(col(k), col(k)): v for k, v in m.items()}
        if not any(row.values()):
            continue
        out.append(row)
    return out


# ---------- page_content 响应解析（经典前端，HTML 表格） ----------

class _TableCollector(HTMLParser):
    """按文档顺序收集所有 table 的行；只取最外层 table（嵌套表的数据在外层 td 里）。"""

    def __init__(self):
        super().__init__()
        self.tables = []
        self._rows = None
        self._row = None
        self._cell = None
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self._depth += 1
            if self._depth == 1:                 # 只收集最外层表格
                self._rows = []
                self.tables.append(self._rows)
        elif tag == 'tr' and self._rows is not None:
            self._row = []
            self._rows.append(self._row)
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag == 'table':
            if self._depth == 1:
                self._rows = None
            self._depth = max(0, self._depth - 1)
        elif tag == 'tr' and self._row is not None:
            self._row = None
        elif tag in ('td', 'th') and self._row is not None and self._cell is not None:
            self._row.append(''.join(self._cell).strip())
            self._cell = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def page_content_rows(text):
    """把 page_content 响应解析成 [ {表头名: 值} ]。

    实测结构（考核调整项明细表）：冻结表头是独立的 1 行 ×N 列表格，
    数据表是另一个 M 行 ×N 列表格。取行数最多的表作数据表，
    再找列数相同、行数==1 的表作表头；找不到就把数据表首行当表头。
    """
    d = json.loads(text)
    c = _TableCollector()
    c.feed(d.get('html', ''))
    tables = [t for t in c.tables if t and any(len(r) for r in t)]
    if not tables:
        return []
    body = max(tables, key=len)
    ncol = max(len(r) for r in body)
    header = None
    for t in tables:
        if t is body:
            continue
        if len(t) == 1 and len(t[0]) == ncol:
            header = t[0]
            break
    if header is None:
        header = body[0]
        body = body[1:]
    out = []
    for r in body:
        if not any(r):
            continue
        if str(r[0]).startswith('合计'):
            continue
        out.append({(header[i] if i < len(header) and header[i] else f'col{i}'): v
                    for i, v in enumerate(r)})
    return out


def render_value(value, today=None):
    """参数值占位符：{today} → 今天，{month_start} → 本月 1 号。"""
    today = today or time.strftime('%Y-%m-%d')
    return (value.replace('{today}', today)
                 .replace('{month_start}', today[:8] + '01'))


# ---------- 引擎 ----------

FR_BASE = 'https://pangu.tcl.com/webroot/decision/view/report'


class FineReportRunner:
    def __init__(self, config, browser_profile, headless=False,
                 frame_host='pangu.tcl.com', frame_path='/webroot/',
                 user_id='', user_name='', start_date='', end_date=''):
        self.config = config
        self.browser_profile = str(Path(browser_profile))
        self.headless = headless
        self.frame_host = frame_host
        self.frame_path = frame_path
        self.user_id = user_id
        self.user_name = user_name
        self.start_date = start_date
        self.end_date = end_date
        self.data_texts = []                     # page/data 响应文本
        self.html_texts = []                     # page_content 响应文本
        self.seen_urls = []                      # 诊断：帆软域内最近响应 URL

    # ----- 响应捕获 -----

    def _on_response(self, resp):
        try:
            u = resp.url
            if self.frame_host in u or 'webroot' in u:
                self.seen_urls.append(u[:200])
                del self.seen_urls[:-20]
            if '/v10/page/data?' in u and 'sessionID=' in u:
                self.data_texts.append(resp.text())
            elif 'op=page_content' in u and 'pn=' in u:
                self.html_texts.append(resp.text())
        except Exception:                                # noqa: BLE001
            pass

    def _captured(self):
        return len(self.data_texts) + len(self.html_texts)

    # ----- 通用浏览器动作 -----

    def _wait_target(self, page, direct, timeout_s=40):
        """直连模式返回主页面；wrapper 模式返回帆软 iframe。"""
        if direct:
            return page
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            fr = next((f for f in page.frames
                       if self.frame_host in f.url and self.frame_path in f.url), None)
            if fr is not None:
                return fr
            page.wait_for_timeout(2000)
        return None

    def _click_query(self, page, target, timeout_s=20):
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                if target.evaluate(JS_CLICK_QUERY):
                    return True
            except Exception:                            # noqa: BLE001
                pass
            page.wait_for_timeout(1000)
        return False

    def _click_next(self, page, target, timeout_s=10):
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                if target.evaluate(JS_CLICK_NEXT):
                    return True
            except Exception:                            # noqa: BLE001
                pass
            page.wait_for_timeout(800)
        return False

    def _click_export(self, page, target, timeout_s=30):
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                if target.evaluate(JS_CLICK_EXPORT):
                    return True
            except Exception:                            # noqa: BLE001
                pass
            page.wait_for_timeout(1000)
        return False

    def _find_input_index(self, target, labels):
        for ls in labels:
            idx = target.evaluate(JS_FIND_INPUT, list(ls))
            if idx >= 0:
                return idx
        return -1

    def _fill_params(self, page, target):
        """wrapper 模式：按标签定位输入框填参。"""
        for spec in self.config.params:
            if not spec.labels:
                continue
            idx, deadline = -1, time.time() + 15
            while time.time() < deadline:
                idx = self._find_input_index(target, spec.labels)
                if idx >= 0:
                    break
                page.wait_for_timeout(1000)
            if idx < 0:
                if spec.optional:
                    continue
                raise RunnerError(
                    f'参数输入框定位失败（labels={spec.labels}）。'
                    '报表参数面板可能已改版，请人工核对标签写法')
            value = render_value(self._param_value(spec))
            inp = target.locator('input').nth(idx)
            inp.click(timeout=5000)
            page.keyboard.press('Control+a')
            if value:
                page.keyboard.type(value, delay=30)
            else:
                page.keyboard.press('Delete')
            page.wait_for_timeout(400)
            cur = inp.input_value()
            if cur != value:
                raise RunnerError(f'参数键入校验失败（labels={spec.labels}）：got {str(cur)[:60]!r}')

    def _param_value(self, spec):
        """CLI 的 --start-date/--end-date 覆盖配置里同名 key 的值。"""
        if spec.key == 'STARTDATE' and self.start_date:
            return self.start_date
        if spec.key == 'ENDDATE' and self.end_date:
            return self.end_date
        return spec.value

    def _wait_data(self, page, before, timeout_s=60):
        # ⚠️ 必须用 page.wait_for_timeout 而不是 time.sleep：
        # Playwright 同步 API 下 sleep 会阻塞事件循环，response 回调永远不会派发
        # （实测踩坑：sleep 版本连引导查询的 page/data 都捕不到）。
        deadline = time.time() + timeout_s
        while time.time() < deadline and self._captured() == before:
            page.wait_for_timeout(1500)
        if self._captured() == before:
            raise RunnerError(
                '未捕获数据响应（查询超时）。帆软域内最近响应：\n  '
                + '\n  '.join(self.seen_urls[-8:]))
        return self._captured()

    # ----- 直连 URL -----

    def direct_url(self):
        q = [('viewlet', self.config.cpt)]
        if self.user_id:
            q.append(('userId', self.user_id))
        if self.user_name:
            q.append(('userName', self.user_name))
        for spec in self.config.params:
            if spec.key:
                q.append((spec.key, render_value(self._param_value(spec))))
        return f'{FR_BASE}?{urlencode(q)}'

    # ----- 解析汇总 -----

    def _rows_from_capture(self, data_texts, html_texts):
        """把捕获到的响应按到达顺序解析成行（两类通道互斥，谁有算谁）。"""
        rows = []
        for t in data_texts:
            rows.extend(data_rows(json.loads(t)))
        for t in html_texts:
            rows.extend(page_content_rows(t))
        return rows

    def _run_pages(self, page, target, first_rows):
        """首份数据已到手，继续翻页直到没有新响应或达上限。"""
        rows = list(first_rows)
        for _ in range(max(0, self.config.max_pages - 1)):
            n_data, n_html = len(self.data_texts), len(self.html_texts)
            before = n_data + n_html
            if not self._click_next(page, target):
                print('未找到「下一页」按钮，按单页结果收尾', file=sys.stderr)
                break
            deadline = time.time() + 25
            while time.time() < deadline and self._captured() == before:
                page.wait_for_timeout(1200)
            if self._captured() == before:
                break                                # 下一页点了但没新响应 = 到底
            rows.extend(self._rows_from_capture(self.data_texts[n_data:],
                                                self.html_texts[n_html:]))
            print(f'翻页 {len(rows)} 行', file=sys.stderr)
        return rows

    def run(self, out_path):
        """执行一次查询并写出 xlsx。返回解析出的数据行列表。"""
        direct = bool(self.config.cpt)
        if not direct and not self.config.page_url:
            raise RunnerError(
                f'报表 {self.config.id}（{self.config.name}）既没配 cpt 也没配 page_url')
        if direct and not self.user_id:
            print('[警告] 未提供 --user-id：帆软会按匿名身份算参数默认值，'
                  '产品线可能只剩 4 项并导致 0 行结果', file=sys.stderr)
        from playwright.sync_api import sync_playwright

        url = self.direct_url() if direct else self.config.page_url
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=self.browser_profile, headless=self.headless,
                viewport={'width': 1600, 'height': 900})
            try:
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.on('response', self._on_response)
                print(f'打开报表页: {url}', file=sys.stderr)
                try:
                    page.goto(url, wait_until='domcontentloaded', timeout=60000)
                except Exception as e:               # noqa: BLE001
                    # 帆软 SSO 302 链会打断 domcontentloaded，属正常
                    if 'ERR_ABORTED' not in str(e):
                        raise
                    page.wait_for_timeout(3000)
                target = self._wait_target(page, direct)
                if target is None:
                    raise RunnerError(
                        'NO PANGU FRAME：帆软 iframe 未出现。'
                        '多为 SSO 失效（重跑 xfz-survey/survey.py capture）或 wrapper URL 不对')
                if not direct:
                    # wrapper 模式：先引导查询让参数面板就绪，再填参
                    if not self._click_query(page, target):
                        raise RunnerError('查询按钮未找到/点击失败（引导查询）')
                    self._wait_data(page, self._captured(), timeout_s=50)
                    print('引导查询完成', file=sys.stderr)
                    self._fill_params(page, target)
                    n_data, n_html = len(self.data_texts), len(self.html_texts)
                    if not self._click_query(page, target):
                        raise RunnerError('查询按钮未找到/点击失败')
                    self._wait_data(page, n_data + n_html)
                    page.wait_for_timeout(1500)
                    first = self._rows_from_capture(self.data_texts[n_data:],
                                                    self.html_texts[n_html:])
                else:
                    # cpt 直连：打开 URL 只预填参数、不会自动查询（实测），
                    # 且参数面板要等报表渲染完才出现（约 30-40s），超时给足
                    if not self._click_query(page, target, timeout_s=90):
                        raise RunnerError(
                            '查询按钮未找到/点击失败（直连）。帆软域内最近响应：\n  '
                            + '\n  '.join(self.seen_urls[-8:]))
                    self._wait_data(page, 0, timeout_s=90)
                    if self.config.data_mode == 'bulk':
                        print('查询完成，开始大数据集导出', file=sys.stderr)
                        with page.expect_download(timeout=600000) as dl_info:
                            if not self._click_export(page, target):
                                raise RunnerError(
                                    '未找到「大数据集导出」按钮。该报表可能没开导出功能，'
                                    '需人工在报表工具栏确认')
                        dl_info.value.save_as(out_path)
                        rows = read_xlsx(out_path)
                        if not rows:
                            print('[警告] 导出文件只有表头、0 数据行。先查 userId：'
                                  '帆软用它做数据权限过滤，必须是 TOF 登录名'
                                  '（如 yiming7.xu），传工号/数字 ID 会查不到任何数据'
                                  '（2026-10-28 实测：数字 ID → 0 行，登录名 → 正常）',
                                  file=sys.stderr)
                        print(f'导出完成：{len(rows)} 行 → {Path(out_path).resolve()}',
                              file=sys.stderr)
                        return rows
                    print('查询完成，开始翻页聚合', file=sys.stderr)
                    first = self._rows_from_capture(self.data_texts, self.html_texts)
                # wrapper 模式：翻页聚合（首份数据 + 后续页）
                rows = self._run_pages(page, target, first)
                print(f'捕获完成：{len(rows)} 行', file=sys.stderr)
                write_xlsx(rows, out_path, title=self.config.name)
                print(f'完成：{len(rows)} 行 → {Path(out_path).resolve()}', file=sys.stderr)
                return rows
            finally:
                try:
                    ctx.close()
                except Exception:                # noqa: BLE001
                    pass    # 产物已落盘，浏览器被人手动关掉不该让整次运行判失败


def read_xlsx(path):
    """读回导出的 xlsx，返回 [ {表头名: 值} ]（跳过全空行）。

    大数据集导出的文件 <dimension ref="A1"/> 是假的（openpyxl read_only
    会只读到 1 行 1 列），所以不能开 read_only。
    """
    wb = load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    try:
        header = [str(h).strip() if h is not None else '' for h in next(it)]
    except StopIteration:
        return []
    out = []
    for vals in it:
        if not any(v not in (None, '') for v in vals):
            continue
        out.append({header[i] if i < len(header) and header[i] else f'col{i}': v
                    for i, v in enumerate(vals)})
    return out


def write_xlsx(rows, out_path, title='帆软报表'):
    headers = []
    for row in rows:
        for k in row:
            if k not in headers:
                headers.append(k)
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31] or '帆软报表'
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
    for row in rows:
        ws.append([row.get(h, '') for h in headers])
    for idx, name in enumerate(headers, start=1):
        ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = \
            max(10, min(60, len(name) * 2 + 4))
    wb.save(out_path)


# ---------- CLI ----------

def main(argv=None):
    from reports import REPORTS

    ap = argparse.ArgumentParser(description='帆软报表 UI 驱动查询')
    ap.add_argument('--report', help='报表 id（见 --list）')
    ap.add_argument('--out', default='', help='输出 xlsx 路径')
    ap.add_argument('--profile', default='',
                    help='Chromium 配置档目录（默认环境变量 FR_BROWSER_PROFILE 或 ../xfz-survey/browser-profile）')
    ap.add_argument('--headless', action='store_true', help='无头模式（默认有头，帆软 SSO 场景建议有头）')
    ap.add_argument('--user-id', default=os.environ.get('FR_USER_ID', ''),
                    help='帆软身份 userId（或环境变量 FR_USER_ID）')
    ap.add_argument('--user-name', default=os.environ.get('FR_USER_NAME', ''),
                    help='帆软身份 userName（或环境变量 FR_USER_NAME）')
    ap.add_argument('--start-date', default='', help='覆盖参数 STARTDATE（YYYY-MM-DD）')
    ap.add_argument('--end-date', default='', help='覆盖参数 ENDDATE（YYYY-MM-DD）')
    ap.add_argument('--max-pages', type=int, default=0, help='最多翻页数（0=用报表配置）')
    ap.add_argument('--dry-run', action='store_true', help='只打印配置，不启动浏览器')
    ap.add_argument('--list', action='store_true', help='列出已注册报表')
    args = ap.parse_args(argv)

    if args.list:
        for cfg in REPORTS:
            status = 'ready(cpt 直连)' if cfg.cpt else (
                'ready(wrapper)' if cfg.page_url else 'TODO(缺 cpt/page_url)')
            print(f'{cfg.id:26s} {cfg.name}  [{status}]')
        return 0

    if not args.report:
        ap.error('需要 --report（--list 查看可选值）')
    cfg = next((c for c in REPORTS if c.id == args.report), None)
    if cfg is None:
        ap.error(f'未知报表 id：{args.report}')
    if args.max_pages:
        cfg.max_pages = args.max_pages

    if args.dry_run:
        runner = FineReportRunner(cfg, '', user_id=args.user_id or '{user-id}',
                                  user_name=args.user_name or '{user-name}',
                                  start_date=args.start_date, end_date=args.end_date)
        print(f'report : {cfg.id} {cfg.name}')
        print(f'cpt    : {cfg.cpt or "(无，走 wrapper)"}')
        print(f'url    : {runner.direct_url() if cfg.cpt else cfg.page_url}')
        print(f'mode   : {cfg.data_mode if cfg.cpt else "wrapper"}')
        print(f'max_pg : {cfg.max_pages}')
        for spec in cfg.params:
            print(f'param  : key={spec.key!r} labels={spec.labels} '
                  f'value={runner._param_value(spec)!r} optional={spec.optional}')
        return 0

    profile = (args.profile or os.environ.get('FR_BROWSER_PROFILE', '')
               or Path(__file__).resolve().parents[3] / '系统调查' / 'xfz-survey' / 'browser-profile')
    out = args.out or f'{cfg.id}_{time.strftime("%Y%m%d_%H%M%S")}.xlsx'
    rows = FineReportRunner(cfg, profile, headless=args.headless,
                            user_id=args.user_id, user_name=args.user_name,
                            start_date=args.start_date,
                            end_date=args.end_date).run(out)
    # 平台侧约定（issue #6 口径 A）：脚本只产文件，把绝对路径打到 stdout，
    # 由 server.js 抓这条路径统一投递飞书。其余进度信息一律走 stderr。
    print(f'产物：{Path(out).resolve()}')
    return 0 if rows else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except RunnerError as e:
        print(f'[引擎错误] {e}', file=sys.stderr)
        sys.exit(4)
