@echo off
REM ============================================================================
REM  Shared Node.js resolver - called by the other .bat scripts.
REM
REM  This project can run two ways:
REM    1. With a bundled runtime in the "nodejs" folder (original Windows
REM       setup). That folder is ~105MB of binaries, so it is git-ignored and
REM       will NOT be present in a fresh clone.
REM    2. With Node.js installed normally on the machine.
REM
REM  Prefer the bundled copy when it exists, otherwise fall back to the system
REM  install, and fail with a clear message if neither is available.
REM
REM  NOTE: keep this file pure ASCII. cmd.exe reads .bat files in the OEM
REM  codepage, so UTF-8 punctuation (dashes, arrows, box drawing) decodes into
REM  garbage that cmd tries to execute - which also clobbers ERRORLEVEL.
REM ============================================================================

if exist "%~dp0nodejs\node.exe" (
  set "PATH=%~dp0nodejs;%PATH%"
  goto :found
)

REM Check for a system install. Test ERRORLEVEL on the very next line so
REM nothing in between can overwrite it.
where node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 goto :found

REM -- Neither available -------------------------------------------------------
color 0C
echo.
echo ============================================================
echo   Node.js not found
echo ============================================================
echo.
echo This project needs Node.js 18 or newer.
echo.
echo Install it from:  https://nodejs.org/  (choose the LTS version)
echo.
echo Then CLOSE this window, open a new one, and run this script again.
echo.
echo ------------------------------------------------------------
echo Note: if you cloned this project from GitHub, the bundled
echo "nodejs" folder is deliberately not included - it is ~105MB
echo of Windows binaries. Installing Node.js normally is correct.
echo ------------------------------------------------------------
echo.
exit /b 1

:found
exit /b 0
