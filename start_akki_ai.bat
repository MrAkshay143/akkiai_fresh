@echo off
title Akki AI Desktop Companion
cd /d "%~dp0"
echo ==============================================
echo   Starting Akki AI Desktop Companion...
echo ==============================================
call npm run electron:start
