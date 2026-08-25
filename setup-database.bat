@echo off
setlocal
title RJ Jewellers - Database Setup
color 0A
echo.
echo ==========================================
echo   RJ Jewellers - PostgreSQL Database Setup
echo ==========================================
echo.

REM ---------------------------------------------------------------------------
REM Locate psql.exe. Checks common PostgreSQL versions, then falls back to PATH.
REM ---------------------------------------------------------------------------
set "PSQL="
for %%V in (18 17 16 15 14) do (
  if not defined PSQL (
    if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" (
      set "PSQL=C:\Program Files\PostgreSQL\%%V\bin\psql.exe"
    )
  )
)
if not defined PSQL (
  where psql.exe >nul 2>&1 && set "PSQL=psql.exe"
)
if not defined PSQL (
  color 0C
  echo ERROR: Could not find psql.exe.
  echo.
  echo Install PostgreSQL from https://www.postgresql.org/download/windows/
  echo or add its "bin" folder to your PATH, then run this again.
  echo.
  pause
  exit /b 1
)
echo Using: %PSQL%
echo.

REM ---------------------------------------------------------------------------
REM Prompt for the postgres password rather than hard-coding it.
REM The old version of this script shipped with "postgres" baked in.
REM ---------------------------------------------------------------------------
set "PGUSER=postgres"
set /p PGUSER=PostgreSQL username [postgres]:
if "%PGUSER%"=="" set "PGUSER=postgres"

echo.
echo Enter the password for PostgreSQL user "%PGUSER%".
echo (It is used for this session only and is not saved by this script.)
set "PGPASSWORD="
set /p PGPASSWORD=Password:
echo.

REM ---------------------------------------------------------------------------
echo [1/3] Creating database "rj_jewellers" (harmless error if it exists)...
echo.
"%PSQL%" -U "%PGUSER%" -c "CREATE DATABASE rj_jewellers;" 2>&1
echo.

REM ---------------------------------------------------------------------------
echo [2/3] Checking the connection...
"%PSQL%" -U "%PGUSER%" -d rj_jewellers -c "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo FAILED - could not connect to the rj_jewellers database.
  echo.
  echo Common fixes:
  echo   - Make sure the PostgreSQL service is running in Windows Services
  echo   - Check the username and password you entered
  echo.
  pause
  exit /b 1
)
echo      Connection OK.
echo.

REM ---------------------------------------------------------------------------
REM Migrations run through the Node runner, which applies EVERY migration in
REM order and records what it ran. The old script only ever applied
REM 001_initial_schema.sql, so the columns from 002 and the tables from 003
REM were missing and payments and bills failed at runtime.
REM ---------------------------------------------------------------------------
echo [3/3] Applying database migrations...
echo.

set "PATH=%~dp0nodejs;%PATH%"
cd /d "%~dp0server"

if not exist "node_modules" (
  echo      Installing server dependencies first...
  call npm install
  echo.
)

if not exist ".env" (
  echo      Creating server\.env from .env.example...
  copy /y ".env.example" ".env" >nul
  echo.
  echo      IMPORTANT: edit server\.env and set DB_PASSWORD before starting.
  echo.
)

call npm run migrate
if errorlevel 1 (
  color 0C
  echo.
  echo FAILED - migrations did not complete. See the error above.
  echo.
  pause
  exit /b 1
)

color 0A
echo.
echo ==========================================
echo   SUCCESS! Database is ready.
echo ==========================================
echo.
echo Next steps:
echo   1. Edit C:\Calculator\server\.env and set DB_PASSWORD
echo   2. Run start-server.bat
echo   3. Run start-client.bat
echo.
pause
endlocal
