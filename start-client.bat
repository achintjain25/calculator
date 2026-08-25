@echo off
title RJ Jewellers - Frontend
color 0E
echo.
echo ========================================
echo   RJ Jewellers - Frontend App
echo ========================================
echo.
REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )

cd /d "%~dp0client"

if not exist "node_modules" (
  echo [1/2] Installing client dependencies...
  call npm install
  echo.
)

echo [2/2] Starting frontend on http://localhost:5173
echo.
echo Press Ctrl+C to stop.
echo.
call npm run dev
pause
