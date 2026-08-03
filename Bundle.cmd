@echo off
setlocal
title Photo Meta Developer Bundle
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\build.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Developer bundle failed with exit code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)
echo.
echo Developer bundle completed in .\out.
pause
endlocal
