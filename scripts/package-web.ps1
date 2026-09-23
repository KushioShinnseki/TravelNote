param([string]$OutputDirectory = "artifacts")

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$output = Join-Path $root $OutputDirectory
$zip = Join-Path $output "travelnote-web.zip"
$package = Join-Path $output "travelnote-web-package"

if (-not (Test-Path $dist)) { throw "dist directory was not found" }
New-Item -ItemType Directory -Force -Path $output | Out-Null
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
if (Test-Path $package) { Remove-Item -LiteralPath $package -Recurse -Force }
New-Item -ItemType Directory -Force -Path $package | Out-Null
Copy-Item -LiteralPath (Join-Path $root "dist") -Destination $package -Recurse
Copy-Item -LiteralPath (Join-Path $root "server") -Destination $package -Recurse
Copy-Item -LiteralPath (Join-Path $root "deploy") -Destination $package -Recurse
Copy-Item -LiteralPath (Join-Path $root "Dockerfile"), (Join-Path $root "docker-compose.yml"), (Join-Path $root ".dockerignore"), (Join-Path $root ".env.example"), (Join-Path $root "README.md") -Destination $package
Compress-Archive -Path (Join-Path $package "*") -DestinationPath $zip -CompressionLevel Optimal
Write-Output $zip
