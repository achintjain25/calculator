@echo off
setlocal
title RJ Jewellers - Production Build
color 0B
echo.
echo ==========================================
echo   RJ Jewellers - Production Build
echo ==========================================
echo.

REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )

REM ---------------------------------------------------------------------------
echo [1/5] Checking configuration...
if not exist "%~dp0server\.env" (
  color 0C
  echo.
  echo ERROR: server\.env is missing.
  echo.
  echo   copy server\.env.example server\.env
  echo.
  echo Then edit it and set DB_PASSWORD before building.
  echo.
  pause
  exit /b 1
)
echo      server\.env found.
echo.

REM ---------------------------------------------------------------------------
echo [2/5] Installing dependencies...
echo.
cd /d "%~dp0client"
call npm install
if errorlevel 1 goto :failed

cd /d "%~dp0server"
call npm install
if errorlevel 1 goto :failed
echo.

REM ---------------------------------------------------------------------------
echo [3/5] Applying database migrations...
echo.
call npm run migrate
if errorlevel 1 goto :failed
echo.

REM ---------------------------------------------------------------------------
echo [4/5] Building the backend...
echo.
call npm run build
if errorlevel 1 goto :failed
echo.

REM ---------------------------------------------------------------------------
echo [5/5] Building the frontend...
echo.
cd /d "%~dp0client"
call npm run build
if errorlevel 1 goto :failed
echo.

color 0A
echo ==========================================
echo   BUILD COMPLETE
echo ==========================================
echo.
echo Start the production server with:
echo    start-production.bat
echo.
echo It serves the app AND the API on one port, so there is
echo no separate frontend process to run.
echo.
pause
endlocal
exit /b 0

:failed
color 0C
echo.
echo ==========================================
echo   BUILD FAILED - see the error above.
echo ==========================================
echo.
pause
endlocal
exit /b 1
