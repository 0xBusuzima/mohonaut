# Keeps a WSL distro (and the CI runners inside it) running while you are logged in.
# WSL stops a distro shortly after its last terminal closes, even with systemd services; a hidden
# `sleep infinity` started at logon keeps it up (through a tiny VBScript, so no window opens).
# The task also runs every 5 minutes: if WSL went down (out of memory, an update), it comes back
# without anyone touching the laptop. A second `sleep` while one runs is harmless.
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
# Starts the keep-alive only when the distro is not running (no pile of sleeping processes).
# Window style 0: hidden; False: do not wait.
Set-Content -Path $vbs -Encoding ASCII -Value @(
  'Set shell = CreateObject("WScript.Shell")',
  "Set run = shell.Exec(""wsl.exe -l --running --quiet"")",
  'running = run.StdOut.ReadAll()',
  "If InStr(Replace(running, Chr(0), """"), ""$Distro"") = 0 Then",
  "  shell.Run ""wsl.exe -d $Distro --exec sleep infinity"", 0, False",
  'End If'
)
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$every5 = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($atLogon, $every5) `
  -Settings $settings -Description "Keeps WSL $Distro running for the Mohonaut CI runners" `
  -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "Scheduled task '$name' registered and started (hidden, every 5 minutes)."
