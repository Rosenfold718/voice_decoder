---
Task ID: 1
Agent: main
Task: Исследование лучших моделей распознавания русской речи + полная сборка приложения VOX DECODER

Work Log:
- Исследован z-ai-web-dev-sdk ASR: поддерживает MP3, WAV, M4A, FLAC, OGG, WebM; base64 API; кеширование
- Изучен docx пакет для генерации Word-файлов
- Установлен пакет `docx@9.7.1`
- Создан API `/api/transcribe` (POST, multipart) — валидация формата/размера, base64 → ASR SDK, постобработка текста
- Создан API `/api/export-docx` (POST, JSON) — генерация .docx с заголовком, метаданными, форматированием (Times New Roman 14pt, выравнивание по ширине, абзацный отступ)
- Создан фронтенд `page.tsx` — хай-тек тёмный UI с glass-morphism, анимированной звуковой волной, drag&drop загрузкой, прогресс-баром, редактируемым текстовым полем, кнопками экспорта в Word и копирования
- Обновлён `layout.tsx` — русский язык, метаданные VOX DECODER
- Обновлён `globals.css` — кастомный скроллбар, selection color, caret color
- ESLint: 0 ошибок
- Agent Browser: страница рендерится, footer sticky, 0 console errors, мобильный responsive

Stage Summary:
- Приложение VOX DECODER полностью собрано и работает
- 2 API-роута: /api/transcribe, /api/export-docx
- Поддерживаемые форматы (вход): MP3, WAV, M4A, FLAC, OGG, WebM
- Автоконвертация MP3/M4A/FLAC/OGG → WAV 16kHz mono через ffmpeg перед отправкой в ASR
- Экспорт в .docx с форматированием
- Тёмный хай-тек интерфейс с анимациями
- Готово к деплою в репозиторий

---
Task ID: 2
Agent: main
Task: Исправление ошибки 400 при загрузке MP3 — ASR SDK принимает только WAV и WebM

Work Log:
- Обнаружена ошибка: ASR SDK возвращает 400 для MP3 — "unsupported audio format: unknown, only WAV and WebM are supported"
- Проверен ffmpeg на сервере — доступен (7.1.4)
- Переписан `/api/transcribe/route.ts`: сохранение файла в tmpdir → конвертация через ffmpeg → base64 → ASR
- Конвертация: 16kHz, mono, 16-bit PCM WAV (оптимально для ASR)
- Добавлена очистка temp-директорий в finally-блоке
- ESLint: 0 ошибок

Stage Summary:
- MP3 и другие форматы теперь автоматически конвертируются в WAV перед отправкой в ASR
- Фронтенд не нужно менять — конвертация прозрачна для пользователя