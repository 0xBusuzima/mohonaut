# Keeps a WSL distro (and the CI runners inside it) running while you are logged in.
# WSL stops a distro shortly after its last terminal closes, even with systemd services; a hidden
# `sleep infinity` started at logon keeps it up (through a tiny VBScript, so no window opens).
#
# Run once in PowerShell (no admin rights needed); -Distro is the name `wsl -l` shows:
#   powershell -ExecutionPolicy Bypass -File .\infra\ci-runner\keep-wsl-alive.ps1 -Distro Ubuntu
# Remove:
#   Unregister-ScheduledTask -TaskName MohonautWslKeepAlive -Confirm:$false

param([string]$Distro = 'Ubuntu')

$ErrorActionPreference = 'Stop'
$name = 'MohonautWslKeepAlive'
$dir = Join-Path $env:LOCALAPPDATA 'Mohonaut'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$vbs = Join-Path $dir 'wsl-keep-alive.vbs'
# Window style 0: hidden; False: do not wait.
Set-Content -Path $vbs -Encoding ASCII -Value @(
  'Set shell = CreateObject("WScript.Shell")',
  "shell.Run ""wsl.exe -d $Distro --exec sleep infinity"", 0, False"
)
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description "Keeps WSL $Distro running for the Mohonaut CI runners" -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "Scheduled task '$name' registered and started (hidden)."
