@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"
title إيقاف نظام المحل

echo جارٍ إيقاف خادم النظام (المنفذ 8080) ...
echo.

set "FOUND=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo إيقاف العملية رقم %%p ...
  taskkill /PID %%p /F >nul 2>nul
  set "FOUND=1"
)

if "%FOUND%"=="0" (
  echo النظام لم يكن يعمل.
) else (
  echo تم إيقاف النظام ✓
)

REM --- نسخة احتياطية مشفّرة على GitHub (لو متعمل لها إعداد) ---
if exist "cloud-backup.json" (
  echo.
  echo جارٍ رفع نسخة احتياطية على GitHub ...
  node scripts\cloud-backup.mjs
  if errorlevel 1 (
    echo [تنبيه] فشل رفع النسخة — البيانات سليمة على الجهاز. التفاصيل في logs\cloud-backup.log
  ) else (
    echo [✓] النسخة الاحتياطية على GitHub تمام.
  )
)

echo.
echo ملاحظة: هذا الملف يوقف فقط العملية اللي بتستخدم المنفذ 8080.
pause
exit /b 0
