$ErrorActionPreference = 'Stop'
$AppName = 'ODA Component Specification Studio'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\ComponentSpecStudio'
$SourceDir = $PSScriptRoot

Write-Host "Installing $AppName to $InstallDir ..."

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path (Join-Path $SourceDir 'ComponentSpecStudio.exe') -Destination $InstallDir -Force
Copy-Item -Path (Join-Path $SourceDir 'uninstall.ps1') -Destination $InstallDir -Force

$PublicDir = Join-Path $InstallDir 'public'
if (Test-Path $PublicDir) { Remove-Item -Recurse -Force $PublicDir }
Expand-Archive -Path (Join-Path $SourceDir 'public.zip') -DestinationPath $PublicDir -Force

# Start Menu shortcut
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ShortcutPath = Join-Path $StartMenuDir "$AppName.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = Join-Path $InstallDir 'ComponentSpecStudio.exe'
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description = $AppName
$Shortcut.Save()

# Register in "Apps & features" / Add-Remove Programs (per-user, no admin needed)
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ComponentSpecStudio'
New-Item -Path $UninstallKey -Force | Out-Null
Set-ItemProperty -Path $UninstallKey -Name 'DisplayName' -Value $AppName
Set-ItemProperty -Path $UninstallKey -Name 'DisplayVersion' -Value '1.0.0'
Set-ItemProperty -Path $UninstallKey -Name 'Publisher' -Value 'Hugo Vaughan'
Set-ItemProperty -Path $UninstallKey -Name 'InstallLocation' -Value $InstallDir
Set-ItemProperty -Path $UninstallKey -Name 'DisplayIcon' -Value (Join-Path $InstallDir 'ComponentSpecStudio.exe')
Set-ItemProperty -Path $UninstallKey -Name 'UninstallString' -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\uninstall.ps1`""
Set-ItemProperty -Path $UninstallKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $UninstallKey -Name 'NoRepair' -Value 1 -Type DWord

Write-Host ""
Write-Host "$AppName installed successfully."
Write-Host "Start Menu shortcut created. Find it in Add/Remove Programs to uninstall later."
Write-Host ""
Write-Host "Note: REPO_ROOT and FRAMEWORKS_DIR default to this machine's existing ClaudeCode workspace."
Write-Host "Set those environment variables first if your spec repo / frameworks folder live elsewhere."

Start-Sleep -Seconds 3
