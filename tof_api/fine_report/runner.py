# -*- coding: utf-8 -*-
"""帆软报表 UI 驱动引擎（fr-report-http.py 模式的通用化）。

为什么是 UI 驱动而不是纯 HTTP：xfz-survey 2026-10-23 实测定论 ——
帆软 para/submit 纯 HTTP 直连不可行（服务端会话注册/粘滞无法在浏览器外复刻，
page/data 过不了 Fine-Core_Invalid_CID 校验）。与人工操作完全一致的
「iframe 内真实键入参数 → 点查询 → 捕获 page/data 响应 → 离线解析」是唯一可行路径。

与点"导出"按钮的 RPA 相比的优势：
  * 不依赖下载链路（ZIP 下载/解压是页面改版最常断的环节）
  * 数据来自 HTTP 响应文本，页面改版只可能脆在「按标签定位输入框」一处
  * 多张报表共享同一引擎，新报表只需在 reports.py 加一段配置

用法：
  python runner.py --list                     # 列出已注册报表
  python runner.py --report baseline --out x.xlsx
  python runner.py --report baseline --dry-run

凭据：依赖已登录 SSO 的 Chromium 配置档（默认 ../xfz-survey/browser-profile，
可用 --profile 或环境变量 FR_BROWSER_PROFILE 覆盖）。SSO 失效时特征是
「NO PANGU FRAME」，重跑一次 xfz-survey/survey.py capture 即可。
"""
import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from openpyxl import Workbook
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


# ---------- 配置模型 ----------

@dataclass
class ParamSpec:
    """一个报表参数：labels 是参数面板标签的候选写法（按序尝试），value 支持占位符。"""
    labels: tuple
    value: str = ''
    optional: bool = False          # 定位不到时跳过（报表改版容错）


@dataclass
class ReportConfig:
    id: str
    name: str
    page_url: str                   # TOF 侧 wrapper 页地址；None = 待部署机抓取补齐
    params: list = field(default_factory=list)
    notes: str = ''


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


def render_value(value, today=None):
    """参数值占位符：{today} → 今天。"""
    today = today or time.strftime('%Y-%m-%d')
    return value.replace('{today}', today)


# ---------- 引擎 ----------

class FineReportRunner:
    def __init__(self, config, browser_profile, headless=False,
                 frame_host='pangu.tcl.com', frame_path='/webroot/'):
        self.config = config
        self.browser_profile = str(Path(browser_profile))
        self.headless = headless
        self.frame_host = frame_host
        self.frame_path = frame_path
        self.data_texts = []                     # 每次 page/data 响应文本
        self.seen_urls = []                      # 诊断：帆软域内最近响应 URL

    def _on_response(self, resp):
        try:
            u = resp.url
            if self.frame_host in u or 'webroot' in u:
                self.seen_urls.append(u[:200])
                del self.seen_urls[:-20]
            if '/v10/page/data?' in u and 'sessionID=' in u:
                self.data_texts.append(resp.text())
        except Exception:                                # noqa: BLE001
            pass

    def _wait_frame(self, page, timeout_s=40):
        """等帆软 iframe 就绪（SSO 302 链 + 报表加载有时超过 15s）。"""
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            fr = next((f for f in page.frames
                       if self.frame_host in f.url and self.frame_path in f.url), None)
            if fr is not None:
                return fr
            page.wait_for_timeout(2000)
        return None

    def _click_query(self, page, fr, timeout_s=20):
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if fr.evaluate(JS_CLICK_QUERY):
                return True
            page.wait_for_timeout(1000)
        return False

    def _find_input_index(self, fr, labels):
        for ls in labels:
            idx = fr.evaluate(JS_FIND_INPUT, list(ls))
            if idx >= 0:
                return idx
        return -1

    def _fill_params(self, page, fr):
        for spec in self.config.params:
            # 参数面板渲染可能晚于 iframe 出现，定位需重试窗口
            idx, deadline = -1, time.time() + 15
            while time.time() < deadline:
                idx = self._find_input_index(fr, spec.labels)
                if idx >= 0:
                    break
                page.wait_for_timeout(1000)
            if idx < 0:
                if spec.optional:
                    continue
                raise RunnerError(
                    f'参数输入框定位失败（labels={spec.labels}）。'
                    '报表参数面板可能已改版，请人工核对标签写法')
            value = render_value(spec.value)
            inp = fr.locator('input').nth(idx)
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

    def _wait_data(self, page, before, timeout_s=60):
        # ⚠️ 必须用 page.wait_for_timeout 而不是 time.sleep：
        # Playwright 同步 API 下 sleep 会阻塞事件循环，response 回调永远不会派发
        # （实测踩坑：sleep 版本连引导查询的 page/data 都捕不到）。
        deadline = time.time() + timeout_s
        while time.time() < deadline and len(self.data_texts) == before:
            page.wait_for_timeout(1500)
        if len(self.data_texts) == before:
            raise RunnerError(
                '未捕获 page/data（查询超时）。帆软域内最近响应：\n  '
                + '\n  '.join(self.seen_urls[-8:]))
        return self.data_texts[-1]

    def run(self, out_path):
        """执行一次查询并写出 xlsx。返回解析出的数据行列表。"""
        if not self.config.page_url:
            raise RunnerError(
                f'报表 {self.config.id}（{self.config.name}）的 page_url 未配置：'
                '在部署机浏览器里点开该报表菜单项，把地址栏 URL 抄进 reports.py 即可')
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=self.browser_profile, headless=self.headless,
                viewport={'width': 1600, 'height': 900})
            try:
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.on('response', self._on_response)
                print(f'打开报表页: {self.config.page_url}', file=sys.stderr)
                page.goto(self.config.page_url, wait_until='domcontentloaded', timeout=60000)
                fr = self._wait_frame(page)
                if fr is None:
                    raise RunnerError(
                        'NO PANGU FRAME：帆软 iframe 未出现。'
                        '多为 SSO 失效（重跑 xfz-survey/survey.py capture）或 wrapper URL 不对')
                # 引导查询：先按默认参数点一次「查询」，等首份 page/data。
                # 作用有二：确认链路通；给参数面板留足渲染/事件绑定时间
                # （实测直接填参点查询会因面板未就绪而空响应，fr-report-http.py 同款流程）。
                if not self._click_query(page, fr):
                    raise RunnerError('查询按钮未找到/点击失败（引导查询）')
                self._wait_data(page, len(self.data_texts), timeout_s=50)
                print('引导查询完成', file=sys.stderr)
                # 正式查询：填参数 → 再点查询 → 捕获新 page/data
                self._fill_params(page, fr)
                before = len(self.data_texts)
                if not self._click_query(page, fr):
                    raise RunnerError('查询按钮未找到/点击失败')
                text = self._wait_data(page, before)
                rows = data_rows(json.loads(text))
                print(f'捕获 page/data：{len(rows)} 行', file=sys.stderr)
                write_xlsx(rows, out_path, title=self.config.name)
                print(f'完成：{len(rows)} 行 → {Path(out_path).resolve()}', file=sys.stderr)
                return rows
            finally:
                ctx.close()


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
    ap.add_argument('--dry-run', action='store_true', help='只打印配置，不启动浏览器')
    ap.add_argument('--list', action='store_true', help='列出已注册报表')
    args = ap.parse_args(argv)

    if args.list:
        for cfg in REPORTS:
            status = 'ready' if cfg.page_url else 'TODO(缺 page_url)'
            print(f'{cfg.id:24s} {cfg.name}  [{status}]')
        return 0

    if not args.report:
        ap.error('需要 --report（--list 查看可选值）')
    cfg = next((c for c in REPORTS if c.id == args.report), None)
    if cfg is None:
        ap.error(f'未知报表 id：{args.report}')

    if args.dry_run:
        print(f'report : {cfg.id} {cfg.name}')
        print(f'url    : {cfg.page_url or "(未配置)"}')
        for spec in cfg.params:
            print(f'param  : labels={spec.labels} value={spec.value!r} optional={spec.optional}')
        return 0

    profile = (args.profile or __import__('os').environ.get('FR_BROWSER_PROFILE', '')
               or Path(__file__).resolve().parents[3] / '系统调查' / 'xfz-survey' / 'browser-profile')
    out = args.out or f'{cfg.id}_{time.strftime("%Y%m%d_%H%M%S")}.xlsx'
    rows = FineReportRunner(cfg, profile, headless=args.headless).run(out)
    return 0 if rows else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except RunnerError as e:
        print(f'[引擎错误] {e}', file=sys.stderr)
        sys.exit(4)
