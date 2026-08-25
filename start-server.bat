@echo off
setlocal
title RJ Jewellers - Backend Server (development)
color 0A
echo.
echo ========================================
echo   RJ Jewellers - Backend API Server
echo ========================================
echo.

REM %~dp0 is this script's own folder, so the project still works if it is
REM moved off C:\Calculator.
REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )
cd /d "%~dp0server"

if not exist ".env" (
  echo Creating server\.env from .env.example...
  copy /y ".env.example" ".env" >nul
  echo.
  echo IMPORTANT: edit server\.env and set DB_PASSWORD, then run this again.
  echo.
  pause
  exit /b 1
)

REM Only install when dependencies are actually missing - the old script ran
REM npm install on every single launch.
if not exist "node_modules" (
  echo [1/2] Installing server dependencies...
  call npm install
  if errorlevel 1 (
    color 0C
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo [2/2] Starting backend on http://localhost:3000
echo.
echo Press Ctrl+C to stop.
echo.

call npm run dev

echo.
echo Server stopped.
pause
endlocal
