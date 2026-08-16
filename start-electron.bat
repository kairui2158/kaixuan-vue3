@echo off
cd /d "%~dp0"

echo ========================================
echo   Shenyi Assistant (Vue3) - Starting...
echo ========================================
echo.

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo [ERR] Electron not found. Run: npm install
    pause
    exit /b 1
)

if not exist "%~dp0dist-renderer\index.html" (
    echo [WARN] dist-renderer not found. Building...
    call npx vite build
)

echo [OK] Electron found
echo [OK] dist-renderer found
echo [OK] Starting application...
echo.

start "" "%~dp0node_modules\electron\dist\electron.exe" --remote-debugging-port=9227 --remote-allow-origins=* "%~dp0."

echo [OK] Application started
echo.
echo If window does not appear, try: npm start
echo.
pause
