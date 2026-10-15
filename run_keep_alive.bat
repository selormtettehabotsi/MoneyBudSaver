@echo off
title MoneyCouncil Render Keep-Alive Daemon
echo ===================================================
echo  Starting MoneyCouncil Render Keep-Alive Service
echo  Keeps https://moneycouncil-7zcr.onrender.com awake
echo ===================================================
where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    py render_keep_alive.py
) else (
    python render_keep_alive.py
)
pause
