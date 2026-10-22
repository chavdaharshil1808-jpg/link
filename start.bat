@echo off
title Universal Downloader
color 0A

echo.
echo  ======================================================
echo     UNIVERSAL DOWNLOADER - STARTING ALL SERVICES
echo  ======================================================
echo.

:: ============================================
:: CHECK IF .env EXISTS
:: ============================================

if not exist ".env" (
    echo  [!] .env file not found!
    echo      Running setup first...
    echo.
    call setup.bat
)

:: ============================================
:: CHECK IF DEPS ARE INSTALLED
:: ============================================

if not exist "node_modules" (
    echo  [!] Root dependencies not installed.
    echo      Running setup first...
    call setup.bat
)

if not exist "client\node_modules" (
    echo  [!] Client dependencies not installed.
    call setup.bat
)

if not exist "server\node_modules" (
    echo  [!] Server dependencies not installed.
    call setup.bat
)

:: ============================================
:: START EACH SERVICE IN SEPARATE CMD WINDOW
:: ============================================

echo.
echo  Opening separate windows for each service...
echo.

:: --- Client (Frontend) ---
echo  [1/3] Starting Frontend (React + Vite)...
start "UD - Frontend" cmd /k "title UD - Frontend (React) && color 0B && echo. && echo  Frontend running at: http://localhost:5173 && echo. && cd client && npm run dev"

:: Wait 2 seconds before starting next
timeout /t 2 /nobreak >nul

:: --- Server (Backend) ---
echo  [2/3] Starting Backend (Node.js + Express)...
start "UD - Backend" cmd /k "title UD - Backend (Node.js) && color 0E && echo. && echo  Backend running at: http://localhost:3001 && echo. && cd server && npm run dev"

:: Wait 2 seconds before starting next
timeout /t 2 /nobreak >nul

:: --- Python Service (Download Engine) ---
echo  [3/3] Starting Python Service (FastAPI + yt-dlp)...
start "UD - Python Service" cmd /k "title UD - Python Service (FastAPI) && color 0A && echo. && echo  Python API running at: http://localhost:8001 && echo  Swagger Docs at: http://localhost:8001/docs && echo. && cd python-service && python -m uvicorn app.main:app --reload --port 8001"

:: ============================================
:: DONE
:: ============================================

echo.
echo  ======================================================
echo     ALL SERVICES LAUNCHED!
echo  ======================================================
echo.
echo  3 separate windows opened:
echo    [1] Frontend  - http://localhost:5173
echo    [2] Backend   - http://localhost:3001
echo    [3] Python    - http://localhost:8001
echo.
echo  Default Login:  admin@universaldl.com / admin123456
echo.
echo  To STOP a service: close its window or press Ctrl+C
echo  To STOP all: close all 3 windows
echo.
echo  ======================================================
echo.
pause
