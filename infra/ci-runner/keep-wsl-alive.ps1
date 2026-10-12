# Keeps the Ubuntu WSL distro (and the CI runners inside it) running while you are logged in.
# WSL stops a distro shortly after its last terminal closes, even with systemd services; a hidden
# `sleep infinity` started at logon keeps it up.
#
# Run once in PowerShell (no admin rights needed):
#   powershell -ExecutionPolicy Bypass -File .\infra\ci-runner\keep-wsl-alive.ps1
# Remove:
#   Unregister-ScheduledTask -TaskName MohonautWslKeepAlive -Confirm:$false

$ErrorActionPreference = 'Stop'
$name = 'MohonautWslKeepAlive'
$action = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument '-d Ubuntu --exec sleep infinity'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Keeps WSL Ubuntu running for the Mohonaut CI runners' -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "Scheduled task '$name' registered and started."
