# -*- coding: utf-8 -*-
"""帆软报表注册表。

平台侧 5 个报表工具里，4 张是帆软报表、1 张不是。配置来源：2026-10-28 从 TOF
菜单接口 `_iam_tcl_v1_18_menus_tree_*.json` 的 description 字段直接取到帆软
cpt 真实路径，不再依赖部署机人工抄 URL。

两种模式（改 runner.py 头部说明）：
  * cpt 直连 —— 参数走 URL query（STARTDATE/ENDDATE），4 张帆软报表统一用这个；
  * wrapper 嵌入 —— 打开 TOF 菜单页按标签填参，仅 BASELINE 自测用。

直连取数再分两种（data_mode）：bulk = 工具栏「大数据集导出」下 xlsx；
pages = 无导出按钮，翻页抓 op=page_content。

status: ready = 已实测可跑；empty = 通道正常但报表当前无数据；
blocked = 报表自身参数不可满足，取不到数（原因见 notes）。

⚠️ 所有直连报表都依赖 --user-id 传 TOF 登录名（如 yiming7.xu）。帆软按 userId
做数据权限过滤，传数字 ID 不会报错，但导出文件只剩「表头 + 0 数据行」。
"""
from runner import ParamSpec, ReportConfig

# 已实测基线：订单财务报表-已收（fr-report-http.py 验证过整条链路的页面），
# 引擎自测/回归用。订单编号取调查时的基线单。
BASELINE = ReportConfig(
    id='baseline',
    name='订单财务报表-已收（引擎自测基线）',
    page_url='https://tof.tcl.com/#/tcl/tof/order/order-report/'
             'order_sales_financial_report_received_1',
    params=[ParamSpec(labels=(('订单编号', '订单单号'), ('订单单号', '订单编号')),
                      value='S1011261023008481')],
    notes='status: ready。2026-10-23 由 fr-report-http.py 实测通过（改参数查询+清空大查询）。',
)

# 4 张帆软报表（cpt 直连）。参数名统一 STARTDATE/ENDDATE，日期默认本月 1 号 → 今天，
# 可由 CLI --start-date/--end-date 覆盖（server.js 正是按这两个参数透传）。
SETTLEMENT_REPORTS = [
    ReportConfig(
        id='settlement-freeze',
        name='客户费用明细表',
        cpt='FRoutnet/electric/tof/tof_settlement/settlement_freeze_detail.cpt',
        params=[ParamSpec(key='STARTDATE', value='{month_start}'),
                ParamSpec(key='ENDDATE', value='{today}')],
        notes='status: ready。data_mode=bulk（工具栏「大数据集导出」）。'
              '2026-10-28 实测单日 2968 行、整月（10-01~10-28）87516 行。'
              'platform: settlement-freeze。',
    ),
    ReportConfig(
        id='settlement-gross-profit',
        name='毛利及费用额度计算明细表',
        cpt='FRoutnet/electric/tof/tof_settlement/settlement_gross_profit_detail.cpt',
        params=[ParamSpec(key='STARTDATE', value='{month_start}'),
                ParamSpec(key='ENDDATE', value='{today}')],
        notes='status: ready。data_mode=bulk（工具栏「大数据集导出」）。'
              '2026-10-28 实测单日（10-20）36419 行、整月（10-01~10-28）410284 行。'
              'platform: settlement-gross-profit。',
    ),
    ReportConfig(
        id='settlement-adjust',
        name='考核调整项明细表',
        cpt='FRoutnet/electric/tof/tof_settlement/settlement_adjust_project.cpt',
        params=[ParamSpec(key='STARTDATE', value='{month_start}'),
                ParamSpec(key='ENDDATE', value='{today}')],
        data_mode='pages',              # 工具栏只有「导出」，无「大数据集导出」
        max_pages=60,
        notes='status: empty。data_mode=pages（op=page_content）。查询能正常发出，'
              '但 2026-07/08/09/10 四个月实测都只有表头、0 数据行 —— 该报表'
              '「数据更新时间」为空，业务口径上本就多数月份无数据。'
              'platform: settlement-adjust。',
    ),
    ReportConfig(
        id='subsidy-tracking',
        name='政策补贴查询明细表（来源政策明细）',
        cpt='FRoutnet/electric/tof/tof_settlement/settlement_source_policy_detail.cpt',
        params=[ParamSpec(key='STARTDATE', value='{month_start}'),
                ParamSpec(key='ENDDATE', value='{today}')],
        data_mode='pages',
        max_pages=60,
        notes='status: blocked。产品线控件 placeholder="必选"，而其选项接口 '
              'POST op=widget&widgetname=product_line_code 返回空数组 []'
              '（只有「全选/不选」空壳），选不了值 → 帆软前端直接拦截查询，'
              '一个请求都不发。需报表维护方补产品线选项数据后再接入。'
              'platform: subsidy-tracking。',
    ),
]

# 不是帆软，本引擎不适用。
# 菜单 description 指向 https://data.tcl.com/databi/pc/dashboard/publish/
# 36b2b06d-9688-4a60-9adb-de9ef8982dcd —— 实测是 Databi BI 看板（iframe 即看板本身），
# 没有帆软 cpt 也没有 STARTDATE/ENDDATE 查询入口，仍由原 RPA（auto_export.py）负责。
NOT_FINEREPORT = [
    ReportConfig(
        id='unpaid-collection',
        name='未兑付余额明细表（合同外未兑付）',
        notes='非帆软：data.tcl.com Databi 看板，引擎不适用。platform: unpaid-collection。',
    ),
]

REPORTS = [BASELINE] + SETTLEMENT_REPORTS + NOT_FINEREPORT
