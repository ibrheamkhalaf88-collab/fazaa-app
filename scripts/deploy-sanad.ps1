# Sanad: one-click deploy of the staff API. Run in PowerShell:  .\deploy-sanad.ps1
# Safe to run again. It never prints your encryption key.
$ErrorActionPreference = "Stop"

$repo = Join-Path $env:USERPROFILE "sanad-app"
if (-not (Test-Path (Join-Path $repo "server\api\wrangler.toml"))) {
  Write-Host "Cannot find the project at $repo" -ForegroundColor Red; exit 1
}

Write-Host "1/5  Getting the latest code..." -ForegroundColor Cyan
Set-Location $repo
git pull

Set-Location (Join-Path $repo "server\api")

Write-Host "2/5  Creating the tables in the database..." -ForegroundColor Cyan
npx wrangler d1 execute sanad --remote --file=schema.sql

Write-Host "3/5  Building the dashboard and deploying the API..." -ForegroundColor Cyan
node (Join-Path $repo "scripts\build-admin.mjs")
npx wrangler deploy

Write-Host "4/5  Setting the encryption key..." -ForegroundColor Cyan
$keyFile = Join-Path $env:USERPROFILE "Desktop\SANAD-MESSAGE-KEY-KEEP-SAFE.txt"
if (Test-Path $keyFile) {
  Write-Host "A key file already exists, reusing it (not creating a new key)." -ForegroundColor Yellow
  $key = (Get-Content $keyFile -Raw).Trim()
} else {
  $key = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  Set-Content -Path $keyFile -Value $key -NoNewline
  Write-Host "Saved a copy of the key to: $keyFile" -ForegroundColor Yellow
  Write-Host "MOVE IT to a safe place (password manager / USB). If it is lost, encrypted messages cannot be read." -ForegroundColor Yellow
}
$key | npx wrangler secret put MESSAGE_KEY

Write-Host "5/5  Done." -ForegroundColor Green
Write-Host "Dashboard: https://sanad-api.ibrheamkhalaf88.workers.dev/admin/  (stays locked until Cloudflare Access is set up)" -ForegroundColor Green
