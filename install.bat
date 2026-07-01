@echo off
chcp 65001 >nul 2>&1
title Vox — Установка

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║         Vox — Расшифровка голоса           ║
echo  ║         Автоматическая установка           ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] Node.js не найден. Установите с https://nodejs.org
    echo      Нужна версия 18+
    pause
    exit /b 1
)

:: Check npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] npm не найден.
    pause
    exit /b 1
)

:: Check ffmpeg
where ffmpeg >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] ffmpeg не найден в PATH.
    echo      Скачайте с https://ffmpeg.org/download.html
    echo      и добавьте папку bin в переменную PATH.
    echo.
    pause
    exit /b 1
)

echo  [✓] Node.js  ... OK
echo  [✓] npm      ... OK
echo  [✓] ffmpeg   ... OK
echo.

:: Install dependencies
echo  [1/3] Установка зависимостей...
call npm install
if %ERRORLEVEL% neq 0 (
    echo  [!] Ошибка установки зависимостей
    pause
    exit /b 1
)
echo.

:: Create .env if not exists
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo  [i] Создан файл .env — впишите ваш ZAI_API_KEY
        echo.
    )
)

:: Build Next.js
echo  [2/3] Сборка приложения...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo  [!] Ошибка сборки
    pause
    exit /b 1
)
echo.

:: Build .exe
echo  [3/3] Создание .exe установщика...
call npm run electron:build
if %ERRORLEVEL% neq 0 (
    echo  [!] Ошибка сборки .exe
    pause
    exit /b 1
)
echo.

echo  ╔══════════════════════════════════════════════╗
echo  ║              ГОТОВО!                        ║
echo  ║                                              ║
echo  ║  Файл установщика:                          ║
echo  ║  dist-electron\Vox Setup 1.0.0.exe          ║
echo  ║                                              ║
echo  ║  Запустите его для установки Vox на ПК.     ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Open the output folder
explorer "dist-electron"

pause