@echo off
cd /d C:\Users\FJ\Trae\tcl-finance-tools

REM Kill any lingering node processes on our ports (safety net)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8888.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

REM Small delay to let ports release
timeout /t 2 /nobreak >nul

REM Resurrect PM2 processes from saved dump
C:\Users\FJ\AppData\Roaming\npm\pm2.cmd resurrect