# TCL 华南大区财务工具平台（管理后台）

React + TypeScript + Vite 前端 + Express 后端的财务管理工具平台，内置多个自动化财务工具（发票 OCR、收款提醒、DeepSeek 余额监控、OA 审批 AI 助手、样机/固定资产盘点数据管理等）。

## 技术栈

- 前端：React 19 + TypeScript + Vite 8 + Tailwind CSS + Recharts
- 后端：Express 5（`server.js` 单体服务）
- 数据：微信云开发 CloudBase（TCB HTTP API）+ 本地 JSON 计数
- 自动化：调用外层目录的 Python 脚本（`spawn`）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（首次必做）
#    复制 .env.example 为 .env 并填入真实密钥
copy .env.example .env

# 3. 启动（后端 3005 + 前端 8888）
npm run dev        # 仅前端（Vite）
npm run server     # 仅后端
npm start          # 前后端同时启动
```

生产环境可使用 PM2（`ecosystem.config.cjs`）或 NSSM 注册为 Windows 服务（`install-service.ps1` / `manage-services.bat`）。

## 环境变量（.env）

| 变量 | 说明 |
|---|---|
| `PORT` | 后端监听端口（默认 3005） |
| `ADMIN_PASSWORD` | 管理后台登录密码（`POST /api/auth/login` 校验后签发会话令牌，所有 `/api` 接口需携带 `x-auth-token` 请求头） |
| `DEEPSEEK_API_KEY` | DeepSeek 大模型 API Key（OA 审批助手使用） |
| `WX_APPID` / `WX_SECRET` | 微信小程序 AppID / AppSecret（云开发 TCB 数据访问） |
| `TCB_ENV` | 微信云开发环境 ID |
| `COS_ENV` / `COS_SECRET_ID` / `COS_SECRET_KEY` | 腾讯云 COS（`export_pdf.mjs` / `export_to_desktop.mjs` 导出脚本） |

> ⚠️ 安全说明：`.env` 已加入 `.gitignore`，**禁止**把真实密钥提交到仓库。

## 目录结构

```
├── server.js                 # Express 后端（工具调度、TCB 数据访问、OA 分析）
├── export_pdf.mjs            # 导出 PDF（COS + pdfkit）
├── export_to_desktop.mjs     # 导出数据到桌面（COS + CSV）
├── src/
│   ├── pages/                # Home / ToolDetail / AssetInventory
│   ├── components/           # ToolCard、Layout、搜索、筛选等
│   ├── data/tools.ts         # 工具清单与统计
│   └── lib/api.ts            # 统一 API 请求（自动携带鉴权头）
├── ecosystem.config.cjs      # PM2 配置
└── install-service.ps1       # NSSM Windows 服务安装脚本
```

## 常用 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（免鉴权） |
| POST | `/api/tools/:id/run` | 启动工具（Python 脚本） |
| POST | `/api/tools/oa-approval/analyze` | OA 审批 AI 分析（DeepSeek） |
| GET | `/api/inventory/stats` | 盘点数据统计 |
| POST | `/api/inventory/import` | 导入盘点数据（CSV/Excel） |
| GET | `/api/inventory/export` | 导出盘点数据 |
| GET | `/api/inventory/photos` | 盘点照片列表 |
| GET | `/api/inventory/photo/download` | 下载盘点照片 |

除 `/api/health` 与 `/api/auth/*` 外，所有接口需携带请求头 `x-auth-token: <会话令牌>`。令牌通过 `POST /api/auth/login`（body: `{"password": "<ADMIN_PASSWORD>"}`）获取，12 小时有效；连续失败 5 次将锁定 15 分钟。