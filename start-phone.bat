@echo off
cd /d "%~dp0"
pip install -q -r requirements.txt
python server.py --mobile
pause
