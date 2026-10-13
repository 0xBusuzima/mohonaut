# Puts a "Mohonaut CI" shortcut on the desktop: a window that follows the runner's log live
# (which job is running, and how each one ended). Closing the window does not affect the runner.
#
#   powershell -ExecutionPolicy Bypass -File .\infra\ci-runner\ci-monitor-shortcut.ps1 -Distro Ubuntu

param([string]$Distro = 'Ubuntu')

$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mohonaut CI.lnk'))
$link.TargetPath = "$env:WINDIR\System32\wsl.exe"
$link.Arguments = "-d $Distro -- journalctl -f -o cat -n 40 -u actions.runner.*"
$link.Description = 'Mohonaut CI runner: live job log'
$link.IconLocation = "$env:WINDIR\System32\wsl.exe,0"
$link.Save()
Write-Output "Desktop shortcut 'Mohonaut CI' created."
