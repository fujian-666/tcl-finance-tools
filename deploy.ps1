# 一键发布脚本：TCL样机盘点系统
# 功能：1) 部署 generateReport 云函数  2) 上传小程序代码  3) 管理后台前端构建
# 用法：powershell -ExecutionPolicy Bypass -File deploy.ps1
#       powershell -ExecutionPolicy Bypass -File deploy.ps1 -Version 1.1.0 -Desc "更新说明" -Port 29243
# 前提：微信开发者工具已登录且开启"服务端口"（安全设置），云函数目录含 package.json

param(
  [string]$Version = "1.0.0",
  [string]$Desc = "盘点导出对齐（门店命名/签名后置/存证哈希/页脚时间戳）+ 离线盘点/OCR/签名存证完整功能",
  [int]$Port = 0
)

$CLI = "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
$MP_PROJECT = "C:\Users\FJ\Trae\inventory-check"
$ADMIN_PROJECT = "C:\Users\FJ\Trae\tcl-finance-tools"
$ENV_ID = "cloud1-d0g8kgm7o08c2d228"
$portArg = @()
if ($Port -gt 0) { $portArg = @("--port", "$Port") }

if (-not (Test-Path $CLI)) {
  Write-Host "未找到微信开发者工具 CLI：$CLI" -ForegroundColor Red
  exit 1
}

Write-Host "=== 1/3 部署云函数 generateReport（云端安装依赖）===" -ForegroundColor Cyan
& $CLI cloud functions deploy -e $ENV_ID -n generateReport --project $MP_PROJECT --remote-npm-install @portArg
if ($LASTEXITCODE -ne 0) {
  Write-Host "云函数部署失败，终止发布" -ForegroundColor Red
  exit 1
}

Write-Host "=== 2/3 上传小程序代码 v$Version ===" -ForegroundColor Cyan
& $CLI upload --project $MP_PROJECT -v $Version -d $Desc @portArg
if ($LASTEXITCODE -ne 0) {
  Write-Host "小程序代码上传失败，终止发布" -ForegroundColor Red
  exit 1
}

Write-Host "=== 3/3 管理后台前端构建 ===" -ForegroundColor Cyan
Push-Location $ADMIN_PROJECT
npm run build
$buildCode = $LASTEXITCODE
Pop-Location
if ($buildCode -ne 0) {
  Write-Host "管理后台构建失败（请检查 TypeScript 报错）" -ForegroundColor Red
  exit 1
}

Write-Host "=== 发布完成（版本 v$Version）===" -ForegroundColor Green
Write-Host "小程序代码已上传，请在微信公众平台（mp.weixin.qq.com）提交审核后正式上线" -ForegroundColor Yellow
