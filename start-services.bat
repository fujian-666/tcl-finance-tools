@echo off
setlocal enabledelayedexpansion

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "VITE_CMD=C:\Users\FJ\Trae\tcl-finance-tools\node_modules\.bin\vite.cmd"
set "WORK_DIR=C:\Users\FJ\Trae\tcl-finance-tools"
set "LOG_DIR=%WORK_DIR%\logs"
set "PYTHON_EXE=C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64\python.exe"
set "PYTHON_BIN=C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64"
set "PYTHON_SCRIPTS=C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64\Scripts"
set "VENV_SCRIPTS=C:\Users\FJ\Trae\.venv\Scripts"
set "NODE_PATH=C:\Program Files\nodejs"
set "PATH=%PYTHON_BIN%;%PYTHON_SCRIPTS%;%VENV_SCRIPTS%;%NODE_PATH%;%PATH%"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%WORK_DIR%"

echo [%date% %time%] ========================================== >> "%LOG_DIR%\service.log"
echo [%date% %time%] TCL Finance Tools Starting... >> "%LOG_DIR%\service.log"

REM Kill any existing processes on our ports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3004.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a 2>nul
    echo [%date% %time%] Killed existing process on port 3004 (PID %%a) >> "%LOG_DIR%\service.log"
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8888.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a 2>nul
    echo [%date% %time%] Killed existing process on port 8888 (PID %%a) >> "%LOG_DIR%\service.log"
)

REM Start backend (no visible window)
echo [%date% %time%] Starting backend... >> "%LOG_DIR%\service.log"
start "tcl-backend" /B "%NODE_EXE%" server.js >> "%LOG_DIR%\backend.log" 2>&1

REM Wait for backend to be ready (max 30s)
set /a count=0
:wait_backend
timeout /t 2 /nobreak >nul
set /a count+=1
netstat -ano | findstr ":3004.*LISTENING" >nul
if not errorlevel 1 goto backend_ready
if %count% lss 15 goto wait_backend
echo [%date% %time%] ERROR: Backend failed to start within 30s >> "%LOG_DIR%\service.log"
goto start_frontend
:backend_ready
echo [%date% %time%] Backend started on port 3004 >> "%LOG_DIR%\service.log"

REM Start frontend (no visible window)
:start_frontend
echo [%date% %time%] Starting frontend... >> "%LOG_DIR%\service.log"
start "tcl-frontend" /B "%NODE_EXE%" "%VITE_CMD%" --host 0.0.0.0 --port 8888 >> "%LOG_DIR%\frontend.log" 2>&1

REM Wait for frontend to be ready (max 30s)
set /a count=0
:wait_frontend
timeout /t 2 /nobreak >nul
set /a count+=1
netstat -ano | findstr ":8888.*LISTENING" >nul
if not errorlevel 1 goto frontend_ready
if %count% lss 15 goto wait_frontend
echo [%date% %time%] ERROR: Frontend failed to start within 30s >> "%LOG_DIR%\service.log"
goto monitor_loop
:frontend_ready
echo [%date% %time%] Frontend started on port 8888 >> "%LOG_DIR%\service.log"

echo [%date% %time%] All services started successfully! >> "%LOG_DIR%\service.log"

REM ===== Monitor loop: keep process alive and auto-restart if crashed =====
:monitor_loop
timeout /t 30 /nobreak >nul

netstat -ano | findstr ":3004.*LISTENING" >nul
if errorlevel 1 (
    echo [%date% %time%] Backend died, restarting... >> "%LOG_DIR%\service.log"
    start "tcl-backend" /B "%NODE_EXE%" server.js >> "%LOG_DIR%\backend.log" 2>&1
)

netstat -ano | findstr ":8888.*LISTENING" >nul
if errorlevel 1 (
    echo [%date% %time%] Frontend died, restarting... >> "%LOG_DIR%\service.log"
    start "tcl-frontend" /B "%NODE_EXE%" "%VITE_CMD%" --host 0.0.0.0 --port 8888 >> "%LOG_DIR%\frontend.log" 2>&1
)

goto monitor_loop