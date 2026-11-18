@echo off
cd /d "%~dp0\.."
if not exist dist (
  call npm run build
)
python python_app\server.py
pause
