@echo off
title Jewelry Shop - Install and Run
color 0E
echo.
echo ========================================
echo   Jewelry Shop Calculator Setup
echo ========================================
echo.

REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )
cd /d "%~dp0client"

echo [1/3] Installing dependencies...
echo.
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Dependencies installed successfully!
echo.
echo [3/3] Starting development server...
echo.
echo The app will open at: http://localhost:5173
echo.
echo Press Ctrl+C to stop the server.
echo.
call npm run dev
pause
