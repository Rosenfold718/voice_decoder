# Vox — Расшифровка голоса

Desktop-приложение для перевода русской речи в текст с экспортом в Word (.docx).

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Electron](https://img.shields.io/badge/Electron-43-blue?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)

## Возможности

- **Загрузка аудиофайлов** — MP3, WAV, M4A, FLAC, OGG, WebM (drag & drop или выбор файла)
- **Запись голоса** — прямо в приложении через микрофон браузера
- **Автоматическое разбиение** — длинные аудиофайлы режутся на 28-секундные чанки
- **Русский язык** — автоматическая конвертация при необходимости через LLM
- **Редактирование** — распознанный текст можно редактировать прямо в приложении
- **Экспорт в Word** — formatted .docx (Times New Roman 14pt, выравнивание по ширине)
- **Копирование** — один клик для копирования в буфер обмена

## Системные требования

- **Windows 10/11** (x64)
- **ffmpeg** — должен быть установлен и доступен в PATH
  - Скачайте с [ffmpeg.org](https://ffmpeg.org/download.html) и добавьте в PATH
  - Проверьте: `ffmpeg -version` в командной строке

## Установка и запуск

### Из исходников (разработка)

```bash
# Клонируйте репозиторий
git clone https://github.com/Rosenfold718/voice_decoder.git
cd voice_decoder

# Установите зависимости
npm install

# Создайте .env файл с API-ключом
cp .env.example .env
# Отредактируйте .env — впишите ваш ZAI_API_KEY

# Запустите в режиме разработки
npm run dev
# Откройте http://localhost:3000 в браузере
```

### Сборка .exe (для дистрибуции)

```bash
# Установите зависимости
npm install

# Соберите приложение
npm run electron:build
```

Результат: `dist-electron/Vox Setup X.X.X.exe` — установщик для Windows.

### Готовый .exe

После установки через `.exe`:
1. Убедитесь, что **ffmpeg** установлен и добавлен в PATH
2. Запустите **Vox** с рабочего стола
3. Приложение откроется автоматически

## Структура проекта

```
voice_decoder/
├── electron/              # Electron main process
│   ├── main.js           # Запуск Next.js сервера + окно
│   ├── preload.js        # Preload script (context bridge)
│   └── copy-static.js    # Post-build: копирование статики
├── src/
│   ├── app/
│   │   ├── page.tsx      # Главная страница (UI)
│   │   ├── layout.tsx    # Layout (lang=ru, метаданные)
│   │   ├── globals.css   # Тёмная тема, кастомный скроллбар
│   │   └── api/
│   │       ├── transcribe/route.ts   # ASR + LLM постобработка
│   │       └── export-docx/route.ts  # Генерация .docx
│   ├── components/ui/    # shadcn/ui компоненты
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Утилиты
├── public/               # Статические файлы
├── .env.example          # Шаблон переменных окружения
├── package.json          # Зависимости + Electron конфигурация
└── next.config.ts        # Next.js (standalone output)
```

## Технологии

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion
- **Backend**: Next.js API Routes, z-ai-web-dev-sdk (ASR + LLM)
- **Audio**: ffmpeg (конвертация + чанкинг), Web Audio API (визуализация)
- **Desktop**: Electron 43, electron-builder (NSIS installer)
- **Export**: docx.js (Word документы)

## Лицензия

MIT