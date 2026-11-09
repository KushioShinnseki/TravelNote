param([string]$OutputDirectory = 'artifacts')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node (Join-Path $PSScriptRoot 'build-local-miniapps.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Local mini-program build failed' }
$output = Join-Path $projectRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $output | Out-Null
foreach ($platform in @('wechat', 'alipay')) {
    $source = Join-Path $projectRoot "artifacts/travelnote-local-$platform"
    $zip = Join-Path $output "travelnote-local-$platform-miniapp.zip"
    Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zip -CompressionLevel Optimal -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
    Set-Content -LiteralPath "$zip.sha256" -Value "$hash  $(Split-Path $zip -Leaf)" -Encoding ascii
    Write-Output $zip
}
