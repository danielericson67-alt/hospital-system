@echo off
title Mukono Hospital Care Desk
echo Starting Mukono Hospital Care Desk. Do not close the two black windows while you work.
start "Care Desk Backend" /D "%~dp0backend" cmd /k npm start
start "Care Desk Frontend" /D "%~dp0frontend" cmd /k npm run dev
timeout /t 10 >nul
start http://localhost:5173