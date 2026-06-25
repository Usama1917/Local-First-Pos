@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"
title إعداد نظام المحل (أول مرة)

echo ============================================
echo    إعداد نظام المحل - أول مرة (للمطوّر)
echo ============================================
echo.
echo الخطوة دي بتتعمل مرة واحدة. بعدها الاستخدام اليومي يكون من "Start POS.bat".
echo.

REM --- Node موجود؟ ---
where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبّت.
  echo حمّل Node.js 24 من: https://nodejs.org  ثم أعد تشغيل هذا الملف.
  pause
  exit /b 1
)

REM --- Node إصدار 24 أو أحدث؟ ---
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 24 (
  echo [خطأ] لازم Node.js إصدار 24 أو أحدث. الحالي:
  node -v
  echo حمّل Node.js 24 من: https://nodejs.org
  pause
  exit /b 1
)
echo [✓] Node:
node -v

REM --- Git موجود؟ ---
where git >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Git غير مثبّت.
  echo حمّله من: https://git-scm.com/download/win  ثم أعد تشغيل هذا الملف.
  pause
  exit /b 1
)
echo [✓] Git:
git --version

REM --- pnpm موجود؟ لو لأ نثبّته ---
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm غير موجود — جارٍ تثبيته عبر npm ...
  call npm install -g pnpm
  if errorlevel 1 (
    echo [خطأ] فشل تثبيت pnpm. جرّب تفتح الـ Command Prompt كـ Administrator.
    pause
    exit /b 1
  )
)
echo [✓] pnpm:
pnpm -v

echo.
echo جارٍ تثبيت الحزم (أول مرة بتاخد دقائق — محتاج إنترنت)...
call pnpm install
if errorlevel 1 (
  echo [خطأ] فشل "pnpm install".
  pause
  exit /b 1
)

echo.
echo جارٍ بناء النظام (الواجهة + الخادم)...
call pnpm run build:shop
if errorlevel 1 (
  echo [خطأ] فشل البناء.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   تم الإعداد بنجاح ✓
echo.
echo   للاستخدام اليومي:
echo     - دوبل كليك على "Start POS.bat"
echo     - أو اعمل اختصار سطح المكتب بتشغيل "Create Desktop Shortcut.vbs"
echo       (هيظهر اختصار اسمه: نظام المحل)
echo ============================================
pause
exit /b 0
