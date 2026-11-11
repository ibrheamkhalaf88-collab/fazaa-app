# Fazaa: update the live site. Run in PowerShell:  .\deploy-fazaa.ps1
# It pulls the latest code, builds the dashboard and deploys the Worker.
# It does NOT touch secrets (MESSAGE_KEY etc.) or the database.
$ErrorActionPreference = "Stop"

$repo = Join-Path $env:USERPROFILE "fazaa-app"
if (-not (Test-Path (Join-Path $repo "server\api\wrangler.toml"))) {
  Write-Host "Cannot find the project at $repo" -ForegroundColor Red; exit 1
}

# On this PC the git wrapper in PATH can fail ("fork bomb"); prefer the real binary when it exists.
$git = "C:\Program Files\Git\mingw64\bin\git.exe"
if (-not (Test-Path $git)) { $git = "git" }

Write-Host "1/3  Getting the latest code..." -ForegroundColor Cyan
Set-Location $repo
& $git pull
if ($LASTEXITCODE -ne 0) { Write-Host "git pull failed; nothing was deployed." -ForegroundColor Red; exit 1 }

Write-Host "2/3  Building the dashboard..." -ForegroundColor Cyan
node scripts\build-admin.mjs

Write-Host "3/3  Deploying..." -ForegroundColor Cyan
Set-Location (Join-Path $repo "server\api")
npx wrangler deploy

Write-Host "Done. Open the site and refresh it twice." -ForegroundColor Green
