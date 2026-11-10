@echo off
REM Double-click to run Fazaa locally and open it in your browser.
cd /d "%~dp0"
where node >nul 2>nul && (
  start "" http://localhost:8080
  npx --yes serve . -l 8080
) || (
  where python >nul 2>nul && (
    start "" http://localhost:8080
    python -m http.server 8080
  ) || (
    echo Install Node.js ^(https://nodejs.org^) or Python, then run this again.
    pause
  )
)
