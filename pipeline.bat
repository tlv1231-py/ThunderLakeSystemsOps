@echo off
title TLS Pipeline
cd /d %~dp0
if not exist logs mkdir logs
echo Running pipeline...
echo.
powershell -command "node scripts/income-agent.mjs 2>&1 | Tee-Object -FilePath 'logs\pipeline-latest.log'"
echo.
echo Done. Log saved to logs\pipeline-latest.log
pause
