# Vox — Расшифровка голоса

Desktop-приложение для перевода русской речи в текст с экспортом в Word (.docx).

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Electron](https://img.shields.io/badge/Electron-43-blue?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)

## Возможности

- **Загрузка аудиофайлов** — MP3, WAV, M4A, FLAC, OGG, WebM (drag & drop или выбор файла)
- **Автоматическое разбиение** — длинные аудиофайлы режутся на 28-секундные чанки
- **Русский язык** — автоматическая конвертация при необходимости через LLM
- **Редактирование** — распознанный текст можно редактировать прямо в приложении
- **Экспорт в Word** — форматированный .docx (Times New Roman 14pt, выравнивание по ширине)
- **Копирование** — один клик для копирования в буфер обмена

## Установка

1. Скачайте **Vox Setup.exe** из раздела [Releases](https://github.com/Rosenfold718/voice_decoder/releases)
2. Запустите скачанный файл
3. Нажмите «Установить»
4. Готово! На рабочем столе появится иконка **Vox**

### Системные требования

- Windows 10 или 11 (x64)
- Интернет-соединение (для распознавания речи)

Никакого дополнительного ПО устанавливать не нужно — всё включено.

## Разработка

```bash
git clone https://github.com/Rosenfold718/voice_decoder.git
cd voice_decoder
npm install
cp .env.example .env
npm run dev
```

## Структура проекта

```
voice_decoder/
├── .github/workflows/    # GitHub Actions — автосборка .exe
├── electron/              # Electron main process
├── src/
│   ├── app/
│   │   ├── page.tsx       # Главная страница (UI)
│   │   ├── layout.tsx     # Layout (lang=ru)
│   │   └── api/
│   │       ├── transcribe/route.ts   # ASR + LLM постобработка
│   │       └── export-docx/route.ts  # Генерация .docx
│   ├── components/ui/     # shadcn/ui компоненты
│   ├── hooks/
│   └── lib/
├── public/
├── package.json
└── next.config.ts
```

## Технологии

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion
- **Backend**: Next.js API Routes, z-ai-web-dev-sdk (ASR + LLM)
- **Audio**: ffmpeg (встроен в .exe), Web Audio API
- **Desktop**: Electron 43, electron-builder (NSIS installer)
- **Export**: docx.js

## Лицензия

MIT
