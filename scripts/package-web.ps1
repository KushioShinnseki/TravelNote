param([string]$OutputDirectory = "artifacts")

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$output = Join-Path $root $OutputDirectory
$zip = Join-Path $output "travelnote-web.zip"

if (-not (Test-Path $dist)) { throw "dist directory was not found" }
New-Item -ItemType Directory -Force -Path $output | Out-Null
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $dist "*") -DestinationPath $zip -CompressionLevel Optimal
Write-Output $zip
