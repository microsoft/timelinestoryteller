echo This is DisableSslv3.cmd

PowerShell -ExecutionPolicy Unrestricted %DEPLOYMENT_SOURCE%\DisableSslv3.ps1 >> %DEPLOYMENT_TEMP%\Startuplog.txt 2>&1

EXIT /B 0
