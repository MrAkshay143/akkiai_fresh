@echo off
title AKKI AI - Desktop AI Companion
chcp 65001 >nul
cls

echo ======================================================================
echo                 AKKI AI - Desktop AI Companion
echo ======================================================================
echo.
echo [INFO] Working Directory: %~dp0
cd /d "%~dp0"

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. If user requested rebuild or build files are missing, compile first
if "%1"=="--rebuild" goto do_build
if not exist "dist\index.html" goto do_build
if not exist "dist-electron\main\index.js" goto do_build
goto do_start

:do_build
echo [INFO] Compiling application source code...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
call npm run build:electron
if %errorlevel% neq 0 (
    echo [ERROR] Electron build failed!
    pause
    exit /b %errorlevel%
)

:do_start
echo [INFO] Launching AKKI AI Application...
echo [INFO] Sandbox Storage: %%APPDATA%%\AkkiAiFresh (Existing app is 100%% safe)
echo.

call npx electron .

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Application exited with code %errorlevel%.
    pause
)
