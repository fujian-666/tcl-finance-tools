# fine_report —— 帆软报表 UI 驱动引擎

平台 5 张 TOF「报表中心」工具里，4 张是帆软报表，由本引擎接管；剩下 1 张是
Databi 看板（不是帆软），仍走原 RPA。cpt 路径取自 TOF 菜单接口
`_iam_tcl_v1_18_menus_tree_*.json` 的 description 字段，不靠人工抄 URL。

| 报表 | 平台工具 id | 取数方式 | 现状（2026-10-28 实测） |
|---|---|---|---|
| 客户费用明细表 | settlement-freeze | 大数据集导出 | ready。10-20 单日 2968 行；10-01~10-28 整月 87516 行 |
| 毛利及费用额度计算明细表 | settlement-gross-profit | 大数据集导出 | ready。10-01~10-28 整月 410284 行 |
| 考核调整项明细表 | settlement-adjust | 翻页抓 page_content | empty。查询正常发出，但报表多数月份本就无数据 |
| 政策补贴查询明细表 | subsidy-tracking | —（翻页抓，见下） | blocked。产品线控件「必选」，选项接口只返回空数组 |
| 未兑付余额明细表 | unpaid-collection | — | 不适用。Databi 看板，仍走 auto_export.py |

## 为什么是 UI 驱动（实测定论）

这些是帆软（FineReport）嵌入页，不在 TOF 网关接口体系内。xfz-survey
2026-10-23 实测：para/submit 纯 HTTP 直连不可行——服务端会话注册/粘滞无法在
浏览器外复刻（SessionID time out），page/data 过不了 Fine-Core_Invalid_CID
校验（cid 是前端生成的 md5#时间戳#随机串，与服务端会话的注册点未定位）。

可行路径 = **UI 驱动**：真实打开报表页 → 点「查询」→ 拿数据。与人工操作的
服务端行为零差异。

## 两种取数方式（data_mode）

**bulk = 大数据集导出**（freeze / gross-profit 有此按钮）
点「查询」建立带参数的会话 → 点工具栏「大数据集导出」→ 一次
`POST /webroot/decision/url/report/v10/direct/export` 拿整表 xlsx。
明细表数据量极大，翻页不可行（2 天 1873 行才翻到第 50 页，按日期倒序 30 页
只覆盖 5 天，整月要几百页、20 分钟以上），所以这两张只走导出。

**pages = 翻页抓响应**（adjust / subsidy：工具栏只有「导出」，无「大数据集导出」）
点查询后抓 `op=page_content`（经典前端的 HTML 表格），再点「下一页」逐页累加。

## 使用

```bash
python runner.py --list                                     # 注册表与就绪状态
python runner.py --report settlement-freeze --dry-run        # 看拼出来的 URL
python runner.py --report settlement-freeze \
    --start-date 2026-10-01 --end-date 2026-10-28 \
    --out 客户费用明细.xlsx --user-id yiming7.xu --user-name 徐一鸣
```

凭据：已登录 SSO 的 Chromium 配置档（`--profile` 或环境变量
`FR_BROWSER_PROFILE`，默认 `../../系统调查/xfz-survey/browser-profile`）。
SSO 失效特征是 `NO PANGU FRAME`，重跑一次 xfz-survey/survey.py capture。

## 踩过的坑（代码里都有注释）

1. **`userId` 必须是 TOF 登录名**（如 `yiming7.xu`），不能传工号/数字 ID。
   帆软按 userId 做数据权限过滤：数字 ID 不报错，但导出文件只剩
   「正常表头 + 0 数据行」，极易误判成「报表没数据」。
2. 直连 URL 只预填参数、**不会自动查询**；必须先点「查询」建立带参数的会话，
   否则导出按钮点了没反应。参数面板约 30–40s 才渲染出来，查询超时给到 90s。
3. 参数控件的 placeholder 决定是否必填：`默认全选` 可留空，`必选` 空值时
   帆软前端直接拦截查询（一个请求都不发）。
4. Playwright 同步 API 里**不能用 `time.sleep`**：会阻塞事件循环，response
   回调永远不派发，必须用 `page.wait_for_timeout`。
5. 大数据集导出的 xlsx，`<dimension ref="A1"/>` 是假的，openpyxl 不能开
   `read_only`（会只读到 1 行 1 列）。

## 接入平台

server.js 的 `toolScripts` 里把 4 个工具的 script 统一指向本引擎，报表用 `--report`
区分（不再按每个工具复制一份脚本，工具 id 与报表 id 一致）：

```js
'settlement-freeze': {
  name: '华南大区客户费用明细报表',
  script: path.join(__dirname, 'tof_api', 'fine_report', 'runner.py'),
},
```

平台实际拼的命令（见 server.js `FINEREPORT_TOOL_IDS` 分支）：

```
python -u tof_api/fine_report/runner.py --report <工具id> --headless \
       --out <仓库>/exports/<工具id>_<时间戳>.xlsx [--start-date .. --end-date ..]
```

- 产物落到 `exports/`（已 gitignore）；引擎把产物绝对路径打到 **stdout**，
  平台按行抓取后统一投递飞书，其余进度信息一律 stderr（issue #6 口径 A）。
- 身份与配置档走 `.env`（server.js 会把环境变量透传给子进程），**部署机必须配**：
  - `FR_USER_ID`：TOF 登录名（如 `yiming7.xu`），不能是工号/数字 ID
  - `FR_USER_NAME`：姓名（用于帆软产品线默认值）
  - `FR_BROWSER_PROFILE`：已登录 SSO 的 Chromium 配置档目录（默认值按仓库相对路径推，
    部署机路径不同时必须显式给）

## 待办

- [ ] subsidy-tracking：等报表维护方补产品线选项数据（`op=widget&widgetname=product_line_code` 当前返回 `[]`）
- [ ] settlement-adjust：等报表有数据后复核一次解析结果
- [ ] 首次在部署机接入时，人工在页面上核对一次行数/列名
