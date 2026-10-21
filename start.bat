@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: CrackCoder Launcher
:: Builds and starts the Electron app silently (no taskbar icon).
:: Press Ctrl+Q inside the app to quit.
:: Press Ctrl+H to take a screenshot.
:: Press Ctrl+Enter to get AI solution.
:: Press Ctrl+B to toggle show/hide.
:: ─────────────────────────────────────────────────────────────────────────────

title CrackCoder

:: Change to the script's own directory so paths always work
cd /d "%~dp0"

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: ── Install dependencies if node_modules is missing ──────────────────────────
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
)

:: ── Build TypeScript + Webpack ────────────────────────────────────────────────
echo [INFO] Building project...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed. Check the errors above.
    pause
    exit /b 1
)

:: ── Launch Electron (completely detached GUI process) ─────────────────────────
echo [INFO] Launching CrackCoder...
start "" "node_modules\electron\dist\electron.exe" .

:: Close the console window automatically after launch
exit
