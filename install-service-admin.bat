@echo off
cd /d "c:\Users\FJ\Trae\tcl-finance-tools"

echo === TCL Finance Tools Service Installer ===
echo.

set NSSM=nssm.exe
set SVC=TCLFinanceTools
set APP=start-services.bat
set DIR=c:\Users\FJ\Trae\tcl-finance-tools

echo [1/5] Stopping existing service...
%NSSM% stop %SVC% 2>nul
timeout /t 2 /nobreak >nul

echo [2/5] Removing old service...
%NSSM% remove %SVC% confirm 2>nul
timeout /t 2 /nobreak >nul

echo [3/5] Installing service...
%NSSM% install %SVC% "%DIR%\%APP%"
if errorlevel 1 (
    echo ERROR: Failed to install service!
    pause
    exit /b 1
)

echo [4/5] Configuring service...
%NSSM% set %SVC% AppDirectory "%DIR%"
%NSSM% set %SVC% Start SERVICE_AUTO_START
%NSSM% set %SVC% AppEnvironmentExtra "PORT=3003"
%NSSM% set %SVC% AppEnvironmentExtra "PATH=C:\Program Files\nodejs;C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64;C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64\Scripts;C:\Users\FJ\Trae\.venv\Scripts;%PATH%"

echo [5/5] Starting service...
%NSSM% start %SVC%
if errorlevel 1 (
    echo WARNING: Service may not have started. Check status.
)

echo.
echo === Done! ===
echo Service: %SVC%
echo Status: Run 'sc query %SVC%' to check
echo Logs: %DIR%\logs\service.log
echo.
pause