@echo off
setlocal
cd /d "%~dp0"

set "NODE_PATH=C:\Program Files\nodejs"
set "PYTHON_PATH=C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64;C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64\Scripts"
set "PATH=%PYTHON_PATH%;%NODE_PATH%;%PATH%"

echo ============================================
echo   TCL 华南大区 - 财务小工具平台
echo ============================================
echo.
echo [1/2] Starting Backend...
start "TCL-Backend" /MIN "%NODE_PATH%\node.exe" server.js
timeout /t 2 /nobreak >nul
echo [2/2] Starting Frontend (port 8888)...
start "TCL-Frontend" /MIN cmd /k "cd /d %~dp0 && set PATH=%PYTHON_PATH%;%NODE_PATH%;%PATH% && npx vite --host 0.0.0.0"
timeout /t 3 /nobreak >nul
echo.
echo ============================================
echo   Backend:  http://localhost:3004
echo   Frontend: http://localhost:8888
echo ============================================
echo.
echo Services started!