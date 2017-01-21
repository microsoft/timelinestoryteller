echo This is DisableSslv3.cmd local

PowerShell -ExecutionPolicy Unrestricted .\DisableSslv3.ps1 >> ".\Startuplog.txt" 2>&1

EXIT /B 0
