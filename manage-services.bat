@echo off
setlocal enabledelayedexpansion
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "WORK_DIR=C:\Users\FJ\Trae\tcl-finance-tools"
set "VITE_CMD=%WORK_DIR%\node_modules\.bin\vite.cmd"

if "%1"=="start" goto :do_start
if "%1"=="stop" goto :do_stop
if "%1"=="restart" goto :do_restart
if "%1"=="status" goto :do_status

echo Usage: manage-services.bat [start^|stop^|restart^|status]
echo.
echo   start   - Start backend and frontend
echo   stop    - Stop all services
echo   restart - Restart all services
echo   status  - Check if services are running
goto :eof

:do_stop
echo Stopping all TCL Finance Tools services...
taskkill /F /IM node.exe 2>nul
echo All node processes killed.
goto :eof

:do_start
echo Starting TCL Finance Tools...
call "%~f0" stop >nul
timeout /t 2 /nobreak >nul

cd /d "%WORK_DIR%"

echo Starting backend...
start "tcl-backend" /MIN "%NODE_EXE%" server.js
timeout /t 3 /nobreak >nul

echo Starting frontend...
start "tcl-frontend" /MIN cmd /k "cd /d %WORK_DIR% && "%VITE_CMD%" --host 0.0.0.0 --port 8888"

echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul
call "%~f0" status
goto :eof

:do_restart
call "%~f0" stop
timeout /t 2 /nobreak >nul
call "%~f0" start
goto :eof

:do_status
echo ============================================
echo  TCL Finance Tools - Service Status
echo ============================================
netstat -ano | findstr ":3003" >nul
if errorlevel 1 (
    echo [OFF] Backend port 3003 - NOT RUNNING
) else (
    echo [ON]  Backend port 3003 - RUNNING
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003.*LISTENING"') do echo       PID: %%a
)
netstat -ano | findstr ":8888" >nul
if errorlevel 1 (
    echo [OFF] Frontend port 8888 - NOT RUNNING
) else (
    echo [ON]  Frontend port 8888 - RUNNING
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8888.*LISTENING"') do echo       PID: %%a
)
echo.
echo Frontend URL: http://localhost:8888
echo Backend URL:  http://localhost:3003
echo ============================================
goto :eof