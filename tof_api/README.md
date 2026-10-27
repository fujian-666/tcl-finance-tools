# tof_api —— TOF 网关接口直连

让平台工具**不开浏览器**直接调 TOF（tof.tcl.com）网关接口。接口配方来自
xfz-survey 逆向调查产物（1989 接口静态目录 + 558 页实测抓包 + 中文标注手册）。

## 已迁移工具

### 兑现申请单据查询（cash-application-query）

替代原 `tof_cash_export.py` 的 Playwright RPA（登录→进页面→点导出→下 ZIP→解压）。

- 接口：`POST /api/settlement/v1/{t}/feeCashMain/getPage`（兑现申请单据列表页的查询接口）
- 请求体：**表单编码**（JSON body 会被服务端静默忽略筛选参数——实测踩过）
- 必填：`startDate`/`endDate`，区间 ≤ 3 个月（超限不报错、只返回空结果）
- 输出：xlsx（单据编号/标题/法人/审批状态/结算客户/申请金额/审批金额/营销组织/当前处理人等 12 列）
- 实测（2026-10-27）：全量 133,561 条；`companyCode=0528` + 近 30 天 → 3,748 条，秒级返回

### 凭据配置（.env）

```
TOF_AUTH_JSON=<xfz-survey>/auth.json     # 或
TOF_BEARER_TOKEN=<浏览器 devtools 里 Authorization 头的值>
```

token 几小时过期；`401/403` 时脚本以退出码 3 结束并提示更新。

## 待办 / 已知边界

- [ ] **审批状态筛选参数名未确认**：页面抓包时该筛选为空，`approval_status`/
      `processStatusName`/`approveStatus`/`processStatus` 四个候选实测均被服务端忽略。
      补齐方式：在 cash-list 页面选"审批中"查一次抓 body，然后到
      `cash_query.py: build_form` 加一行。当前版本不传该筛选，xlsx 里带审批状态列供本地筛。
- [ ] `companyCode=0528` 实测带出"宁波"与"惠州酷友"两个法人名，与页面口径核对后可再收紧。
- [ ] token 自动续期（xfz.py refresh 思路：SSO 长效 cookie 免登换新 token）。

## 其余 TOF 报表工具为何没迁

来源政策明细/客户费用明细/毛利及费用/调整项明细/未兑付余额 5 张报表是
**帆软（FineReport）嵌入页**（pangu.tcl.com），纯 HTTP 已被 xfz-survey 实测判死
（SessionID 粘滞 + Fine-Core_Invalid_CID 校验），升级路径是 UI 驱动提交+响应捕获
（fr-report-http.py 模式），另立 PR。
