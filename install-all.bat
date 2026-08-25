@echo off
setlocal
title RJ Jewellers - Install All Dependencies
color 0E

REM %~dp0 is this script's own folder, so the project works from any location.
REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )

echo.
echo ==========================================
echo  Installing CLIENT dependencies...
echo ==========================================
cd /d "%~dp0client"
call npm install
if errorlevel 1 goto :failed
echo.

echo ==========================================
echo  Installing SERVER dependencies...
echo ==========================================
cd /d "%~dp0server"
call npm install
if errorlevel 1 goto :failed
echo.

if not exist "%~dp0server\.env" (
  echo Creating server\.env from .env.example...
  copy /y "%~dp0server\.env.example" "%~dp0server\.env" >nul
  echo.
  echo IMPORTANT: edit server\.env and set DB_PASSWORD.
  echo.
)

color 0A
echo ==========================================
echo  ALL DONE
echo ==========================================
echo.
echo Next:
echo   1. Edit server\.env and set DB_PASSWORD
echo   2. setup-database.bat    (creates the DB and runs migrations)
echo.
echo Then, for development:
echo   3. start-server.bat      (backend,  one window)
echo   4. start-client.bat      (frontend, another window)
echo.
echo Or, for production:
echo   3. build-production.bat
echo   4. start-production.bat  (serves app + API on one port)
echo.
pause
endlocal
exit /b 0

:failed
color 0C
echo.
echo INSTALL FAILED - see the error above.
echo.
pause
endlocal
exit /b 1
