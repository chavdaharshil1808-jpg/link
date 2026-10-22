@echo off
title Universal Downloader - Full Setup
color 0B

echo.
echo  ======================================================
echo     UNIVERSAL DOWNLOADER - PROJECT SETUP
echo  ======================================================
echo.

:: ============================================
:: CHECK PREREQUISITES
:: ============================================

echo [1/9] Checking prerequisites...
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [X] Node.js is NOT installed!
    echo      Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo  [OK] Node.js found: %NODE_VER%

:: Check npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo  [X] npm is NOT installed!
    echo      Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VER=%%i
echo  [OK] npm found: v%NPM_VER%

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo  [X] Python is NOT installed!
    echo      Download from: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo  [OK] Python found: %PYTHON_VER%

:: Check pip
where pip >nul 2>nul
if %errorlevel% neq 0 (
    echo  [X] pip is NOT installed!
    echo      Run: python -m ensurepip --upgrade
    echo.
    pause
    exit /b 1
)
echo  [OK] pip found

:: Check PostgreSQL
where psql >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] PostgreSQL CLI (psql) not in PATH.
    echo      Make sure PostgreSQL is installed and added to PATH.
    echo      Download from: https://www.postgresql.org/download/windows/
    echo      Continuing anyway - if PostgreSQL is running, setup may work...
    echo.
) else (
    echo  [OK] PostgreSQL found
)

:: Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] FFmpeg is NOT in PATH.
    echo      Audio/video conversion may not work without it.
    echo      Download from: https://ffmpeg.org/download.html
    echo      Continuing anyway...
    echo.
) else (
    echo  [OK] FFmpeg found
)

echo.
echo  Prerequisites check complete.
echo.

:: ============================================
:: SETUP .ENV FILE
:: ============================================

echo [2/9] Setting up environment file...

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo  [OK] Created .env from .env.example
    echo  [!] Edit .env to configure your database and settings.
) else (
    echo  [OK] .env already exists - skipping
)

:: ============================================
:: INSTALL ROOT DEPENDENCIES
:: ============================================

echo.
echo [3/9] Installing root dependencies...

call npm install
if %errorlevel% neq 0 (
    echo  [X] Failed to install root dependencies!
    pause
    exit /b 1
)
echo  [OK] Root dependencies installed

:: ============================================
:: INSTALL CLIENT DEPENDENCIES
:: ============================================

echo.
echo [4/9] Installing client dependencies...

cd client
call npm install
if %errorlevel% neq 0 (
    echo  [X] Failed to install client dependencies!
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Client dependencies installed

:: ============================================
:: INSTALL SERVER DEPENDENCIES
:: ============================================

echo.
echo [5/9] Installing server dependencies...

cd server
call npm install
if %errorlevel% neq 0 (
    echo  [X] Failed to install server dependencies!
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Server dependencies installed

:: ============================================
:: INSTALL PYTHON DEPENDENCIES
:: ============================================

echo.
echo [6/9] Installing Python dependencies...

cd python-service
call pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo  [X] Failed to install Python dependencies!
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Python dependencies installed

:: ============================================
:: SETUP DATABASE
:: ============================================

echo.
echo [7/9] Setting up database (Prisma)...

cd database
call npx prisma generate
if %errorlevel% neq 0 (
    echo  [!] Prisma generate had issues - may need DATABASE_URL configured.
    echo      Edit .env and re-run: cd database ^&^& npx prisma generate
    cd ..
) else (
    echo  [OK] Prisma client generated

    echo.
    echo [8/9] Pushing database schema...

    call npx prisma db push
    if %errorlevel% neq 0 (
        echo  [!] Database push failed - make sure PostgreSQL is running.
        echo      Edit .env with correct DATABASE_URL, then run:
        echo        cd database ^&^& npx prisma db push
    ) else (
        echo  [OK] Database schema pushed

        echo.
        echo [9/9] Seeding database...

        call npx tsx prisma/seed.ts
        if %errorlevel% neq 0 (
            echo  [!] Seed failed - you can re-run later: npm run db:seed
        ) else (
            echo  [OK] Database seeded with admin user
        )
    )
    cd ..
)

:: ============================================
:: CREATE DOWNLOADS FOLDER
:: ============================================

if not exist "downloads" mkdir downloads
if not exist "python-service\downloads" mkdir python-service\downloads
echo  [OK] Downloads directories created

:: ============================================
:: COMPLETE
:: ============================================

echo.
echo  ======================================================
echo     SETUP COMPLETE!
echo  ======================================================
echo.
echo  SERVICES:
echo    Frontend  : http://localhost:5173
echo    Backend   : http://localhost:3001
echo    Python API: http://localhost:8001/docs
echo.
echo  DEFAULT LOGIN:
echo    Email    : admin@universaldl.com
echo    Password : admin123456
echo.
echo  NEXT STEPS:
echo    1. Make sure PostgreSQL is running
echo    2. Edit .env if you changed database credentials
echo    3. Run start.bat to start the project
echo.
echo  ======================================================
echo.
pause
