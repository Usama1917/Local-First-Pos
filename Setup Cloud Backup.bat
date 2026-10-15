@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"
title إعداد النسخ الاحتياطي على GitHub

echo ============================================
echo     إعداد النسخ الاحتياطي على GitHub (مرة واحدة)
echo ============================================
echo.
echo ممكن تعمل نفس الإعداد من جوّه البرنامج: الإعدادات ^> النسخ الاحتياطي ^> إعداد GitHub.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبّت. شغّل "Setup POS.bat" الأول.
  pause
  exit /b 1
)

node scripts\cloud-backup.mjs setup
if errorlevel 1 (
  echo.
  echo [خطأ] الإعداد ما كملش — راجع الرسالة اللي فوق أو logs\cloud-backup.log
  pause
  exit /b 1
)
pause
exit /b 0
