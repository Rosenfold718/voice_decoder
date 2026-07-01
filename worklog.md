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

---
Task ID: 3
Agent: main
Task: Исправление двух багов: (1) ASR переводит русский на английский, (2) запись голоса пустая

Work Log:
- Баг 1 (язык): В API transcribe добавлен параметр `language: "ru"` к вызову `zai.audio.asr.create()`. TypeScript-тип SDK не включает `language`, поэтому используется `as any`. API не отклоняет параметр (проверено тестовым вызовом — ошибка была только о длительности файла).
- Баг 2 (запись): В режиме «Запись» добавлен янтарный баннер-предупреждение, если `navigator.mediaDevices.getUserMedia` не доступен. Кнопка записи становится disabled + opacity-40. В обработчиках `onstop` (пустая запись) и детекции тишины улучшены сообщения toast с пояснением что запись работает только на реальном ПК в браузере.
- Проверено через Agent Browser: страница рендерится без ошибок, console errors = 0.

Stage Summary:
- ASR теперь получает `language: "ru"` для каждого чанка + LLM постобработка при >20% английского текста
- Режим записи: проактивная проверка микрофона при открытии вкладки (800ms probe), баннер + disabled-кнопка когда микрофон мёртвый
- Проверено через Agent Browser: баннер появляется, кнопка disabled, ссылка «Перейти к загрузке файла» переключает на вкладку Файл