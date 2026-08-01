Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c cd /d C:\Users\FJ\Trae\tcl-finance-tools && npx pm2 resurrect > C:\Users\FJ\Trae\tcl-finance-tools\logs\startup.log 2>&1", 0, False