$nssmPath = "c:\Users\FJ\Trae\tcl-finance-tools\nssm.exe"
$serviceName = "TCLFinanceTools"
$appPath = "c:\Users\FJ\Trae\tcl-finance-tools\start-services.bat"
$appDir = "c:\Users\FJ\Trae\tcl-finance-tools"

# Build full PATH for SYSTEM account
$nodePath = "C:\Program Files\nodejs"
$pythonPaths = "C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64;C:\Users\FJ\AppData\Local\Python\pythoncore-3.14-64\Scripts;C:\Users\FJ\Trae\.venv\Scripts"
$systemPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$fullPath = "$nodePath;$pythonPaths;$systemPath;$userPath"

Write-Host "=== TCL Finance Tools Service Installer ==="
Write-Host "Node path: $nodePath"
Write-Host ""

Write-Host "Stopping existing service..."
& $nssmPath stop $serviceName 2>$null
Start-Sleep -Seconds 2

Write-Host "Removing old service..."
& $nssmPath remove $serviceName confirm 2>$null
Start-Sleep -Seconds 2

Write-Host "Installing service $serviceName..."
& $nssmPath install $serviceName $appPath

Write-Host "Configuring service..."
& $nssmPath set $serviceName AppDirectory $appDir
& $nssmPath set $serviceName Start SERVICE_AUTO_START
& $nssmPath set $serviceName AppEnvironmentExtra "PORT=3003"
& $nssmPath set $serviceName AppEnvironmentExtra "PATH=$fullPath"

Write-Host "Starting service..."
& $nssmPath start $serviceName

Write-Host ""
Write-Host "Service installed and started!"
Write-Host "Check status: sc query $serviceName"
Write-Host "Check logs: tail -f $appDir\logs\service.log"