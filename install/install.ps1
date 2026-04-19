#Requires -Version 5.1
<#
.SYNOPSIS
  Install Forge CLI on Windows via npm. Falls back to downloading a signed
  portable binary from GitHub Releases when npm is unavailable.
#>
[CmdletBinding()]
param(
  [string]$Version = 'latest',
  [string]$Package = '@forge/cli',
  [switch]$SkipDownload
)

$ErrorActionPreference = 'Stop'

function Test-Command($name) {
  try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

if (Test-Command npm) {
  Write-Host "Installing $Package@$Version via npm -g..."
  npm install -g "$Package@$Version"
  Write-Host ""
  Write-Host "Run: forge init"
  Write-Host "Then: forge run 'your first task'"
  exit 0
}

if ($SkipDownload) {
  Write-Error "npm not found and --SkipDownload passed. Install Node.js 20+ first."
  exit 1
}

$home = if ($env:FORGE_HOME) { $env:FORGE_HOME } else { Join-Path $env:USERPROFILE '.forge' }
New-Item -ItemType Directory -Force -Path (Join-Path $home 'bin') | Out-Null

$arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
$artifact = "forge-windows-$arch.exe"
$url = "https://github.com/forge/forge/releases/latest/download/$artifact"
$dst = Join-Path $home 'bin\forge.exe'

Write-Host "Downloading $url..."
Invoke-WebRequest -Uri $url -OutFile $dst
Write-Host "Installed to $dst"
Write-Host ""
Write-Host "Add $home\bin to your PATH, then run: forge init"
