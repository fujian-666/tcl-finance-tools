# One-click deploy: TCL inventory system
# Steps: 1) deploy generateReport cloud function  2) upload mini-program code  3) build admin frontend
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1
#        powershell -ExecutionPolicy Bypass -File deploy.ps1 -Version 1.1.0 -Desc "update desc" -Port 29243
# Prereq: WeChat DevTools logged in with service port enabled; cloud function dir contains package.json

param(
  [string]$Version = "1.0.0",
  [string]$Desc = "inventory export alignment + notice agreement v1.1",
  [int]$Port = 0
)

$CLI = "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
$MP_PROJECT = "C:\Users\FJ\Trae\inventory-check"
$ADMIN_PROJECT = "C:\Users\FJ\Trae\tcl-finance-tools"
$ENV_ID = "cloud1-d0g8kgm7o08c2d228"
$portArg = @()
if ($Port -gt 0) { $portArg = @("--port", "$Port") }

if (-not (Test-Path $CLI)) {
  Write-Host "ERROR: WeChat DevTools CLI not found: $CLI" -ForegroundColor Red
  exit 1
}

Write-Host "=== [1/3] Deploy cloud function generateReport (remote npm install) ===" -ForegroundColor Cyan
& $CLI cloud functions deploy -e $ENV_ID -n generateReport --project $MP_PROJECT --remote-npm-install @portArg
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: cloud function deploy failed, abort" -ForegroundColor Red
  exit 1
}

Write-Host "=== [2/3] Upload mini-program code v$Version ===" -ForegroundColor Cyan
& $CLI upload --project $MP_PROJECT -v $Version -d $Desc @portArg
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: mini-program upload failed, abort" -ForegroundColor Red
  exit 1
}

Write-Host "=== [3/3] Build admin frontend ===" -ForegroundColor Cyan
Push-Location $ADMIN_PROJECT
npm run build
$buildCode = $LASTEXITCODE
Pop-Location
if ($buildCode -ne 0) {
  Write-Host "ERROR: admin build failed (check TypeScript errors)" -ForegroundColor Red
  exit 1
}

Write-Host "=== DEPLOY COMPLETE (v$Version) ===" -ForegroundColor Green
Write-Host "Mini-program uploaded. Submit for review at mp.weixin.qq.com to go live." -ForegroundColor Yellow
