# 一键启动 NGINX // PULSE 前后端服务 (Windows PowerShell)
Write-Host "Starting NGINX // PULSE Backend on http://127.0.0.1:8090 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python main.py"

Write-Host "Starting NGINX // PULSE Frontend Dev Server on http://127.0.0.1:5173 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"
