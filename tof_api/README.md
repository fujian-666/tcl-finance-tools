# tof_api —— TOF 网关接口直连

让平台工具**不开浏览器**直接调 TOF（tof.tcl.com）网关接口。接口配方来自
xfz-survey 逆向调查产物（1989 接口静态目录 + 558 页实测抓包 + 中文标注手册）。

## 已迁移工具

### 兑现申请单据查询（cash-application-query）

替代原 `tof_cash_export.py` 的 Playwright RPA（登录→进页面→点导出→下 ZIP→解压）。

- 接口：`POST /api/settlement/v1/{t}/feeCashMain/getPage`（兑现申请单据列表页的查询接口）
- 请求体：**表单编码**（JSON body 会被服务端静默忽略筛选参数——实测踩过）
- 提交方式：页面实际把 `page`/`size` 同时带在 query 和表单里；本脚本只放表单，已实测生效
- 输出：xlsx（单据编号/标题/法人/审批状态/结算客户/申请金额/审批金额/营销组织/当前处理人等 12 列）
- 实测（2026-10-27）：全量 133,561 条；`companyCode=0528` + 近 30 天 → 3,748 条，秒级返回

#### 默认筛选口径（与原 RPA `FILTERS` 四项对齐，全部实测生效）

| 维度 | 参数 | 默认值 | 含义 |
|---|---|---|---|
| 法人 | `companyCode` | `0528` | TCL智能科技（宁波）有限公司 |
| 审批状态 | `processStatusCodes` | `30` | 审批中 |
| 产品线 | `productLineCode` | `PL002` | TCL_空调产品线 |
| 营销组织 | `salesOrgCode` | `A001040000` | 华南大区 |

实测对照（区间 2026-08-01 ~ 2026-10-27）：全不加=10,986 条；四条件全加=**513 条**；
再加 `processStatusCodes=30`=**89 条**（全部 审批中 / 全部宁波法人 / 5 个华南战区）。

- `processStatusCodes` 是**复数**，多个状态用**英文逗号**分隔（`30,40` 实测 493 条；
  用分号 `30;40` 返回 0 条）。枚举来自页面 `ASSIGN_STATUS`：
  `10 已驳回 / 20 编辑中 / 30 审批中 / 40 已审批 / 50 已取消`。
  此前 README 里列的 `approval_status`/`processStatusName`/`approveStatus`/`processStatus`
  四个单数候选**都不存在**，服务端一律静默忽略——这是当时"参数名未确认"的根因。
- 营销组织编码来自登录账号的组织树（`localStorage.clientSalesOrg`，461 个节点），
  `华南大区` 的 `salesOrgCode=A001040000`（L3，父级「网络大区」）。换账号/换大区
  需要改默认值，或用 `--sales-org-code` 覆盖。
- `--dry-run` 会打印**最终生效的全部筛选条件**，上线前可逐项核对。

#### 翻页与失败语义

- `size=500`（服务端实测接受 500/1000），一直翻到 `len(rows) == totalElements`；
- 触到 `--max-pages`（默认 200 页 × 500 = 10 万条安全阀）仍未拉全 → **退出码 5，
  且不写 xlsx**，不会产出"看起来完整实则截断"的假报表（旧版 `--max-pages=50` 会）；
- 日期跨度服务端实测**不限制**（2020-01-01 ~ 2026-10-27 无筛选返回 5,650 条、HTTP 200），
  旧 README "超 3 个月静默返回空"的说法对 `getPage` 不成立；超过一年只提示不阻断；
- 拉完做一次自检：筛了审批状态但结果 0% 命中 → 退出码 4（防止参数被服务端忽略后静默出错数）。

#### 飞书口径

口径已定：**工具只产文件，发送由平台统一负责**（[issue #6](https://github.com/fujian-666/tcl-finance-tools/issues/6)
决策 A，平台侧实现见 [PR #7](https://github.com/fujian-666/tcl-finance-tools/pull/7)）。

- 本脚本只落本地 xlsx，并在最后一行 stdout 打印**绝对路径**；不读飞书凭据、不发起发送；
- 平台侧（`server.js` + `lib/lark.js`）在 `exitCode === 0` 且从日志解析到产物路径时，
  用 `.env` 的 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_NOTIFY_OPEN_ID` 上传并发送；
- `--no-lark` 是平台对个别工具透传的约定参数，本脚本接受但忽略（无副作用）；
- 发送失败不吞：平台写日志 + UI 提示，产物路径仍然可见可下载；
- 后续 5 张帆软报表迁移沿用同一口径，脚本侧均不实现发送。

### 凭据配置（.env）与自动续期

```
TOF_AUTH_JSON=<xfz-survey>/auth.json     # 或
TOF_BEARER_TOKEN=<浏览器 devtools 里 Authorization 头的值>
```

token 几小时过期。**过期不再需要人工更新**：脚本收到 `401/403` 时自动开一次
后台浏览器免登续期（SSO cookie 长效，机制同 `xfz.py refresh`），拿到新 token
写回凭据文件并重试一次，全程无需人工介入：

- 凭据读取/写回优先级：`--auth-file` > `TOF_AUTH_JSON` >
  续期缓存 `%LOCALAPPDATA%\tcl-finance-tools\tof-auth.json` > `TOF_BEARER_TOKEN`；
  续期永远写回配置指向的文件，没有文件凭据时写缓存（下次运行自动生效）；
- 浏览器配置目录：`%LOCALAPPDATA%\tcl-finance-tools\tof-profile`（可用
  `TOF_BROWSER_PROFILE` 覆盖；仓外，不进版本库）。首次续期自动创建；
- `--no-renew` 关闭自动续期；`--renew-headful` 弹出可见浏览器——仅当
  **SSO 登录态本身也过期**（少见，浏览器会停在登录页）时用它手动登录一次；
- 续期失败 → 退出码 3，错误信息含上述操作提示；`renew.py` 也可单独运行调试：
  `python renew.py [--headful]`。

## 待办 / 已知边界

- [x] 审批状态筛选：`processStatusCodes`（逗号分隔多值）已实测生效，默认 `30`
- [x] 产品线/营销组织默认值：`PL002` / `A001040000` 已实测生效
- [x] token 自动续期：SSO 免登续期 + 过期自动重试（`tof_api/renew.py`）
- [ ] `companyCode=0528` 单独用（不配 `salesOrgCode`）会带出"宁波"与"惠州酷友"两个法人；
      四条件全加后实测只有宁波法人，无需再收紧

## 其余 TOF 报表工具为何没迁

来源政策明细/客户费用明细/毛利及费用/调整项明细/未兑付余额 5 张报表是
**帆软（FineReport）嵌入页**（pangu.tcl.com），纯 HTTP 已被 xfz-survey 实测判死
（SessionID 粘滞 + Fine-Core_Invalid_CID 校验），升级路径是 UI 驱动提交+响应捕获
（fr-report-http.py 模式），另立 PR。
