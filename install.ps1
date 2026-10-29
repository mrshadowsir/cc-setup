# Windows launcher (bina WSL/Linux ke) - .\install.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}

if (-not (Has node)) {
  Write-Host '[*] Node.js install ho raha hai (winget)...'
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  RefreshPath
}
if (-not (Has git)) {
  Write-Host '[*] Git install ho raha hai (Claude Code ko Windows par chahiye)...'
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  RefreshPath
}
if (-not (Has node)) {
  Write-Host '[!] Node abhi bhi nahi mila. PowerShell band karke dobara kholo aur phir chalao.'
  exit 1
}
node setup.js @args
