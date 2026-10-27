# fine_report —— 帆软报表 UI 驱动引擎

覆盖平台 5 张 TOF"报表中心"嵌入的帆软报表工具：

| 报表 | 平台工具 id | 现状 RPA |
|---|---|---|
| 未兑付余额明细表 | unpaid-collection | auto_export.py |
| 客户费用明细表 | settlement-freeze | settlement_freeze_export.py |
| 毛利及费用额度计算明细表 | settlement-gross-profit | settlement_gross_profit_export.py |
| 考核调整项明细表 | settlement-adjust | settlement_adjust_export.py |
| 政策补贴查询明细表 | subsidy-tracking | auto_export_subsidy.py |

## 为什么不能纯 API（实测定论）

这 5 张是帆软（FineReport）嵌入页，不在 TOF 网关接口体系内。xfz-survey
2026-10-23 实测：para/submit 纯 HTTP 直连不可行——服务端会话注册/粘滞无法在
浏览器外复刻（SessionID time out），page/data 过不了 Fine-Core_Invalid_CID
校验（cid 是前端生成的 md5#时间戳#随机串，与服务端会话的注册点未定位）。

唯一可行路径 = **UI 驱动**：iframe 内真实键入参数 → 点「查询」→ 捕获
`page/data` 响应 → Python 离线解析。与人工操作服务端行为零差异，
无截图无渲染等待（见 xfz-survey/fr-report-http.py 的实测结论段）。

## 与点"导出"按钮的 RPA 相比

| | 旧 RPA（点导出→下ZIP→解压） | 本引擎 |
|---|---|---|
| 断点位置 | 导出按钮/下载目录/ZIP格式 任一改版即断 | 只脆在"按标签定位输入框"一处 |
| 新报表接入 | 每张重写一套脚本 | reports.py 加一段配置 |
| 数据来源 | 解析下载文件 | page/data HTTP 响应（结构稳定） |

## 使用

```bash
python runner.py --list                          # 看注册表与就绪状态
python runner.py --report baseline --dry-run     # 看配置
python runner.py --report baseline --out 试跑.xlsx
```

凭据：已登录 SSO 的 Chromium 配置档（`--profile` 或环境变量
`FR_BROWSER_PROFILE`，默认 `../../xfz-survey/browser-profile` 同机相对路径）。
SSO 失效特征是 `NO PANGU FRAME`，重跑一次 xfz-survey/survey.py capture。

## 接入平台（逐张验证后逐张接线，每张一行）

在 server.js 的 toolScripts 里把对应工具的 script 指向本引擎即可，例如：

```js
'settlement-freeze': {
  name: '华南大区客户费用明细报表',
  script: path.join(__dirname, 'tof_api', 'fine_report', 'runner.py'),
  // 参数经环境变量传给引擎（FR_REPORT=settlement-freeze）
},
```

⚠️ 接线前必须先在部署机完成对应报表的配置补齐并在页面上核对过一次行数/列名
（runner 的解析结果与页面所见同源，核对成本低）。

## 待办

- [ ] 5 张报表的 page_url / 参数标签补齐（部署机一次浏览器会话，见 reports.py 头注释）
- [ ] 引擎自测：`python runner.py --report baseline`（本机 2026-10-27 跑通即勾）
- [ ] 多页报表翻页捕获（当前与单页渲染对齐；FineReport 分页条"下一页"点击可复用同一捕获机制）
