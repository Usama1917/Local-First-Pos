@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"
title نظام المحل

echo ============================================
echo            نظام المحل - تشغيل
echo ============================================
echo.

REM --- التأكد إن Node موجود ---
where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبّت. شغّل "Setup POS.bat" الأول أو ثبّت Node.js 24 من https://nodejs.org
  echo [ERROR] Node.js is not installed.
  pause
  exit /b 1
)

REM --- التأكد إن إصدار Node رقم 24 أو أحدث ---
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 24 (
  echo [خطأ] لازم Node.js إصدار 24 أو أحدث. الإصدار الحالي:
  node -v
  echo ثبّت Node.js 24 من https://nodejs.org
  pause
  exit /b 1
)

REM --- التأكد إن pnpm موجود ---
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [خطأ] pnpm غير مثبّت. شغّل "Setup POS.bat" الأول.
  echo [ERROR] pnpm is not installed. Run "Setup POS.bat" first.
  pause
  exit /b 1
)

if not exist "logs" mkdir "logs"

REM --- هل الخادم شغّال بالفعل على المنفذ 8080؟ ---
netstat -ano | findstr ":8080" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo النظام يعمل بالفعل. جارٍ فتح المتصفح...
  start "" "http://localhost:8080"
  exit /b 0
)

REM --- التأكد إن في نسخة مبنية جاهزة (أول تشغيل ممكن يبنيها) ---
if not exist "artifacts\pos\dist\public\index.html" goto needbuild
if not exist "artifacts\api-server\dist\index.mjs" goto needbuild
goto run

:needbuild
echo [تنبيه] لا توجد نسخة جاهزة — جارٍ التجهيز لأول مرة (ممكن ياخد دقائق)...
call pnpm run build:shop
if errorlevel 1 (
  echo [خطأ] فشل التجهيز. افتح "logs\pos-server.log" أو شغّل "Setup POS.bat".
  pause
  exit /b 1
)

:run
echo جارٍ تشغيل الخادم على المنفذ 8080 ...
set "NODE_ENV=production"
set "PORT=8080"

REM --- تشغيل الخادم في نافذة مصغّرة مع تسجيل السجل في ملف ---
start "POS Server" /min cmd /c "pnpm run start:shop >> logs\pos-server.log 2>&1"

REM --- الانتظار حتى يرد فحص الصحة ثم فتح المتصفح ---
echo جارٍ انتظار بدء الخادم ...
set /a TRIES=0
:waitloop
timeout /t 1 /nobreak >nul
set /a TRIES+=1
curl -s -o nul "http://localhost:8080/api/healthz"
if not errorlevel 1 goto ready
if %TRIES% GEQ 30 goto slow
goto waitloop

:ready
echo النظام جاهز ✓ جارٍ فتح المتصفح...
start "" "http://localhost:8080"
exit /b 0

:slow
echo [تنبيه] الخادم اتأخر في البدء. هفتح المتصفح برضو — لو الصفحة مش بتفتح راجع "logs\pos-server.log".
start "" "http://localhost:8080"
exit /b 0
