import { GoogleGenAI } from '@google/genai';
import express from 'express';
import JSZip from 'jszip';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto, { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { createServer as createViteServer } from 'vite';
import {
  ASTANA_CENTER,
  ASTANA_EXTRA_POIS_SEED,
  ASTANA_PLACES,
  ASTANA_SERGEK_CAMERAS,
  ASTANA_TRAFFIC_SEGMENTS,
  KAZAKHSTAN_TV_CHANNELS,
} from './src/data/astanaData.ts';
import {
  getQalaKartaStore,
  queryQalaKartaViewport,
  searchQalaKarta,
} from './qalakartaLoader.ts';
import type {
  ApartmentListing,
  DeliveryStop,
  MapBookmark,
  MarketListing,
  PlanItem,
  QalaProfile,
  TvChannel,
  WalletTransaction,
} from './src/types/qala.ts';
import { buildWorldChannels, WORLD_PLAYLIST_PATH, WORLD_SOURCE_ID } from './src/lib/iptvWorld.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'qala.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_initial TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS apartments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    rent_type TEXT NOT NULL,
    rooms INTEGER NOT NULL,
    area REAL NOT NULL,
    floor TEXT NOT NULL,
    price INTEGER NOT NULL,
    address TEXT NOT NULL,
    district TEXT NOT NULL,
    source TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    added_at TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    is_custom INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS market_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    is_free INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    address TEXT NOT NULL,
    distance_meters INTEGER NOT NULL DEFAULT 300,
    seller_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_mine INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS delivery_stops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date_label TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS favorite_movies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    year INTEGER NOT NULL DEFAULT 0,
    genre TEXT NOT NULL DEFAULT 'Кино',
    duration TEXT NOT NULL DEFAULT '',
    rating TEXT NOT NULL DEFAULT '—',
    director TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    poster_url TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'open-cinema',
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tv_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Общий',
    current_show TEXT NOT NULL DEFAULT 'Прямой эфир',
    next_show TEXT NOT NULL DEFAULT 'Программа передач',
    accent_color TEXT NOT NULL DEFAULT '#2563EB',
    stream_url TEXT NOT NULL,
    logo_url TEXT NOT NULL DEFAULT '',
    quality_auto TEXT NOT NULL DEFAULT '',
    quality_720 TEXT NOT NULL DEFAULT '',
    quality_1080 TEXT NOT NULL DEFAULT '',
    is_regional INTEGER NOT NULL DEFAULT 0,
    source_m3u TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS m3u_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    channel_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS board_posts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    owner TEXT NOT NULL,
    created INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tv_favorites (
    channel_id TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tv_history (
    channel_id TEXT PRIMARY KEY,
    watched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS food_orders (
    id TEXT PRIMARY KEY,
    restaurant TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total INTEGER NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Готовится',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Город',
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cinema_booked_seats (
    session_key TEXT NOT NULL,
    seat_id TEXT NOT NULL,
    ticket_type TEXT NOT NULL DEFAULT 'Взрослый',
    booked_at TEXT NOT NULL,
    PRIMARY KEY (session_key, seat_id)
  );

  CREATE TABLE IF NOT EXISTS map_bookmarks (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'favorite',
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cinema_tickets (
    id TEXT PRIMARY KEY,
    session_key TEXT NOT NULL,
    movie_title TEXT NOT NULL,
    cinema_name TEXT NOT NULL,
    hall_name TEXT NOT NULL,
    time_label TEXT NOT NULL,
    seats_json TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    total_price INTEGER NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS route_history (
    id TEXT PRIMARY KEY,
    from_name TEXT NOT NULL,
    to_name TEXT NOT NULL,
    via_name TEXT NOT NULL DEFAULT '',
    from_lat REAL NOT NULL,
    from_lng REAL NOT NULL,
    to_lat REAL NOT NULL,
    to_lng REAL NOT NULL,
    via_lat REAL,
    via_lng REAL,
    distance_km REAL NOT NULL,
    duration_min INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'taxi',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS parking_sessions (
    id TEXT PRIMARY KEY,
    parking_title TEXT NOT NULL,
    zone TEXT NOT NULL,
    price_per_hour INTEGER NOT NULL,
    duration_min INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS utility_readings (
    id TEXT PRIMARY KEY,
    period TEXT NOT NULL,
    cold_water REAL NOT NULL,
    hot_water REAL NOT NULL,
    electricity_kwh REAL NOT NULL,
    heating_area REAL NOT NULL,
    total_kzt INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ikomek_reports (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Принято',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS garage_vehicles (
    id TEXT PRIMARY KEY,
    plate TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL DEFAULT 2021,
    mileage_km INTEGER NOT NULL DEFAULT 45000,
    tech_inspection_date TEXT NOT NULL DEFAULT '',
    insurance_date TEXT NOT NULL DEFAULT '',
    tire_season TEXT NOT NULL DEFAULT 'Зима (шипы)',
    next_oil_change_km INTEGER NOT NULL DEFAULT 50000,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS map_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'note',
    rating INTEGER NOT NULL DEFAULT 5,
    address TEXT NOT NULL DEFAULT 'Астана',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function seedDatabaseIfEmpty() {
  const profileCount = (
    db.prepare('SELECT COUNT(*) as c FROM profile').get() as { c: number }
  ).c;
  if (profileCount === 0) {
    db.prepare(
      `INSERT INTO profile (id, name, city, address, phone, email, avatar_initial)
       VALUES (1, 'Амир', 'Астана', 'Нұржол желек жолы, 14', '+7 (701) 555-01-42', 'amir@qala.kz', 'А')`
    ).run();
  }

  const aptCount = (
    db.prepare('SELECT COUNT(*) as c FROM apartments').get() as { c: number }
  ).c;
  if (aptCount === 0) {
    const initialApts: ApartmentListing[] = [
      {
        id: 'apt-1',
        title: '1-комн. квартира, 28 м², 3/9 эт.',
        rentType: 'Аренда',
        rooms: 1,
        area: 28,
        floor: '3/9 эт.',
        price: 120000,
        address: 'Нажимеденова, 19',
        district: 'Алматы район',
        source: 'kn.kz',
        lat: 51.1165,
        lng: 71.4982,
        addedAt: '13.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Уютная светлая квартира рядом с вокзалом Нурлы Жол, свежий ремонт, мебель и техника.',
      },
      {
        id: 'apt-2',
        title: '1-комн. квартира, 32 м², 5/12 эт.',
        rentType: 'Аренда',
        rooms: 1,
        area: 32,
        floor: '5/12 эт.',
        price: 130000,
        address: 'Казыбек би, 7',
        district: 'Сарыарка',
        source: 'kn.kz',
        lat: 51.1612,
        lng: 71.4184,
        addedAt: '13.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Тихий двор, развитая инфраструктура, 5 минут до набережной.',
      },
      {
        id: 'apt-3',
        title: '1-комн. квартира, 34 м², 4/9 эт.',
        rentType: 'Аренда',
        rooms: 1,
        area: 34,
        floor: '4/9 эт.',
        price: 135000,
        address: 'Тлендиева, 52',
        district: 'Сарыарка',
        source: 'krisha.kz',
        lat: 51.1815,
        lng: 71.3842,
        addedAt: '13.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Чистая квартира на длительный срок, рядом остановки маршрутов 10 и 32.',
      },
      {
        id: 'apt-4',
        title: '1-комн. квартира, 36 м², 6/10 эт.',
        rentType: 'Аренда',
        rooms: 1,
        area: 36,
        floor: '6/10 эт.',
        price: 140000,
        address: 'Манаса, 20/1',
        district: 'Алматы район',
        source: 'kn.kz',
        lat: 51.1504,
        lng: 71.4712,
        addedAt: '13.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Теплая квартира с застекленной лоджией и отдельной кухней.',
      },
      {
        id: 'apt-5',
        title: '1-комн. квартира, 39 м², 7/12 эт.',
        rentType: 'Аренда',
        rooms: 1,
        area: 39,
        floor: '7/12 эт.',
        price: 150000,
        address: 'Абылай хана, 49/2',
        district: 'Алматы район',
        source: 'krisha.kz',
        lat: 51.1422,
        lng: 71.4824,
        addedAt: '13.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Удобная транспортная развязка, рядом ТРЦ Евразия и школы.',
      },
      {
        id: 'apt-6',
        title: '2-комн. квартира, 54 м², 8/16 эт.',
        rentType: 'Аренда',
        rooms: 2,
        area: 54,
        floor: '8/16 эт.',
        price: 160000,
        address: 'Калдаякова, 11',
        district: 'Есиль',
        source: 'krisha.kz',
        lat: 51.1241,
        lng: 71.4662,
        addedAt: '14.11.2026',
        isFavorite: true,
        isHidden: false,
        isCustom: false,
        description: 'Вид на президентский парк, современный жилой комплекс с охраняемым двором.',
      },
      {
        id: 'apt-7',
        title: '2-комн. квартира, 60 м², 10/18 эт.',
        rentType: 'Аренда',
        rooms: 2,
        area: 60,
        floor: '10/18 эт.',
        price: 180000,
        address: 'Достык, 12',
        district: 'Есиль',
        source: 'kn.kz',
        lat: 51.1268,
        lng: 71.4275,
        addedAt: '14.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'В шаговой доступности от Байтерека и бульвара Нуржол.',
      },
      {
        id: 'apt-8',
        title: '3-комн. квартира, 82 м², 12/20 эт.',
        rentType: 'Аренда',
        rooms: 3,
        area: 82,
        floor: '12/20 эт.',
        price: 200000,
        address: 'Сыганак, 29',
        district: 'Есиль',
        source: 'krisha.kz',
        lat: 51.1194,
        lng: 71.4158,
        addedAt: '14.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Просторная семейная квартира рядом с парком и Абу-Даби Плаза.',
      },
      {
        id: 'apt-9',
        title: 'Студия у Байтерека, 35 м², 9/14 эт.',
        rentType: 'Посуточно',
        rooms: 1,
        area: 35,
        floor: '9/14 эт.',
        price: 18000,
        address: 'Нуржол бульвар, 14',
        district: 'Есиль',
        source: 'Qala',
        lat: 51.1289,
        lng: 71.4316,
        addedAt: '14.11.2026',
        isFavorite: false,
        isHidden: false,
        isCustom: false,
        description: 'Панорамные окна на левый берег, бесконтактное заселение, Wi-Fi 300 Мбит/с.',
      },
    ];

    const stmt = db.prepare(`
      INSERT INTO apartments (
        id, title, rent_type, rooms, area, floor, price, address, district,
        source, lat, lng, added_at, is_favorite, is_hidden, is_custom, description
      ) VALUES (
        @id, @title, @rentType, @rooms, @area, @floor, @price, @address, @district,
        @source, @lat, @lng, @addedAt, @isFavorite, @isHidden, @isCustom, @description
      )
    `);
    for (const a of initialApts) {
      stmt.run({
        id: a.id,
        title: a.title,
        rentType: a.rentType,
        rooms: a.rooms,
        area: a.area,
        floor: a.floor,
        price: a.price,
        address: a.address,
        district: a.district,
        source: a.source,
        lat: a.lat,
        lng: a.lng,
        addedAt: a.addedAt,
        isFavorite: a.isFavorite ? 1 : 0,
        isHidden: a.isHidden ? 1 : 0,
        isCustom: a.isCustom ? 1 : 0,
        description: a.description || '',
      });
    }
  }

  const marketCount = (
    db.prepare('SELECT COUNT(*) as c FROM market_items').get() as { c: number }
  ).c;
  if (marketCount === 0) {
    const initialMarket: MarketListing[] = [
      {
        id: 'mkt-1',
        title: 'Учебник Python',
        price: 3500,
        isFree: false,
        category: 'Учебники',
        address: 'Нуржол желек жолы, 14',
        distanceMeters: 0,
        sellerName: 'Амир',
        phone: '+7 (701) 555-01-42',
        description: 'Отличное состояние, актуальное издание с практическими задачами по алгоритмам.',
        createdAt: '13.11.2026',
        isMine: true,
        status: 'active',
      },
      {
        id: 'mkt-2',
        title: 'Велосипед',
        price: 45000,
        isFree: false,
        category: 'Другое',
        address: 'Туран, 24',
        distanceMeters: 361,
        sellerName: 'Данияр',
        phone: '+7 (702) 318-44-10',
        description: 'Городской велосипед 28", 21 скорость, дисковые тормоза, обслужен перед сезоном.',
        createdAt: '13.11.2026',
        isMine: true,
        status: 'active',
      },
      {
        id: 'mkt-3',
        title: 'Куртка',
        price: 0,
        isFree: true,
        category: 'Одежда',
        address: 'Сыганак, 18',
        distanceMeters: 412,
        sellerName: 'Айгерим',
        phone: '+7 (705) 901-22-19',
        description: 'Тёплая зимняя парка, размер M, отдам даром при самовывозе.',
        createdAt: '13.11.2026',
        isMine: true,
        status: 'active',
      },
      {
        id: 'mkt-4',
        title: 'Монитор Dell 27" 4K USB-C',
        price: 115000,
        isFree: false,
        category: 'Электроника',
        address: 'Кунаева, 14',
        distanceMeters: 520,
        sellerName: 'Тимур',
        phone: '+7 (777) 412-09-88',
        description: 'IPS матрица без битых пикселей, питание ноутбука 90W по одному кабелю.',
        createdAt: '14.11.2026',
        isMine: false,
        status: 'active',
      },
      {
        id: 'mkt-5',
        title: 'Кофеварка рожковая DeLonghi',
        price: 38000,
        isFree: false,
        category: 'Для дома',
        address: 'Достык, 5',
        distanceMeters: 640,
        sellerName: 'Мадина',
        phone: '+7 (701) 880-11-33',
        description: 'Работает безупречно, капучинатор в комплекте, использовалась дома.',
        createdAt: '14.11.2026',
        isMine: false,
        status: 'active',
      },
    ];

    const stmt = db.prepare(`
      INSERT INTO market_items (
        id, title, price, is_free, category, address, distance_meters,
        seller_name, phone, description, created_at, is_mine, status
      ) VALUES (
        @id, @title, @price, @isFree, @category, @address, @distanceMeters,
        @sellerName, @phone, @description, @createdAt, @isMine, @status
      )
    `);
    for (const m of initialMarket) {
      stmt.run({
        id: m.id,
        title: m.title,
        price: m.price,
        isFree: m.isFree ? 1 : 0,
        category: m.category,
        address: m.address,
        distanceMeters: m.distanceMeters,
        sellerName: m.sellerName,
        phone: m.phone,
        description: m.description,
        createdAt: m.createdAt,
        isMine: m.isMine ? 1 : 0,
        status: m.status,
      });
    }
  }

  const stopsCount = (
    db.prepare('SELECT COUNT(*) as c FROM delivery_stops').get() as { c: number }
  ).c;
  if (stopsCount === 0) {
    const initialStops = [
      { id: 'stop-1', name: 'Байтерек · Остановка', address: 'бульвар Нуржол, 14', lat: 51.1283, lng: 71.4305, done: 1, sortOrder: 1 },
      { id: 'stop-2', name: 'Хан Шатыр · Остановка', address: 'проспект Туран, 37', lat: 51.1325, lng: 71.4038, done: 1, sortOrder: 2 },
      { id: 'stop-3', name: 'Мега Силк Вей · Торговый центр', address: 'проспект Кабанбай батыра, 62', lat: 51.0894, lng: 71.4079, done: 0, sortOrder: 3 },
      { id: 'stop-4', name: 'Нурлы Жол · Остановка', address: 'улица Гейдара Алиева, 15', lat: 51.1112, lng: 71.5295, done: 0, sortOrder: 4 },
    ];
    const stmt = db.prepare(`
      INSERT INTO delivery_stops (id, name, address, lat, lng, done, sort_order)
      VALUES (@id, @name, @address, @lat, @lng, @done, @sortOrder)
    `);
    for (const s of initialStops) stmt.run(s);
  }

  const tvCount = (
    db.prepare('SELECT COUNT(*) as c FROM tv_channels').get() as { c: number }
  ).c;
  if (tvCount === 0) {
    const insertTv = db.prepare(`
      INSERT INTO tv_channels (
        id, name, category, current_show, next_show, accent_color,
        stream_url, logo_url, quality_auto, quality_720, quality_1080,
        is_regional, source_m3u, is_active, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const nowIso = new Date().toISOString();
    KAZAKHSTAN_TV_CHANNELS.forEach((ch, idx) => {
      insertTv.run(
        ch.id,
        ch.name,
        ch.category,
        ch.currentShow,
        ch.nextShow,
        ch.accentColor,
        ch.streamUrl,
        ch.logoUrl || '',
        ch.qualityStreams?.auto || '',
        ch.qualityStreams?.['720p'] || '',
        ch.qualityStreams?.['1080p'] || '',
        ch.isRegional ? 1 : 0,
        'seed-kz',
        idx,
        nowIso
      );
    });
  }

  // Ensure verified HTTPS KZ TV channels exist and migrate legacy dead mcquack.net URLs
  const upsertTv = db.prepare(`
    INSERT OR IGNORE INTO tv_channels (
      id, name, category, current_show, next_show, accent_color,
      stream_url, logo_url, quality_auto, quality_720, quality_1080,
      is_regional, source_m3u, is_active, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const updateLegacyTv = db.prepare(
    `UPDATE tv_channels SET stream_url = ? WHERE id = ? AND stream_url LIKE '%mcquack.net%'`
  );
  const nowIsoSeed = new Date().toISOString();
  KAZAKHSTAN_TV_CHANNELS.forEach((ch, idx) => {
    upsertTv.run(
      ch.id,
      ch.name,
      ch.category,
      ch.currentShow,
      ch.nextShow,
      ch.accentColor,
      ch.streamUrl,
      ch.logoUrl || '',
      ch.qualityStreams?.auto || '',
      ch.qualityStreams?.['720p'] || '',
      ch.qualityStreams?.['1080p'] || '',
      ch.isRegional ? 1 : 0,
      'seed-kz',
      idx,
      nowIsoSeed
    );
    updateLegacyTv.run(ch.streamUrl, ch.id);
  });
  db.prepare(`DELETE FROM tv_channels WHERE stream_url LIKE '%mcquack.net%'`).run();

  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('admin_pin', '1234')`).run();
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theme', 'light')`).run();
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('wallet_budget', '150000')`).run();
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('avtobys_balance', '2200')`).run();
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('avtobys_card', '9643 1084 5512 0194')`).run();
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('avtobys_trips', '[]')`).run();

  const remCount = (
    db.prepare('SELECT COUNT(*) as c FROM reminders').get() as { c: number }
  ).c;
  if (remCount === 0) {
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, 0, ?)`
    ).run('rem-1', 'Продлить ключ ЭЦП на egov.kz', 'Завтра · 10:00', 'Документы', nowIso);
    db.prepare(
      `INSERT INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, 0, ?)`
    ).run('rem-2', 'Оплатить транспортную карту Avtobys', 'Пятница · 18:00', 'Город', nowIso);
  }

  const bmCount = (
    db.prepare('SELECT COUNT(*) as c FROM map_bookmarks').get() as { c: number }
  ).c;
  if (bmCount === 0) {
    const nowIso = new Date().toISOString();
    const insertBm = db.prepare(
      `INSERT INTO map_bookmarks (id, label, kind, address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertBm.run('bm-home', 'Дом', 'home', 'Нұржол желек жолы, 14', 51.1282, 71.4304, nowIso);
    insertBm.run('bm-work', 'Работа · МФЦА', 'work', 'пр. Мәңгілік Ел, 55/18', 51.0899, 71.4136, nowIso);
    insertBm.run(
      'bm-park',
      'Парковка · Байтерек',
      'parking',
      'бульвар Нұржол, подземный паркинг',
      51.1288,
      71.4322,
      nowIso
    );
  }
}

seedDatabaseIfEmpty();

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function weatherCodeToRu(code: number): string {
  if (code === 0) return 'Ясно';
  if (code <= 3) return 'Переменная облачность';
  if (code <= 48) return 'Туман';
  if (code <= 67) return 'Дождь';
  if (code <= 77) return 'Снег';
  if (code <= 86) return 'Снегопад';
  return 'Пасмурно';
}

const ARCHIVE_FALLBACK_MOVIES = [
  {
    id: 'archive-charade-1963',
    title: 'Шарада',
    originalTitle: 'Charade',
    year: 1963,
    genre: 'Триллер / Детектив',
    duration: '1 ч 53 мин',
    rating: '7.9',
    director: 'Стэнли Донен',
    description: 'Классический детектив в Париже с Одри Хепбёрн и Кэри Грантом.',
    posterUrl: 'https://archive.org/services/img/Charade1963',
    videoUrl: 'https://archive.org/download/Charade1963/Charade1963_512kb.mp4',
    source: 'archive',
  },
  {
    id: 'archive-metropolis-1927',
    title: 'Метрополис',
    originalTitle: 'Metropolis',
    year: 1927,
    genre: 'Фантастика / Классика',
    duration: '2 ч 28 мин',
    rating: '8.3',
    director: 'Фриц Ланг',
    description: 'Культовый научно-фантастический шедевр о городе будущего.',
    posterUrl: 'https://archive.org/services/img/Metropolis1927_201809',
    videoUrl: 'https://archive.org/download/Metropolis1927_201809/Metropolis%20%281927%29.mp4',
    source: 'archive',
  },
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  /* ---- Защита админки: токен после ввода PIN, PIN по умолчанию нужно сменить ---- */
  const adminTokens = new Map<string, number>();
  const ADMIN_TTL = 12 * 60 * 60 * 1000;
  const readAdminPin = () =>
    ((db.prepare(`SELECT value FROM app_settings WHERE key = 'admin_pin'`).get() as { value: string } | undefined)?.value) || '1234';
  const issueAdminToken = () => {
    const token = randomBytes(24).toString('hex');
    adminTokens.set(token, Date.now() + ADMIN_TTL);
    return token;
  };
  const isAdminRequest = (req: express.Request) => {
    const token = String(req.headers['x-qala-admin'] || '');
    const exp = adminTokens.get(token);
    if (!exp) return false;
    if (exp < Date.now()) {
      adminTokens.delete(token);
      return false;
    }
    return true;
  };
  const PROTECTED: Array<[string, RegExp]> = [
    ['GET', /^\/api\/download-source/],
    ['GET', /^\/api\/admin\/backup/],
    ['PUT', /^\/api\/tv\/channels\//],
    ['DELETE', /^\/api\/tv\/channels\//],
    ['DELETE', /^\/api\/tv\/m3u\//],
    ['POST', /^\/api\/tv\/m3u\/import-kz-free/],
  ];
  app.use((req, res, next) => {
    const hit = PROTECTED.some(([m, re]) => m === req.method && re.test(req.path));
    if (!hit) return next();
    if (!isAdminRequest(req)) {
      res.status(401).json({ error: 'Нужен вход в админку по PIN-коду' });
      return;
    }
    if (readAdminPin() === '1234') {
      res.status(403).json({ error: 'Смените PIN-код по умолчанию (1234) в админке' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', dbPath: DB_PATH });
  });

  // 1. Live Weather for Astana (Open-Meteo)
  app.get('/api/weather', async (_req, res) => {
    try {
      const response = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=51.1694&longitude=71.4491&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&wind_speed_unit=ms',
        { signal: AbortSignal.timeout(4000) }
      );
      if (!response.ok) throw new Error('Weather API failed');
      const data = (await response.json()) as {
        current?: {
          temperature_2m?: number;
          apparent_temperature?: number;
          wind_speed_10m?: number;
          weather_code?: number;
        };
      };
      const c = data.current;
      res.json({
        temperature: Math.round(c?.temperature_2m ?? -4),
        apparentTemperature: Math.round(c?.apparent_temperature ?? -11),
        windSpeed: Math.round(c?.wind_speed_10m ?? 7),
        weatherCode: c?.weather_code ?? 71,
        description: weatherCodeToRu(c?.weather_code ?? 71),
        updatedAt: new Date().toISOString(),
        isLive: true,
      });
    } catch {
      res.json({
        temperature: -4,
        apparentTemperature: -11,
        windSpeed: 7,
        weatherCode: 71,
        description: 'Лёгкий снег',
        updatedAt: new Date().toISOString(),
        isLive: false,
      });
    }
  });

  // 2. Live Routing via TomTom (if key configured) -> OSRM -> Astana haversine fallback
  const getTomTomKey = (): string => {
    const key = (process.env.TOMTOM_API_KEY || '').trim();
    return key && key !== 'MY_TOMTOM_API_KEY' ? key : '';
  };

  app.post('/api/route', async (req, res) => {
    const { points } = req.body as { points?: Array<[number, number]> };
    if (!Array.isArray(points) || points.length < 2) {
      res.status(400).json({ error: 'Нужно минимум 2 координаты' });
      return;
    }

    const ttKey = getTomTomKey();
    if (ttKey) {
      try {
        const locs = points.map((p) => `${p[0]},${p[1]}`).join(':');
        const ttUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?traffic=true&travelMode=car&key=${encodeURIComponent(ttKey)}`;
        const ttRes = await fetch(ttUrl, { signal: AbortSignal.timeout(4500) });
        if (ttRes.ok) {
          const ttJson = (await ttRes.json()) as {
            routes?: Array<{
              summary?: { lengthInMeters?: number; travelTimeInSeconds?: number };
              legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
            }>;
          };
          const route = ttJson.routes?.[0];
          const pts = (route?.legs || []).flatMap((l) =>
            (l.points || []).map((p): [number, number] => [p.latitude, p.longitude])
          );
          if (pts.length >= 2 && route?.summary) {
            res.json({
              distanceKm: Number(((route.summary.lengthInMeters || 0) / 1000).toFixed(1)),
              durationMin: Math.max(2, Math.round((route.summary.travelTimeInSeconds || 0) / 60)),
              coordinates: pts,
              isLiveOsrm: true,
            });
            return;
          }
        }
      } catch {
        // fall through to OSRM
      }
    }

    try {
      const coordString = points.map((p) => `${p[1]},${p[0]}`).join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
      const r = await fetch(osrmUrl, { signal: AbortSignal.timeout(4500) });
      if (!r.ok) throw new Error('OSRM failed');
      const json = (await r.json()) as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry?: { coordinates?: Array<[number, number]> };
        }>;
      };
      const route = json.routes?.[0];
      if (!route?.geometry?.coordinates?.length) throw new Error('No route geometry');

      const latLngCoords = route.geometry.coordinates.map(
        (c): [number, number] => [c[1], c[0]]
      );
      res.json({
        distanceKm: Number((route.distance / 1000).toFixed(1)),
        durationMin: Math.max(2, Math.round(route.duration / 60)),
        coordinates: latLngCoords,
        isLiveOsrm: true,
      });
    } catch {
      let totalKm = 0;
      for (let i = 1; i < points.length; i++) {
        totalKm += haversineKm(points[i - 1], points[i]) * 1.28;
      }
      res.json({
        distanceKm: Number(totalKm.toFixed(1)),
        durationMin: Math.max(4, Math.round(totalKm * 2.4)),
        coordinates: points,
        isLiveOsrm: false,
      });
    }
  });

  // 3. Profile (Qala ID)
  app.get('/api/profile', (_req, res) => {
    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>;
    res.json({
      profile: {
        name: String(row.name),
        city: String(row.city),
        address: String(row.address),
        phone: String(row.phone),
        email: String(row.email),
        avatarInitial: String(row.avatar_initial),
      } satisfies QalaProfile,
    });
  });

  app.put('/api/profile', (req, res) => {
    const body = req.body as Partial<QalaProfile>;
    const cleanName = (body.name || 'Амир').trim();
    const initial = cleanName.charAt(0).toUpperCase() || 'А';
    db.prepare(
      `UPDATE profile SET name = ?, city = ?, address = ?, phone = ?, email = ?, avatar_initial = ? WHERE id = 1`
    ).run(
      cleanName,
      (body.city || 'Астана').trim(),
      (body.address || 'Нұржол желек жолы, 14').trim(),
      (body.phone || '+7 (701) 555-01-42').trim(),
      (body.email || 'amir@qala.kz').trim(),
      initial
    );
    res.json({
      profile: {
        name: cleanName,
        city: (body.city || 'Астана').trim(),
        address: (body.address || 'Нұржол желек жолы, 14').trim(),
        phone: (body.phone || '+7 (701) 555-01-42').trim(),
        email: (body.email || 'amir@qala.kz').trim(),
        avatarInitial: initial,
      },
    });
  });

  // 4. Qala Үй (Apartments CRUD)
  app.get('/api/apartments', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM apartments WHERE is_hidden = 0 ORDER BY price ASC')
      .all() as Array<Record<string, unknown>>;
    const apartments: ApartmentListing[] = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      rentType: String(r.rent_type) as ApartmentListing['rentType'],
      rooms: Number(r.rooms),
      area: Number(r.area),
      floor: String(r.floor),
      price: Number(r.price),
      address: String(r.address),
      district: String(r.district),
      source: String(r.source),
      lat: Number(r.lat),
      lng: Number(r.lng),
      addedAt: String(r.added_at),
      isFavorite: Boolean(r.is_favorite),
      isHidden: Boolean(r.is_hidden),
      isCustom: Boolean(r.is_custom),
      description: String(r.description || ''),
    }));
    res.json({ apartments });
  });

  app.post('/api/apartments', (req, res) => {
    const body = req.body as Partial<ApartmentListing>;
    if (!body.address || !body.price) {
      res.status(400).json({ error: 'Укажите адрес и цену' });
      return;
    }
    const id = `apt-custom-${Date.now()}`;
    const rooms = Number(body.rooms || 1);
    const area = Number(body.area || 38);
    const floor = body.floor || '5/12 эт.';
    const title = body.title || `${rooms}-комн. квартира, ${area} м², ${floor}`;
    const today = new Date().toLocaleDateString('ru-RU');
    const lat = Number(body.lat || 51.1282 + (Math.random() - 0.5) * 0.03);
    const lng = Number(body.lng || 71.4304 + (Math.random() - 0.5) * 0.05);

    db.prepare(`
      INSERT INTO apartments (
        id, title, rent_type, rooms, area, floor, price, address, district,
        source, lat, lng, added_at, is_favorite, is_hidden, is_custom, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Qala', ?, ?, ?, 0, 0, 1, ?)
    `).run(
      id,
      title,
      body.rentType || 'Аренда',
      rooms,
      area,
      floor,
      Number(body.price),
      body.address,
      body.district || 'Есиль',
      lat,
      lng,
      today,
      body.description || 'Добавлено пользователем Qala Үй'
    );
    res.status(201).json({ id });
  });

  app.patch('/api/apartments/:id', (req, res) => {
    const { isFavorite, isHidden, price, address } = req.body as Partial<ApartmentListing>;
    if (typeof isFavorite === 'boolean') {
      db.prepare('UPDATE apartments SET is_favorite = ? WHERE id = ?').run(
        isFavorite ? 1 : 0,
        req.params.id
      );
    }
    if (typeof isHidden === 'boolean') {
      db.prepare('UPDATE apartments SET is_hidden = ? WHERE id = ?').run(
        isHidden ? 1 : 0,
        req.params.id
      );
    }
    if (typeof price === 'number') {
      db.prepare('UPDATE apartments SET price = ? WHERE id = ?').run(price, req.params.id);
    }
    if (typeof address === 'string') {
      db.prepare('UPDATE apartments SET address = ? WHERE id = ?').run(address, req.params.id);
    }
    res.json({ ok: true });
  });

  app.delete('/api/apartments/:id', (req, res) => {
    db.prepare('DELETE FROM apartments WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/apartments/reset-hidden', (_req, res) => {
    db.prepare('UPDATE apartments SET is_hidden = 0').run();
    res.json({ ok: true });
  });

  // 5. Qala Market CRUD
  app.get('/api/market', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM market_items ORDER BY rowid DESC')
      .all() as Array<Record<string, unknown>>;
    const items: MarketListing[] = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      price: Number(r.price),
      isFree: Boolean(r.is_free),
      category: String(r.category) as MarketListing['category'],
      address: String(r.address),
      distanceMeters: Number(r.distance_meters),
      sellerName: String(r.seller_name),
      phone: String(r.phone),
      description: String(r.description),
      createdAt: String(r.created_at),
      isMine: Boolean(r.is_mine),
      status: String(r.status) as MarketListing['status'],
    }));
    res.json({ items });
  });

  app.post('/api/market', (req, res) => {
    const body = req.body as Partial<MarketListing>;
    if (!body.title) {
      res.status(400).json({ error: 'Укажите название объявления' });
      return;
    }
    const id = `mkt-${Date.now()}`;
    const today = new Date().toLocaleDateString('ru-RU');
    const isFree = Boolean(body.isFree) || Number(body.price || 0) === 0;
    db.prepare(`
      INSERT INTO market_items (
        id, title, price, is_free, category, address, distance_meters,
        seller_name, phone, description, created_at, is_mine, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
    `).run(
      id,
      body.title.trim(),
      isFree ? 0 : Number(body.price || 0),
      isFree ? 1 : 0,
      body.category || 'Другое',
      body.address || 'Нуржол желек жолы, 14',
      Math.floor(Math.random() * 650),
      body.sellerName || 'Амир',
      body.phone || '+7 (701) 555-01-42',
      body.description || 'Самовывоз в центре Астаны.',
      today
    );
    res.status(201).json({ id });
  });

  app.patch('/api/market/:id', (req, res) => {
    const { status } = req.body as { status?: 'active' | 'reserved' };
    if (status) {
      db.prepare('UPDATE market_items SET status = ? WHERE id = ?').run(status, req.params.id);
    }
    res.json({ ok: true });
  });

  app.delete('/api/market/:id', (req, res) => {
    db.prepare('DELETE FROM market_items WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 6. Qala Delivery Stops CRUD & TSP Route Optimization
  app.get('/api/delivery/stops', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM delivery_stops ORDER BY sort_order ASC, rowid ASC')
      .all() as Array<Record<string, unknown>>;
    const stops: DeliveryStop[] = rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      address: String(r.address),
      lat: Number(r.lat),
      lng: Number(r.lng),
      done: Boolean(r.done),
    }));
    res.json({ stops });
  });

  app.post('/api/delivery/stops', (req, res) => {
    const body = req.body as Partial<DeliveryStop>;
    if (!body.name) {
      res.status(400).json({ error: 'Укажите адрес точки' });
      return;
    }
    const id = `stop-${Date.now()}`;
    const maxOrder = (
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM delivery_stops').get() as {
        m: number;
      }
    ).m;
    db.prepare(`
      INSERT INTO delivery_stops (id, name, address, lat, lng, done, sort_order)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      body.name.trim(),
      body.address || body.name.trim(),
      Number(body.lat || 51.1282 + (Math.random() - 0.5) * 0.03),
      Number(body.lng || 71.4304 + (Math.random() - 0.5) * 0.05),
      maxOrder + 1
    );
    res.status(201).json({ id });
  });

  app.patch('/api/delivery/stops/:id', (req, res) => {
    const { done } = req.body as { done?: boolean };
    if (typeof done === 'boolean') {
      db.prepare('UPDATE delivery_stops SET done = ? WHERE id = ?').run(
        done ? 1 : 0,
        req.params.id
      );
    }
    res.json({ ok: true });
  });

  app.delete('/api/delivery/stops/:id', (req, res) => {
    if (req.params.id === 'all') {
      db.prepare('DELETE FROM delivery_stops').run();
    } else {
      db.prepare('DELETE FROM delivery_stops WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  });

  app.post('/api/delivery/optimize', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM delivery_stops ORDER BY sort_order ASC, rowid ASC')
      .all() as Array<Record<string, unknown>>;
    if (rows.length <= 2) {
      res.json({ ok: true });
      return;
    }
    const remaining = [...rows];
    const ordered: Array<Record<string, unknown>> = [remaining.shift()!];
    while (remaining.length > 0) {
      const last = ordered[ordered.length - 1];
      const lastCoord: [number, number] = [Number(last.lat), Number(last.lng)];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(lastCoord, [
          Number(remaining[i].lat),
          Number(remaining[i].lng),
        ]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    const update = db.prepare('UPDATE delivery_stops SET sort_order = ? WHERE id = ?');
    ordered.forEach((row, idx) => update.run(idx + 1, String(row.id)));
    res.json({ ok: true });
  });

  // 7. Wallet & Plans CRUD
  app.get('/api/wallet', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM wallet_transactions ORDER BY datetime(created_at) DESC')
      .all() as Array<Record<string, unknown>>;
    const transactions: WalletTransaction[] = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      category: String(r.category) as WalletTransaction['category'],
      amount: Number(r.amount),
      createdAt: String(r.created_at),
    }));
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    res.json({ transactions, total });
  });

  app.post('/api/wallet', (req, res) => {
    const body = req.body as Partial<WalletTransaction>;
    if (!body.title || !body.amount) {
      res.status(400).json({ error: 'Укажите назначение и сумму' });
      return;
    }
    const id = `tx-${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, body.title.trim(), body.category || 'Другое', Number(body.amount), now);
    res.status(201).json({ id });
  });

  app.delete('/api/wallet/:id', (req, res) => {
    db.prepare('DELETE FROM wallet_transactions WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/plans', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM plans ORDER BY completed ASC, datetime(created_at) DESC')
      .all() as Array<Record<string, unknown>>;
    const plans: PlanItem[] = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      dateLabel: String(r.date_label),
      completed: Boolean(r.completed),
      createdAt: String(r.created_at),
    }));
    res.json({ plans });
  });

  app.post('/api/plans', (req, res) => {
    const body = req.body as Partial<PlanItem>;
    if (!body.title) {
      res.status(400).json({ error: 'Укажите текст напоминания' });
      return;
    }
    const id = `plan-${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO plans (id, title, date_label, completed, created_at) VALUES (?, ?, ?, 0, ?)`
    ).run(id, body.title.trim(), body.dateLabel || 'Сегодня', now);
    res.status(201).json({ id });
  });

  app.patch('/api/plans/:id', (req, res) => {
    const { completed } = req.body as { completed?: boolean };
    if (typeof completed === 'boolean') {
      db.prepare('UPDATE plans SET completed = ? WHERE id = ?').run(
        completed ? 1 : 0,
        req.params.id
      );
    }
    res.json({ ok: true });
  });

  app.delete('/api/plans/:id', (req, res) => {
    db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 8. Online Movie Search (Qala Qino) + Favorites
  app.get('/api/favorites', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM favorite_movies ORDER BY datetime(added_at) DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      favorites: rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        year: Number(r.year),
        genre: String(r.genre),
        duration: String(r.duration),
        rating: String(r.rating),
        director: String(r.director),
        description: String(r.description),
        posterUrl: String(r.poster_url),
        videoUrl: String(r.video_url),
        source: String(r.source),
        addedAt: String(r.added_at),
      })),
    });
  });

  app.post('/api/favorites', (req, res) => {
    const m = req.body as Record<string, unknown>;
    if (!m?.id || !m?.title || !m?.videoUrl) {
      res.status(400).json({ error: 'Неверные данные фильма' });
      return;
    }
    db.prepare(`
      INSERT OR REPLACE INTO favorite_movies
      (id, title, year, genre, duration, rating, director, description, poster_url, video_url, source, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(m.id),
      String(m.title),
      Number(m.year || 2024),
      String(m.genre || 'Кино'),
      String(m.duration || ''),
      String(m.rating || 'HD'),
      String(m.director || ''),
      String(m.description || ''),
      String(m.posterUrl || ''),
      String(m.videoUrl),
      String(m.source || 'open-cinema'),
      new Date().toISOString()
    );
    res.status(201).json({ ok: true });
  });

  app.delete('/api/favorites/:id', (req, res) => {
    db.prepare('DELETE FROM favorite_movies WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/movies/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) {
      res.json({ results: ARCHIVE_FALLBACK_MOVIES });
      return;
    }

    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          query
        )}&media=movie&entity=movie&limit=12&lang=ru_ru`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (!itunesRes.ok) throw new Error('iTunes failed');
      const data = (await itunesRes.json()) as {
        results?: Array<{
          trackId?: number;
          trackName?: string;
          artistName?: string;
          primaryGenreName?: string;
          releaseDate?: string;
          longDescription?: string;
          artworkUrl100?: string;
          previewUrl?: string;
        }>;
      };
      const mapped = (data.results || [])
        .filter((item) => item.trackName && item.previewUrl)
        .map((item) => ({
          id: `itunes-${item.trackId}`,
          title: item.trackName || 'Фильм',
          year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2022,
          genre: item.primaryGenreName || 'Кино',
          duration: 'Трейлер HD',
          rating: 'HD',
          director: item.artistName || '',
          description: item.longDescription || 'Фильм из онлайн-каталога.',
          posterUrl: item.artworkUrl100
            ? item.artworkUrl100.replace(/100x100bb\./, '600x600bb.')
            : '',
          videoUrl: item.previewUrl || '',
          source: 'itunes',
        }));

      res.json({
        results: mapped.length > 0 ? mapped : ARCHIVE_FALLBACK_MOVIES,
      });
    } catch {
      res.json({ results: ARCHIVE_FALLBACK_MOVIES });
    }
  });

  // 9. Qala AI Assistant (Server-side @google/genai)
  app.post('/api/ai/ask', async (req, res) => {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Введите вопрос для Qala AI' });
      return;
    }

    const walletTotal = (
      db.prepare('SELECT COALESCE(SUM(amount), 0) as s FROM wallet_transactions').get() as {
        s: number;
      }
    ).s;
    const activePlans = (
      db.prepare('SELECT COUNT(*) as c FROM plans WHERE completed = 0').get() as { c: number }
    ).c;
    const aptsCount = (
      db.prepare('SELECT COUNT(*) as c FROM apartments WHERE is_hidden = 0').get() as { c: number }
    ).c;
    const stopsRows = db
      .prepare('SELECT name FROM delivery_stops ORDER BY sort_order ASC')
      .all() as Array<{ name: string }>;

    const cityContext = `Контекст пользователя в Астане (приложение QALA):
- Расходы за месяц: ${walletTotal} ₸
- Активных планов: ${activePlans}
- Доступно квартир в Qala Үй: ${aptsCount}
- Маршрут Qala Delivery: ${stopsRows.map((s) => s.name).join(' -> ') || 'не задан'}`;

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error: 'Ключ GEMINI_API_KEY не настроен в панели Secrets.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${cityContext}\n\nЗапрос пользователя: ${prompt}`,
        config: {
          systemInstruction:
            'Ты — Qala AI, умный городской ассистент супер-приложения QALA в Астане (Казахстан). Отвечай кратко, дружелюбно и по делу на русском языке (при уместности используй казахские приветствия вроде «Қайырлы күн!»). Помогай с маршрутами по Астане, подбором жилья, расчётом бюджета в тенге (₸), выбором досуга и планированием дня.',
        },
      });

      res.json({ reply: response.text || 'Не удалось сформировать ответ.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка обращения к Gemini API';
      res.status(500).json({ error: message });
    }
  });

  // 10. Download all project source & config files as a ZIP archive
  const collectProjectFiles = (rootDir: string) => {
    const excludedDirs = new Set([
      'node_modules',
      'dist',
      'dev-dist',
      '.git',
      '.vite',
      '.cache',
      'data',
    ]);
    const excludedFiles = new Set(['.env', '.DS_Store']);
    const collected: Array<{ relPath: string; absPath: string; size: number }> = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!excludedDirs.has(entry.name)) {
            walk(path.join(dir, entry.name));
          }
          continue;
        }
        if (entry.isFile() && !excludedFiles.has(entry.name)) {
          const absPath = path.join(dir, entry.name);
          const relPath = path.relative(rootDir, absPath).split(path.sep).join('/');
          const stat = fs.statSync(absPath);
          collected.push({ relPath, absPath, size: stat.size });
        }
      }
    };

    walk(rootDir);
    collected.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return collected;
  };

  app.get('/api/download-source/manifest', (_req, res) => {
    try {
      const files = collectProjectFiles(process.cwd());
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
      res.json({
        count: files.length,
        totalBytes,
        files: files.map((f) => ({ path: f.relPath, size: f.size })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка чтения файлов проекта';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/download-source', async (_req, res) => {
    try {
      const rootDir = process.cwd();
      const files = collectProjectFiles(rootDir);
      const zip = new JSZip();

      for (const file of files) {
        zip.file(file.relPath, fs.readFileSync(file.absPath));
      }

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="qala-project-source.zip"');
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка создания ZIP-архива';
      res.status(500).json({ error: message });
    }
  });

  // 11. Qala TV Admin, M3U Playlists & HLS Proxy
  const ACCENT_PALETTE = [
    '#2563EB',
    '#DC2626',
    '#0EA5E9',
    '#E11D48',
    '#EA580C',
    '#0F766E',
    '#16A34A',
    '#7C3AED',
    '#4F46E5',
    '#0284C7',
  ];

  const isSafeExternalUrl = (rawUrl: string): URL | null => {
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  // Миграция: заголовки, которые требуют некоторые IPTV-потоки (Referer / User-Agent)
  {
    const cols = new Set(
      (db.prepare('PRAGMA table_info(tv_channels)').all() as Array<{ name: string }>).map((c) => c.name)
    );
    if (!cols.has('stream_referrer')) {
      db.exec("ALTER TABLE tv_channels ADD COLUMN stream_referrer TEXT NOT NULL DEFAULT ''");
    }
    if (!cols.has('stream_user_agent')) {
      db.exec("ALTER TABLE tv_channels ADD COLUMN stream_user_agent TEXT NOT NULL DEFAULT ''");
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tv_channels_order ON tv_channels (is_active, sort_order);
      CREATE INDEX IF NOT EXISTS idx_tv_channels_source ON tv_channels (source_m3u);
    `);
  }

  // Кэш ответа /api/tv/channels (JSON + gzip) и карта хост → заголовки для прокси.
  // Сбрасывается при любом изменении каналов.
  let tvChannelsCache: { json: string; gzip: Buffer; etag: string } | null = null;
  let tvHostHeaders: Map<string, { referrer: string; userAgent: string }> | null = null;
  const invalidateTvCaches = () => {
    tvChannelsCache = null;
    tvHostHeaders = null;
  };
  const getTvHostHeaders = () => {
    if (tvHostHeaders) return tvHostHeaders;
    const map = new Map<string, { referrer: string; userAgent: string }>();
    const rows = db
      .prepare(
        "SELECT stream_url, stream_referrer, stream_user_agent FROM tv_channels WHERE stream_referrer != '' OR stream_user_agent != ''"
      )
      .all() as Array<{ stream_url: string; stream_referrer: string; stream_user_agent: string }>;
    for (const r of rows) {
      try {
        map.set(new URL(r.stream_url).hostname, {
          referrer: r.stream_referrer,
          userAgent: r.stream_user_agent,
        });
      } catch {
        // пропускаем битые URL
      }
    }
    tvHostHeaders = map;
    return map;
  };
  app.use('/api/tv', (req, _res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') invalidateTvCaches();
    next();
  });

  const mapTvRow = (row: Record<string, unknown>): TvChannel => {
    const qAuto = String(row.quality_auto || '').trim();
    const q720 = String(row.quality_720 || '').trim();
    const q1080 = String(row.quality_1080 || '').trim();
    const qualityStreams: TvChannel['qualityStreams'] = {};
    if (qAuto) qualityStreams.auto = qAuto;
    if (q720) qualityStreams['720p'] = q720;
    if (q1080) qualityStreams['1080p'] = q1080;

    return {
      id: String(row.id),
      name: String(row.name),
      category: String(row.category || 'Общий'),
      currentShow: String(row.current_show || 'Прямой эфир'),
      nextShow: String(row.next_show || 'Программа передач'),
      accentColor: String(row.accent_color || '#2563EB'),
      streamUrl: String(row.stream_url),
      logoUrl: String(row.logo_url || '') || undefined,
      qualityStreams: Object.keys(qualityStreams).length > 0 ? qualityStreams : undefined,
      isRegional: Boolean(row.is_regional),
      sourceM3u: String(row.source_m3u || '') || undefined,
      isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    };
  };

  type ParsedM3uChannel = {
    id?: string;
    name: string;
    category: string;
    logoUrl: string;
    streamUrl: string;
    isRegional: boolean;
    subtitle?: string;
    referrer?: string;
    userAgent?: string;
  };

  const parseM3uContent = (rawText: string, sourceLabel: string): ParsedM3uChannel[] => {
    const lines = rawText
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim());
    const parsed: ParsedM3uChannel[] = [];

    let pendingMeta: {
      name: string;
      category: string;
      logoUrl: string;
      referrer?: string;
      userAgent?: string;
    } | null = null;
    const categoryRuMap: Record<string, string> = {
      General: 'Национальный',
      News: 'Новости',
      Culture: 'Культура',
      Kids: 'Детский',
      Sports: 'Спорт',
      Movies: 'Кино',
      Business: 'Бизнес',
      Music: 'Музыка',
      Entertainment: 'Развлекательный',
      Undefined: 'Региональный',
      Travel: 'Путешествия',
    };

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        const refMatch = line.match(/http-referrer="([^"]*)"/i);
        const uaMatch = line.match(/http-user-agent="([^"]*)"/i);
        // Название — после запятой, идущей за атрибутами key="value"
        const afterAttrs = line
          .replace(/^#EXTINF:\s*-?\d+(?:\.\d+)?/, '')
          .replace(/^(?:\s*[\w-]+="[^"]*")*/, '');
        const commaIdx = afterAttrs.indexOf(',');
        const rawName = commaIdx >= 0 ? afterAttrs.slice(commaIdx + 1).trim() : 'Канал ТВ';
        const cleanName =
          rawName.replace(/\s*\[Not 24\/7\]|\s*\[Geo-blocked\]/gi, '').trim() || 'Канал ТВ';
        const rawGroup = (groupMatch?.[1] || 'Общий').split(';')[0].trim();
        const category = categoryRuMap[rawGroup] || rawGroup || 'Общий';
        pendingMeta = {
          name: cleanName,
          category,
          logoUrl: logoMatch?.[1]?.trim() || '',
          referrer: refMatch?.[1]?.trim() || undefined,
          userAgent: uaMatch?.[1]?.trim() || undefined,
        };
      } else if (line.startsWith('#EXTVLCOPT:') && pendingMeta) {
        const opt = line.slice('#EXTVLCOPT:'.length);
        const eq = opt.indexOf('=');
        if (eq > 0) {
          const key = opt.slice(0, eq).trim().toLowerCase();
          const val = opt.slice(eq + 1).trim();
          if (key === 'http-referrer') pendingMeta.referrer = val;
          if (key === 'http-user-agent') pendingMeta.userAgent = val;
        }
      } else if (!line.startsWith('#')) {
        if (/^https?:\/\//i.test(line)) {
          const meta = pendingMeta || {
            name: `${sourceLabel} #${parsed.length + 1}`,
            category: 'M3U канал',
            logoUrl: '',
          };
          const lower = meta.name.toLowerCase();
          const isRegional =
            meta.category === 'Региональный' ||
            /alau|almaty|aqjaiyq|aqtobe|atyra|ertis|jambyl|kokshe|mangysta|mtrk|ontustik|qonaev|qostanai|qyzyl|rika|saryarqa|semei|tdk|ulytau/i.test(
              lower
            );
          parsed.push({
            name: meta.name,
            category: meta.category,
            logoUrl: meta.logoUrl,
            streamUrl: line,
            isRegional,
            referrer: 'referrer' in meta ? meta.referrer : undefined,
            userAgent: 'userAgent' in meta ? meta.userAgent : undefined,
          });
        }
        pendingMeta = null;
      }
    }
    return parsed;
  };

  app.get('/api/tv/channels', (req, res) => {
    const includeInactive = req.query.all === '1';
    const sql = includeInactive
      ? 'SELECT * FROM tv_channels ORDER BY sort_order ASC, created_at DESC'
      : 'SELECT * FROM tv_channels WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC';
    if (includeInactive) {
      const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
      res.json({ channels: rows.map(mapTvRow) });
      return;
    }

    // Публичный список (8000+ каналов): собираем один раз, отдаём сжатым и с ETag
    if (!tvChannelsCache) {
      const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
      const json = JSON.stringify({ channels: rows.map(mapTvRow) });
      tvChannelsCache = {
        json,
        gzip: zlib.gzipSync(json, { level: 6 }),
        etag: `"tv-${crypto.createHash('sha1').update(json).digest('hex').slice(0, 16)}"`,
      };
    }
    const cache = tvChannelsCache;
    res.setHeader('ETag', cache.etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === cache.etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      res.setHeader('Content-Encoding', 'gzip');
      res.send(cache.gzip);
    } else {
      res.send(cache.json);
    }
  });

  app.post('/api/tv/channels', (req, res) => {
    const body = req.body as Partial<TvChannel>;
    const name = (body.name || '').trim();
    const streamUrl = (body.streamUrl || '').trim();
    if (!name || !streamUrl || !/^https?:\/\//i.test(streamUrl)) {
      res.status(400).json({ error: 'Укажите название канала и корректную ссылку http(s):// на поток' });
      return;
    }

    const id = `tv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM tv_channels')
      .get() as { m: number };
    const color =
      body.accentColor || ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];

    db.prepare(`
      INSERT INTO tv_channels (
        id, name, category, current_show, next_show, accent_color,
        stream_url, logo_url, quality_auto, quality_720, quality_1080,
        is_regional, source_m3u, is_active, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      (body.category || 'ТВ').trim(),
      (body.currentShow || 'Прямой эфир').trim(),
      (body.nextShow || 'Программа передач').trim(),
      color,
      streamUrl,
      (body.logoUrl || '').trim(),
      (body.qualityStreams?.auto || '').trim(),
      (body.qualityStreams?.['720p'] || '').trim(),
      (body.qualityStreams?.['1080p'] || '').trim(),
      body.isRegional ? 1 : 0,
      'admin-manual',
      1,
      (maxOrderRow.m || 0) + 1,
      nowIso
    );

    const row = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    res.status(201).json({ channel: mapTvRow(row) });
  });

  app.put('/api/tv/channels/:id', (req, res) => {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Канал не найден' });
      return;
    }

    const body = req.body as Partial<TvChannel>;
    const name = body.name !== undefined ? body.name.trim() : String(existing.name);
    const streamUrl =
      body.streamUrl !== undefined ? body.streamUrl.trim() : String(existing.stream_url);
    const category =
      body.category !== undefined ? body.category.trim() : String(existing.category);
    const currentShow =
      body.currentShow !== undefined ? body.currentShow.trim() : String(existing.current_show);
    const isRegional =
      body.isRegional !== undefined ? (body.isRegional ? 1 : 0) : Number(existing.is_regional);
    const isActive =
      body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existing.is_active);
    const qAuto =
      body.qualityStreams?.auto !== undefined
        ? body.qualityStreams.auto.trim()
        : String(existing.quality_auto || '');
    const q720 =
      body.qualityStreams?.['720p'] !== undefined
        ? body.qualityStreams['720p'].trim()
        : String(existing.quality_720 || '');
    const q1080 =
      body.qualityStreams?.['1080p'] !== undefined
        ? body.qualityStreams['1080p'].trim()
        : String(existing.quality_1080 || '');

    db.prepare(`
      UPDATE tv_channels
      SET name = ?, category = ?, current_show = ?, stream_url = ?,
          quality_auto = ?, quality_720 = ?, quality_1080 = ?,
          is_regional = ?, is_active = ?
      WHERE id = ?
    `).run(name, category, currentShow, streamUrl, qAuto, q720, q1080, isRegional, isActive, id);

    const updated = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    res.json({ channel: mapTvRow(updated) });
  });

  app.delete('/api/tv/channels/:id', (req, res) => {
    db.prepare('DELETE FROM tv_channels WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/tv/m3u', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM m3u_sources ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      sources: rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        url: String(r.url),
        channelCount: Number(r.channel_count || 0),
        lastSyncedAt: String(r.last_synced_at),
        createdAt: String(r.created_at),
      })),
    });
  });

  const saveImportedM3uChannels = (
    sourceId: string,
    sourceName: string,
    sourceUrl: string,
    parsed: ReturnType<typeof parseM3uContent>
  ) => {
    const nowIso = new Date().toISOString();
    const existingSource = db
      .prepare("SELECT id FROM m3u_sources WHERE id = ? OR (url != '' AND url = ?)")
      .get(sourceId, sourceUrl) as { id: string } | undefined;
    const finalSourceId = existingSource?.id || sourceId;

    if (existingSource) {
      db.prepare(
        'UPDATE m3u_sources SET name = ?, url = ?, channel_count = ?, last_synced_at = ? WHERE id = ?'
      ).run(sourceName, sourceUrl, parsed.length, nowIso, finalSourceId);
      db.prepare('DELETE FROM tv_channels WHERE source_m3u = ?').run(finalSourceId);
    } else {
      db.prepare(
        'INSERT INTO m3u_sources (id, name, url, channel_count, last_synced_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(finalSourceId, sourceName, sourceUrl, parsed.length, nowIso, nowIso);
    }

    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM tv_channels')
      .get() as { m: number };
    let order = (maxOrderRow.m || 0) + 1;

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO tv_channels (
        id, name, category, current_show, next_show, accent_color,
        stream_url, logo_url, quality_auto, quality_720, quality_1080,
        is_regional, source_m3u, is_active, sort_order, created_at,
        stream_referrer, stream_user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, 1, ?, ?, ?, ?)
    `);

    // Одна транзакция на весь плейлист: тысячи INSERT за доли секунды
    db.exec('BEGIN');
    try {
      parsed.forEach((ch, idx) => {
        const slug = ch.name
          .toLowerCase()
          .replace(/[^a-z0-9а-яё]+/gi, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 28);
        const id = ch.id || `${finalSourceId}-${idx}-${slug || 'ch'}`;
        const color = ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
        insertStmt.run(
          id,
          ch.name,
          ch.category,
          ch.subtitle || `Плейлист: ${sourceName}`,
          'Прямой эфир',
          color,
          ch.streamUrl,
          ch.logoUrl,
          ch.isRegional ? 1 : 0,
          finalSourceId,
          order++,
          nowIso,
          ch.referrer || '',
          ch.userAgent || ''
        );
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    invalidateTvCaches();
    return finalSourceId;
  };

  // Мировой плейлист iptv-org (public/tv/iptv-org-all.m3u — тот же файл попадает в EXE/APK):
  // импортируется при старте, разбор общий с клиентом (src/lib/iptvWorld.ts), id каналов совпадают.
  const WORLD_SOURCE_NAME = 'Мировое IPTV (iptv-org) v2'; // смена версии → переимпорт
  const importWorldPlaylistIfNeeded = () => {
    const filePath = path.join(process.cwd(), 'public', WORLD_PLAYLIST_PATH);
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    const existing = db
      .prepare('SELECT name, last_synced_at FROM m3u_sources WHERE id = ?')
      .get(WORLD_SOURCE_ID) as { name: string; last_synced_at: string } | undefined;
    // Переимпорт только если файл новее последней синхронизации или сменилась версия разбора
    if (
      existing &&
      existing.name === WORLD_SOURCE_NAME &&
      new Date(existing.last_synced_at).getTime() >= stat.mtimeMs
    ) {
      return;
    }

    const started = Date.now();
    const parsed = buildWorldChannels(fs.readFileSync(filePath, 'utf8')).map((ch) => ({
      ...ch,
      isRegional: false,
    }));
    saveImportedM3uChannels(WORLD_SOURCE_ID, WORLD_SOURCE_NAME, '', parsed);
    console.log(`[tv] Импортирован мировой плейлист: ${parsed.length} каналов за ${Date.now() - started} мс`);
  };
  try {
    importWorldPlaylistIfNeeded();
  } catch (err) {
    console.error('[tv] Ошибка импорта мирового плейлиста:', err);
  }

  app.post('/api/tv/m3u/import', async (req, res) => {
    const { name, url, rawContent } = req.body as {
      name?: string;
      url?: string;
      rawContent?: string;
    };

    const trimmedUrl = (url || '').trim();
    const trimmedRaw = (rawContent || '').trim();
    const sourceName = (name || '').trim() || (trimmedUrl ? 'M3U плейлист' : 'Локальный M3U');

    if (!trimmedUrl && !trimmedRaw) {
      res.status(400).json({ error: 'Укажите ссылку на M3U/M3U8 плейлист или вставьте текст #EXTM3U' });
      return;
    }

    let textToParse = trimmedRaw;
    if (!textToParse && trimmedUrl) {
      const safeUrl = isSafeExternalUrl(trimmedUrl);
      if (!safeUrl) {
        res.status(400).json({ error: 'Некорректная или недопустимая ссылка M3U' });
        return;
      }
      try {
        const resp = await fetch(safeUrl.toString(), {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'QALA-TV/1.0' },
        });
        if (!resp.ok) {
          res.status(502).json({ error: `Не удалось скачать M3U (${resp.status})` });
          return;
        }
        textToParse = await resp.text();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка загрузки M3U по ссылке';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const parsed = parseM3uContent(textToParse, sourceName);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'В указанном M3U не найдено потоков (http/https)' });
      return;
    }

    const sourceId = `m3u-${Date.now()}`;
    const finalId = saveImportedM3uChannels(sourceId, sourceName, trimmedUrl, parsed);
    res.json({ ok: true, sourceId: finalId, importedCount: parsed.length });
  });

  app.post('/api/tv/m3u/import-kz-free', async (_req, res) => {
    const kzM3uUrl = 'https://iptv-org.github.io/iptv/countries/kz.m3u';
    try {
      const resp = await fetch(kzM3uUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'QALA-TV/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const m3uText = await resp.text();
      const parsed = parseM3uContent(m3uText, 'Казахстан Free IPTV');
      if (parsed.length === 0) throw new Error('Пустой плейлист KZ');

      const finalId = saveImportedM3uChannels(
        'm3u-kz-free',
        'Казахстан Free IPTV (iptv-org)',
        kzM3uUrl,
        parsed
      );
      res.json({ ok: true, sourceId: finalId, importedCount: parsed.length, isLive: true });
    } catch {
      // Fallback to built-in curated KZ channels if upstream is unreachable
      const fallbackParsed = KAZAKHSTAN_TV_CHANNELS.map((ch) => ({
        name: ch.name,
        category: ch.category,
        logoUrl: ch.logoUrl || '',
        streamUrl: ch.streamUrl,
        isRegional: Boolean(ch.isRegional),
      }));
      const finalId = saveImportedM3uChannels(
        'm3u-kz-free',
        'Казахстан Free IPTV (локальная база)',
        kzM3uUrl,
        fallbackParsed
      );
      res.json({ ok: true, sourceId: finalId, importedCount: fallbackParsed.length, isLive: false });
    }
  });

  app.delete('/api/tv/m3u/:id', (req, res) => {
    const id = req.params.id;
    db.prepare('DELETE FROM tv_channels WHERE source_m3u = ?').run(id);
    db.prepare('DELETE FROM m3u_sources WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/tv/export.m3u', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM tv_channels WHERE is_active = 1 ORDER BY sort_order ASC')
      .all() as Array<Record<string, unknown>>;
    const lines = ['#EXTM3U'];
    for (const r of rows) {
      const logo = r.logo_url ? ` tvg-logo="${String(r.logo_url)}"` : '';
      const group = ` group-title="${String(r.category || 'KZ')}"`;
      lines.push(`#EXTINF:-1${logo}${group},${String(r.name)}`);
      lines.push(String(r.stream_url));
    }
    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="qala-kz-tv.m3u"');
    res.send(lines.join('\n'));
  });

  app.get('/api/tv/proxy', async (req, res) => {
    const rawTarget = typeof req.query.url === 'string' ? req.query.url : '';
    const target = isSafeExternalUrl(rawTarget);
    if (!target) {
      res.status(400).json({ error: 'Некорректный URL потока' });
      return;
    }

    try {
      const hostHeaders = getTvHostHeaders();
      const extra = hostHeaders.get(target.hostname);
      const upstreamHeaders: Record<string, string> = {
        'User-Agent':
          extra?.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (extra?.referrer) {
        upstreamHeaders.Referer = extra.referrer;
        try {
          upstreamHeaders.Origin = new URL(extra.referrer).origin;
        } catch {
          // некорректный referrer — без Origin
        }
      }
      const upstream = await fetch(target.toString(), {
        signal: AbortSignal.timeout(12000),
        headers: upstreamHeaders,
      });
      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const isPlaylist =
        target.pathname.toLowerCase().includes('.m3u8') ||
        contentType.toLowerCase().includes('mpegurl') ||
        contentType.toLowerCase().includes('x-mpegurl');

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');

      if (isPlaylist) {
        const text = await upstream.text();
        const baseUrl = upstream.url || target.toString();
        const rewritten = text
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
                try {
                  const abs = new URL(uri, baseUrl).toString();
                  return `URI="/api/tv/proxy?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }
            try {
              const absUrl = new URL(trimmed, baseUrl);
              // Сегменты на другом CDN-хосте получают те же заголовки, что и плейлист
              if (extra && !hostHeaders.has(absUrl.hostname)) hostHeaders.set(absUrl.hostname, extra);
              const abs = absUrl.toString();
              return `/api/tv/proxy?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.send(rewritten);
        return;
      }

      // Сегменты стримим сразу, не дожидаясь полной загрузки в память
      res.setHeader('Content-Type', contentType);
      const len = upstream.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      let clientGone = false;
      res.on('close', () => {
        clientGone = true;
        reader.cancel().catch(() => {});
      });
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || clientGone) break;
          if (!res.write(value)) {
            await new Promise<void>((resolve) => {
              res.once('drain', resolve);
              res.once('close', resolve);
            });
          }
        }
      } catch {
        // обрыв соединения с источником или клиентом
      }
      if (!res.writableEnded) res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка проксирования потока';
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.status(502).json({ error: msg });
    }
  });

  app.get('/api/radio/proxy', (req, res) => {
    const rawTarget = typeof req.query.url === 'string' ? req.query.url : '';
    const target = isSafeExternalUrl(rawTarget);
    if (!target) {
      res.status(400).json({ error: 'Некорректный URL аудиопотока' });
      return;
    }

    let settled = false;
    let activeUpstreamReq: http.ClientRequest | null = null;

    const pipeRadioUrl = (urlObj: URL, hops: number) => {
      if (hops > 3) {
        if (!settled) {
          settled = true;
          res.status(502).json({ error: 'Слишком много перенаправлений потока' });
        }
        return;
      }

      const client = urlObj.protocol === 'https:' ? https : http;
      const upstreamReq = client.get(
        urlObj,
        {
          headers: {
            'User-Agent': 'QALA-Radio/1.0 (Astana SuperApp)',
            Accept: 'audio/mpeg, audio/aac, audio/*, */*',
          },
          timeout: 12000,
        },
        (upstreamRes) => {
          const status = upstreamRes.statusCode || 502;
          const loc = upstreamRes.headers.location;
          if (status >= 300 && status < 400 && loc) {
            upstreamRes.resume();
            const nextSafe = isSafeExternalUrl(new URL(loc, urlObj).toString());
            if (!nextSafe) {
              if (!settled) {
                settled = true;
                res.status(400).json({ error: 'Небезопасное перенаправление потока' });
              }
              return;
            }
            pipeRadioUrl(nextSafe, hops + 1);
            return;
          }

          if (status < 200 || status >= 300) {
            upstreamRes.resume();
            if (!settled) {
              settled = true;
              res.status(status).json({ error: `Ошибка радиопотока: ${status}` });
            }
            return;
          }

          settled = true;
          const contentType = upstreamRes.headers['content-type'] || 'audio/mpeg';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache, no-store');
          res.status(200);
          upstreamRes.pipe(res);
        }
      );

      activeUpstreamReq = upstreamReq;

      upstreamReq.on('timeout', () => {
        upstreamReq.destroy();
        if (!settled && !res.headersSent) {
          settled = true;
          res.status(504).json({ error: 'Таймаут подключения к радиостанции' });
        }
      });

      upstreamReq.on('error', (err) => {
        if (!settled && !res.headersSent) {
          settled = true;
          res.status(502).json({ error: err.message || 'Ошибка радиопотока' });
        }
      });
    };

    req.on('close', () => {
      activeUpstreamReq?.destroy();
    });

    pipeRadioUrl(target, 0);
  });

  // 12. Weekly Weather Forecast (Open-Meteo Astana 7-day + fallback)
  app.get('/api/weather/weekly', async (_req, res) => {
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    try {
      const resp = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=51.1694&longitude=71.4491&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FAlmaty',
        { signal: AbortSignal.timeout(4500) }
      );
      if (!resp.ok) throw new Error('Weekly weather failed');
      const data = (await resp.json()) as {
        daily?: {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_probability_max?: number[];
          wind_speed_10m_max?: number[];
        };
      };
      const times = data.daily?.time || [];
      const days = times.slice(0, 7).map((isoDate, idx) => {
        const dt = new Date(`${isoDate}T12:00:00`);
        const label = idx === 0 ? 'Сегодня' : `${dayNames[dt.getDay()]} · ${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const code = data.daily?.weather_code?.[idx] ?? 3;
        return {
          date: isoDate,
          dayLabel: label,
          weatherCode: code,
          description: weatherCodeToRu(code),
          tempMax: Math.round(data.daily?.temperature_2m_max?.[idx] ?? -2),
          tempMin: Math.round(data.daily?.temperature_2m_min?.[idx] ?? -9),
          precipProb: Math.round(data.daily?.precipitation_probability_max?.[idx] ?? 20),
          windMax: Math.round(data.daily?.wind_speed_10m_max?.[idx] ?? 6),
        };
      });
      res.json({ days, isLive: true });
    } catch {
      const today = new Date();
      const fallback = Array.from({ length: 7 }, (_, idx) => {
        const dt = new Date(today.getTime() + idx * 86400000);
        const label = idx === 0 ? 'Сегодня' : `${dayNames[dt.getDay()]} · ${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const codes = [71, 3, 0, 2, 71, 3, 1];
        const maxes = [-3, -1, 1, -2, -5, -4, 0];
        const mins = [-10, -8, -7, -9, -13, -11, -8];
        return {
          date: dt.toISOString().slice(0, 10),
          dayLabel: label,
          weatherCode: codes[idx],
          description: weatherCodeToRu(codes[idx]),
          tempMax: maxes[idx],
          tempMin: mins[idx],
          precipProb: idx === 0 || idx === 4 ? 65 : 15,
          windMax: 5 + (idx % 4),
        };
      });
      res.json({ days: fallback, isLive: false });
    }
  });

  // 13. Live FX Exchange Rates to KZT (open.er-api.com + NBK reference fallback)
  app.get('/api/rates', async (_req, res) => {
    try {
      const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(4500),
      });
      if (!resp.ok) throw new Error('FX API failed');
      const data = (await resp.json()) as { rates?: Record<string, number> };
      const r = data.rates || {};
      const kztPerUsd = r.KZT || 495.5;
      const toKzt = (code: string, fallbackVal: number) =>
        r[code] && r[code] > 0 ? Number((kztPerUsd / r[code]).toFixed(2)) : fallbackVal;
      res.json({
        base: 'KZT',
        updatedAt: new Date().toISOString(),
        isLive: true,
        rates: {
          USD: Number(kztPerUsd.toFixed(2)),
          EUR: toKzt('EUR', 528.4),
          RUB: toKzt('RUB', 5.05),
          CNY: toKzt('CNY', 68.7),
          GBP: toKzt('GBP', 628.2),
          TRY: toKzt('TRY', 14.35),
        },
      });
    } catch {
      res.json({
        base: 'KZT',
        updatedAt: new Date().toISOString(),
        isLive: false,
        rates: {
          USD: 495.5,
          EUR: 528.4,
          RUB: 5.05,
          CNY: 68.7,
          GBP: 628.2,
          TRY: 14.35,
        },
      });
    }
  });

  // 14. Astana Traffic & Sergek Cameras
  app.get('/api/traffic', (_req, res) => {
    const hour = new Date().getHours();
    const rushBonus = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20) ? 1 : 0;
    const segments = ASTANA_TRAFFIC_SEGMENTS.map((seg) => {
      const score = Math.min(10, Math.max(1, seg.score + rushBonus));
      const level = score >= 7 ? 'busy' : score >= 4 ? 'moderate' : 'free';
      return {
        ...seg,
        score,
        level,
        speedKmh: Math.max(14, seg.speedKmh - rushBonus * 5),
      };
    });
    const avgScore = Math.round(segments.reduce((s, x) => s + x.score, 0) / segments.length);
    res.json({
      cityScore: avgScore,
      updatedAt: new Date().toISOString(),
      segments,
      cameras: ASTANA_SERGEK_CAMERAS,
    });
  });

  // 15. Qala Food Orders (persisted in SQLite + logs Wallet & Plans)
  app.get('/api/food/orders', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM food_orders ORDER BY datetime(created_at) DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      orders: rows.map((r) => ({
        id: String(r.id),
        restaurant: String(r.restaurant),
        items: JSON.parse(String(r.items_json || '[]')),
        total: Number(r.total),
        address: String(r.address),
        status: String(r.status),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/food/orders', (req, res) => {
    const body = req.body as {
      restaurant?: string;
      items?: Array<{ name: string; qty: number; price: number }>;
      total?: number;
      address?: string;
    };
    if (!Array.isArray(body.items) || body.items.length === 0 || !body.total) {
      res.status(400).json({ error: 'Корзина пуста' });
      return;
    }
    const id = `food-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const restaurant = (body.restaurant || 'Qala Food · Астана').trim();
    const address = (body.address || 'Нұржол желек жолы, 14').trim();

    db.prepare(
      `INSERT INTO food_orders (id, restaurant, items_json, total, address, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Курьер в пути (25 мин)', ?)`
    ).run(id, restaurant, JSON.stringify(body.items), Number(body.total), address, nowIso);

    db.prepare(
      `INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Еда', ?, ?)`
    ).run(`tx-food-${Date.now()}`, `Qala Food: ${restaurant}`, Number(body.total), nowIso);

    db.prepare(
      `INSERT INTO plans (id, title, date_label, completed, created_at) VALUES (?, ?, 'Доставка ~25 мин', 0, ?)`
    ).run(`plan-food-${Date.now()}`, `Заказ еды из ${restaurant} (${address})`, nowIso);

    res.status(201).json({ id, ok: true });
  });

  // 16. Reminders CRUD
  app.get('/api/reminders', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM reminders ORDER BY done ASC, datetime(created_at) DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      reminders: rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        remindAt: String(r.remind_at),
        category: String(r.category),
        done: Boolean(r.done),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/reminders', (req, res) => {
    const body = req.body as { title?: string; remindAt?: string; category?: string };
    if (!body.title?.trim()) {
      res.status(400).json({ error: 'Введите текст напоминания' });
      return;
    }
    const id = `rem-${Date.now()}`;
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, 0, ?)`
    ).run(
      id,
      body.title.trim(),
      (body.remindAt || 'Сегодня').trim(),
      (body.category || 'Город').trim(),
      nowIso
    );
    res.status(201).json({ id });
  });

  app.patch('/api/reminders/:id', (req, res) => {
    const { done } = req.body as { done?: boolean };
    if (typeof done === 'boolean') {
      db.prepare('UPDATE reminders SET done = ? WHERE id = ?').run(done ? 1 : 0, req.params.id);
    }
    res.json({ ok: true });
  });

  app.delete('/api/reminders/:id', (req, res) => {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 17. TV Favorites & Watch History
  app.get('/api/tv/favorites', (_req, res) => {
    const rows = db
      .prepare('SELECT channel_id FROM tv_favorites ORDER BY datetime(added_at) DESC')
      .all() as Array<{ channel_id: string }>;
    res.json({ favoriteIds: rows.map((r) => r.channel_id) });
  });

  app.post('/api/tv/favorites', (req, res) => {
    const { channelId } = req.body as { channelId?: string };
    if (!channelId) {
      res.status(400).json({ error: 'channelId required' });
      return;
    }
    db.prepare('INSERT OR REPLACE INTO tv_favorites (channel_id, added_at) VALUES (?, ?)').run(
      channelId,
      new Date().toISOString()
    );
    res.json({ ok: true });
  });

  app.delete('/api/tv/favorites/:id', (req, res) => {
    db.prepare('DELETE FROM tv_favorites WHERE channel_id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/tv/history', (_req, res) => {
    const rows = db
      .prepare('SELECT channel_id FROM tv_history ORDER BY datetime(watched_at) DESC LIMIT 20')
      .all() as Array<{ channel_id: string }>;
    res.json({ historyIds: rows.map((r) => r.channel_id) });
  });

  app.post('/api/tv/history', (req, res) => {
    const { channelId } = req.body as { channelId?: string };
    if (!channelId) {
      res.status(400).json({ error: 'channelId required' });
      return;
    }
    db.prepare('INSERT OR REPLACE INTO tv_history (channel_id, watched_at) VALUES (?, ?)').run(
      channelId,
      new Date().toISOString()
    );
    res.json({ ok: true });
  });

  // 18. Admin PIN & Global Settings (Theme)
  app.get('/api/admin/pin/status', (_req, res) => {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'admin_pin'`)
      .get() as { value: string } | undefined;
    const pin = row?.value || '1234';
    res.json({ hasPin: Boolean(pin), isDefault: pin === '1234' });
  });

  app.post('/api/admin/pin/verify', (req, res) => {
    const { pin } = req.body as { pin?: string };
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'admin_pin'`)
      .get() as { value: string } | undefined;
    const current = row?.value || '1234';
    if (String(pin || '').trim() === current) {
      res.json({ ok: true, token: issueAdminToken(), mustChangePin: current === '1234' });
      return;
    }
    res.status(401).json({ ok: false, error: 'Неверный PIN-код' });
  });

  app.put('/api/admin/pin', (req, res) => {
    const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'admin_pin'`)
      .get() as { value: string } | undefined;
    const savedPin = row?.value || '1234';
    if (String(currentPin || '').trim() !== savedPin) {
      res.status(401).json({ error: 'Текущий PIN-код указан неверно' });
      return;
    }
    const cleanNew = String(newPin || '').trim();
    if (!/^\d{4,6}$/.test(cleanNew)) {
      res.status(400).json({ error: 'Новый PIN должен состоять из 4–6 цифр' });
      return;
    }
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_pin', ?)`).run(
      cleanNew
    );
    res.json({ ok: true });
  });

  /* Доска города: попутчики, находки, гололёд, ОСИ, волонтёры, питомцы, отзывы, подработки */
  const BOARD_TYPES = new Set(['ride', 'lost', 'ice', 'osi', 'volunteer', 'pet', 'review', 'gig', 'run']);
  app.get('/api/board', (req, res) => {
    const type = String(req.query.type || '');
    const since = Date.now() - (type === 'ice' ? 2 : 30) * 86400000;
    const rows = (BOARD_TYPES.has(type)
      ? db.prepare(`SELECT id, type, title, body, contact, lat, lng, created FROM board_posts WHERE type = ? AND created > ? ORDER BY created DESC LIMIT 100`).all(type, since)
      : db.prepare(`SELECT id, type, title, body, contact, lat, lng, created FROM board_posts WHERE created > ? ORDER BY created DESC LIMIT 100`).all(Date.now() - 30 * 86400000));
    res.json(rows);
  });
  app.post('/api/board', (req, res) => {
    const b = req.body as { type?: string; title?: string; body?: string; contact?: string; lat?: number; lng?: number; owner?: string };
    const type = String(b.type || '');
    const title = String(b.title || '').trim().slice(0, 120);
    const owner = String(b.owner || '').slice(0, 64);
    if (!BOARD_TYPES.has(type) || title.length < 3 || owner.length < 8) {
      res.status(400).json({ error: 'Заполните заголовок (от 3 символов)' });
      return;
    }
    const id = randomBytes(8).toString('hex');
    const lat = Number.isFinite(Number(b.lat)) ? Number(b.lat) : null;
    const lng = Number.isFinite(Number(b.lng)) ? Number(b.lng) : null;
    db.prepare(`INSERT INTO board_posts (id, type, title, body, contact, lat, lng, owner, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, type, title, String(b.body || '').slice(0, 1000), String(b.contact || '').slice(0, 80), lat, lng, owner, Date.now()
    );
    res.json({ ok: true, id });
  });
  app.delete('/api/board/:id', (req, res) => {
    const owner = String(req.headers['x-qala-owner'] || '');
    const r = isAdminRequest(req)
      ? db.prepare(`DELETE FROM board_posts WHERE id = ?`).run(req.params.id)
      : db.prepare(`DELETE FROM board_posts WHERE id = ? AND owner = ?`).run(req.params.id, owner);
    res.json({ ok: Number(r.changes) > 0 });
  });

  /* Резервная копия базы SQLite (только для админа) */
  app.get('/api/admin/backup', (_req, res) => {
    try {
      const tmp = path.join(DATA_DIR, `backup-${Date.now()}.db`);
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      res.download(tmp, `qala-backup-${new Date().toISOString().slice(0, 10)}.db`, () => {
        fs.rm(tmp, { force: true }, () => undefined);
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось сделать копию' });
    }
  });

  app.get('/api/settings', (_req, res) => {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'theme'`)
      .get() as { value: string } | undefined;
    res.json({ theme: row?.value === 'dark' ? 'dark' : 'light' });
  });

  app.put('/api/settings', (req, res) => {
    const { theme } = req.body as { theme?: 'light' | 'dark' };
    if (theme === 'light' || theme === 'dark') {
      db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('theme', ?)`).run(
        theme
      );
    }
    res.json({ ok: true, theme: theme === 'dark' ? 'dark' : 'light' });
  });

  // 19. QalaKarta Astana Map Layers (Parkings, Bus Stops, Sergek Cameras, Traffic Lights, Signs, POIs) + TomTom Proxy
  let cachedAstanaLayers: Record<string, unknown> | null = null;
  const loadAstanaLayers = () => {
    if (cachedAstanaLayers) return cachedAstanaLayers;
    const layersPath = path.join(DATA_DIR, 'astana_layers.json');
    try {
      if (fs.existsSync(layersPath)) {
        cachedAstanaLayers = JSON.parse(fs.readFileSync(layersPath, 'utf-8')) as Record<
          string,
          unknown
        >;
        return cachedAstanaLayers;
      }
    } catch {
      // ignore
    }
    return {
      parkings: [],
      osmParkings: [],
      noParkingSigns: [],
      busStops: [],
      trafficLights: [],
      sergekCameras: [],
      speedCameras: [],
      crossings: [],
      placesExtra: [],
    };
  };

  app.get('/api/map/layers', (_req, res) => {
    const layers = loadAstanaLayers();
    const existingExtra = Array.isArray(layers.placesExtra) ? layers.placesExtra : [];
    res.json({
      ...layers,
      placesExtra: [...ASTANA_EXTRA_POIS_SEED, ...existingExtra],
      tomtomConfigured: Boolean(getTomTomKey()),
    });
  });

  app.get('/api/map/tomtom/tile/:z/:x/:y.png', async (req, res) => {
    const ttKey = getTomTomKey();
    if (!ttKey) {
      res.status(204).end();
      return;
    }
    const { z, x, y } = req.params;
    if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
      res.status(400).end();
      return;
    }
    try {
      const tileUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(ttKey)}&tileSize=256`;
      const upstream = await fetch(tileUrl, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) {
        res.status(204).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.send(buf);
    } catch {
      res.status(204).end();
    }
  });

  app.get('/api/map/tomtom/incidents', async (_req, res) => {
    const ttKey = getTomTomKey();
    if (!ttKey) {
      res.json({ isLive: false, incidents: [] });
      return;
    }
    try {
      const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(ttKey)}&bbox=71.20,51.02,71.70,51.28&language=ru-RU&fields=%7Bincidents%7Btype%2Cgeometry%7Btype%2Ccoordinates%7D%2Cproperties%7BiconCategory%2CmagnitudeOfDelay%2Cevents%7Bdescription%7D%2Cfrom%2Cto%2Cdelay%2Clength%7D%7D%7D`;
      const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      const json = (await upstream.json()) as {
        incidents?: Array<{
          geometry?: { type?: string; coordinates?: unknown };
          properties?: {
            iconCategory?: number;
            magnitudeOfDelay?: number;
            events?: Array<{ description?: string }>;
            from?: string;
            to?: string;
            delay?: number;
          };
        }>;
      };
      const incidents = (json.incidents || [])
        .map((inc, idx) => {
          const props = inc.properties || {};
          const geom = inc.geometry || {};
          const rawCoords = geom.coordinates;
          let coords: Array<[number, number]> = [];
          if (geom.type === 'Point' && Array.isArray(rawCoords) && rawCoords.length >= 2) {
            coords = [[Number(rawCoords[1]), Number(rawCoords[0])]];
          } else if (geom.type === 'LineString' && Array.isArray(rawCoords)) {
            coords = (rawCoords as Array<[number, number]>).map((c) => [Number(c[1]), Number(c[0])]);
          } else if (geom.type === 'MultiPoint' && Array.isArray(rawCoords)) {
            coords = (rawCoords as Array<[number, number]>).map((c) => [Number(c[1]), Number(c[0])]);
          }
          coords = coords.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
          return {
            id: `tt-inc-${idx}`,
            description:
              props.events?.map((e) => e.description).filter(Boolean).join(', ') ||
              'Дорожное событие',
            from: String(props.from || 'Астана'),
            to: String(props.to || ''),
            delaySec: Number(props.delay || 0),
            magnitude: Number(props.magnitudeOfDelay || 0),
            iconCategory: Number(props.iconCategory || 0),
            coords,
          };
        })
        .filter((x) => x.coords.length > 0)
        .slice(0, 60);
      res.json({ isLive: true, incidents });
    } catch {
      res.json({ isLive: false, incidents: [] });
    }
  });

  // 20. Live Astana Cinema Afisha (kino.kz) + Poster Proxy
  let afishaCache: { date: string; at: number; movies: unknown[] } | null = null;

  app.get('/api/cinema/poster', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const parsed = isSafeExternalUrl(rawUrl);
    if (!parsed) {
      res.status(400).end();
      return;
    }
    try {
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://kino.kz/',
        },
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const ct = upstream.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  app.get('/api/cinema/afisha', async (req, res) => {
    const reqDate =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    if (
      afishaCache &&
      afishaCache.date === reqDate &&
      Date.now() - afishaCache.at < 20 * 60 * 1000 &&
      afishaCache.movies.length > 0
    ) {
      res.json({ isLive: true, date: reqDate, movies: afishaCache.movies });
      return;
    }

    const trpcUrl = (proc: string, payload: Record<string, unknown>) => {
      const inp = JSON.stringify({ '0': { json: payload } });
      return `https://kino.kz/api/trpc/${proc}?batch=1&input=${encodeURIComponent(inp)}`;
    };
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Referer: 'https://kino.kz/ru',
      Cookie: 'city=1; city_id=1',
    };

    try {
      const moviesResp = await fetch(
        trpcUrl('sessions.findMovies', { startDate: reqDate, endDate: reqDate }),
        { headers, signal: AbortSignal.timeout(7000) }
      );
      if (!moviesResp.ok) throw new Error(`kino.kz movies ${moviesResp.status}`);
      const moviesBatch = (await moviesResp.json()) as Array<{
        result?: { data?: { json?: Array<Record<string, unknown>> } };
      }>;
      const rawMovies = moviesBatch?.[0]?.result?.data?.json || [];
      const topMovies = rawMovies.slice(0, 14);

      const enriched = await Promise.all(
        topMovies.map(async (m) => {
          const movieId = Number(m.id);
          const smallPoster = String(m.small_poster || m.big_poster || '');
          const posterUrl = smallPoster
            ? `/api/cinema/poster?url=${encodeURIComponent(smallPoster)}`
            : '';
          const mins = Number(m.duration || 0);
          const durationStr =
            mins > 0 ? `${Math.floor(mins / 60)} ч ${String(mins % 60).padStart(2, '0')} мин` : '1 ч 45 мин';
          const genres = Array.isArray(m.genres)
            ? (m.genres as Array<{ title?: string }>).map((g) => g.title || '').filter(Boolean)
            : [];

          let sessions: Array<Record<string, unknown>> = [];
          try {
            const sessResp = await fetch(
              trpcUrl('sessions.getSessions', { id: movieId, date: reqDate }),
              { headers, signal: AbortSignal.timeout(5000) }
            );
            if (sessResp.ok) {
              const sessBatch = (await sessResp.json()) as Array<{
                result?: { data?: { json?: { sessions?: Array<Record<string, unknown>> } } };
              }>;
              const rawSessions = sessBatch?.[0]?.result?.data?.json?.sessions || [];
              sessions = rawSessions.slice(0, 18).map((it) => {
                const s = (it.session || {}) as Record<string, unknown>;
                const c = (it.cinema || {}) as Record<string, unknown>;
                const h = (it.hall || {}) as Record<string, unknown>;
                const dateIso = String(s.session_date_tz || '');
                const timeMatch = dateIso.match(/T(\d{2}:\d{2})/);
                let fmt = s.is_imax || h.imax
                  ? 'IMAX'
                  : s.is_fdx
                  ? '4DX'
                  : s.is_3_d
                  ? '3D'
                  : '2D';
                if (s.is_atmos) fmt += ' Atmos';
                const hallNameObj = (h.name_i18n || {}) as Record<string, unknown>;
                return {
                  id: Number(s.id || 0),
                  time: timeMatch ? timeMatch[1] : '19:00',
                  cinema: String(c.name || 'Кинотеатр Астаны').trim(),
                  address: String(c.address || 'Астана').trim(),
                  hall: String(hallNameObj.ru || h.name || 'Зал 1').trim(),
                  format: fmt,
                  lang: String(s.lang_label || 'RU'),
                  adultPrice: Number(s.adult || 2200),
                  studentPrice: Number(s.student || 0),
                  childPrice: Number(s.child || 0),
                  vipPrice: Number(s.vip || 0),
                  lat: Number(c.latitude || 51.1282),
                  lng: Number(c.longitude || 71.4304),
                };
              });
            }
          } catch {
            // keep movie even if sessions call timed out
          }

          return {
            id: `kino-${movieId}`,
            kinoId: movieId,
            title: String(m.name || m.name_rus || 'Фильм').trim(),
            originalTitle: String(m.name_origin || '').trim(),
            genres: genres.length > 0 ? genres : ['Кино'],
            age: Number(m.age_restriction || 12),
            duration: durationStr,
            posterUrl,
            url: String(m.movie_path || `https://kino.kz/ru/movie/${movieId}`),
            presale: Boolean(m.is_pre_sales),
            sessions,
          };
        })
      );

      const validMovies = enriched.filter((m) => m.title);
      if (validMovies.length > 0) {
        afishaCache = { date: reqDate, at: Date.now(), movies: validMovies };
        res.json({ isLive: true, date: reqDate, movies: validMovies });
        return;
      }
      throw new Error('No live movies');
    } catch {
      res.json({ isLive: false, date: reqDate, movies: [] });
    }
  });

  // 21. Saved Map Bookmarks (Дом, Работа, Парковка, Избранное)
  app.get('/api/map/bookmarks', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM map_bookmarks ORDER BY datetime(created_at) ASC')
      .all() as Array<Record<string, unknown>>;
    const bookmarks: MapBookmark[] = rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      kind: (['home', 'work', 'parking', 'favorite'].includes(String(r.kind))
        ? String(r.kind)
        : 'favorite') as MapBookmark['kind'],
      address: String(r.address),
      lat: Number(r.lat),
      lng: Number(r.lng),
      createdAt: String(r.created_at),
    }));
    res.json({ bookmarks });
  });

  app.post('/api/map/bookmarks', (req, res) => {
    const body = req.body as Partial<MapBookmark>;
    const label = String(body.label || '').trim();
    const address = String(body.address || 'Астана').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const kind =
      body.kind && ['home', 'work', 'parking', 'favorite'].includes(body.kind)
        ? body.kind
        : 'favorite';

    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Укажите название и корректные координаты' });
      return;
    }

    const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO map_bookmarks (id, label, kind, address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, label, kind, address, lat, lng, createdAt);

    const bookmark: MapBookmark = {
      id,
      label,
      kind,
      address,
      lat,
      lng,
      createdAt,
    };
    res.status(201).json({ bookmark });
  });

  app.delete('/api/map/bookmarks/:id', (req, res) => {
    db.prepare('DELETE FROM map_bookmarks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 22. Interactive Cinema Seat Map & Booking Persistence
  function getBaselineBookedSeats(sessionKey: string): string[] {
    let hash = 0;
    for (let i = 0; i < sessionKey.length; i++) {
      hash = (hash * 31 + sessionKey.charCodeAt(i)) >>> 0;
    }
    const rows = ['B', 'C', 'D', 'E', 'F', 'G'];
    const result = new Set<string>();
    const count = 6 + (hash % 7);
    for (let i = 0; i < count; i++) {
      const r = rows[(hash + i * 3) % rows.length];
      const seatNum = 2 + ((hash + i * 7) % 8);
      result.add(`${r}${seatNum}`);
    }
    return Array.from(result);
  }

  app.get('/api/cinema/seats', (req, res) => {
    const sessionKey = String(req.query.sessionKey || '').trim();
    if (!sessionKey) {
      res.status(400).json({ error: 'sessionKey required' });
      return;
    }
    const dbRows = db
      .prepare('SELECT seat_id FROM cinema_booked_seats WHERE session_key = ?')
      .all(sessionKey) as Array<{ seat_id: string }>;
    const userBookedSeats = dbRows.map((r) => r.seat_id);
    const baseline = getBaselineBookedSeats(sessionKey);
    const merged = Array.from(new Set([...baseline, ...userBookedSeats]));
    res.json({ sessionKey, bookedSeats: merged, userBookedSeats });
  });

  app.post('/api/cinema/seats/book', (req, res) => {
    const body = req.body as {
      sessionKey?: string;
      seats?: string[];
      ticketType?: string;
    };
    const sessionKey = String(body.sessionKey || '').trim();
    const ticketType = String(body.ticketType || 'Взрослый').trim() || 'Взрослый';
    const rawSeats = Array.isArray(body.seats) ? body.seats : [];
    const validSeats = Array.from(
      new Set(
        rawSeats
          .map((s) => String(s).trim().toUpperCase())
          .filter((s) => /^[A-G](10|[1-9])$/.test(s))
      )
    );

    if (!sessionKey || validSeats.length === 0) {
      res.status(400).json({ error: 'Выберите хотя бы одно место для бронирования' });
      return;
    }

    const existingRows = db
      .prepare('SELECT seat_id FROM cinema_booked_seats WHERE session_key = ?')
      .all(sessionKey) as Array<{ seat_id: string }>;
    const existingSet = new Set([
      ...getBaselineBookedSeats(sessionKey),
      ...existingRows.map((r) => r.seat_id),
    ]);
    const conflict = validSeats.filter((s) => existingSet.has(s));
    if (conflict.length > 0) {
      res.status(409).json({
        error: `Места ${conflict.join(', ')} уже заняты`,
        conflict,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const insertSeat = db.prepare(
      `INSERT INTO cinema_booked_seats (session_key, seat_id, ticket_type, booked_at)
       VALUES (?, ?, ?, ?)`
    );
    for (const seat of validSeats) {
      insertSeat.run(sessionKey, seat, ticketType, nowIso);
    }

    const allBooked = Array.from(new Set([...existingSet, ...validSeats]));
    res.status(201).json({ ok: true, bookedSeats: allBooked, reserved: validSeats });
  });

  // 23. Geolocation IP Fallback & Astana Reverse Geocoding
  app.get('/api/geo/current', async (req, res) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const rawIp = forwarded || req.socket.remoteAddress || '';
    const cleanIp = rawIp.replace(/^::ffff:/, '');
    const isPrivate =
      !cleanIp ||
      cleanIp === '127.0.0.1' ||
      cleanIp === '::1' ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('172.');

    if (!isPrivate) {
      try {
        const ipRes = await fetch(`https://ipwho.is/${encodeURIComponent(cleanIp)}`, {
          signal: AbortSignal.timeout(3500),
        });
        if (ipRes.ok) {
          const d = (await ipRes.json()) as {
            success?: boolean;
            latitude?: number;
            longitude?: number;
            city?: string;
            country?: string;
          };
          if (d.success && typeof d.latitude === 'number' && typeof d.longitude === 'number') {
            res.json({
              lat: d.latitude,
              lng: d.longitude,
              city: d.city || 'Астана',
              country: d.country || 'Казахстан',
              source: 'ip',
            });
            return;
          }
        }
      } catch {
        // fall back to Astana center
      }
    }

    res.json({
      lat: ASTANA_CENTER[0],
      lng: ASTANA_CENTER[1],
      city: 'Астана',
      country: 'Казахстан',
      source: 'default',
    });
  });

  app.get('/api/geo/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Некорректные координаты' });
      return;
    }

    // 1. Check nearest Astana landmark, stop, or POI locally first
    let nearestLandmark = '';
    let minKm = Infinity;
    for (const pl of ASTANA_PLACES) {
      const d = haversineKm([lat, lng], [pl.lat, pl.lng]);
      if (d < minKm) {
        minKm = d;
        nearestLandmark = pl.name;
      }
    }

    const layers = loadAstanaLayers() as {
      busStops?: Array<{ name?: string; lat: number; lng: number }>;
      parkings?: Array<{ addr?: string; zone?: string; lat: number; lng: number }>;
      placesExtra?: Array<{ name?: string; address?: string; lat: number; lng: number }>;
    };

    let localAddress = '';
    let localDistKm = Infinity;
    for (const st of layers.busStops || []) {
      const d = haversineKm([lat, lng], [st.lat, st.lng]);
      if (d < localDistKm && st.name) {
        localDistKm = d;
        localAddress = `р-н ост. «${st.name}»`;
      }
    }
    for (const pk of layers.parkings || []) {
      const d = haversineKm([lat, lng], [pk.lat, pk.lng]);
      if (d < localDistKm && pk.addr) {
        localDistKm = d;
        localAddress = pk.addr;
      }
    }
    for (const ex of layers.placesExtra || []) {
      const d = haversineKm([lat, lng], [ex.lat, ex.lng]);
      if (d < localDistKm && (ex.address || ex.name)) {
        localDistKm = d;
        localAddress = ex.address || ex.name || '';
      }
    }

    // 2. Try Nominatim reverse geocoding with short timeout for exact street name
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru`;
      const nomRes = await fetch(nomUrl, {
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'QALA-Astana-App/1.0' },
      });
      if (nomRes.ok) {
        const nomJson = (await nomRes.json()) as {
          address?: {
            road?: string;
            house_number?: string;
            suburb?: string;
            city_district?: string;
            city?: string;
            town?: string;
          };
          display_name?: string;
        };
        const a = nomJson.address || {};
        const roadPart = [a.road, a.house_number].filter(Boolean).join(', ');
        const district = a.city_district || a.suburb || a.city || a.town || 'Астана';
        const resolved = roadPart || localAddress || nomJson.display_name?.split(',').slice(0, 2).join(', ');
        if (resolved) {
          res.json({
            address: resolved,
            district,
            nearestLandmark: minKm < 2.5 ? nearestLandmark : '',
          });
          return;
        }
      }
    } catch {
      // use local Astana match
    }

    const district =
      lat < 51.135 ? 'Есиль / Нура' : lng > 71.46 ? 'Алматы район' : 'Сарыарка / Байконур';
    res.json({
      address:
        localDistKm < 0.7 && localAddress
          ? localAddress
          : minKm < 1.2 && nearestLandmark
          ? `рядом с «${nearestLandmark}»`
          : `Астана (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      district,
      nearestLandmark: minKm < 3 ? nearestLandmark : '',
    });
  });

  // 24. Cinema Tickets History
  app.get('/api/cinema/tickets', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM cinema_tickets ORDER BY datetime(created_at) DESC LIMIT 40')
      .all() as Array<Record<string, unknown>>;
    res.json({
      tickets: rows.map((r) => ({
        id: String(r.id),
        sessionKey: String(r.session_key),
        movieTitle: String(r.movie_title),
        cinemaName: String(r.cinema_name),
        hallName: String(r.hall_name),
        time: String(r.time_label),
        seats: JSON.parse(String(r.seats_json || '[]')) as string[],
        ticketType: String(r.ticket_type),
        totalPrice: Number(r.total_price),
        code: String(r.code),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/cinema/tickets', (req, res) => {
    const body = req.body as {
      sessionKey?: string;
      movieTitle?: string;
      cinemaName?: string;
      hallName?: string;
      time?: string;
      seats?: string[];
      ticketType?: string;
      totalPrice?: number;
      code?: string;
    };
    if (!body.movieTitle || !Array.isArray(body.seats) || body.seats.length === 0) {
      res.status(400).json({ error: 'Укажите фильм и выбранные места' });
      return;
    }
    const id = `tkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const code = (body.code || `QINO-${Math.random().toString(36).slice(2, 6).toUpperCase()}`).trim();
    db.prepare(
      `INSERT INTO cinema_tickets (
        id, session_key, movie_title, cinema_name, hall_name, time_label,
        seats_json, ticket_type, total_price, code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      String(body.sessionKey || id),
      String(body.movieTitle).trim(),
      String(body.cinemaName || 'Кинотеатр Астаны').trim(),
      String(body.hallName || 'Зал 1').trim(),
      String(body.time || '19:00').trim(),
      JSON.stringify(body.seats),
      String(body.ticketType || 'Взрослый').trim(),
      Number(body.totalPrice || 0),
      code,
      nowIso
    );
    res.status(201).json({
      ticket: {
        id,
        sessionKey: String(body.sessionKey || id),
        movieTitle: String(body.movieTitle).trim(),
        cinemaName: String(body.cinemaName || 'Кинотеатр Астаны').trim(),
        hallName: String(body.hallName || 'Зал 1').trim(),
        time: String(body.time || '19:00').trim(),
        seats: body.seats,
        ticketType: String(body.ticketType || 'Взрослый').trim(),
        totalPrice: Number(body.totalPrice || 0),
        code,
        createdAt: nowIso,
      },
    });
  });

  // 25. Route History
  app.get('/api/map/routes/history', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM route_history ORDER BY datetime(created_at) DESC LIMIT 12')
      .all() as Array<Record<string, unknown>>;
    res.json({
      routes: rows.map((r) => ({
        id: String(r.id),
        fromName: String(r.from_name),
        toName: String(r.to_name),
        viaName: String(r.via_name || ''),
        fromLat: Number(r.from_lat),
        fromLng: Number(r.from_lng),
        toLat: Number(r.to_lat),
        toLng: Number(r.to_lng),
        viaLat: r.via_lat === null ? null : Number(r.via_lat),
        viaLng: r.via_lng === null ? null : Number(r.via_lng),
        distanceKm: Number(r.distance_km),
        durationMin: Number(r.duration_min),
        mode: String(r.mode) as 'taxi' | 'car' | 'bus',
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/map/routes/history', (req, res) => {
    const b = req.body as Partial<{
      fromName: string;
      toName: string;
      viaName: string;
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
      viaLat: number | null;
      viaLng: number | null;
      distanceKm: number;
      durationMin: number;
      mode: string;
    }>;
    if (!b.fromName || !b.toName || !Number.isFinite(b.fromLat) || !Number.isFinite(b.toLat)) {
      res.status(400).json({ error: 'Некорректные данные маршрута' });
      return;
    }
    const id = `rh-${Date.now()}`;
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO route_history (
        id, from_name, to_name, via_name, from_lat, from_lng, to_lat, to_lng,
        via_lat, via_lng, distance_km, duration_min, mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      String(b.fromName).trim(),
      String(b.toName).trim(),
      String(b.viaName || '').trim(),
      Number(b.fromLat),
      Number(b.fromLng),
      Number(b.toLat),
      Number(b.toLng),
      typeof b.viaLat === 'number' ? b.viaLat : null,
      typeof b.viaLng === 'number' ? b.viaLng : null,
      Number(b.distanceKm || 0),
      Number(b.durationMin || 0),
      String(b.mode || 'taxi'),
      nowIso
    );
    db.prepare(
      `DELETE FROM route_history WHERE id NOT IN (SELECT id FROM route_history ORDER BY datetime(created_at) DESC LIMIT 12)`
    ).run();
    res.status(201).json({ id });
  });

  app.delete('/api/map/routes/history', (_req, res) => {
    db.prepare('DELETE FROM route_history').run();
    res.json({ ok: true });
  });

  // 26. Paid Parking Timer Sessions (ЦОДД Астаны)
  app.get('/api/parking/sessions', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM parking_sessions ORDER BY datetime(started_at) DESC LIMIT 15')
      .all() as Array<Record<string, unknown>>;
    res.json({
      sessions: rows.map((r) => ({
        id: String(r.id),
        parkingTitle: String(r.parking_title),
        zone: String(r.zone),
        pricePerHour: Number(r.price_per_hour),
        durationMin: Number(r.duration_min),
        totalPrice: Number(r.total_price),
        startedAt: String(r.started_at),
        endsAt: String(r.ends_at),
        active: Boolean(r.active),
      })),
    });
  });

  app.post('/api/parking/sessions', (req, res) => {
    const b = req.body as {
      parkingTitle?: string;
      zone?: string;
      pricePerHour?: number;
      durationMin?: number;
    };
    const title = String(b.parkingTitle || 'Парковка ЦОДД Астана').trim();
    const zone = String(b.zone || 'Центр').trim();
    const pricePerHour = Math.max(0, Number(b.pricePerHour ?? 100));
    const durationMin = Math.max(15, Number(b.durationMin ?? 60));
    const totalPrice = Math.round((pricePerHour * durationMin) / 60);
    const now = new Date();
    const ends = new Date(now.getTime() + durationMin * 60000);
    const id = `park-${Date.now()}`;

    db.prepare(`UPDATE parking_sessions SET active = 0 WHERE active = 1`).run();
    db.prepare(
      `INSERT INTO parking_sessions (id, parking_title, zone, price_per_hour, duration_min, total_price, started_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, title, zone, pricePerHour, durationMin, totalPrice, now.toISOString(), ends.toISOString());

    if (totalPrice > 0) {
      db.prepare(
        `INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Транспорт', ?, ?)`
      ).run(`tx-park-${Date.now()}`, `Парковка ЦОДД (${title}, ${durationMin} мин)`, totalPrice, now.toISOString());
    }

    res.status(201).json({
      session: {
        id,
        parkingTitle: title,
        zone,
        pricePerHour,
        durationMin,
        totalPrice,
        startedAt: now.toISOString(),
        endsAt: ends.toISOString(),
        active: true,
      },
    });
  });

  app.patch('/api/parking/sessions/:id', (req, res) => {
    const row = db
      .prepare('SELECT * FROM parking_sessions WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }
    const { action, extraMin } = req.body as { action?: 'extend' | 'stop'; extraMin?: number };
    if (action === 'stop') {
      db.prepare('UPDATE parking_sessions SET active = 0 WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
      return;
    }
    const addMin = Math.max(15, Number(extraMin || 30));
    const prevEnd = Math.max(Date.now(), new Date(String(row.ends_at)).getTime());
    const nextEnd = new Date(prevEnd + addMin * 60000).toISOString();
    const extraFee = Math.round((Number(row.price_per_hour) * addMin) / 60);
    const nextDuration = Number(row.duration_min) + addMin;
    const nextTotal = Number(row.total_price) + extraFee;
    db.prepare(
      'UPDATE parking_sessions SET duration_min = ?, total_price = ?, ends_at = ? WHERE id = ?'
    ).run(nextDuration, nextTotal, nextEnd, req.params.id);
    if (extraFee > 0) {
      db.prepare(
        `INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Транспорт', ?, ?)`
      ).run(
        `tx-park-ext-${Date.now()}`,
        `Продление парковки (+${addMin} мин)`,
        extraFee,
        new Date().toISOString()
      );
    }
    res.json({ ok: true, endsAt: nextEnd, durationMin: nextDuration, totalPrice: nextTotal });
  });

  // 27. Utility Meter Readings (ЖКХ Астаны)
  app.get('/api/utilities', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM utility_readings ORDER BY datetime(created_at) DESC LIMIT 24')
      .all() as Array<Record<string, unknown>>;
    res.json({
      readings: rows.map((r) => ({
        id: String(r.id),
        period: String(r.period),
        coldWater: Number(r.cold_water),
        hotWater: Number(r.hot_water),
        electricityKwh: Number(r.electricity_kwh),
        heatingArea: Number(r.heating_area),
        totalKzt: Number(r.total_kzt),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/utilities', (req, res) => {
    const b = req.body as {
      period?: string;
      coldWater?: number;
      hotWater?: number;
      electricityKwh?: number;
      heatingArea?: number;
      totalKzt?: number;
      logToWallet?: boolean;
    };
    const id = `util-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const period = String(b.period || 'Текущий месяц').trim();
    const totalKzt = Math.max(0, Math.round(Number(b.totalKzt || 0)));
    db.prepare(
      `INSERT INTO utility_readings (id, period, cold_water, hot_water, electricity_kwh, heating_area, total_kzt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      period,
      Number(b.coldWater || 0),
      Number(b.hotWater || 0),
      Number(b.electricityKwh || 0),
      Number(b.heatingArea || 0),
      totalKzt,
      nowIso
    );
    if (b.logToWallet && totalKzt > 0) {
      db.prepare(
        `INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Другое', ?, ?)`
      ).run(`tx-util-${Date.now()}`, `ЖКХ Астана (${period})`, totalKzt, nowIso);
    }
    res.status(201).json({ id });
  });

  app.delete('/api/utilities/:id', (req, res) => {
    db.prepare('DELETE FROM utility_readings WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 28. Wallet Monthly Budget
  app.get('/api/wallet/budget', (_req, res) => {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'wallet_budget'`)
      .get() as { value: string } | undefined;
    res.json({ budget: Math.max(10000, Number(row?.value || 150000)) });
  });

  app.put('/api/wallet/budget', (req, res) => {
    const budget = Math.max(10000, Math.round(Number((req.body as { budget?: number }).budget || 150000)));
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('wallet_budget', ?)`).run(
      String(budget)
    );
    res.json({ budget });
  });

  // 29. Virtual Avtobys Transport Card (110 ₸ Astana fare)
  app.get('/api/avtobys', (_req, res) => {
    const balRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'avtobys_balance'`)
      .get() as { value: string } | undefined;
    const cardRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'avtobys_card'`)
      .get() as { value: string } | undefined;
    const tripsRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'avtobys_trips'`)
      .get() as { value: string } | undefined;
    let trips: unknown[] = [];
    try {
      trips = JSON.parse(tripsRow?.value || '[]') as unknown[];
    } catch {
      trips = [];
    }
    res.json({
      balance: Number(balRow?.value || 2200),
      cardNumber: cardRow?.value || '9643 1084 5512 0194',
      trips,
    });
  });

  app.post('/api/avtobys', (req, res) => {
    const b = req.body as {
      action?: 'pay' | 'topup';
      busNumber?: string;
      routeTitle?: string;
      amount?: number;
    };
    const balRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'avtobys_balance'`)
      .get() as { value: string } | undefined;
    const cardRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'avtobys_card'`)
      .get() as { value: string } | undefined;
    const tripsRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'avtobys_trips'`)
      .get() as { value: string } | undefined;

    let balance = Number(balRow?.value || 2200);
    let trips: Array<Record<string, unknown>> = [];
    try {
      trips = JSON.parse(tripsRow?.value || '[]') as Array<Record<string, unknown>>;
    } catch {
      trips = [];
    }

    const nowIso = new Date().toISOString();
    if (b.action === 'topup') {
      const add = Math.max(100, Math.round(Number(b.amount || 1000)));
      balance += add;
    } else {
      const fare = Math.max(55, Math.round(Number(b.amount || 110)));
      if (balance < fare) {
        res.status(400).json({ error: 'Недостаточно средств на карте Avtobys' });
        return;
      }
      balance -= fare;
      const busNum = String(b.busNumber || '10').trim();
      const routeTitle = String(b.routeTitle || `Автобус №${busNum}`).trim();
      trips = [
        {
          id: `avt-${Date.now()}`,
          busNumber: busNum,
          routeTitle,
          fare,
          createdAt: nowIso,
        },
        ...trips,
      ].slice(0, 15);
      db.prepare(
        `INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Транспорт', ?, ?)`
      ).run(`tx-avt-${Date.now()}`, `Avtobys: автобус №${busNum}`, fare, nowIso);
    }

    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('avtobys_balance', ?)`).run(
      String(balance)
    );
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('avtobys_trips', ?)`).run(
      JSON.stringify(trips)
    );

    res.json({
      balance,
      cardNumber: cardRow?.value || '9643 1084 5512 0194',
      trips,
    });
  });

  // 30. Astana Address & Place Autocomplete Search (/api/geo/search)
  app.get('/api/geo/search', async (req, res) => {
    const qRaw = String(req.query.q || '').trim();
    if (qRaw.length < 2) {
      res.json({ results: [] });
      return;
    }
    const q = qRaw.toLowerCase();
    const results: Array<{
      id: string;
      name: string;
      address: string;
      category: string;
      lat: number;
      lng: number;
      source: 'local' | 'nominatim';
    }> = [];
    const seen = new Set<string>();
    const pushItem = (item: (typeof results)[number]) => {
      const key = `${item.name.toLowerCase()}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push(item);
    };

    for (const pl of ASTANA_PLACES) {
      if (pl.name.toLowerCase().includes(q) || pl.address.toLowerCase().includes(q)) {
        pushItem({
          id: pl.id,
          name: pl.name,
          address: pl.address,
          category: pl.category,
          lat: pl.lat,
          lng: pl.lng,
          source: 'local',
        });
      }
    }

    for (const ex of ASTANA_EXTRA_POIS_SEED) {
      if (ex.name.toLowerCase().includes(q) || ex.address.toLowerCase().includes(q)) {
        pushItem({
          id: ex.id,
          name: ex.name,
          address: ex.address,
          category: ex.category,
          lat: ex.lat,
          lng: ex.lng,
          source: 'local',
        });
      }
    }

    const layers = loadAstanaLayers() as {
      busStops?: Array<{ id?: string; name?: string; routes?: string; lat: number; lng: number }>;
      parkings?: Array<{ id?: string; addr?: string; zone?: string; lat: number; lng: number }>;
      placesExtra?: Array<{ id?: string; name?: string; address?: string; category?: string; lat: number; lng: number }>;
    };

    for (const ex of layers.placesExtra || []) {
      if (results.length >= 8) break;
      const n = String(ex.name || '');
      const a = String(ex.address || '');
      if (n.toLowerCase().includes(q) || a.toLowerCase().includes(q)) {
        pushItem({
          id: String(ex.id || `ex-${n}`),
          name: n || a,
          address: a || 'Астана',
          category: String(ex.category || 'place'),
          lat: Number(ex.lat),
          lng: Number(ex.lng),
          source: 'local',
        });
      }
    }

    for (const bs of layers.busStops || []) {
      if (results.length >= 10) break;
      const n = String(bs.name || '');
      if (n.toLowerCase().includes(q)) {
        pushItem({
          id: String(bs.id || `bs-${n}`),
          name: `Остановка «${n}»`,
          address: bs.routes ? `Маршруты: ${bs.routes}` : 'Остановка Астаны',
          category: 'bus',
          lat: Number(bs.lat),
          lng: Number(bs.lng),
          source: 'local',
        });
      }
    }

    for (const pk of layers.parkings || []) {
      if (results.length >= 12) break;
      const a = String(pk.addr || '');
      if (a.toLowerCase().includes(q)) {
        pushItem({
          id: String(pk.id || `pk-${a}`),
          name: `Парковка · ${a}`,
          address: `Зона ${pk.zone || 'Центр'}`,
          category: 'parking',
          lat: Number(pk.lat),
          lng: Number(pk.lng),
          source: 'local',
        });
      }
    }

    const qkMatches = await searchQalaKarta(qRaw, 8);
    for (const qk of qkMatches) {
      if (results.length >= 10) break;
      pushItem({
        id: qk.id,
        name: qk.name,
        address: qk.address,
        category: qk.category,
        lat: qk.lat,
        lng: qk.lng,
        source: 'local',
      });
    }

    if (results.length < 6) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          `${qRaw}, Астана, Казахстан`
        )}&viewbox=71.15,51.32,71.75,50.95&bounded=1&limit=6&accept-language=ru`;
        const nomRes = await fetch(nomUrl, {
          signal: AbortSignal.timeout(3000),
          headers: { 'User-Agent': 'QALA-Astana-App/1.0' },
        });
        if (nomRes.ok) {
          const arr = (await nomRes.json()) as Array<{
            place_id?: number;
            display_name?: string;
            name?: string;
            type?: string;
            lat?: string;
            lon?: string;
          }>;
          for (const item of arr) {
            const lat = Number(item.lat);
            const lng = Number(item.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const parts = String(item.display_name || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            pushItem({
              id: `nom-${item.place_id || Math.random()}`,
              name: item.name || parts[0] || qRaw,
              address: parts.slice(0, 3).join(', '),
              category: item.type || 'address',
              lat,
              lng,
              source: 'nominatim',
            });
          }
        }
      } catch {
        // fallback to local Astana matches
      }
    }

    res.json({ results: results.slice(0, 10) });
  });

  // 31. Live Air Quality (AQI, PM2.5, PM10) for Astana via Open-Meteo Air Quality
  app.get('/api/air-quality', async (_req, res) => {
    const classify = (aqi: number) => {
      if (aqi <= 25) return { level: 'Отличный' as const, advice: 'Воздух чистый — отлично подходит для пробежек у Ишима и прогулок.' };
      if (aqi <= 50) return { level: 'Хороший' as const, advice: 'Комфортные условия для пеших маршрутов и спорта на улице.' };
      if (aqi <= 85) return { level: 'Умеренный' as const, advice: 'Чувствительным людям лучше сократить интенсивные тренировки у магистралей.' };
      if (aqi <= 130) return { level: 'Повышенный' as const, advice: 'Проветривайте помещения кратковременно, выберите парк или крытый спорткомплекс.' };
      return { level: 'Высокий' as const, advice: 'Рекомендуется маска при длительном нахождении на улице и очиститель воздуха дома.' };
    };

    try {
      const aqRes = await fetch(
        'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=51.1694&longitude=71.4491&current=pm2_5,pm10,nitrogen_dioxide,european_aqi',
        { signal: AbortSignal.timeout(4000) }
      );
      if (!aqRes.ok) throw new Error('AQ HTTP');
      const aqJson = (await aqRes.json()) as {
        current?: { pm2_5?: number; pm10?: number; nitrogen_dioxide?: number; european_aqi?: number };
      };
      const cur = aqJson.current || {};
      const aqi = Math.max(5, Math.round(cur.european_aqi ?? 28));
      const info = classify(aqi);
      res.json({
        aqi,
        level: info.level,
        pm25: Number((cur.pm2_5 ?? 9.4).toFixed(1)),
        pm10: Number((cur.pm10 ?? 18.2).toFixed(1)),
        no2: Number((cur.nitrogen_dioxide ?? 14.5).toFixed(1)),
        advice: info.advice,
        updatedAt: new Date().toISOString(),
        isLive: true,
      });
    } catch {
      const info = classify(29);
      res.json({
        aqi: 29,
        level: info.level,
        pm25: 9.8,
        pm10: 19.4,
        no2: 15.2,
        advice: info.advice,
        updatedAt: new Date().toISOString(),
        isLive: false,
      });
    }
  });

  // 32. Astana Prayer Times (AlAdhan live + seasonal Astana fallback)
  app.get('/api/prayer-times', async (_req, res) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dateLabel = `${dd}.${mm}.${yyyy}`;

    const determineNext = (t: { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string }) => {
      const astanaNow = new Date(now.getTime() + 5 * 3600 * 1000);
      const hm = `${String(astanaNow.getUTCHours()).padStart(2, '0')}:${String(astanaNow.getUTCMinutes()).padStart(2, '0')}`;
      const list: Array<[string, string]> = [
        ['Фаджр', t.fajr],
        ['Восход', t.sunrise],
        ['Зухр', t.dhuhr],
        ['Аср', t.asr],
        ['Магриб', t.maghrib],
        ['Иша', t.isha],
      ];
      for (const [label, time] of list) {
        if (time > hm) return `${label} · ${time}`;
      }
      return `Фаджр · ${t.fajr}`;
    };

    try {
      const alRes = await fetch(
        `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=51.1694&longitude=71.4491&method=3`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!alRes.ok) throw new Error('AlAdhan error');
      const alJson = (await alRes.json()) as {
        data?: { timings?: Record<string, string> };
      };
      const tm = alJson.data?.timings;
      if (!tm) throw new Error('No timings');
      const clean = (v?: string) => String(v || '00:00').slice(0, 5);
      const out = {
        fajr: clean(tm.Fajr),
        sunrise: clean(tm.Sunrise),
        dhuhr: clean(tm.Dhuhr),
        asr: clean(tm.Asr),
        maghrib: clean(tm.Maghrib),
        isha: clean(tm.Isha),
      };
      res.json({
        date: dateLabel,
        city: 'Астана',
        ...out,
        nextPrayer: determineNext(out),
        isLive: true,
      });
    } catch {
      const month = now.getMonth() + 1;
      const seasonal =
        month >= 5 && month <= 8
          ? { fajr: '03:18', sunrise: '04:42', dhuhr: '12:14', asr: '16:28', maghrib: '19:46', isha: '21:14' }
          : month >= 11 || month <= 2
          ? { fajr: '06:04', sunrise: '07:48', dhuhr: '12:12', asr: '14:32', maghrib: '16:36', isha: '18:12' }
          : { fajr: '04:46', sunrise: '06:24', dhuhr: '12:16', asr: '15:36', maghrib: '18:08', isha: '19:38' };
      res.json({
        date: dateLabel,
        city: 'Астана',
        ...seasonal,
        nextPrayer: determineNext(seasonal),
        isLive: false,
      });
    }
  });

  // 33. iKomek 109 Citizen Reports CRUD
  app.get('/api/ikomek', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM ikomek_reports ORDER BY datetime(created_at) DESC LIMIT 40')
      .all() as Array<Record<string, unknown>>;
    res.json({
      reports: rows.map((r) => ({
        id: String(r.id),
        category: String(r.category),
        title: String(r.title),
        address: String(r.address),
        lat: Number(r.lat),
        lng: Number(r.lng),
        status: String(r.status),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/ikomek', (req, res) => {
    const b = req.body as Partial<{
      category: string;
      title: string;
      address: string;
      lat: number;
      lng: number;
    }>;
    if (!b.title?.trim()) {
      res.status(400).json({ error: 'Опишите городскую проблему для заявки в iKomek 109' });
      return;
    }
    const id = `ik-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const category = String(b.category || 'Дороги').trim();
    const title = b.title.trim();
    const address = String(b.address || 'Астана, Есильский район').trim();
    const lat = Number.isFinite(Number(b.lat)) ? Number(b.lat) : ASTANA_CENTER[0];
    const lng = Number.isFinite(Number(b.lng)) ? Number(b.lng) : ASTANA_CENTER[1];

    db.prepare(
      `INSERT INTO ikomek_reports (id, category, title, address, lat, lng, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Принято', ?)`
    ).run(id, category, title, address, lat, lng, nowIso);

    res.status(201).json({
      report: { id, category, title, address, lat, lng, status: 'Принято', createdAt: nowIso },
    });
  });

  app.patch('/api/ikomek/:id', (req, res) => {
    const { status } = req.body as { status?: string };
    if (status && ['Принято', 'В работе', 'Решено'].includes(status)) {
      db.prepare('UPDATE ikomek_reports SET status = ? WHERE id = ?').run(status, req.params.id);
    }
    res.json({ ok: true });
  });

  app.delete('/api/ikomek/:id', (req, res) => {
    db.prepare('DELETE FROM ikomek_reports WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 34. Garage / My Car CRUD (/api/garage)
  app.get('/api/garage', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM garage_vehicles ORDER BY datetime(created_at) DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      vehicles: rows.map((r) => ({
        id: String(r.id),
        plate: String(r.plate),
        model: String(r.model),
        year: Number(r.year),
        mileageKm: Number(r.mileage_km),
        techInspectionDate: String(r.tech_inspection_date),
        insuranceDate: String(r.insurance_date),
        tireSeason: String(r.tire_season),
        nextOilChangeKm: Number(r.next_oil_change_km),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/garage', (req, res) => {
    const b = req.body as Partial<{
      plate: string;
      model: string;
      year: number;
      mileageKm: number;
      techInspectionDate: string;
      insuranceDate: string;
      tireSeason: string;
      nextOilChangeKm: number;
    }>;
    if (!b.plate?.trim() || !b.model?.trim()) {
      res.status(400).json({ error: 'Укажите госномер и модель автомобиля' });
      return;
    }
    const id = `car-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const mileage = Math.max(0, Number(b.mileageKm || 0));
    const nextOil = Math.max(mileage, Number(b.nextOilChangeKm || mileage + 8000));
    db.prepare(
      `INSERT INTO garage_vehicles (
        id, plate, model, year, mileage_km, tech_inspection_date, insurance_date,
        tire_season, next_oil_change_km, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.plate.trim().toUpperCase(),
      b.model.trim(),
      Number(b.year || 2022),
      mileage,
      String(b.techInspectionDate || '2027-04-15'),
      String(b.insuranceDate || '2027-02-20'),
      String(b.tireSeason || 'Зима (шипы)'),
      nextOil,
      nowIso
    );
    res.status(201).json({ id });
  });

  app.delete('/api/garage/:id', (req, res) => {
    db.prepare('DELETE FROM garage_vehicles WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 35. Personal Map Notes, Parked Car Tracker & Family Safe Zones (/api/map/notes)
  app.get('/api/map/notes', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM map_notes ORDER BY datetime(created_at) DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      notes: rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        note: String(r.note),
        kind: String(r.kind) as 'note' | 'parked_car' | 'family_zone',
        rating: Number(r.rating),
        address: String(r.address),
        lat: Number(r.lat),
        lng: Number(r.lng),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/map/notes', (req, res) => {
    const b = req.body as Partial<{
      title: string;
      note: string;
      kind: 'note' | 'parked_car' | 'family_zone';
      rating: number;
      address: string;
      lat: number;
      lng: number;
    }>;
    if (!b.title?.trim() || !Number.isFinite(Number(b.lat)) || !Number.isFinite(Number(b.lng))) {
      res.status(400).json({ error: 'Укажите название и координаты точки' });
      return;
    }
    const kind =
      b.kind === 'parked_car' || b.kind === 'family_zone' ? b.kind : 'note';
    if (kind === 'parked_car') {
      db.prepare(`DELETE FROM map_notes WHERE kind = 'parked_car'`).run();
    }
    const id = `mn-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const rating = Math.min(5, Math.max(1, Math.round(Number(b.rating || 5))));
    db.prepare(
      `INSERT INTO map_notes (id, title, note, kind, rating, address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.title.trim(),
      String(b.note || '').trim(),
      kind,
      rating,
      String(b.address || 'Астана').trim(),
      Number(b.lat),
      Number(b.lng),
      nowIso
    );
    res.status(201).json({
      item: {
        id,
        title: b.title.trim(),
        note: String(b.note || '').trim(),
        kind,
        rating,
        address: String(b.address || 'Астана').trim(),
        lat: Number(b.lat),
        lng: Number(b.lng),
        createdAt: nowIso,
      },
    });
  });

  app.delete('/api/map/notes/:id', (req, res) => {
    db.prepare('DELETE FROM map_notes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 36. Full Personal State JSON Backup & Restore (/api/backup/export & /api/backup/restore)
  app.get('/api/backup/export', (_req, res) => {
    const data = {
      exportedAt: new Date().toISOString(),
      app: 'QALA Astana',
      profile: db.prepare('SELECT * FROM profile WHERE id = 1').get(),
      plans: db.prepare('SELECT * FROM plans').all(),
      reminders: db.prepare('SELECT * FROM reminders').all(),
      wallet_transactions: db.prepare('SELECT * FROM wallet_transactions').all(),
      map_bookmarks: db.prepare('SELECT * FROM map_bookmarks').all(),
      map_notes: db.prepare('SELECT * FROM map_notes').all(),
      garage_vehicles: db.prepare('SELECT * FROM garage_vehicles').all(),
      ikomek_reports: db.prepare('SELECT * FROM ikomek_reports').all(),
      utility_readings: db.prepare('SELECT * FROM utility_readings').all(),
    };
    res.json(data);
  });

  app.post('/api/backup/restore', (req, res) => {
    const b = req.body as Record<string, unknown>;
    if (!b || typeof b !== 'object' || b.app !== 'QALA Astana') {
      res.status(400).json({ error: 'Некорректный формат резервной копии QALA' });
      return;
    }
    let restoredCount = 0;
    const arr = (k: string) => (Array.isArray(b[k]) ? (b[k] as Array<Record<string, unknown>>) : []);

    for (const r of arr('reminders')) {
      if (r.id && r.title) {
        db.prepare(
          `INSERT OR IGNORE INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          String(r.id),
          String(r.title),
          String(r.remind_at || 'Сегодня'),
          String(r.category || 'Город'),
          Number(r.done || 0),
          String(r.created_at || new Date().toISOString())
        );
        restoredCount++;
      }
    }
    for (const p of arr('plans')) {
      if (p.id && p.title) {
        db.prepare(
          `INSERT OR IGNORE INTO plans (id, title, date_label, completed, created_at) VALUES (?, ?, ?, ?, ?)`
        ).run(
          String(p.id),
          String(p.title),
          String(p.date_label || 'Сегодня'),
          Number(p.completed || 0),
          String(p.created_at || new Date().toISOString())
        );
        restoredCount++;
      }
    }
    for (const g of arr('garage_vehicles')) {
      if (g.id && g.plate && g.model) {
        db.prepare(
          `INSERT OR IGNORE INTO garage_vehicles (id, plate, model, year, mileage_km, tech_inspection_date, insurance_date, tire_season, next_oil_change_km, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          String(g.id),
          String(g.plate),
          String(g.model),
          Number(g.year || 2022),
          Number(g.mileage_km || 0),
          String(g.tech_inspection_date || ''),
          String(g.insurance_date || ''),
          String(g.tire_season || 'Зима (шипы)'),
          Number(g.next_oil_change_km || 50000),
          String(g.created_at || new Date().toISOString())
        );
        restoredCount++;
      }
    }
    for (const n of arr('map_notes')) {
      if (n.id && n.title) {
        db.prepare(
          `INSERT OR IGNORE INTO map_notes (id, title, note, kind, rating, address, lat, lng, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          String(n.id),
          String(n.title),
          String(n.note || ''),
          String(n.kind || 'note'),
          Number(n.rating || 5),
          String(n.address || 'Астана'),
          Number(n.lat || ASTANA_CENTER[0]),
          Number(n.lng || ASTANA_CENTER[1]),
          String(n.created_at || new Date().toISOString())
        );
        restoredCount++;
      }
    }

    res.json({ ok: true, restoredCount });
  });

  // 36. QalaKarta Custom Vector Map Engine (128k OSM elements, 50k buildings, 6120 POIs, 6310 signs)
  app.get('/api/qalakarta/stats', async (_req, res) => {
    try {
      const store = await getQalaKartaStore();
      res.json(store.stats);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'QalaKarta error' });
    }
  });

  app.get('/api/qalakarta/viewport', async (req, res) => {
    const minLat = Number(req.query.minLat ?? ASTANA_CENTER[0] - 0.03);
    const maxLat = Number(req.query.maxLat ?? ASTANA_CENTER[0] + 0.03);
    const minLng = Number(req.query.minLng ?? ASTANA_CENTER[1] - 0.05);
    const maxLng = Number(req.query.maxLng ?? ASTANA_CENTER[1] + 0.05);
    const zoom = Number(req.query.zoom ?? 13);
    const includeBuildings = req.query.buildings !== '0';
    const includeSigns = req.query.signs !== '0';
    const includePlaces = req.query.places !== '0';

    if (
      !Number.isFinite(minLat) ||
      !Number.isFinite(maxLat) ||
      !Number.isFinite(minLng) ||
      !Number.isFinite(maxLng)
    ) {
      res.status(400).json({ error: 'Некорректные границы области' });
      return;
    }

    try {
      const data = await queryQalaKartaViewport({
        minLat,
        maxLat,
        minLng,
        maxLng,
        zoom: Number.isFinite(zoom) ? zoom : 13,
        includeBuildings,
        includeSigns,
        includePlaces,
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'QalaKarta viewport error' });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`QALA Liquid Glass сервер запущен на http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Ошибка запуска QALA сервера:', err);
  process.exit(1);
});
