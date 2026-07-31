@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Install failed with exit code %EXIT_CODE%.
  echo Review the messages above, then press any key to close this window.
  pause >nul
)
exit /b %EXIT_CODE%
