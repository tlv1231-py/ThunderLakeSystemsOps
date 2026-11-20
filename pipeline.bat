@echo off
title TLS Pipeline
cd /d %~dp0
if not exist logs mkdir logs

:RERUN
cls
echo.
echo  [TLS Pipeline]
echo.
powershell -command "node scripts/income-agent.mjs 2>&1 | Tee-Object -FilePath 'logs\pipeline-latest.log'"
echo.
echo  Done.  Log saved to logs\pipeline-latest.log
echo.
echo  [SPACE] run again    [any other key] exit
echo.
powershell -NoProfile -Command "$k=$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown'); exit ([int]($k.Character -eq ' '))"
if %ERRORLEVEL%==1 goto RERUN
