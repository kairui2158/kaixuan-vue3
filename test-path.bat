@echo off
cd /d "%~dp0"
echo DPD0=[%~dp0]
echo DPD0DOT=[%~dp0.]
cd /d "%~dp0."
echo AFTER_CD=[%CD%]
pause
