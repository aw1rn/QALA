# QALA на Python (Backend + SQLite + M3U/IPTV Админка)

Этот каталог содержит автономный Python-сервер (`server.py`) на стандартной библиотеке Python 3.10+ (без обязательных внешних пакетов `pip`).

## Возможности
- Обслуживает собранный Liquid Glass интерфейс из папки `dist/`.
- Использует общую базу SQLite `data/qala.db` (телеканалы, M3U-ссылки, профиль, объявления, кошелёк, планы).
- Встроенный парсер `#EXTM3U` плейлистов по URL и тексту (`POST /api/tv/m3u/import`).
- Сбор бесплатных казахстанских каналов (`POST /api/tv/m3u/import-kz-free`).
- HLS-прокси (`/api/tv/proxy`) для воспроизведения HTTP и CORS-ограниченных `.m3u8` потоков.
- Экспорт собственного плейлиста (`/api/tv/export.m3u`) и всех файлов проекта (`/api/download-source`).

## Запуск
```bash
npm run build
python3 python_app/server.py
```

На Windows можно просто запустить `python_app\run.bat`.
Сервер откроется на `http://localhost:3000` (порт меняется переменной `PORT`).
