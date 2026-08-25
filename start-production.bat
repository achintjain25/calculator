@echo off
setlocal
title RJ Jewellers - Production Server
color 0A
echo.
echo ==========================================
echo   RJ Jewellers - Production Server
echo ==========================================
echo.

REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )
cd /d "%~dp0server"

REM ---------------------------------------------------------------------------
if not exist "dist\index.js" (
  color 0C
  echo ERROR: No backend build found.
  echo.
  echo Run build-production.bat first.
  echo.
  pause
  exit /b 1
)

if not exist "..\client\dist\index.html" (
  color 0C
  echo ERROR: No frontend build found.
  echo.
  echo Run build-production.bat first.
  echo.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------------------
REM Production mode: strict security headers, no internal error details in API
REM responses, and the built client is served from this same process.
REM ---------------------------------------------------------------------------
set "NODE_ENV=production"

echo Starting on http://localhost:3000
echo.
echo The app and the API are served together on this one port,
echo so there is no separate frontend server to start.
echo.
echo Press Ctrl+C to stop.
echo.

node dist\index.js

REM Only reached if the server exits.
echo.
echo Server stopped.
pause
endlocal
