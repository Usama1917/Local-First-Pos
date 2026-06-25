@echo off
chcp 65001 >nul
setlocal enableextensions enabledelayedexpansion
cd /d "%~dp0"
title تحديث نظام المحل

echo ============================================
echo        تحديث نظام المحل (للمطوّر)
echo ============================================
echo.
echo يُفضّل تقفل النظام الأول بتشغيل "Stop POS.bat".
echo.

REM ====== 1) نسخة احتياطية لقاعدة البيانات قبل أي حاجة ======
if exist "data\store.db" (
  if not exist "backups" mkdir "backups"
  for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HH-mm-ss"') do set "TS=%%t"
  set "BACKUP=backups\store-backup-!TS!.db"
  echo جارٍ عمل نسخة احتياطية: !BACKUP!
  copy /Y "data\store.db" "!BACKUP!" >nul
  if errorlevel 1 (
    echo [خطأ] فشل عمل النسخة الاحتياطية. تم إيقاف التحديث للأمان.
    pause
    exit /b 1
  )
  REM نسخ ملفات WAL/SHM لو موجودة (لقطة متّسقة)
  if exist "data\store.db-wal" copy /Y "data\store.db-wal" "backups\store-backup-!TS!.db-wal" >nul
  if exist "data\store.db-shm" copy /Y "data\store.db-shm" "backups\store-backup-!TS!.db-shm" >nul
  echo [✓] تم حفظ النسخة الاحتياطية.
) else (
  echo [تنبيه] لا توجد قاعدة بيانات data\store.db بعد — تخطّي النسخ الاحتياطي.
  echo (لو نقلت مكان البيانات من داخل البرنامج، اعمل نسخة احتياطية من داخل التطبيق الأول.)
)

echo.
echo ====== 2) جلب آخر تحديث من GitHub ======
call git pull origin main
if errorlevel 1 (
  echo [خطأ] فشل "git pull". قاعدة بياناتك سليمة والنسخة الاحتياطية في مجلد "backups".
  pause
  exit /b 1
)

echo.
echo ====== 3) تثبيت الحزم ======
call pnpm install
if errorlevel 1 (
  echo [خطأ] فشل "pnpm install". النسخة الاحتياطية في مجلد "backups".
  pause
  exit /b 1
)

echo.
echo ====== 4) بناء النظام ======
call pnpm run build:shop
if errorlevel 1 (
  echo [خطأ] فشل البناء. النسخة الاحتياطية في مجلد "backups".
  pause
  exit /b 1
)

echo.
echo ============================================
echo   تم التحديث بنجاح ✓
echo   شغّل "Start POS.bat" للاستخدام.
echo ============================================
pause
exit /b 0
