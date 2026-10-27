# -*- coding: utf-8 -*-
"""帆软报表注册表。

补齐一张报表配置的步骤（在部署机做一次即可，约 5 分钟）：
  1. 浏览器（引擎用的同一配置档）登录 TOF，点开对应菜单项，
     把地址栏 URL 抄进 page_url；
  2. 目测参数面板，把每个筛选的标签文字写进 ParamSpec.labels（多写几个同义
     候选更稳，匹配规则是「输入框左侧兄弟节点的文字包含该标签」）；
  3. python runner.py --report <id> --out 试跑核对行数与列名。

status: ready = 已实测可跑；todo = 待部署机补 page_url/labels。
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

# 平台 5 张帆软报表工具的配置骨架。
# 5 页均为"报表中心"嵌入的帆软页（menu 路由 /report/pages/index.vue），
# 调查产物未覆盖外部报表页（xfz-survey PROGRESS.md B 项），page_url 待部署机抄录。
TODO_5_REPORTS = [
    ReportConfig(
        id='unpaid-collection',
        name='未兑付余额明细表（合同外未兑付）',
        page_url=None,                      # TODO 部署机抄录
        params=[],                          # TODO 补 ParamSpec（法人/产品线/日期等）
        notes='对应平台工具 unpaid-collection，现状 RPA：auto_export.py',
    ),
    ReportConfig(
        id='settlement-freeze',
        name='客户费用明细表',
        page_url=None,                      # TODO
        params=[],
        notes='对应平台工具 settlement-freeze，现状 RPA：settlement_freeze_export.py',
    ),
    ReportConfig(
        id='settlement-gross-profit',
        name='毛利及费用额度计算明细表',
        page_url=None,                      # TODO
        params=[],
        notes='对应平台工具 settlement-gross-profit，现状 RPA：settlement_gross_profit_export.py',
    ),
    ReportConfig(
        id='settlement-adjust',
        name='考核调整项明细表',
        page_url=None,                      # TODO
        params=[],
        notes='对应平台工具 settlement-adjust，现状 RPA：settlement_adjust_export.py',
    ),
    ReportConfig(
        id='subsidy-tracking',
        name='政策补贴查询明细表（来源政策明细）',
        page_url=None,                      # TODO
        params=[],
        notes='对应平台工具 subsidy-tracking，现状 RPA：auto_export_subsidy.py',
    ),
]

REPORTS = [BASELINE] + TODO_5_REPORTS
