param([string]$OutputDirectory = "artifacts")

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$output = Join-Path $root $OutputDirectory
New-Item -ItemType Directory -Force -Path $output | Out-Null

foreach ($platform in @("wechat", "alipay")) {
  $source = Join-Path $root "miniapps\$platform"
  $zip = Join-Path $output "travelnote-$platform-miniapp.zip"
  if (-not (Test-Path $source)) { throw "Mini-program directory was not found: $source" }
  if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -Path (Join-Path $source "*") -DestinationPath $zip -CompressionLevel Optimal
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$zip.sha256" -Value "$hash  $(Split-Path $zip -Leaf)" -Encoding ascii
  Write-Output $zip
}
