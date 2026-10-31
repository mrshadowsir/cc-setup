# Windows / VS Code launcher:  .\install.ps1   (ya install.bat)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath {
  $m = [Environment]::GetEnvironmentVariable('Path','Machine')
  $u = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$m;$u"
}
function Install($id, $name) {
  if (-not (Has winget)) {
    Write-Host "[!] winget nahi mila. $name manually install karo (nodejs.org / git-scm.com), phir dobara chalao."
    exit 1
  }
  Write-Host "[*] $name install ho raha hai (winget)..."
  winget install -e --id $id --accept-source-agreements --accept-package-agreements
  RefreshPath
}

if (-not (Has node)) { Install 'OpenJS.NodeJS.LTS' 'Node.js' }
if (-not (Has git))  { Install 'Git.Git' 'Git' }

foreach ($c in 'node','npm','git') {
  if (-not (Has $c)) {
    Write-Host "[!] '$c' abhi bhi nahi mila. VS Code / terminal band karke dobara kholo, phir dobara chalao."
    exit 1
  }
}
node setup.js @args
