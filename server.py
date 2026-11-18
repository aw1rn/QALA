#!/usr/bin/env python3
"""
QALA — Полноценный Python-сервер (Python 3.10+, только стандартная библиотека).
Обслуживает собранный интерфейс (dist/), SQLite (data/qala.db),
Админку ТВ и M3U/M3U8, сбор бесплатных каналов Казахстана, HLS-прокси,
карту/погоду/маршруты Астаны, Qala AI и экспорт ZIP-архива.
"""

from __future__ import annotations

import gzip
import ipaddress
import json
import math
import mimetypes
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from typing import Any

ROOT_DIR = Path(os.environ.get("QALA_ROOT_DIR") or Path(__file__).resolve().parent.parent)
DIST_DIR = ROOT_DIR / "dist"
DATA_DIR = Path(os.environ.get("QALA_DATA_DIR") or ROOT_DIR / "data")
DB_PATH = DATA_DIR / "qala.db"
PORT = int(os.environ.get("PORT", "3000"))

DATA_DIR.mkdir(parents=True, exist_ok=True)

ACCENT_PALETTE = [
    "#2563EB",
    "#DC2626",
    "#0EA5E9",
    "#E11D48",
    "#EA580C",
    "#0F766E",
    "#16A34A",
    "#7C3AED",
    "#4F46E5",
    "#0284C7",
]

ASTANA_CENTER = (51.1282, 71.4304)

ASTANA_PLACES_MIN = [
    ("Байтерек", 51.1283, 71.4305),
    ("Хан Шатыр", 51.1325, 71.4038),
    ("Мега Силк Вей", 51.0894, 71.4079),
    ("Нурлы Жол", 51.1112, 71.5295),
    ("Абу-Даби Плаза", 51.1208, 71.4281),
    ("Ботанический сад", 51.1066, 71.4163),
    ("Аэропорт Нурсултан Назарбаев", 51.0222, 71.4669),
    ("Паркинг Нуржол", 51.1292, 71.4342),
    ("Парковка Барыс Арена", 51.1088, 71.4005),
    ("Паркинг Достык", 51.1251, 71.4258),
    ("Остановка Дом Министерств", 51.1264, 71.4418),
    ("Остановка Astana Opera", 51.1342, 71.4112),
]

PY_EXTRA_POIS_SEED = [
    {"id": "poi-warm-1", "name": "Тёплая остановка «Байтерек»", "category": "warm_stop", "address": "ул. Динмухамеда Кунаева, 14 (у Нұржол)", "phone": "109", "website": "cts.gov.kz", "hours": "06:00 – 23:30", "lat": 51.1286, "lng": 71.4319},
    {"id": "poi-warm-2", "name": "Тёплая остановка «Хан Шатыр»", "category": "warm_stop", "address": "пр. Туран, 37", "phone": "109", "website": "cts.gov.kz", "hours": "06:00 – 23:30", "lat": 51.1329, "lng": 71.4048},
    {"id": "poi-ev-1", "name": "ЭЗС Qazaq Energy · Абу-Даби Плаза", "category": "ev", "address": "ул. Сыганак, 60/5", "phone": "+7 (7172) 55-12-00", "website": "qazaqenergy.kz", "hours": "24/7 · CCS2", "lat": 51.1204, "lng": 71.4274},
    {"id": "poi-cowork-1", "name": "Astana Hub Coworking & Wi-Fi", "category": "coworking", "address": "пр. Мәңгілік Ел, 55/8", "phone": "+7 (7172) 79-97-50", "website": "astanahub.com", "hours": "09:00 – 21:00", "lat": 51.0906, "lng": 71.4165},
    {"id": "poi-eco-1", "name": "Экопункт вторсырья «Taza Qala · Нұржол»", "category": "eco", "address": "ул. Туркестан, 12", "phone": "109", "website": "recycle.kz", "hours": "09:00 – 20:00", "lat": 51.1235, "lng": 71.4265},
    {"id": "poi-acc-1", "name": "Дворец Мира и Согласия (безбарьерная среда)", "category": "accessible", "address": "пр. Тәуелсіздік, 57", "phone": "+7 (7172) 74-47-44", "website": "astana-piramida.kz", "hours": "10:00 – 19:00", "lat": 51.1231, "lng": 71.4636},
]

_QK_STORE_CACHE: dict[str, Any] | None = None
_QK_STORE_LOCK = threading.Lock()
_QK_LAT0, _QK_LON0 = 51.1283, 71.4305
_QK_MLAT = 111320.0
_QK_MLON = 111320.0 * math.cos(math.radians(_QK_LAT0))
_QK_ROAD_CLS = {
    "motorway": 0, "motorway_link": 0, "trunk": 0, "trunk_link": 0,
    "primary": 1, "primary_link": 1,
    "secondary": 2, "secondary_link": 2, "tertiary": 2, "tertiary_link": 2,
    "residential": 3, "unclassified": 3, "living_street": 3, "road": 3,
    "service": 4, "busway": 4,
    "pedestrian": 5, "footway": 5, "path": 5, "steps": 5, "cycleway": 5, "track": 5,
}
_QK_SIGN_NAMES = {
    "L": "Светофор", "C": "Пешеходный переход", "J": "Остановка транспорта",
    "K": "Камера «Сергек»", "F": "Парковочный знак", "R": "Ж/Д переезд",
    "P": "Пост / Рубеж", "S": "Знак «Стоп» (2.5)", "G": "«Уступи дорогу» (2.4)",
    "V": "Контроль скорости", "H": "Ограничение скорости", "U": "Разворот",
    "Z": "Пешеходная зона", "Y": "Одностороннее движение", "M": "Дорожная камера",
    "T": "Развязка / Светофор", "B": "Остановочный карман", "Q": "Инфо-указатель",
    "E": "Въезд запрещён",
}


def _qk_bbox(pts: list[list[float]]) -> tuple[float, float, float, float]:
    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    return (min(lats), min(lngs), max(lats), max(lngs))


def get_qalakarta_store() -> dict[str, Any]:
    global _QK_STORE_CACHE
    if _QK_STORE_CACHE is not None:
        return _QK_STORE_CACHE
    with _QK_STORE_LOCK:
        if _QK_STORE_CACHE is not None:
            return _QK_STORE_CACHE
        zip_path = ROOT_DIR / "public" / "assets" / "aistudio" / "QalaKarta_a07b787c.zip"
        areas: list[dict[str, Any]] = []
        waterways: list[dict[str, Any]] = []
        roads: list[dict[str, Any]] = []
        buildings: list[dict[str, Any]] = []
        places: list[dict[str, Any]] = []
        signs: list[dict[str, Any]] = []
        addresses: list[dict[str, Any]] = []
        total_elements = 0

        if zip_path.exists():
            with zipfile.ZipFile(zip_path) as zf:
                names = set(zf.namelist())
                if "QalaKarta/bundled/astana_full.json.gz" in names:
                    full = json.loads(gzip.decompress(zf.read("QalaKarta/bundled/astana_full.json.gz")).decode("utf-8"))
                    elements = full.get("elements") or []
                    total_elements = len(elements)
                    for el in elements:
                        tags = el.get("tags") or {}
                        eid = int(el.get("id") or 0)
                        etype = el.get("type")
                        if etype == "node" and isinstance(el.get("lat"), (int, float)) and isinstance(el.get("lon"), (int, float)):
                            street, house = tags.get("addr:street", ""), tags.get("addr:housenumber", "")
                            name = tags.get("name:ru") or tags.get("name") or tags.get("name:kk") or ""
                            addr = f"{street}, {house}" if (street and house) else tags.get("addr:full", "")
                            if addr or (name and any(k in tags for k in ("amenity", "shop", "office", "tourism", "healthcare"))):
                                addresses.append({"id": f"qkn-{eid}", "name": name or addr, "address": addr or "Астана", "category": tags.get("amenity") or tags.get("shop") or "address", "lat": float(el["lat"]), "lng": float(el["lon"])})
                            continue
                        geom = el.get("geometry") or []
                        if etype != "way" or len(geom) < 2:
                            continue
                        pts = [[round(float(g["lat"]), 6), round(float(g["lon"]), 6)] for g in geom]
                        bb = _qk_bbox(pts)
                        name = tags.get("name:ru") or tags.get("name") or tags.get("name:kk") or ""
                        if "building" in tags:
                            street, house = tags.get("addr:street", ""), tags.get("addr:housenumber", "")
                            addr = f"{street}, {house}" if (street and house) else tags.get("addr:full", "")
                            h_val = 9.6 if tags.get("building") in ("apartments", "residential", "yes") else 6.4
                            try:
                                if tags.get("height"):
                                    h_val = max(1.0, float(str(tags["height"]).replace("m", "").strip()))
                                elif tags.get("building:levels"):
                                    h_val = max(1.0, float(tags["building:levels"])) * 3.2
                            except ValueError:
                                pass
                            buildings.append({
                                "id": eid, "name": name, "addr": addr, "height": h_val,
                                "levels": tags.get("building:levels"), "amenity": tags.get("amenity"),
                                "shop": tags.get("shop"), "hours": tags.get("opening_hours"),
                                "phone": tags.get("phone") or tags.get("contact:phone"), "website": tags.get("website"),
                                "pts": pts, "bbox": bb,
                            })
                            if addr or name:
                                addresses.append({
                                    "id": f"qkb-{eid}", "name": name or addr, "address": addr or "Астана",
                                    "category": tags.get("amenity") or tags.get("shop") or "building",
                                    "lat": (bb[0] + bb[2]) / 2, "lng": (bb[1] + bb[3]) / 2,
                                })
                        elif "highway" in tags and tags.get("area") != "yes":
                            cls = _QK_ROAD_CLS.get(tags["highway"], 3)
                            ow = tags.get("oneway", "")
                            oneway = 1 if (ow in ("yes", "1", "true") or tags.get("junction") == "roundabout") else (-1 if ow == "-1" else 0)
                            roads.append({"id": eid, "cls": cls, "oneway": oneway, "bridge": bool(tags.get("bridge") and tags.get("bridge") != "no"), "name": name, "pts": pts, "bbox": bb})
                        elif tags.get("waterway") in ("river", "canal", "stream"):
                            waterways.append({"id": eid, "wide": tags["waterway"] in ("river", "canal"), "name": name, "pts": pts, "bbox": bb})
                        elif len(pts) >= 3:
                            ak = None
                            ww = tags.get("waterway")
                            lu = tags.get("landuse")
                            ls = tags.get("leisure")
                            nat = tags.get("natural")
                            if nat == "water" or ww == "riverbank" or lu == "reservoir":
                                ak = "water"
                            elif ls in ("park", "garden") or lu in ("recreation_ground", "grass"):
                                ak = "park"
                            elif nat == "wood" or lu == "forest":
                                ak = "wood"
                            elif ls in ("pitch", "stadium", "sports_centre"):
                                ak = "sport"
                            elif lu == "industrial":
                                ak = "industrial"
                            elif lu == "residential":
                                ak = "residential"
                            elif tags.get("place") in ("suburb", "quarter") or tags.get("district"):
                                ak = "district"
                            if ak:
                                areas.append({"id": eid, "kind": ak, "name": name, "pts": pts, "bbox": bb, "span": max(bb[2] - bb[0], bb[3] - bb[1])})

                if "QalaKarta/bundled/places_extra.json" in names:
                    px = json.loads(zf.read("QalaKarta/bundled/places_extra.json").decode("utf-8"))
                    for i, row in enumerate(px.get("p") or []):
                        if not isinstance(row, list) or len(row) < 3:
                            continue
                        try:
                            x, y = float(row[0]), float(row[1])
                        except (TypeError, ValueError):
                            continue
                        nm = str(row[2] or "").strip()
                        if not nm:
                            continue
                        places.append({
                            "id": f"qkp-{i}", "name": nm,
                            "cat": str(row[3] or "place").strip() or "place",
                            "addr": str(row[4] or "").strip() if len(row) > 4 else "",
                            "phone": str(row[5] or "").strip() if len(row) > 5 else "",
                            "website": str(row[6] or "").strip() if len(row) > 6 else "",
                            "hours": str(row[8] or "").strip() if len(row) > 8 else "",
                            "lat": round(_QK_LAT0 - y / _QK_MLAT, 6),
                            "lng": round(_QK_LON0 + x / _QK_MLON, 6),
                        })

                if "QalaKarta/bundled/signs.json" in names:
                    raw_signs = json.loads(zf.read("QalaKarta/bundled/signs.json").decode("utf-8"))
                    for i, row in enumerate(raw_signs):
                        if not isinstance(row, list) or len(row) < 3:
                            continue
                        code = str(row[0] or "").strip()
                        try:
                            x, y = float(row[1]), float(row[2])
                        except (TypeError, ValueError):
                            continue
                        extra = row[3] if len(row) > 3 else None
                        item: dict[str, Any] = {
                            "id": f"qks-{i}", "code": code,
                            "name": _QK_SIGN_NAMES.get(code, f"Знак ({code})"),
                            "lat": round(_QK_LAT0 - y / _QK_MLAT, 6),
                            "lng": round(_QK_LON0 + x / _QK_MLON, 6),
                        }
                        if isinstance(extra, (int, float)):
                            item["hits"] = int(extra)
                        elif isinstance(extra, str) and extra:
                            item["label"] = extra
                        signs.append(item)

        _QK_STORE_CACHE = {
            "areas": areas, "waterways": waterways, "roads": roads,
            "buildings": buildings, "places": places, "signs": signs, "addresses": addresses,
            "stats": {
                "totalElements": total_elements, "buildings": len(buildings),
                "roads": len(roads), "places": len(places), "signs": len(signs),
                "addresses": len(addresses), "isReady": bool(zip_path.exists()),
            },
        }
        return _QK_STORE_CACHE


def query_qalakarta_viewport(
    min_lat: float, max_lat: float, min_lng: float, max_lng: float,
    zoom: float, inc_b: bool = True, inc_s: bool = True, inc_p: bool = True,
) -> dict[str, Any]:
    store = get_qalakarta_store()
    areas_out = []
    min_span = 0.004 if zoom < 12 else (0.001 if zoom < 13.5 else 0.0)
    for a in store["areas"]:
        if a["kind"] == "residential" and zoom < 13:
            continue
        if a["span"] < min_span and a["kind"] != "water":
            continue
        bb = a["bbox"]
        if bb[2] >= min_lat and bb[0] <= max_lat and bb[3] >= min_lng and bb[1] <= max_lng:
            areas_out.append({"id": a["id"], "kind": a["kind"], "name": a["name"], "pts": a["pts"]})
            if len(areas_out) >= 1600:
                break

    waterways_out = []
    for w in store["waterways"]:
        if not w["wide"] and zoom < 13.2:
            continue
        bb = w["bbox"]
        if bb[2] >= min_lat and bb[0] <= max_lat and bb[3] >= min_lng and bb[1] <= max_lng:
            waterways_out.append({"id": w["id"], "wide": w["wide"], "name": w["name"], "pts": w["pts"]})

    max_cls = 2 if zoom < 12.2 else (3 if zoom < 13.6 else (4 if zoom < 14.5 else 5))
    roads_out = []
    for r in store["roads"]:
        if r["cls"] > max_cls:
            continue
        bb = r["bbox"]
        if bb[2] >= min_lat and bb[0] <= max_lat and bb[3] >= min_lng and bb[1] <= max_lng:
            roads_out.append({"id": r["id"], "cls": r["cls"], "oneway": r["oneway"], "bridge": r["bridge"], "name": r["name"], "pts": r["pts"]})
            if len(roads_out) >= 4200:
                break

    buildings_out = []
    if inc_b and zoom >= 14.0:
        for b in store["buildings"]:
            bb = b["bbox"]
            if bb[2] >= min_lat and bb[0] <= max_lat and bb[3] >= min_lng and bb[1] <= max_lng:
                buildings_out.append({k: b[k] for k in ("id", "name", "addr", "height", "levels", "amenity", "shop", "hours", "phone", "website", "pts") if b.get(k) is not None})
                if len(buildings_out) >= 2200:
                    break

    places_out = []
    if inc_p and zoom >= 12.6:
        lim = 420 if zoom >= 14.5 else 180
        for p in store["places"]:
            if min_lat <= p["lat"] <= max_lat and min_lng <= p["lng"] <= max_lng:
                places_out.append(p)
                if len(places_out) >= lim:
                    break

    signs_out = []
    if inc_s and zoom >= 13.2:
        maj = zoom < 14.6
        lim = 600 if zoom >= 15.2 else 260
        for s in store["signs"]:
            if maj and s["code"] not in ("K", "L", "R", "P"):
                continue
            if min_lat <= s["lat"] <= max_lat and min_lng <= s["lng"] <= max_lng:
                signs_out.append(s)
                if len(signs_out) >= lim:
                    break

    return {
        "areas": areas_out, "waterways": waterways_out, "roads": roads_out,
        "buildings": buildings_out, "places": places_out, "signs": signs_out,
        "stats": store["stats"],
    }


def search_qalakarta(query: str, limit: int = 8) -> list[dict[str, Any]]:
    store = get_qalakarta_store()
    q = query.strip().lower()
    if len(q) < 2:
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for p in store["places"]:
        if q in p["name"].lower() or q in p["addr"].lower():
            k = f"{p['name'].lower()}|{p['lat']:.4f}|{p['lng']:.4f}"
            if k not in seen:
                seen.add(k)
                out.append({"id": p["id"], "name": p["name"], "address": p["addr"] or "Астана", "category": p["cat"], "lat": p["lat"], "lng": p["lng"]})
                if len(out) >= limit:
                    return out
    for a in store["addresses"]:
        if q in a["name"].lower() or q in a["address"].lower():
            k = f"{a['name'].lower()}|{a['lat']:.4f}|{a['lng']:.4f}"
            if k not in seen:
                seen.add(k)
                out.append(a)
                if len(out) >= limit:
                    return out
    return out


SEED_KZ_CHANNELS = [
    {
        "id": "qazaqstan",
        "name": "Qazaqstan HD",
        "category": "Национальный",
        "currentShow": "Прямой эфир · Главный канал страны",
        "nextShow": "Документальный цикл «Ұлы дала»",
        "accentColor": "#2563EB",
        "streamUrl": "https://qazaqstantv-stream.qazcdn.com/qazaqstantv/qazaqstantv/playlist.m3u8",
        "logoUrl": "https://i.imgur.com/oI8g396.png",
        "isRegional": False,
    },
    {
        "id": "abai-tv",
        "name": "Abai TV",
        "category": "Культура",
        "currentShow": "Классика казахской оперы и театра",
        "nextShow": "Диалоги о литературе и кино",
        "accentColor": "#DC2626",
        "streamUrl": "https://abaitv-stream.qazcdn.com/abaitv/abaitv/playlist.m3u8",
        "logoUrl": "https://i.imgur.com/Nw2R7Dq.png",
        "isRegional": False,
    },
    {
        "id": "jibek-joly",
        "name": "Jibek Joly HD",
        "category": "Информационный",
        "currentShow": "Прямой эфир: Городская среда",
        "nextShow": "Вечерняя аналитика",
        "accentColor": "#0EA5E9",
        "streamUrl": "https://stream.qazcdn.net/ex6r514/jjtv/playlist.m3u8",
        "logoUrl": "https://i.imgur.com/SqyXtgK.png",
        "isRegional": False,
    },
    {
        "id": "silk-way",
        "name": "Silk Way",
        "category": "Международный",
        "currentShow": "Central Asia Today · Прямой эфир",
        "nextShow": "Архитектура столицы",
        "accentColor": "#1E293B",
        "streamUrl": "https://hlspackager.akamaized.net/live/DB/SILKWAY/SILKWAY/SILKWAY.m3u8",
        "logoUrl": "https://i.imgur.com/SJNDksF.png",
        "isRegional": False,
    },
    {
        "id": "balapan",
        "name": "Балапан HD",
        "category": "Детский",
        "currentShow": "Умные сказки и анимация",
        "nextShow": "Весёлая математика",
        "accentColor": "#EA580C",
        "streamUrl": "https://balapantv-stream.qazcdn.com/balapantv/balapantv/playlist.m3u8",
        "logoUrl": "https://vote.rtrk.kz/img/balapan-logo.png",
        "isRegional": False,
    },
    {
        "id": "ktk",
        "name": "KTK HD",
        "category": "Развлекательный",
        "currentShow": "Вечерний выпуск событий",
        "nextShow": "Премьера недели",
        "accentColor": "#E11D48",
        "streamUrl": "https://wz-kt.ktk.kz/ktklive/smil:ktk-live.smil/playlist.m3u8",
        "logoUrl": "https://i.imgur.com/BurrNTo.png",
        "isRegional": False,
    },
    {
        "id": "qazsport",
        "name": "QazSport HD",
        "category": "Спорт",
        "currentShow": "Барыс Арена: Прямая трансляция",
        "nextShow": "Лёгкая атлетика и велоспорт",
        "accentColor": "#16A34A",
        "streamUrl": "https://qazsporttv-stream.qazcdn.com/qazsporttv/qazsporttv/playlist.m3u8",
        "logoUrl": "",
        "isRegional": False,
    },
    {
        "id": "silk-way-cinema",
        "name": "Silk Way Cinema",
        "category": "Кино",
        "currentShow": "Фестивальное кино Азии",
        "nextShow": "Ретроспектива 2000-х",
        "accentColor": "#6D28D9",
        "streamUrl": "https://stream.qazcdn.net/ex6r514/silkwaycinema/index.m3u8",
        "logoUrl": "",
        "isRegional": False,
    },
    {
        "id": "ulytau",
        "name": "Ulytau TV",
        "category": "Национальный",
        "currentShow": "Культурное наследие степи",
        "nextShow": "Документальные фильмы",
        "accentColor": "#7C3AED",
        "streamUrl": "https://ulytau.tv/hls/master.m3u8",
        "logoUrl": "",
        "isRegional": False,
    },
    {
        "id": "qazaqstan-intl",
        "name": "Qazaqstan International",
        "category": "Международный",
        "currentShow": "Новости и культура Казахстана",
        "nextShow": "Документальный проект",
        "accentColor": "#1D4ED8",
        "streamUrl": "https://stream8.cinerama.uz/1431/tracks-v1a1/mono.m3u8",
        "logoUrl": "https://cdn.qazaqstan.tv/qazaqstan.png",
        "isRegional": False,
    },
    {
        "id": "saryarqa",
        "name": "Saryarqa (Караганда)",
        "category": "Караганда",
        "currentShow": "Новости региона",
        "nextShow": "Промышленный фокус",
        "accentColor": "#4F46E5",
        "streamUrl": "https://stream.kaztrk.kz/regional/karagandytv/index.m3u8",
        "logoUrl": "",
        "isRegional": True,
    },
    {
        "id": "ertis",
        "name": "Ertis (Павлодар)",
        "category": "Павлодар",
        "currentShow": "Новости Прииртышья",
        "nextShow": "Вечерний эфир",
        "accentColor": "#0284C7",
        "streamUrl": "https://stream.kaztrk.kz/regional/pavlodartv/index.m3u8",
        "logoUrl": "",
        "isRegional": True,
    },
    {
        "id": "qyzyljar",
        "name": "Qyzyljar (Петропавловск)",
        "category": "СКО",
        "currentShow": "Северный Казахстан · Прямой эфир",
        "nextShow": "События дня",
        "accentColor": "#0EA5E9",
        "streamUrl": "https://stream.kaztrk.kz/regional/petropavltv/index.m3u8",
        "logoUrl": "",
        "isRegional": True,
    },
    {
        "id": "aqtobe",
        "name": "Aqtóbe TV",
        "category": "Актобе",
        "currentShow": "Региональный эфир · Актобе",
        "nextShow": "Итоги дня",
        "accentColor": "#0F766E",
        "streamUrl": "https://stream.kaztrk.kz/regional/aktobetv/index.m3u8",
        "logoUrl": "",
        "isRegional": True,
    },
    {
        "id": "rika-tv",
        "name": "Рика ТВ",
        "category": "Актобе",
        "currentShow": "Региональный эфир · Актобе",
        "nextShow": "Факт: новости города",
        "accentColor": "#0F766E",
        "streamUrl": "https://live-rikatv.cdnvideo.ru/rikatv/rikatv_tcode.sdp/playlist.m3u8",
        "logoUrl": "https://i.imgur.com/KJHWZ3B.png",
        "isRegional": True,
    },
    {
        "id": "qonaev-media",
        "name": "Qonaev Media",
        "category": "Алматинская обл.",
        "currentShow": "Региональный эфир",
        "nextShow": "Аналитика",
        "accentColor": "#F97316",
        "streamUrl": "https://s.qonaevtv.kz/live/qonaev/playlist.m3u8",
        "logoUrl": "",
        "isRegional": True,
    },
    {
        "id": "open-cinema-tv",
        "name": "Qala Cinema Stream",
        "category": "Кино",
        "currentShow": "Sintel · Открытый HD поток",
        "nextShow": "Tears of Steel 4K",
        "accentColor": "#10B981",
        "streamUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
        "logoUrl": "",
        "isRegional": False,
    },
]

DB_LOCK = threading.Lock()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with DB_LOCK:
        conn = get_db()
        try:
            conn.executescript(
                """
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
                """
            )

            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('admin_pin', '1234')")
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theme', 'light')")
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('wallet_budget', '150000')")
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('avtobys_balance', '2200')")
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('avtobys_card', '9643 1084 5512 0194')")
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('avtobys_trips', '[]')")

            if conn.execute("SELECT COUNT(*) FROM profile").fetchone()[0] == 0:
                conn.execute(
                    """
                    INSERT INTO profile (id, name, city, address, phone, email, avatar_initial)
                    VALUES (1, 'Амир', 'Астана', 'Нұржол желек жолы, 14', '+7 (701) 555-0142', 'amir@qala.kz', 'А')
                    """
                )

            now_iso = datetime.now(timezone.utc).isoformat()
            for idx, ch in enumerate(SEED_KZ_CHANNELS):
                conn.execute(
                    """
                    INSERT OR IGNORE INTO tv_channels (
                      id, name, category, current_show, next_show, accent_color,
                      stream_url, logo_url, quality_auto, quality_720, quality_1080,
                      is_regional, source_m3u, is_active, sort_order, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, 'seed-kz', 1, ?, ?)
                    """,
                    (
                        ch["id"],
                        ch["name"],
                        ch["category"],
                        ch["currentShow"],
                        ch["nextShow"],
                        ch["accentColor"],
                        ch["streamUrl"],
                        ch.get("logoUrl", ""),
                        1 if ch.get("isRegional") else 0,
                        idx,
                        now_iso,
                    ),
                )
                conn.execute(
                    "UPDATE tv_channels SET stream_url = ? WHERE id = ? AND stream_url LIKE '%mcquack.net%'",
                    (ch["streamUrl"], ch["id"]),
                )
            conn.execute("DELETE FROM tv_channels WHERE stream_url LIKE '%mcquack.net%'")

            if conn.execute("SELECT COUNT(*) FROM reminders").fetchone()[0] == 0:
                conn.execute(
                    "INSERT INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                    ("rem-1", "Продлить ключ ЭЦП на egov.kz", "Завтра · 10:00", "Документы", now_iso),
                )
                conn.execute(
                    "INSERT INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                    ("rem-2", "Оплатить транспортную карту Avtobys", "Пятница · 18:00", "Город", now_iso),
                )

            if conn.execute("SELECT COUNT(*) FROM map_bookmarks").fetchone()[0] == 0:
                conn.execute(
                    "INSERT INTO map_bookmarks (id, label, kind, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    ("bm-home", "Дом", "home", "Нұржол желек жолы, 14", 51.1282, 71.4304, now_iso),
                )
                conn.execute(
                    "INSERT INTO map_bookmarks (id, label, kind, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    ("bm-work", "Работа · МФЦА", "work", "пр. Мәңгілік Ел, 55/18", 51.0899, 71.4136, now_iso),
                )
                conn.execute(
                    "INSERT INTO map_bookmarks (id, label, kind, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    ("bm-park", "Парковка · Байтерек", "parking", "бульвар Нұржол, подземный паркинг", 51.1288, 71.4322, now_iso),
                )

            conn.commit()
        finally:
            conn.close()


def is_safe_external_url(raw_url: str) -> str | None:
    try:
        parsed = urllib.parse.urlparse(raw_url.strip())
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return None
        host = parsed.hostname.lower()
        if host in ("localhost", "0.0.0.0", "::1") or host.endswith((".local", ".internal")):
            return None
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return None
        except ValueError:
            pass
        return urllib.parse.urlunparse(parsed)
    except Exception:
        return None


def parse_m3u_content(raw_text: str, source_label: str) -> list[dict[str, Any]]:
    category_ru = {
        "General": "Национальный",
        "News": "Новости",
        "Culture": "Культура",
        "Kids": "Детский",
        "Sports": "Спорт",
        "Movies": "Кино",
        "Business": "Бизнес",
        "Music": "Музыка",
        "Entertainment": "Развлекательный",
        "Undefined": "Региональный",
        "Travel": "Путешествия",
    }
    parsed: list[dict[str, Any]] = []
    pending: dict[str, str] | None = None

    for raw_line in raw_text.replace("\r\n", "\n").split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            logo_m = re.search(r'tvg-logo="([^"]*)"', line, re.IGNORECASE)
            group_m = re.search(r'group-title="([^"]*)"', line, re.IGNORECASE)
            comma_idx = line.rfind(",")
            raw_name = line[comma_idx + 1 :].strip() if comma_idx >= 0 else "Канал ТВ"
            clean_name = re.sub(r"\s*\[Not 24/7\]|\s*\[Geo-blocked\]", "", raw_name, flags=re.I).strip() or "Канал ТВ"
            raw_group = (group_m.group(1) if group_m else "Общий").split(";")[0].strip()
            pending = {
                "name": clean_name,
                "category": category_ru.get(raw_group, raw_group or "Общий"),
                "logoUrl": logo_m.group(1).strip() if logo_m else "",
            }
        elif not line.startswith("#"):
            if re.match(r"^https?://", line, re.I):
                meta = pending or {
                    "name": f"{source_label} #{len(parsed) + 1}",
                    "category": "M3U канал",
                    "logoUrl": "",
                }
                is_regional = meta["category"] == "Региональный" or bool(
                    re.search(
                        r"alau|almaty|aqjaiyq|aqtobe|atyra|ertis|jambyl|kokshe|mangysta|mtrk|ontustik|qonaev|qostanai|qyzyl|rika|saryarqa|semei|tdk|ulytau",
                        meta["name"],
                        re.I,
                    )
                )
                parsed.append(
                    {
                        "name": meta["name"],
                        "category": meta["category"],
                        "logoUrl": meta["logoUrl"],
                        "streamUrl": line,
                        "isRegional": is_regional,
                    }
                )
            pending = None
    return parsed


def map_tv_row(row: sqlite3.Row) -> dict[str, Any]:
    q_streams: dict[str, str] = {}
    if row["quality_auto"]:
        q_streams["auto"] = row["quality_auto"]
    if row["quality_720"]:
        q_streams["720p"] = row["quality_720"]
    if row["quality_1080"]:
        q_streams["1080p"] = row["quality_1080"]
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "currentShow": row["current_show"],
        "nextShow": row["next_show"],
        "accentColor": row["accent_color"],
        "streamUrl": row["stream_url"],
        "logoUrl": row["logo_url"] or None,
        "qualityStreams": q_streams or None,
        "isRegional": bool(row["is_regional"]),
        "sourceM3u": row["source_m3u"] or None,
        "isActive": bool(row["is_active"]),
    }


def save_m3u_channels(source_id: str, source_name: str, source_url: str, parsed: list[dict[str, Any]]) -> str:
    now_iso = datetime.now(timezone.utc).isoformat()
    with DB_LOCK:
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT id FROM m3u_sources WHERE id = ? OR (url != '' AND url = ?)",
                (source_id, source_url),
            ).fetchone()
            final_id = existing["id"] if existing else source_id
            if existing:
                conn.execute(
                    "UPDATE m3u_sources SET name = ?, url = ?, channel_count = ?, last_synced_at = ? WHERE id = ?",
                    (source_name, source_url, len(parsed), now_iso, final_id),
                )
                conn.execute("DELETE FROM tv_channels WHERE source_m3u = ?", (final_id,))
            else:
                conn.execute(
                    "INSERT INTO m3u_sources (id, name, url, channel_count, last_synced_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (final_id, source_name, source_url, len(parsed), now_iso, now_iso),
                )

            max_order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM tv_channels").fetchone()[0] or 0
            order = max_order + 1
            for idx, ch in enumerate(parsed):
                slug = re.sub(r"[^a-z0-9а-яё]+", "-", ch["name"].lower(), flags=re.I).strip("-")[:28] or "ch"
                ch_id = f"{final_id}-{idx}-{slug}"
                color = ACCENT_PALETTE[idx % len(ACCENT_PALETTE)]
                conn.execute(
                    """
                    INSERT OR REPLACE INTO tv_channels (
                      id, name, category, current_show, next_show, accent_color,
                      stream_url, logo_url, quality_auto, quality_720, quality_1080,
                      is_regional, source_m3u, is_active, sort_order, created_at
                    ) VALUES (?, ?, ?, ?, 'Прямой эфир', ?, ?, ?, '', '', '', ?, ?, 1, ?, ?)
                    """,
                    (
                        ch_id,
                        ch["name"],
                        ch["category"],
                        f"Плейлист: {source_name}",
                        color,
                        ch["streamUrl"],
                        ch.get("logoUrl", ""),
                        1 if ch.get("isRegional") else 0,
                        final_id,
                        order,
                        now_iso,
                    ),
                )
                order += 1
            conn.commit()
            return final_id
        finally:
            conn.close()


def collect_project_files() -> list[tuple[str, Path, int]]:
    excluded_dirs = {"node_modules", "dist", "dev-dist", ".git", ".vite", ".cache", "data", "__pycache__"}
    excluded_files = {".env", ".DS_Store"}
    items: list[tuple[str, Path, int]] = []
    for dirpath, dirnames, filenames in os.walk(ROOT_DIR):
        dirnames[:] = [d for d in dirnames if d not in excluded_dirs]
        for fname in filenames:
            if fname in excluded_files:
                continue
            fpath = Path(dirpath) / fname
            rel = fpath.relative_to(ROOT_DIR).as_posix()
            items.append((rel, fpath, fpath.stat().st_size))
    items.sort(key=lambda x: x[0])
    return items


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


CACHED_ASTANA_LAYERS: dict[str, Any] | None = None
AFISHA_CACHE: dict[str, Any] | None = None


def load_astana_layers() -> dict[str, Any]:
    global CACHED_ASTANA_LAYERS
    if CACHED_ASTANA_LAYERS is not None:
        return CACHED_ASTANA_LAYERS
    layers_path = DATA_DIR / "astana_layers.json"
    if layers_path.exists():
        try:
            CACHED_ASTANA_LAYERS = json.loads(layers_path.read_text(encoding="utf-8"))
            return CACHED_ASTANA_LAYERS
        except Exception:
            pass
    return {
        "parkings": [],
        "osmParkings": [],
        "noParkingSigns": [],
        "busStops": [],
        "trafficLights": [],
        "sergekCameras": [],
        "speedCameras": [],
        "crossings": [],
        "placesExtra": [],
    }


def get_tomtom_key() -> str:
    key = os.environ.get("TOMTOM_API_KEY", "").strip()
    return key if key and key != "MY_TOMTOM_API_KEY" else ""


def get_baseline_booked_seats(session_key: str) -> list[str]:
    h = 0
    for ch in session_key:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    rows = ["B", "C", "D", "E", "F", "G"]
    res: list[str] = []
    seen: set[str] = set()
    count = 6 + (h % 7)
    for i in range(count):
        r = rows[(h + i * 3) % len(rows)]
        snum = 2 + ((h + i * 7) % 8)
        sid = f"{r}{snum}"
        if sid not in seen:
            seen.add(sid)
            res.append(sid)
    return res


class QalaPythonHandler(BaseHTTPRequestHandler):
    server_version = "QALA-Python/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        pass

    def _send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/api/health":
            self._send_json(200, {"status": "ok", "runtime": "python", "dbPath": str(DB_PATH)})
            return

        if path == "/api/weather":
            try:
                req = urllib.request.Request(
                    "https://api.open-meteo.com/v1/forecast?latitude=51.1694&longitude=71.4491&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&wind_speed_unit=ms",
                    headers={"User-Agent": "QALA-Python/1.0"},
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode("utf-8")).get("current", {})
                self._send_json(
                    200,
                    {
                        "temperature": round(data.get("temperature_2m", -4)),
                        "apparentTemperature": round(data.get("apparent_temperature", -11)),
                        "windSpeed": round(data.get("wind_speed_10m", 7)),
                        "weatherCode": data.get("weather_code", 71),
                        "description": "Погода в Астане",
                        "updatedAt": datetime.now(timezone.utc).isoformat(),
                        "isLive": True,
                    },
                )
            except Exception:
                self._send_json(
                    200,
                    {
                        "temperature": -4,
                        "apparentTemperature": -11,
                        "windSpeed": 7,
                        "weatherCode": 71,
                        "description": "Снег",
                        "updatedAt": datetime.now(timezone.utc).isoformat(),
                        "isLive": False,
                    },
                )
            return

        if path == "/api/profile":
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
                conn.close()
            if not row:
                self._send_json(404, {"error": "Профиль не найден"})
                return
            self._send_json(
                200,
                {
                    "profile": {
                        "name": row["name"],
                        "city": row["city"],
                        "address": row["address"],
                        "phone": row["phone"],
                        "email": row["email"],
                        "avatarInitial": row["avatar_initial"],
                    }
                },
            )
            return

        if path == "/api/apartments":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM apartments WHERE is_hidden = 0 ORDER BY rowid DESC").fetchall()
                conn.close()
            self._send_json(
                200,
                {
                    "apartments": [
                        {
                            "id": r["id"],
                            "title": r["title"],
                            "rentType": r["rent_type"],
                            "rooms": r["rooms"],
                            "area": r["area"],
                            "floor": r["floor"],
                            "price": r["price"],
                            "address": r["address"],
                            "district": r["district"],
                            "source": r["source"],
                            "lat": r["lat"],
                            "lng": r["lng"],
                            "addedAt": r["added_at"],
                            "isFavorite": bool(r["is_favorite"]),
                            "isHidden": bool(r["is_hidden"]),
                            "isCustom": bool(r["is_custom"]),
                            "description": r["description"],
                        }
                        for r in rows
                    ]
                },
            )
            return

        if path == "/api/market":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM market_items ORDER BY rowid DESC").fetchall()
                conn.close()
            self._send_json(
                200,
                {
                    "items": [
                        {
                            "id": r["id"],
                            "title": r["title"],
                            "price": r["price"],
                            "isFree": bool(r["is_free"]),
                            "category": r["category"],
                            "address": r["address"],
                            "distanceMeters": r["distance_meters"],
                            "sellerName": r["seller_name"],
                            "phone": r["phone"],
                            "description": r["description"],
                            "createdAt": r["created_at"],
                            "isMine": bool(r["is_mine"]),
                            "status": r["status"],
                        }
                        for r in rows
                    ]
                },
            )
            return

        if path == "/api/delivery/stops":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM delivery_stops ORDER BY sort_order ASC").fetchall()
                conn.close()
            self._send_json(
                200,
                {
                    "stops": [
                        {
                            "id": r["id"],
                            "name": r["name"],
                            "address": r["address"],
                            "lat": r["lat"],
                            "lng": r["lng"],
                            "done": bool(r["done"]),
                        }
                        for r in rows
                    ]
                },
            )
            return

        if path == "/api/wallet":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM wallet_transactions ORDER BY created_at DESC").fetchall()
                total = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions").fetchone()[0]
                conn.close()
            self._send_json(
                200,
                {
                    "transactions": [
                        {
                            "id": r["id"],
                            "title": r["title"],
                            "category": r["category"],
                            "amount": r["amount"],
                            "createdAt": r["created_at"],
                        }
                        for r in rows
                    ],
                    "total": total,
                },
            )
            return

        if path == "/api/plans":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM plans ORDER BY created_at DESC").fetchall()
                conn.close()
            self._send_json(
                200,
                {
                    "plans": [
                        {
                            "id": r["id"],
                            "title": r["title"],
                            "dateLabel": r["date_label"],
                            "completed": bool(r["completed"]),
                            "createdAt": r["created_at"],
                        }
                        for r in rows
                    ]
                },
            )
            return

        if path == "/api/favorites":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM favorite_movies ORDER BY added_at DESC").fetchall()
                conn.close()
            self._send_json(
                200,
                {
                    "favorites": [
                        {
                            "id": r["id"],
                            "title": r["title"],
                            "year": r["year"],
                            "genre": r["genre"],
                            "duration": r["duration"],
                            "rating": r["rating"],
                            "director": r["director"],
                            "description": r["description"],
                            "posterUrl": r["poster_url"],
                            "videoUrl": r["video_url"],
                            "source": r["source"],
                        }
                        for r in rows
                    ]
                },
            )
            return

        if path == "/api/tv/channels":
            include_all = qs.get("all", ["0"])[0] == "1"
            sql = (
                "SELECT * FROM tv_channels ORDER BY sort_order ASC, created_at DESC"
                if include_all
                else "SELECT * FROM tv_channels WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC"
            )
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute(sql).fetchall()
                conn.close()
            self._send_json(200, {"channels": [map_tv_row(r) for r in rows]})
            return

        if path == "/api/tv/m3u":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM m3u_sources ORDER BY created_at DESC").fetchall()
                conn.close()
            self._send_json(
                200,
                {
                    "sources": [
                        {
                            "id": r["id"],
                            "name": r["name"],
                            "url": r["url"],
                            "channelCount": r["channel_count"],
                            "lastSyncedAt": r["last_synced_at"],
                            "createdAt": r["created_at"],
                        }
                        for r in rows
                    ]
                },
            )
            return

        if path == "/api/tv/export.m3u":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute(
                    "SELECT * FROM tv_channels WHERE is_active = 1 ORDER BY sort_order ASC"
                ).fetchall()
                conn.close()
            lines = ["#EXTM3U"]
            for r in rows:
                logo = f' tvg-logo="{r["logo_url"]}"' if r["logo_url"] else ""
                lines.append(f'#EXTINF:-1{logo} group-title="{r["category"]}",{r["name"]}')
                lines.append(r["stream_url"])
            body = "\n".join(lines).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "audio/x-mpegurl; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="qala-kz-tv.m3u"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/tv/proxy":
            raw_target = qs.get("url", [""])[0]
            safe_url = is_safe_external_url(raw_target)
            if not safe_url:
                self._send_json(400, {"error": "Некорректный URL потока"})
                return
            try:
                req = urllib.request.Request(
                    safe_url,
                    headers={"User-Agent": "Mozilla/5.0 QALA-Python/1.0"},
                )
                with urllib.request.urlopen(req, timeout=12) as resp:
                    ctype = resp.headers.get("Content-Type", "application/octet-stream")
                    final_url = resp.geturl() or safe_url
                    data = resp.read()
                is_pl = ".m3u8" in urllib.parse.urlparse(safe_url).path.lower() or "mpegurl" in ctype.lower()
                if is_pl:
                    text = data.decode("utf-8", errors="replace")
                    out_lines = []
                    for line in text.split("\n"):
                        tr = line.strip()
                        if not tr:
                            out_lines.append(line)
                        elif tr.startswith("#"):
                            out_lines.append(
                                re.sub(
                                    r'URI="([^"]+)"',
                                    lambda m: f'URI="/api/tv/proxy?url={urllib.parse.quote(urllib.parse.urljoin(final_url, m.group(1)), safe="")}"',
                                    line,
                                )
                            )
                        else:
                            abs_u = urllib.parse.urljoin(final_url, tr)
                            out_lines.append(f"/api/tv/proxy?url={urllib.parse.quote(abs_u, safe='')}")
                    payload = "\n".join(out_lines).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as exc:
                self._send_json(502, {"error": str(exc)})
            return

        if path == "/api/radio/proxy":
            raw_target = qs.get("url", [""])[0]
            safe_url = is_safe_external_url(raw_target)
            if not safe_url:
                self._send_json(400, {"error": "Некорректный URL аудиопотока"})
                return
            try:
                req = urllib.request.Request(
                    safe_url,
                    headers={
                        "User-Agent": "QALA-Radio/1.0 (Astana SuperApp)",
                        "Accept": "audio/mpeg, audio/aac, audio/*, */*",
                    },
                )
                with urllib.request.urlopen(req, timeout=12) as resp:
                    ctype = resp.headers.get("Content-Type", "audio/mpeg")
                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-cache, no-store")
                    self.end_headers()
                    while True:
                        chunk = resp.read(8192)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as exc:
                if not self.wfile.closed:
                    try:
                        self._send_json(502, {"error": str(exc)})
                    except Exception:
                        pass
            return

        if path == "/api/download-source/manifest":
            files = collect_project_files()
            self._send_json(
                200,
                {
                    "count": len(files),
                    "totalBytes": sum(sz for _, _, sz in files),
                    "files": [{"path": rel, "size": sz} for rel, _, sz in files],
                },
            )
            return

        if path == "/api/download-source":
            files = collect_project_files()
            buf = BytesIO()
            with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for rel, fpath, _ in files:
                    zf.write(fpath, arcname=rel)
            raw_zip = buf.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", 'attachment; filename="qala-project-source.zip"')
            self.send_header("Content-Length", str(len(raw_zip)))
            self.end_headers()
            self.wfile.write(raw_zip)
            return

        if path == "/api/weather/weekly":
            day_names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
            try:
                req = urllib.request.Request(
                    "https://api.open-meteo.com/v1/forecast?latitude=51.1694&longitude=71.4491&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FAlmaty",
                    headers={"User-Agent": "QALA-Python/1.0"},
                )
                with urllib.request.urlopen(req, timeout=4.5) as resp:
                    daily = json.loads(resp.read().decode("utf-8")).get("daily", {})
                times = daily.get("time", [])[:7]
                days = []
                for idx, iso_dt in enumerate(times):
                    dt = datetime.strptime(iso_dt, "%Y-%m-%d")
                    label = "Сегодня" if idx == 0 else f"{day_names[dt.weekday()]} · {dt.strftime('%d.%m')}"
                    days.append({
                        "date": iso_dt,
                        "dayLabel": label,
                        "weatherCode": (daily.get("weather_code") or [3]*7)[idx],
                        "description": "Погода в Астане",
                        "tempMax": round((daily.get("temperature_2m_max") or [-2]*7)[idx]),
                        "tempMin": round((daily.get("temperature_2m_min") or [-9]*7)[idx]),
                        "precipProb": round((daily.get("precipitation_probability_max") or [20]*7)[idx]),
                        "windMax": round((daily.get("wind_speed_10m_max") or [6]*7)[idx]),
                    })
                self._send_json(200, {"days": days, "isLive": True})
            except Exception:
                now = datetime.now()
                fallback = []
                for idx in range(7):
                    dt = now + timedelta(days=idx)
                    label = "Сегодня" if idx == 0 else f"{day_names[dt.weekday()]} · {dt.strftime('%d.%m')}"
                    fallback.append({
                        "date": dt.strftime("%Y-%m-%d"),
                        "dayLabel": label,
                        "weatherCode": 71 if idx in (0, 4) else 3,
                        "description": "Снег" if idx in (0, 4) else "Переменная облачность",
                        "tempMax": [-3, -1, 1, -2, -5, -4, 0][idx],
                        "tempMin": [-10, -8, -7, -9, -13, -11, -8][idx],
                        "precipProb": 65 if idx in (0, 4) else 15,
                        "windMax": 5 + (idx % 4),
                    })
                self._send_json(200, {"days": fallback, "isLive": False})
            return

        if path == "/api/rates":
            try:
                req = urllib.request.Request("https://open.er-api.com/v6/latest/USD", headers={"User-Agent": "QALA-Python/1.0"})
                with urllib.request.urlopen(req, timeout=4.5) as resp:
                    rates = json.loads(resp.read().decode("utf-8")).get("rates", {})
                kzt = float(rates.get("KZT") or 495.5)
                def to_kzt(code: str, fb: float) -> float:
                    v = float(rates.get(code) or 0)
                    return round(kzt / v, 2) if v > 0 else fb
                self._send_json(200, {
                    "base": "KZT",
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "isLive": True,
                    "rates": {
                        "USD": round(kzt, 2),
                        "EUR": to_kzt("EUR", 528.4),
                        "RUB": to_kzt("RUB", 5.05),
                        "CNY": to_kzt("CNY", 68.7),
                        "GBP": to_kzt("GBP", 628.2),
                        "TRY": to_kzt("TRY", 14.35),
                    },
                })
            except Exception:
                self._send_json(200, {
                    "base": "KZT",
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "isLive": False,
                    "rates": {"USD": 495.5, "EUR": 528.4, "RUB": 5.05, "CNY": 68.7, "GBP": 628.2, "TRY": 14.35},
                })
            return

        if path == "/api/traffic":
            hour = datetime.now().hour
            rush = 1 if (8 <= hour <= 10 or 17 <= hour <= 20) else 0
            segments = [
                {"id": "tr-turan", "street": "пр. Туран (Хан Шатыр — Барыс Арена)", "district": "Есиль", "score": min(10, 7 + rush), "speedKmh": max(14, 24 - rush * 5), "coords": [[51.1325, 71.4038], [51.1205, 71.402], [51.1088, 71.4005]]},
                {"id": "tr-mangilik", "street": "пр. Мәңгілік Ел (Дом Министерств — EXPO)", "district": "Есиль", "score": min(10, 5 + rush), "speedKmh": max(14, 38 - rush * 5), "coords": [[51.1264, 71.4418], [51.111, 71.441], [51.0915, 71.429]]},
                {"id": "tr-kabanbay", "street": "пр. Кабанбай батыра (Ботанический — Mega)", "district": "Есиль", "score": min(10, 2 + rush), "speedKmh": max(14, 56 - rush * 5), "coords": [[51.1066, 71.4163], [51.098, 71.412], [51.0894, 71.4079]]},
                {"id": "tr-syganak", "street": "ул. Сыганак (Абу-Даби Плаза — мост Есиль)", "district": "Есиль / Алматы", "score": min(10, 6 + rush), "speedKmh": max(14, 31 - rush * 5), "coords": [[51.1208, 71.4158], [51.1208, 71.4281], [51.1202, 71.454]]},
                {"id": "tr-respublika", "street": "пр. Республики — набережная", "district": "Сарыарка", "score": min(10, 8 + rush), "speedKmh": max(14, 19 - rush * 5), "coords": [[51.1645, 71.4212], [51.156, 71.428], [51.1475, 71.434]]},
            ]
            for s in segments:
                s["level"] = "busy" if s["score"] >= 7 else ("moderate" if s["score"] >= 4 else "free")
            cameras = [
                {"id": "cam-1", "name": "Сергек №104", "intersection": "пр. Туран / ул. Достык", "limitKmh": 60, "lat": 51.1312, "lng": 71.4041, "status": "active"},
                {"id": "cam-2", "name": "Сергек №218", "intersection": "пр. Мәңгілік Ел / ул. Сыганак", "limitKmh": 60, "lat": 51.1211, "lng": 71.4414, "status": "active"},
                {"id": "cam-3", "name": "Сергек №309", "intersection": "пр. Кабанбай батыра / ул. Керей-Жанибек хандар", "limitKmh": 60, "lat": 51.1045, "lng": 71.4151, "status": "monitoring"},
                {"id": "cam-4", "name": "Сергек №412", "intersection": "пр. Республики / ул. Абая", "limitKmh": 60, "lat": 51.1618, "lng": 71.4252, "status": "active"},
                {"id": "cam-5", "name": "Сергек №507", "intersection": "шоссе Каркаралы (поворот на Аэропорт)", "limitKmh": 80, "lat": 51.045, "lng": 71.448, "status": "active"},
            ]
            self._send_json(200, {
                "cityScore": round(sum(s["score"] for s in segments) / len(segments)),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "segments": segments,
                "cameras": cameras,
            })
            return

        if path == "/api/food/orders":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM food_orders ORDER BY datetime(created_at) DESC").fetchall()
                conn.close()
            self._send_json(200, {
                "orders": [
                    {
                        "id": r["id"],
                        "restaurant": r["restaurant"],
                        "items": json.loads(r["items_json"] or "[]"),
                        "total": r["total"],
                        "address": r["address"],
                        "status": r["status"],
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/reminders":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM reminders ORDER BY done ASC, datetime(created_at) DESC").fetchall()
                conn.close()
            self._send_json(200, {
                "reminders": [
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "remindAt": r["remind_at"],
                        "category": r["category"],
                        "done": bool(r["done"]),
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/tv/favorites":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT channel_id FROM tv_favorites ORDER BY datetime(added_at) DESC").fetchall()
                conn.close()
            self._send_json(200, {"favoriteIds": [r["channel_id"] for r in rows]})
            return

        if path == "/api/tv/history":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT channel_id FROM tv_history ORDER BY datetime(watched_at) DESC LIMIT 20").fetchall()
                conn.close()
            self._send_json(200, {"historyIds": [r["channel_id"] for r in rows]})
            return

        if path == "/api/admin/pin/status":
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT value FROM app_settings WHERE key = 'admin_pin'").fetchone()
                conn.close()
            pin = row["value"] if row else "1234"
            self._send_json(200, {"hasPin": bool(pin), "isDefault": pin == "1234"})
            return

        if path == "/api/settings":
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT value FROM app_settings WHERE key = 'theme'").fetchone()
                conn.close()
            self._send_json(200, {"theme": "dark" if (row and row["value"] == "dark") else "light"})
            return

        if path == "/api/map/layers":
            layers = dict(load_astana_layers())
            layers["placesExtra"] = [*PY_EXTRA_POIS_SEED, *(layers.get("placesExtra") or [])]
            layers["tomtomConfigured"] = bool(get_tomtom_key())
            self._send_json(200, layers)
            return

        tt_tile_m = re.match(r"^/api/map/tomtom/tile/(\d+)/(\d+)/(\d+)\.png$", path)
        if tt_tile_m:
            tt_key = get_tomtom_key()
            if not tt_key:
                self.send_response(204)
                self.end_headers()
                return
            z, x, y = tt_tile_m.groups()
            try:
                tile_url = f"https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key={urllib.parse.quote(tt_key)}&tileSize=256"
                req = urllib.request.Request(tile_url, headers={"User-Agent": "QALA-Python/1.0"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    buf = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Cache-Control", "public, max-age=120")
                self.send_header("Content-Length", str(len(buf)))
                self.end_headers()
                self.wfile.write(buf)
            except Exception:
                self.send_response(204)
                self.end_headers()
            return

        if path == "/api/map/tomtom/incidents":
            tt_key = get_tomtom_key()
            if not tt_key:
                self._send_json(200, {"isLive": False, "incidents": []})
                return
            try:
                inc_url = (
                    f"https://api.tomtom.com/traffic/services/5/incidentDetails?key={urllib.parse.quote(tt_key)}"
                    "&bbox=71.20,51.02,71.70,51.28&language=ru-RU"
                    "&fields=%7Bincidents%7Btype%2Cgeometry%7Btype%2Ccoordinates%7D%2Cproperties%7BiconCategory%2CmagnitudeOfDelay%2Cevents%7Bdescription%7D%2Cfrom%2Cto%2Cdelay%2Clength%7D%7D%7D"
                )
                req = urllib.request.Request(inc_url, headers={"User-Agent": "QALA-Python/1.0"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    raw_json = json.loads(resp.read().decode("utf-8"))
                incidents = []
                for idx, inc in enumerate(raw_json.get("incidents") or []):
                    props = inc.get("properties") or {}
                    geom = inc.get("geometry") or {}
                    gtype = geom.get("type")
                    rcoords = geom.get("coordinates")
                    coords: list[list[float]] = []
                    if gtype == "Point" and isinstance(rcoords, list) and len(rcoords) >= 2:
                        coords = [[float(rcoords[1]), float(rcoords[0])]]
                    elif gtype in ("LineString", "MultiPoint") and isinstance(rcoords, list):
                        coords = [[float(c[1]), float(c[0])] for c in rcoords if isinstance(c, list) and len(c) >= 2]
                    if coords:
                        events = [str(e.get("description") or "") for e in (props.get("events") or []) if e.get("description")]
                        incidents.append({
                            "id": f"tt-inc-{idx}",
                            "description": ", ".join(events) or "Дорожное событие",
                            "from": str(props.get("from") or "Астана"),
                            "to": str(props.get("to") or ""),
                            "delaySec": int(props.get("delay") or 0),
                            "magnitude": int(props.get("magnitudeOfDelay") or 0),
                            "iconCategory": int(props.get("iconCategory") or 0),
                            "coords": coords,
                        })
                    if len(incidents) >= 60:
                        break
                self._send_json(200, {"isLive": True, "incidents": incidents})
            except Exception:
                self._send_json(200, {"isLive": False, "incidents": []})
            return

        if path == "/api/cinema/poster":
            raw_target = qs.get("url", [""])[0]
            safe_url = is_safe_external_url(raw_target)
            if not safe_url:
                self.send_response(400)
                self.end_headers()
                return
            try:
                req = urllib.request.Request(
                    safe_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Referer": "https://kino.kz/",
                    },
                )
                with urllib.request.urlopen(req, timeout=6) as resp:
                    ct = resp.headers.get("Content-Type", "image/jpeg")
                    data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", ct)
                self.send_header("Cache-Control", "public, max-age=3600")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(502)
                self.end_headers()
            return

        if path == "/api/cinema/afisha":
            global AFISHA_CACHE
            req_date = qs.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", req_date):
                req_date = datetime.now().strftime("%Y-%m-%d")
            if (
                AFISHA_CACHE
                and AFISHA_CACHE.get("date") == req_date
                and (time.time() - float(AFISHA_CACHE.get("at", 0))) < 1200
                and AFISHA_CACHE.get("movies")
            ):
                self._send_json(200, {"isLive": True, "date": req_date, "movies": AFISHA_CACHE["movies"]})
                return

            def trpc_url(proc: str, payload: dict[str, Any]) -> str:
                inp = json.dumps({"0": {"json": payload}}, separators=(",", ":"))
                return f"https://kino.kz/api/trpc/{proc}?batch=1&input={urllib.parse.quote(inp, safe='')}"

            kino_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
                "Referer": "https://kino.kz/ru",
                "Cookie": "city=1; city_id=1",
            }
            try:
                req = urllib.request.Request(
                    trpc_url("sessions.findMovies", {"startDate": req_date, "endDate": req_date}),
                    headers=kino_headers,
                )
                with urllib.request.urlopen(req, timeout=7) as resp:
                    batch = json.loads(resp.read().decode("utf-8"))
                raw_movies = (((batch or [{}])[0].get("result") or {}).get("data") or {}).get("json") or []
                movies_out = []
                for m in raw_movies[:14]:
                    mid = int(m.get("id") or 0)
                    sp = str(m.get("small_poster") or m.get("big_poster") or "")
                    poster_url = f"/api/cinema/poster?url={urllib.parse.quote(sp, safe='')}" if sp else ""
                    mins = int(m.get("duration") or 0)
                    dur_str = f"{mins // 60} ч {mins % 60:02d} мин" if mins > 0 else "1 ч 45 мин"
                    genres = [str(g.get("title") or "") for g in (m.get("genres") or []) if g.get("title")]
                    sessions = []
                    try:
                        sreq = urllib.request.Request(
                            trpc_url("sessions.getSessions", {"id": mid, "date": req_date}),
                            headers=kino_headers,
                        )
                        with urllib.request.urlopen(sreq, timeout=5) as sresp:
                            sbatch = json.loads(sresp.read().decode("utf-8"))
                        raw_sess = ((((sbatch or [{}])[0].get("result") or {}).get("data") or {}).get("json") or {}).get("sessions") or []
                        for it in raw_sess[:18]:
                            s = it.get("session") or {}
                            c = it.get("cinema") or {}
                            h = it.get("hall") or {}
                            tm = re.search(r"T(\d{2}:\d{2})", str(s.get("session_date_tz") or ""))
                            fmt = "IMAX" if (s.get("is_imax") or h.get("imax")) else ("4DX" if s.get("is_fdx") else ("3D" if s.get("is_3_d") else "2D"))
                            if s.get("is_atmos"):
                                fmt += " Atmos"
                            hname = (h.get("name_i18n") or {}).get("ru") or h.get("name") or "Зал 1"
                            sessions.append({
                                "id": int(s.get("id") or 0),
                                "time": tm.group(1) if tm else "19:00",
                                "cinema": str(c.get("name") or "Кинотеатр Астаны").strip(),
                                "address": str(c.get("address") or "Астана").strip(),
                                "hall": str(hname).strip(),
                                "format": fmt,
                                "lang": str(s.get("lang_label") or "RU"),
                                "adultPrice": int(s.get("adult") or 2200),
                                "studentPrice": int(s.get("student") or 0),
                                "childPrice": int(s.get("child") or 0),
                                "vipPrice": int(s.get("vip") or 0),
                                "lat": float(c.get("latitude") or 51.1282),
                                "lng": float(c.get("longitude") or 71.4304),
                            })
                    except Exception:
                        pass
                    title = str(m.get("name") or m.get("name_rus") or "Фильм").strip()
                    if title:
                        movies_out.append({
                            "id": f"kino-{mid}",
                            "kinoId": mid,
                            "title": title,
                            "originalTitle": str(m.get("name_origin") or "").strip(),
                            "genres": genres or ["Кино"],
                            "age": int(m.get("age_restriction") or 12),
                            "duration": dur_str,
                            "posterUrl": poster_url,
                            "url": str(m.get("movie_path") or f"https://kino.kz/ru/movie/{mid}"),
                            "presale": bool(m.get("is_pre_sales")),
                            "sessions": sessions,
                        })
                if not movies_out:
                    raise ValueError("No live movies")
                AFISHA_CACHE = {"date": req_date, "at": time.time(), "movies": movies_out}
                self._send_json(200, {"isLive": True, "date": req_date, "movies": movies_out})
            except Exception:
                self._send_json(200, {"isLive": False, "date": req_date, "movies": []})
            return

        if path == "/api/cinema/seats":
            session_key = qs.get("sessionKey", [""])[0].strip()
            if not session_key:
                self._send_json(400, {"error": "sessionKey required"})
                return
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT seat_id FROM cinema_booked_seats WHERE session_key = ?", (session_key,)).fetchall()
                conn.close()
            user_seats = [r["seat_id"] for r in rows]
            merged = list(dict.fromkeys([*get_baseline_booked_seats(session_key), *user_seats]))
            self._send_json(200, {"sessionKey": session_key, "bookedSeats": merged, "userBookedSeats": user_seats})
            return

        if path == "/api/cinema/tickets":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM cinema_tickets ORDER BY datetime(created_at) DESC LIMIT 40").fetchall()
                conn.close()
            self._send_json(200, {
                "tickets": [
                    {
                        "id": r["id"],
                        "sessionKey": r["session_key"],
                        "movieTitle": r["movie_title"],
                        "cinemaName": r["cinema_name"],
                        "hallName": r["hall_name"],
                        "time": r["time_label"],
                        "seats": json.loads(r["seats_json"] or "[]"),
                        "ticketType": r["ticket_type"],
                        "totalPrice": r["total_price"],
                        "code": r["code"],
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/map/bookmarks":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM map_bookmarks ORDER BY datetime(created_at) ASC").fetchall()
                conn.close()
            self._send_json(200, {
                "bookmarks": [
                    {
                        "id": r["id"],
                        "label": r["label"],
                        "kind": r["kind"] if r["kind"] in ("home", "work", "parking", "favorite") else "favorite",
                        "address": r["address"],
                        "lat": r["lat"],
                        "lng": r["lng"],
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/map/routes/history":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM route_history ORDER BY datetime(created_at) DESC LIMIT 12").fetchall()
                conn.close()
            self._send_json(200, {
                "routes": [
                    {
                        "id": r["id"],
                        "fromName": r["from_name"],
                        "toName": r["to_name"],
                        "viaName": r["via_name"] or "",
                        "fromLat": r["from_lat"],
                        "fromLng": r["from_lng"],
                        "toLat": r["to_lat"],
                        "toLng": r["to_lng"],
                        "viaLat": r["via_lat"],
                        "viaLng": r["via_lng"],
                        "distanceKm": r["distance_km"],
                        "durationMin": r["duration_min"],
                        "mode": r["mode"],
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/parking/sessions":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM parking_sessions ORDER BY datetime(started_at) DESC LIMIT 15").fetchall()
                conn.close()
            self._send_json(200, {
                "sessions": [
                    {
                        "id": r["id"],
                        "parkingTitle": r["parking_title"],
                        "zone": r["zone"],
                        "pricePerHour": r["price_per_hour"],
                        "durationMin": r["duration_min"],
                        "totalPrice": r["total_price"],
                        "startedAt": r["started_at"],
                        "endsAt": r["ends_at"],
                        "active": bool(r["active"]),
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/utilities":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM utility_readings ORDER BY datetime(created_at) DESC LIMIT 24").fetchall()
                conn.close()
            self._send_json(200, {
                "readings": [
                    {
                        "id": r["id"],
                        "period": r["period"],
                        "coldWater": r["cold_water"],
                        "hotWater": r["hot_water"],
                        "electricityKwh": r["electricity_kwh"],
                        "heatingArea": r["heating_area"],
                        "totalKzt": r["total_kzt"],
                        "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/wallet/budget":
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT value FROM app_settings WHERE key = 'wallet_budget'").fetchone()
                conn.close()
            budget = max(10000, int(float(row["value"]) if row else 150000))
            self._send_json(200, {"budget": budget})
            return

        if path == "/api/avtobys":
            with DB_LOCK:
                conn = get_db()
                bal_row = conn.execute("SELECT value FROM app_settings WHERE key = 'avtobys_balance'").fetchone()
                card_row = conn.execute("SELECT value FROM app_settings WHERE key = 'avtobys_card'").fetchone()
                trips_row = conn.execute("SELECT value FROM app_settings WHERE key = 'avtobys_trips'").fetchone()
                conn.close()
            try:
                trips = json.loads(trips_row["value"] if trips_row else "[]")
            except Exception:
                trips = []
            self._send_json(200, {
                "balance": int(float(bal_row["value"]) if bal_row else 2200),
                "cardNumber": card_row["value"] if card_row else "9643 1084 5512 0194",
                "trips": trips,
            })
            return

        if path == "/api/geo/current":
            fwd = str(self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            raw_ip = fwd or (self.client_address[0] if self.client_address else "")
            clean_ip = raw_ip.replace("::ffff:", "")
            is_private = (
                not clean_ip
                or clean_ip in ("127.0.0.1", "::1")
                or clean_ip.startswith(("10.", "192.168.", "172."))
            )
            if not is_private:
                try:
                    req = urllib.request.Request(
                        f"https://ipwho.is/{urllib.parse.quote(clean_ip, safe='')}",
                        headers={"User-Agent": "QALA-Python/1.0"},
                    )
                    with urllib.request.urlopen(req, timeout=3.5) as resp:
                        d = json.loads(resp.read().decode("utf-8"))
                    if d.get("success") and isinstance(d.get("latitude"), (int, float)) and isinstance(d.get("longitude"), (int, float)):
                        self._send_json(200, {
                            "lat": float(d["latitude"]),
                            "lng": float(d["longitude"]),
                            "city": d.get("city") or "Астана",
                            "country": d.get("country") or "Казахстан",
                            "source": "ip",
                        })
                        return
                except Exception:
                    pass
            self._send_json(200, {
                "lat": ASTANA_CENTER[0],
                "lng": ASTANA_CENTER[1],
                "city": "Астана",
                "country": "Казахстан",
                "source": "default",
            })
            return

        if path == "/api/geo/reverse":
            try:
                lat = float(qs.get("lat", [""])[0])
                lng = float(qs.get("lng", [""])[0])
            except Exception:
                self._send_json(400, {"error": "Некорректные координаты"})
                return
            nearest_lm = ""
            min_km = float("inf")
            for name, plat, plng in ASTANA_PLACES_MIN:
                d = haversine_km((lat, lng), (plat, plng))
                if d < min_km:
                    min_km = d
                    nearest_lm = name
            layers = load_astana_layers()
            local_addr = ""
            local_dist = float("inf")
            for st in layers.get("busStops") or []:
                if st.get("name"):
                    d = haversine_km((lat, lng), (float(st["lat"]), float(st["lng"])))
                    if d < local_dist:
                        local_dist = d
                        local_addr = f"р-н ост. «{st['name']}»"
            for pk in layers.get("parkings") or []:
                if pk.get("addr"):
                    d = haversine_km((lat, lng), (float(pk["lat"]), float(pk["lng"])))
                    if d < local_dist:
                        local_dist = d
                        local_addr = str(pk["addr"])
            for ex in layers.get("placesExtra") or []:
                lbl = ex.get("address") or ex.get("name")
                if lbl:
                    d = haversine_km((lat, lng), (float(ex["lat"]), float(ex["lng"])))
                    if d < local_dist:
                        local_dist = d
                        local_addr = str(lbl)
            try:
                nom_url = f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lng}&accept-language=ru"
                req = urllib.request.Request(nom_url, headers={"User-Agent": "QALA-Astana-App/1.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    nom = json.loads(resp.read().decode("utf-8"))
                a = nom.get("address") or {}
                road = ", ".join(x for x in (a.get("road"), a.get("house_number")) if x)
                district = a.get("city_district") or a.get("suburb") or a.get("city") or a.get("town") or "Астана"
                resolved = road or local_addr or ", ".join(str(nom.get("display_name") or "").split(",")[:2]).strip()
                if resolved:
                    self._send_json(200, {
                        "address": resolved,
                        "district": district,
                        "nearestLandmark": nearest_lm if min_km < 2.5 else "",
                    })
                    return
            except Exception:
                pass
            district = "Есиль / Нура" if lat < 51.135 else ("Алматы район" if lng > 71.46 else "Сарыарка / Байконур")
            addr_out = (
                local_addr
                if (local_dist < 0.7 and local_addr)
                else (f"рядом с «{nearest_lm}»" if (min_km < 1.2 and nearest_lm) else f"Астана ({lat:.4f}, {lng:.4f})")
            )
            self._send_json(200, {
                "address": addr_out,
                "district": district,
                "nearestLandmark": nearest_lm if min_km < 3 else "",
            })
            return

        if path == "/api/geo/search":
            q_raw = str(qs.get("q", [""])[0]).strip()
            if len(q_raw) < 2:
                self._send_json(200, {"results": []})
                return
            q = q_raw.lower()
            results: list[dict[str, Any]] = []
            seen: set[str] = set()

            def push_res(item: dict[str, Any]) -> None:
                key = f"{item['name'].lower()}|{item['lat']:.4f}|{item['lng']:.4f}"
                if key not in seen:
                    seen.add(key)
                    results.append(item)

            for name, plat, plng in ASTANA_PLACES_MIN:
                if q in name.lower():
                    push_res({"id": f"pl-{name}", "name": name, "address": "Астана", "category": "place", "lat": plat, "lng": plng, "source": "local"})
            for ex in PY_EXTRA_POIS_SEED:
                if q in ex["name"].lower() or q in ex["address"].lower():
                    push_res({**ex, "source": "local"})
            layers = load_astana_layers()
            for bs in layers.get("busStops") or []:
                if len(results) >= 10:
                    break
                bn = str(bs.get("name") or "")
                if q in bn.lower():
                    push_res({"id": str(bs.get("id") or bn), "name": f"Остановка «{bn}»", "address": f"Маршруты: {bs.get('routes') or '—'}", "category": "bus", "lat": float(bs["lat"]), "lng": float(bs["lng"]), "source": "local"})
            for qk in search_qalakarta(q_raw, 8):
                if len(results) >= 10:
                    break
                push_res({**qk, "source": "local"})
            if len(results) < 6:
                try:
                    nom_url = f"https://nominatim.openstreetmap.org/search?format=jsonv2&q={urllib.parse.quote(q_raw + ', Астана, Казахстан')}&viewbox=71.15,51.32,71.75,50.95&bounded=1&limit=6&accept-language=ru"
                    req = urllib.request.Request(nom_url, headers={"User-Agent": "QALA-Astana-App/1.0"})
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        arr = json.loads(resp.read().decode("utf-8"))
                    for it in arr:
                        parts = [s.strip() for s in str(it.get("display_name") or "").split(",") if s.strip()]
                        push_res({
                            "id": f"nom-{it.get('place_id')}",
                            "name": it.get("name") or (parts[0] if parts else q_raw),
                            "address": ", ".join(parts[:3]),
                            "category": it.get("type") or "address",
                            "lat": float(it["lat"]),
                            "lng": float(it["lon"]),
                            "source": "nominatim",
                        })
                except Exception:
                    pass
            self._send_json(200, {"results": results[:10]})
            return

        if path == "/api/air-quality":
            def classify_aq(val: int) -> tuple[str, str]:
                if val <= 25:
                    return "Отличный", "Воздух чистый — отлично подходит для пробежек у Ишима и прогулок."
                if val <= 50:
                    return "Хороший", "Комфортные условия для пеших маршрутов и спорта на улице."
                if val <= 85:
                    return "Умеренный", "Чувствительным людям лучше сократить интенсивные тренировки у магистралей."
                if val <= 130:
                    return "Повышенный", "Проветривайте помещения кратковременно, выберите парк или крытый спорткомплекс."
                return "Высокий", "Рекомендуется маска при длительном нахождении на улице."

            try:
                req = urllib.request.Request(
                    "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=51.1694&longitude=71.4491&current=pm2_5,pm10,nitrogen_dioxide,european_aqi",
                    headers={"User-Agent": "QALA-Python/1.0"},
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    cur = json.loads(resp.read().decode("utf-8")).get("current") or {}
                aqi = max(5, round(cur.get("european_aqi") or 28))
                lvl, adv = classify_aq(aqi)
                self._send_json(200, {
                    "aqi": aqi,
                    "level": lvl,
                    "pm25": round(float(cur.get("pm2_5") or 9.4), 1),
                    "pm10": round(float(cur.get("pm10") or 18.2), 1),
                    "no2": round(float(cur.get("nitrogen_dioxide") or 14.5), 1),
                    "advice": adv,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "isLive": True,
                })
            except Exception:
                lvl, adv = classify_aq(29)
                self._send_json(200, {
                    "aqi": 29,
                    "level": lvl,
                    "pm25": 9.8,
                    "pm10": 19.4,
                    "no2": 15.2,
                    "advice": adv,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "isLive": False,
                })
            return

        if path == "/api/prayer-times":
            now = datetime.now()
            date_lbl = now.strftime("%d.%m.%Y")
            ast_hm = (datetime.now(timezone.utc) + timedelta(hours=5)).strftime("%H:%M")

            def next_p(tm: dict[str, str]) -> str:
                for lbl, key in [("Фаджр", "fajr"), ("Восход", "sunrise"), ("Зухр", "dhuhr"), ("Аср", "asr"), ("Магриб", "maghrib"), ("Иша", "isha")]:
                    if tm[key] > ast_hm:
                        return f"{lbl} · {tm[key]}"
                return f"Фаджр · {tm['fajr']}"

            try:
                req = urllib.request.Request(
                    f"https://api.aladhan.com/v1/timings/{now.strftime('%d-%m-%Y')}?latitude=51.1694&longitude=71.4491&method=3",
                    headers={"User-Agent": "QALA-Python/1.0"},
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    tm = (json.loads(resp.read().decode("utf-8")).get("data") or {}).get("timings") or {}
                out = {
                    "fajr": str(tm.get("Fajr") or "05:00")[:5],
                    "sunrise": str(tm.get("Sunrise") or "06:30")[:5],
                    "dhuhr": str(tm.get("Dhuhr") or "12:15")[:5],
                    "asr": str(tm.get("Asr") or "15:30")[:5],
                    "maghrib": str(tm.get("Maghrib") or "18:10")[:5],
                    "isha": str(tm.get("Isha") or "19:40")[:5],
                }
                self._send_json(200, {"date": date_lbl, "city": "Астана", **out, "nextPrayer": next_p(out), "isLive": True})
            except Exception:
                out = {"fajr": "04:46", "sunrise": "06:24", "dhuhr": "12:16", "asr": "15:36", "maghrib": "18:08", "isha": "19:38"}
                self._send_json(200, {"date": date_lbl, "city": "Астана", **out, "nextPrayer": next_p(out), "isLive": False})
            return

        if path == "/api/ikomek":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM ikomek_reports ORDER BY datetime(created_at) DESC LIMIT 40").fetchall()
                conn.close()
            self._send_json(200, {
                "reports": [
                    {"id": r["id"], "category": r["category"], "title": r["title"], "address": r["address"], "lat": r["lat"], "lng": r["lng"], "status": r["status"], "createdAt": r["created_at"]}
                    for r in rows
                ]
            })
            return

        if path == "/api/garage":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM garage_vehicles ORDER BY datetime(created_at) DESC").fetchall()
                conn.close()
            self._send_json(200, {
                "vehicles": [
                    {
                        "id": r["id"], "plate": r["plate"], "model": r["model"], "year": r["year"],
                        "mileageKm": r["mileage_km"], "techInspectionDate": r["tech_inspection_date"],
                        "insuranceDate": r["insurance_date"], "tireSeason": r["tire_season"],
                        "nextOilChangeKm": r["next_oil_change_km"], "createdAt": r["created_at"],
                    }
                    for r in rows
                ]
            })
            return

        if path == "/api/map/notes":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM map_notes ORDER BY datetime(created_at) DESC").fetchall()
                conn.close()
            self._send_json(200, {
                "notes": [
                    {"id": r["id"], "title": r["title"], "note": r["note"], "kind": r["kind"], "rating": r["rating"], "address": r["address"], "lat": r["lat"], "lng": r["lng"], "createdAt": r["created_at"]}
                    for r in rows
                ]
            })
            return

        if path == "/api/backup/export":
            with DB_LOCK:
                conn = get_db()
                prof = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
                data = {
                    "exportedAt": datetime.now(timezone.utc).isoformat(),
                    "app": "QALA Astana",
                    "profile": dict(prof) if prof else None,
                    "plans": [dict(r) for r in conn.execute("SELECT * FROM plans").fetchall()],
                    "reminders": [dict(r) for r in conn.execute("SELECT * FROM reminders").fetchall()],
                    "wallet_transactions": [dict(r) for r in conn.execute("SELECT * FROM wallet_transactions").fetchall()],
                    "map_bookmarks": [dict(r) for r in conn.execute("SELECT * FROM map_bookmarks").fetchall()],
                    "map_notes": [dict(r) for r in conn.execute("SELECT * FROM map_notes").fetchall()],
                    "garage_vehicles": [dict(r) for r in conn.execute("SELECT * FROM garage_vehicles").fetchall()],
                    "ikomek_reports": [dict(r) for r in conn.execute("SELECT * FROM ikomek_reports").fetchall()],
                    "utility_readings": [dict(r) for r in conn.execute("SELECT * FROM utility_readings").fetchall()],
                }
                conn.close()
            self._send_json(200, data)
            return

        if path == "/api/qalakarta/stats":
            store = get_qalakarta_store()
            self._send_json(200, store["stats"])
            return

        if path == "/api/qalakarta/viewport":
            try:
                min_lat = float(qs.get("minLat", [str(ASTANA_CENTER[0] - 0.03)])[0])
                max_lat = float(qs.get("maxLat", [str(ASTANA_CENTER[0] + 0.03)])[0])
                min_lng = float(qs.get("minLng", [str(ASTANA_CENTER[1] - 0.05)])[0])
                max_lng = float(qs.get("maxLng", [str(ASTANA_CENTER[1] + 0.05)])[0])
                zoom = float(qs.get("zoom", ["13"])[0])
            except ValueError:
                self._send_json(400, {"error": "Некорректные границы области"})
                return
            inc_b = qs.get("buildings", ["1"])[0] != "0"
            inc_s = qs.get("signs", ["1"])[0] != "0"
            inc_p = qs.get("places", ["1"])[0] != "0"
            self._send_json(
                200,
                query_qalakarta_viewport(min_lat, max_lat, min_lng, max_lng, zoom, inc_b, inc_s, inc_p),
            )
            return

        # Serve Vite static build (dist/) with SPA fallback
        self._serve_static(path)

    def do_POST(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        body = self._read_json()

        if path == "/api/tv/channels":
            name = str(body.get("name", "")).strip()
            stream_url = str(body.get("streamUrl", "")).strip()
            if not name or not re.match(r"^https?://", stream_url, re.I):
                self._send_json(400, {"error": "Укажите название канала и URL http(s)://"})
                return
            ch_id = f"tv-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            q = body.get("qualityStreams") or {}
            with DB_LOCK:
                conn = get_db()
                max_o = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM tv_channels").fetchone()[0] or 0
                conn.execute(
                    """
                    INSERT INTO tv_channels (
                      id, name, category, current_show, next_show, accent_color,
                      stream_url, logo_url, quality_auto, quality_720, quality_1080,
                      is_regional, source_m3u, is_active, sort_order, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-manual', 1, ?, ?)
                    """,
                    (
                        ch_id,
                        name,
                        str(body.get("category") or "ТВ").strip(),
                        str(body.get("currentShow") or "Прямой эфир").strip(),
                        str(body.get("nextShow") or "Программа передач").strip(),
                        str(body.get("accentColor") or ACCENT_PALETTE[max_o % len(ACCENT_PALETTE)]),
                        stream_url,
                        str(body.get("logoUrl") or "").strip(),
                        str(q.get("auto") or "").strip(),
                        str(q.get("720p") or "").strip(),
                        str(q.get("1080p") or "").strip(),
                        1 if body.get("isRegional") else 0,
                        max_o + 1,
                        now_iso,
                    ),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM tv_channels WHERE id = ?", (ch_id,)).fetchone()
                conn.close()
            self._send_json(201, {"channel": map_tv_row(row)})
            return

        if path == "/api/tv/m3u/import":
            url = str(body.get("url") or "").strip()
            raw_content = str(body.get("rawContent") or "").strip()
            name = str(body.get("name") or "").strip() or (url and "M3U плейлист" or "Локальный M3U")
            if not url and not raw_content:
                self._send_json(400, {"error": "Укажите ссылку M3U или текст #EXTM3U"})
                return
            text_to_parse = raw_content
            if not text_to_parse:
                safe = is_safe_external_url(url)
                if not safe:
                    self._send_json(400, {"error": "Некорректная ссылка M3U"})
                    return
                try:
                    req = urllib.request.Request(safe, headers={"User-Agent": "QALA-Python/1.0"})
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        text_to_parse = resp.read().decode("utf-8", errors="replace")
                except Exception as exc:
                    self._send_json(502, {"error": f"Ошибка загрузки M3U: {exc}"})
                    return
            parsed = parse_m3u_content(text_to_parse, name)
            if not parsed:
                self._send_json(400, {"error": "Потоки http/https не найдены в M3U"})
                return
            src_id = save_m3u_channels(f"m3u-{int(time.time() * 1000)}", name, url, parsed)
            self._send_json(200, {"ok": True, "sourceId": src_id, "importedCount": len(parsed)})
            return

        if path == "/api/tv/m3u/import-kz-free":
            kz_url = "https://iptv-org.github.io/iptv/countries/kz.m3u"
            try:
                req = urllib.request.Request(kz_url, headers={"User-Agent": "QALA-Python/1.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    text = resp.read().decode("utf-8", errors="replace")
                parsed = parse_m3u_content(text, "Казахстан Free IPTV")
                if not parsed:
                    raise ValueError("Empty KZ playlist")
                src_id = save_m3u_channels("m3u-kz-free", "Казахстан Free IPTV (iptv-org)", kz_url, parsed)
                self._send_json(200, {"ok": True, "sourceId": src_id, "importedCount": len(parsed), "isLive": True})
            except Exception:
                src_id = save_m3u_channels("m3u-kz-free", "Казахстан Free IPTV (база)", kz_url, SEED_KZ_CHANNELS)
                self._send_json(200, {"ok": True, "sourceId": src_id, "importedCount": len(SEED_KZ_CHANNELS), "isLive": False})
            return

        if path == "/api/route":
            points = body.get("points") or []
            if len(points) < 2:
                self._send_json(400, {"error": "Нужно минимум 2 точки"})
                return
            km = sum(haversine_km(tuple(points[i]), tuple(points[i + 1])) for i in range(len(points) - 1))
            self._send_json(200, {"distanceKm": round(km * 1.25, 1), "durationMin": max(3, round(km * 2.5)), "coordinates": points, "isLiveOsrm": False})
            return

        if path == "/api/delivery/optimize":
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT * FROM delivery_stops ORDER BY sort_order ASC").fetchall()
                conn.close()
            stops = [dict(r) for r in rows]
            if len(stops) <= 2:
                self._send_json(200, {"stops": stops})
                return
            remaining = stops[1:]
            ordered = [stops[0]]
            while remaining:
                cur = ordered[-1]
                best_idx = min(
                    range(len(remaining)),
                    key=lambda idx: haversine_km((cur["lat"], cur["lng"]), (remaining[idx]["lat"], remaining[idx]["lng"])),
                )
                ordered.append(remaining.pop(best_idx))
            with DB_LOCK:
                conn = get_db()
                for idx, st in enumerate(ordered):
                    conn.execute("UPDATE delivery_stops SET sort_order = ? WHERE id = ?", (idx + 1, st["id"]))
                conn.commit()
                conn.close()
            self._send_json(200, {"stops": ordered})
            return

        if path == "/api/food/orders":
            items = body.get("items") or []
            total = int(body.get("total") or 0)
            if not items or total <= 0:
                self._send_json(400, {"error": "Корзина пуста"})
                return
            now_iso = datetime.now(timezone.utc).isoformat()
            oid = f"food-{int(time.time() * 1000)}"
            rest = str(body.get("restaurant") or "Qala Food · Астана").strip()
            addr = str(body.get("address") or "Нұржол желек жолы, 14").strip()
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO food_orders (id, restaurant, items_json, total, address, status, created_at) VALUES (?, ?, ?, ?, ?, 'Курьер в пути (25 мин)', ?)",
                    (oid, rest, json.dumps(items, ensure_ascii=False), total, addr, now_iso),
                )
                conn.execute(
                    "INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Еда', ?, ?)",
                    (f"tx-food-{int(time.time() * 1000)}", f"Qala Food: {rest}", total, now_iso),
                )
                conn.execute(
                    "INSERT INTO plans (id, title, date_label, completed, created_at) VALUES (?, ?, 'Доставка ~25 мин', 0, ?)",
                    (f"plan-food-{int(time.time() * 1000)}", f"Заказ еды из {rest} ({addr})", now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": oid, "ok": True})
            return

        if path == "/api/reminders":
            title = str(body.get("title") or "").strip()
            if not title:
                self._send_json(400, {"error": "Введите текст напоминания"})
                return
            rid = f"rem-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                    (rid, title, str(body.get("remindAt") or "Сегодня").strip(), str(body.get("category") or "Город").strip(), now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": rid})
            return

        if path == "/api/tv/favorites":
            ch_id = str(body.get("channelId") or "").strip()
            if not ch_id:
                self._send_json(400, {"error": "channelId required"})
                return
            with DB_LOCK:
                conn = get_db()
                conn.execute("INSERT OR REPLACE INTO tv_favorites (channel_id, added_at) VALUES (?, ?)", (ch_id, datetime.now(timezone.utc).isoformat()))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path == "/api/tv/history":
            ch_id = str(body.get("channelId") or "").strip()
            if not ch_id:
                self._send_json(400, {"error": "channelId required"})
                return
            with DB_LOCK:
                conn = get_db()
                conn.execute("INSERT OR REPLACE INTO tv_history (channel_id, watched_at) VALUES (?, ?)", (ch_id, datetime.now(timezone.utc).isoformat()))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path == "/api/admin/pin/verify":
            pin = str(body.get("pin") or "").strip()
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT value FROM app_settings WHERE key = 'admin_pin'").fetchone()
                conn.close()
            saved = row["value"] if row else "1234"
            if pin == saved:
                self._send_json(200, {"ok": True})
            else:
                self._send_json(401, {"ok": False, "error": "Неверный PIN-код"})
            return

        if path == "/api/map/bookmarks":
            label = str(body.get("label") or "").strip()
            address = str(body.get("address") or "Астана").strip()
            kind = str(body.get("kind") or "favorite")
            if kind not in ("home", "work", "parking", "favorite"):
                kind = "favorite"
            try:
                lat = float(body.get("lat"))
                lng = float(body.get("lng"))
            except Exception:
                self._send_json(400, {"error": "Укажите название и корректные координаты"})
                return
            if not label:
                self._send_json(400, {"error": "Укажите название и корректные координаты"})
                return
            bid = f"bm-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO map_bookmarks (id, label, kind, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (bid, label, kind, address, lat, lng, now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {
                "bookmark": {
                    "id": bid,
                    "label": label,
                    "kind": kind,
                    "address": address,
                    "lat": lat,
                    "lng": lng,
                    "createdAt": now_iso,
                }
            })
            return

        if path == "/api/cinema/seats/book":
            session_key = str(body.get("sessionKey") or "").strip()
            ticket_type = str(body.get("ticketType") or "Взрослый").strip() or "Взрослый"
            raw_seats = body.get("seats") if isinstance(body.get("seats"), list) else []
            valid_seats = list(dict.fromkeys(
                s for s in (str(x).strip().upper() for x in raw_seats) if re.match(r"^[A-G](10|[1-9])$", s)
            ))
            if not session_key or not valid_seats:
                self._send_json(400, {"error": "Выберите хотя бы одно место для бронирования"})
                return
            with DB_LOCK:
                conn = get_db()
                rows = conn.execute("SELECT seat_id FROM cinema_booked_seats WHERE session_key = ?", (session_key,)).fetchall()
                existing_set = set(get_baseline_booked_seats(session_key)) | {r["seat_id"] for r in rows}
                conflict = [s for s in valid_seats if s in existing_set]
                if conflict:
                    conn.close()
                    self._send_json(409, {"error": f"Места {', '.join(conflict)} уже заняты", "conflict": conflict})
                    return
                now_iso = datetime.now(timezone.utc).isoformat()
                for s in valid_seats:
                    conn.execute(
                        "INSERT INTO cinema_booked_seats (session_key, seat_id, ticket_type, booked_at) VALUES (?, ?, ?, ?)",
                        (session_key, s, ticket_type, now_iso),
                    )
                conn.commit()
                conn.close()
            self._send_json(201, {"ok": True, "bookedSeats": list(existing_set | set(valid_seats)), "reserved": valid_seats})
            return

        if path == "/api/cinema/tickets":
            movie_title = str(body.get("movieTitle") or "").strip()
            seats = body.get("seats") if isinstance(body.get("seats"), list) else []
            if not movie_title or not seats:
                self._send_json(400, {"error": "Укажите фильм и выбранные места"})
                return
            tid = f"tkt-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            code = str(body.get("code") or f"QINO-{tid[-4:]}").strip()
            skey = str(body.get("sessionKey") or tid)
            cname = str(body.get("cinemaName") or "Кинотеатр Астаны").strip()
            hname = str(body.get("hallName") or "Зал 1").strip()
            tlabel = str(body.get("time") or "19:00").strip()
            ttype = str(body.get("ticketType") or "Взрослый").strip()
            tprice = int(body.get("totalPrice") or 0)
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO cinema_tickets (
                      id, session_key, movie_title, cinema_name, hall_name, time_label,
                      seats_json, ticket_type, total_price, code, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (tid, skey, movie_title, cname, hname, tlabel, json.dumps(seats, ensure_ascii=False), ttype, tprice, code, now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {
                "ticket": {
                    "id": tid,
                    "sessionKey": skey,
                    "movieTitle": movie_title,
                    "cinemaName": cname,
                    "hallName": hname,
                    "time": tlabel,
                    "seats": seats,
                    "ticketType": ttype,
                    "totalPrice": tprice,
                    "code": code,
                    "createdAt": now_iso,
                }
            })
            return

        if path == "/api/map/routes/history":
            fname = str(body.get("fromName") or "").strip()
            tname = str(body.get("toName") or "").strip()
            if not fname or not tname:
                self._send_json(400, {"error": "Некорректные данные маршрута"})
                return
            rid = f"rh-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO route_history (
                      id, from_name, to_name, via_name, from_lat, from_lng, to_lat, to_lng,
                      via_lat, via_lng, distance_km, duration_min, mode, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rid,
                        fname,
                        tname,
                        str(body.get("viaName") or "").strip(),
                        float(body.get("fromLat") or ASTANA_CENTER[0]),
                        float(body.get("fromLng") or ASTANA_CENTER[1]),
                        float(body.get("toLat") or ASTANA_CENTER[0]),
                        float(body.get("toLng") or ASTANA_CENTER[1]),
                        float(body["viaLat"]) if body.get("viaLat") is not None else None,
                        float(body["viaLng"]) if body.get("viaLng") is not None else None,
                        float(body.get("distanceKm") or 0),
                        int(body.get("durationMin") or 0),
                        str(body.get("mode") or "taxi"),
                        now_iso,
                    ),
                )
                conn.execute("DELETE FROM route_history WHERE id NOT IN (SELECT id FROM route_history ORDER BY datetime(created_at) DESC LIMIT 12)")
                conn.commit()
                conn.close()
            self._send_json(201, {"id": rid})
            return

        if path == "/api/parking/sessions":
            title = str(body.get("parkingTitle") or "Парковка ЦОДД Астана").strip()
            zone = str(body.get("zone") or "Центр").strip()
            price_hr = max(0, int(body.get("pricePerHour") if body.get("pricePerHour") is not None else 100))
            dur_min = max(15, int(body.get("durationMin") if body.get("durationMin") is not None else 60))
            total_price = round((price_hr * dur_min) / 60)
            now_dt = datetime.now(timezone.utc)
            ends_dt = now_dt + timedelta(minutes=dur_min)
            pid = f"park-{int(time.time() * 1000)}"
            with DB_LOCK:
                conn = get_db()
                conn.execute("UPDATE parking_sessions SET active = 0 WHERE active = 1")
                conn.execute(
                    """
                    INSERT INTO parking_sessions (id, parking_title, zone, price_per_hour, duration_min, total_price, started_at, ends_at, active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (pid, title, zone, price_hr, dur_min, total_price, now_dt.isoformat(), ends_dt.isoformat()),
                )
                if total_price > 0:
                    conn.execute(
                        "INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Транспорт', ?, ?)",
                        (f"tx-park-{int(time.time() * 1000)}", f"Парковка ЦОДД ({title}, {dur_min} мин)", total_price, now_dt.isoformat()),
                    )
                conn.commit()
                conn.close()
            self._send_json(201, {
                "session": {
                    "id": pid,
                    "parkingTitle": title,
                    "zone": zone,
                    "pricePerHour": price_hr,
                    "durationMin": dur_min,
                    "totalPrice": total_price,
                    "startedAt": now_dt.isoformat(),
                    "endsAt": ends_dt.isoformat(),
                    "active": True,
                }
            })
            return

        if path == "/api/utilities":
            uid = f"util-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            period = str(body.get("period") or "Текущий месяц").strip()
            total_kzt = max(0, round(float(body.get("totalKzt") or 0)))
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO utility_readings (id, period, cold_water, hot_water, electricity_kwh, heating_area, total_kzt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        uid,
                        period,
                        float(body.get("coldWater") or 0),
                        float(body.get("hotWater") or 0),
                        float(body.get("electricityKwh") or 0),
                        float(body.get("heatingArea") or 0),
                        total_kzt,
                        now_iso,
                    ),
                )
                if body.get("logToWallet") and total_kzt > 0:
                    conn.execute(
                        "INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Другое', ?, ?)",
                        (f"tx-util-{int(time.time() * 1000)}", f"ЖКХ Астана ({period})", total_kzt, now_iso),
                    )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": uid})
            return

        if path == "/api/avtobys":
            action = body.get("action")
            now_iso = datetime.now(timezone.utc).isoformat()
            with DB_LOCK:
                conn = get_db()
                bal_row = conn.execute("SELECT value FROM app_settings WHERE key = 'avtobys_balance'").fetchone()
                card_row = conn.execute("SELECT value FROM app_settings WHERE key = 'avtobys_card'").fetchone()
                trips_row = conn.execute("SELECT value FROM app_settings WHERE key = 'avtobys_trips'").fetchone()
                balance = int(float(bal_row["value"]) if bal_row else 2200)
                try:
                    trips = json.loads(trips_row["value"] if trips_row else "[]")
                except Exception:
                    trips = []
                if action == "topup":
                    balance += max(100, round(float(body.get("amount") or 1000)))
                else:
                    fare = max(55, round(float(body.get("amount") or 110)))
                    if balance < fare:
                        conn.close()
                        self._send_json(400, {"error": "Недостаточно средств на карте Avtobys"})
                        return
                    balance -= fare
                    bus_num = str(body.get("busNumber") or "10").strip()
                    route_title = str(body.get("routeTitle") or f"Автобус №{bus_num}").strip()
                    trips = [{"id": f"avt-{int(time.time() * 1000)}", "busNumber": bus_num, "routeTitle": route_title, "fare": fare, "createdAt": now_iso}, *trips][:15]
                    conn.execute(
                        "INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Транспорт', ?, ?)",
                        (f"tx-avt-{int(time.time() * 1000)}", f"Avtobys: автобус №{bus_num}", fare, now_iso),
                    )
                conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('avtobys_balance', ?)", (str(balance),))
                conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('avtobys_trips', ?)", (json.dumps(trips, ensure_ascii=False),))
                conn.commit()
                conn.close()
            self._send_json(200, {
                "balance": balance,
                "cardNumber": card_row["value"] if card_row else "9643 1084 5512 0194",
                "trips": trips,
            })
            return

        if path == "/api/wallet":
            title = str(body.get("title") or "").strip()
            amount = int(body.get("amount") or 0)
            if not title or not amount:
                self._send_json(400, {"error": "Укажите назначение и сумму"})
                return
            tid = f"tx-{int(time.time() * 1000)}"
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, ?, ?, ?)",
                    (tid, title, str(body.get("category") or "Другое"), amount, datetime.now(timezone.utc).isoformat()),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": tid})
            return

        if path == "/api/plans":
            title = str(body.get("title") or "").strip()
            if not title:
                self._send_json(400, {"error": "Укажите текст напоминания"})
                return
            pid = f"plan-{int(time.time() * 1000)}"
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO plans (id, title, date_label, completed, created_at) VALUES (?, ?, ?, 0, ?)",
                    (pid, title, str(body.get("dateLabel") or "Сегодня"), datetime.now(timezone.utc).isoformat()),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": pid})
            return

        if path == "/api/apartments":
            addr = str(body.get("address") or "").strip()
            price = int(body.get("price") or 0)
            if not addr or not price:
                self._send_json(400, {"error": "Укажите адрес и цену"})
                return
            aid = f"apt-custom-{int(time.time() * 1000)}"
            rooms = int(body.get("rooms") or 1)
            area = float(body.get("area") or 38)
            floor = str(body.get("floor") or "5/12 эт.")
            title = str(body.get("title") or f"{rooms}-комн. квартира, {area:g} м², {floor}")
            today = datetime.now().strftime("%d.%m.%Y")
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO apartments (
                      id, title, rent_type, rooms, area, floor, price, address, district,
                      source, lat, lng, added_at, is_favorite, is_hidden, is_custom, description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Qala', ?, ?, ?, 0, 0, 1, ?)
                    """,
                    (
                        aid,
                        title,
                        str(body.get("rentType") or "Аренда"),
                        rooms,
                        area,
                        floor,
                        price,
                        addr,
                        str(body.get("district") or "Есиль"),
                        float(body.get("lat") or ASTANA_CENTER[0]),
                        float(body.get("lng") or ASTANA_CENTER[1]),
                        today,
                        str(body.get("description") or "Добавлено пользователем Qala Үй"),
                    ),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": aid})
            return

        if path == "/api/market":
            title = str(body.get("title") or "").strip()
            if not title:
                self._send_json(400, {"error": "Укажите название объявления"})
                return
            mid = f"mkt-{int(time.time() * 1000)}"
            price = int(body.get("price") or 0)
            is_free = 1 if (body.get("isFree") or price == 0) else 0
            today = datetime.now().strftime("%d.%m.%Y")
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO market_items (
                      id, title, price, is_free, category, address, distance_meters,
                      seller_name, phone, description, created_at, is_mine, status
                    ) VALUES (?, ?, ?, ?, ?, ?, 250, ?, ?, ?, ?, 1, 'active')
                    """,
                    (
                        mid,
                        title,
                        0 if is_free else price,
                        is_free,
                        str(body.get("category") or "Другое"),
                        str(body.get("address") or "Нұржол желек жолы, 14"),
                        str(body.get("sellerName") or "Амир"),
                        str(body.get("phone") or "+7 (701) 555-01-42"),
                        str(body.get("description") or "Самовывоз в центре Астаны."),
                        today,
                    ),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": mid})
            return

        if path == "/api/delivery/stops":
            name = str(body.get("name") or "").strip()
            if not name:
                self._send_json(400, {"error": "Укажите адрес точки"})
                return
            sid = f"stop-{int(time.time() * 1000)}"
            with DB_LOCK:
                conn = get_db()
                max_o = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM delivery_stops").fetchone()[0] or 0
                conn.execute(
                    "INSERT INTO delivery_stops (id, name, address, lat, lng, done, sort_order) VALUES (?, ?, ?, ?, ?, 0, ?)",
                    (
                        sid,
                        name,
                        str(body.get("address") or name),
                        float(body.get("lat") or ASTANA_CENTER[0]),
                        float(body.get("lng") or ASTANA_CENTER[1]),
                        max_o + 1,
                    ),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": sid})
            return

        if path == "/api/ikomek":
            title = str(body.get("title") or "").strip()
            if not title:
                self._send_json(400, {"error": "Опишите городскую проблему для заявки в iKomek 109"})
                return
            iid = f"ik-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            cat = str(body.get("category") or "Дороги").strip()
            addr = str(body.get("address") or "Астана, Есильский район").strip()
            lat = float(body.get("lat") if body.get("lat") is not None else ASTANA_CENTER[0])
            lng = float(body.get("lng") if body.get("lng") is not None else ASTANA_CENTER[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO ikomek_reports (id, category, title, address, lat, lng, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Принято', ?)",
                    (iid, cat, title, addr, lat, lng, now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"report": {"id": iid, "category": cat, "title": title, "address": addr, "lat": lat, "lng": lng, "status": "Принято", "createdAt": now_iso}})
            return

        if path == "/api/garage":
            plate = str(body.get("plate") or "").strip().upper()
            model = str(body.get("model") or "").strip()
            if not plate or not model:
                self._send_json(400, {"error": "Укажите госномер и модель автомобиля"})
                return
            cid = f"car-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            mileage = max(0, int(body.get("mileageKm") or 0))
            next_oil = max(mileage, int(body.get("nextOilChangeKm") or (mileage + 8000)))
            with DB_LOCK:
                conn = get_db()
                conn.execute(
                    "INSERT INTO garage_vehicles (id, plate, model, year, mileage_km, tech_inspection_date, insurance_date, tire_season, next_oil_change_km, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (cid, plate, model, int(body.get("year") or 2022), mileage, str(body.get("techInspectionDate") or "2027-04-15"), str(body.get("insuranceDate") or "2027-02-20"), str(body.get("tireSeason") or "Зима (шипы)"), next_oil, now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"id": cid})
            return

        if path == "/api/map/notes":
            title = str(body.get("title") or "").strip()
            try:
                lat = float(body.get("lat"))
                lng = float(body.get("lng"))
            except Exception:
                self._send_json(400, {"error": "Укажите название и координаты точки"})
                return
            if not title:
                self._send_json(400, {"error": "Укажите название и координаты точки"})
                return
            kind = str(body.get("kind") or "note")
            if kind not in ("note", "parked_car", "family_zone"):
                kind = "note"
            nid = f"mn-{int(time.time() * 1000)}"
            now_iso = datetime.now(timezone.utc).isoformat()
            rating = min(5, max(1, round(float(body.get("rating") or 5))))
            addr = str(body.get("address") or "Астана").strip()
            note = str(body.get("note") or "").strip()
            with DB_LOCK:
                conn = get_db()
                if kind == "parked_car":
                    conn.execute("DELETE FROM map_notes WHERE kind = 'parked_car'")
                conn.execute(
                    "INSERT INTO map_notes (id, title, note, kind, rating, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (nid, title, note, kind, rating, addr, lat, lng, now_iso),
                )
                conn.commit()
                conn.close()
            self._send_json(201, {"item": {"id": nid, "title": title, "note": note, "kind": kind, "rating": rating, "address": addr, "lat": lat, "lng": lng, "createdAt": now_iso}})
            return

        if path == "/api/backup/restore":
            if not isinstance(body, dict) or body.get("app") != "QALA Astana":
                self._send_json(400, {"error": "Некорректный формат резервной копии QALA"})
                return
            restored = 0
            now_iso = datetime.now(timezone.utc).isoformat()
            with DB_LOCK:
                conn = get_db()
                for r in body.get("reminders") or []:
                    if isinstance(r, dict) and r.get("id") and r.get("title"):
                        conn.execute("INSERT OR IGNORE INTO reminders (id, title, remind_at, category, done, created_at) VALUES (?, ?, ?, ?, ?, ?)", (r["id"], r["title"], r.get("remind_at") or "Сегодня", r.get("category") or "Город", int(r.get("done") or 0), r.get("created_at") or now_iso))
                        restored += 1
                for p in body.get("plans") or []:
                    if isinstance(p, dict) and p.get("id") and p.get("title"):
                        conn.execute("INSERT OR IGNORE INTO plans (id, title, date_label, completed, created_at) VALUES (?, ?, ?, ?, ?)", (p["id"], p["title"], p.get("date_label") or "Сегодня", int(p.get("completed") or 0), p.get("created_at") or now_iso))
                        restored += 1
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True, "restoredCount": restored})
            return

        self._send_json(404, {"error": "Not found"})

    def do_PATCH(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        body = self._read_json()

        if path.startswith("/api/reminders/"):
            rid = urllib.parse.unquote(path.split("/api/reminders/", 1)[1])
            done = 1 if body.get("done") else 0
            with DB_LOCK:
                conn = get_db()
                conn.execute("UPDATE reminders SET done = ? WHERE id = ?", (done, rid))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/parking/sessions/"):
            pid = urllib.parse.unquote(path.split("/api/parking/sessions/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT * FROM parking_sessions WHERE id = ?", (pid,)).fetchone()
                if not row:
                    conn.close()
                    self._send_json(404, {"error": "Сессия не найдена"})
                    return
                if body.get("action") == "stop":
                    conn.execute("UPDATE parking_sessions SET active = 0 WHERE id = ?", (pid,))
                    conn.commit()
                    conn.close()
                    self._send_json(200, {"ok": True})
                    return
                add_min = max(15, int(body.get("extraMin") or 30))
                prev_end = datetime.fromisoformat(str(row["ends_at"]).replace("Z", "+00:00"))
                base_dt = max(datetime.now(timezone.utc), prev_end)
                next_end = (base_dt + timedelta(minutes=add_min)).isoformat()
                extra_fee = round((int(row["price_per_hour"]) * add_min) / 60)
                next_dur = int(row["duration_min"]) + add_min
                next_tot = int(row["total_price"]) + extra_fee
                conn.execute(
                    "UPDATE parking_sessions SET duration_min = ?, total_price = ?, ends_at = ? WHERE id = ?",
                    (next_dur, next_tot, next_end, pid),
                )
                if extra_fee > 0:
                    conn.execute(
                        "INSERT INTO wallet_transactions (id, title, category, amount, created_at) VALUES (?, ?, 'Транспорт', ?, ?)",
                        (f"tx-park-ext-{int(time.time() * 1000)}", f"Продление парковки (+{add_min} мин)", extra_fee, datetime.now(timezone.utc).isoformat()),
                    )
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True, "endsAt": next_end, "durationMin": next_dur, "totalPrice": next_tot})
            return

        if path.startswith("/api/apartments/"):
            aid = urllib.parse.unquote(path.split("/api/apartments/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                if "isFavorite" in body:
                    conn.execute("UPDATE apartments SET is_favorite = ? WHERE id = ?", (1 if body["isFavorite"] else 0, aid))
                if "isHidden" in body:
                    conn.execute("UPDATE apartments SET is_hidden = ? WHERE id = ?", (1 if body["isHidden"] else 0, aid))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/market/"):
            mid = urllib.parse.unquote(path.split("/api/market/", 1)[1])
            if body.get("status"):
                with DB_LOCK:
                    conn = get_db()
                    conn.execute("UPDATE market_items SET status = ? WHERE id = ?", (str(body["status"]), mid))
                    conn.commit()
                    conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/delivery/stops/"):
            sid = urllib.parse.unquote(path.split("/api/delivery/stops/", 1)[1])
            if "done" in body:
                with DB_LOCK:
                    conn = get_db()
                    conn.execute("UPDATE delivery_stops SET done = ? WHERE id = ?", (1 if body["done"] else 0, sid))
                    conn.commit()
                    conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/plans/"):
            pid = urllib.parse.unquote(path.split("/api/plans/", 1)[1])
            if "completed" in body:
                with DB_LOCK:
                    conn = get_db()
                    conn.execute("UPDATE plans SET completed = ? WHERE id = ?", (1 if body["completed"] else 0, pid))
                    conn.commit()
                    conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/ikomek/"):
            iid = urllib.parse.unquote(path.split("/api/ikomek/", 1)[1])
            st = str(body.get("status") or "")
            if st in ("Принято", "В работе", "Решено"):
                with DB_LOCK:
                    conn = get_db()
                    conn.execute("UPDATE ikomek_reports SET status = ? WHERE id = ?", (st, iid))
                    conn.commit()
                    conn.close()
            self._send_json(200, {"ok": True})
            return

        self._send_json(404, {"error": "Not found"})

    def do_PUT(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        body = self._read_json()

        if path.startswith("/api/tv/channels/"):
            ch_id = urllib.parse.unquote(path.split("/api/tv/channels/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT * FROM tv_channels WHERE id = ?", (ch_id,)).fetchone()
                if not row:
                    conn.close()
                    self._send_json(404, {"error": "Канал не найден"})
                    return
                is_active = 1 if body.get("isActive", bool(row["is_active"])) else 0
                is_regional = 1 if body.get("isRegional", bool(row["is_regional"])) else 0
                conn.execute(
                    "UPDATE tv_channels SET name = ?, category = ?, stream_url = ?, is_active = ?, is_regional = ? WHERE id = ?",
                    (
                        str(body.get("name", row["name"])).strip(),
                        str(body.get("category", row["category"])).strip(),
                        str(body.get("streamUrl", row["stream_url"])).strip(),
                        is_active,
                        is_regional,
                        ch_id,
                    ),
                )
                conn.commit()
                updated = conn.execute("SELECT * FROM tv_channels WHERE id = ?", (ch_id,)).fetchone()
                conn.close()
            self._send_json(200, {"channel": map_tv_row(updated)})
            return

        if path == "/api/profile":
            with DB_LOCK:
                conn = get_db()
                name = str(body.get("name") or "Амир").strip()
                conn.execute(
                    "UPDATE profile SET name = ?, city = ?, address = ?, phone = ?, email = ?, avatar_initial = ? WHERE id = 1",
                    (
                        name,
                        str(body.get("city") or "Астана").strip(),
                        str(body.get("address") or "").strip(),
                        str(body.get("phone") or "").strip(),
                        str(body.get("email") or "").strip(),
                        name[:1].upper() or "Q",
                    ),
                )
                conn.commit()
                conn.close()
            self._send_json(200, {"profile": body})
            return

        if path == "/api/admin/pin":
            cur_pin = str(body.get("currentPin") or "").strip()
            new_pin = str(body.get("newPin") or "").strip()
            with DB_LOCK:
                conn = get_db()
                row = conn.execute("SELECT value FROM app_settings WHERE key = 'admin_pin'").fetchone()
                saved = row["value"] if row else "1234"
                if cur_pin != saved:
                    conn.close()
                    self._send_json(401, {"error": "Текущий PIN-код указан неверно"})
                    return
                if not re.match(r"^\d{4,6}$", new_pin):
                    conn.close()
                    self._send_json(400, {"error": "Новый PIN должен состоять из 4–6 цифр"})
                    return
                conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_pin', ?)", (new_pin,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path == "/api/settings":
            theme = "dark" if body.get("theme") == "dark" else "light"
            with DB_LOCK:
                conn = get_db()
                conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('theme', ?)", (theme,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True, "theme": theme})
            return

        if path == "/api/wallet/budget":
            budget = max(10000, round(float(body.get("budget") or 150000)))
            with DB_LOCK:
                conn = get_db()
                conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('wallet_budget', ?)", (str(budget),))
                conn.commit()
                conn.close()
            self._send_json(200, {"budget": budget})
            return

        self._send_json(404, {"error": "Not found"})

    def do_DELETE(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path.startswith("/api/tv/channels/"):
            ch_id = urllib.parse.unquote(path.split("/api/tv/channels/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM tv_channels WHERE id = ?", (ch_id,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/tv/m3u/"):
            src_id = urllib.parse.unquote(path.split("/api/tv/m3u/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM tv_channels WHERE source_m3u = ?", (src_id,))
                conn.execute("DELETE FROM m3u_sources WHERE id = ?", (src_id,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/tv/favorites/"):
            ch_id = urllib.parse.unquote(path.split("/api/tv/favorites/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM tv_favorites WHERE channel_id = ?", (ch_id,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/reminders/"):
            rid = urllib.parse.unquote(path.split("/api/reminders/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM reminders WHERE id = ?", (rid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/map/bookmarks/"):
            bid = urllib.parse.unquote(path.split("/api/map/bookmarks/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM map_bookmarks WHERE id = ?", (bid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path == "/api/map/routes/history":
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM route_history")
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/utilities/"):
            uid = urllib.parse.unquote(path.split("/api/utilities/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM utility_readings WHERE id = ?", (uid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/wallet/"):
            tid = urllib.parse.unquote(path.split("/api/wallet/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM wallet_transactions WHERE id = ?", (tid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/plans/"):
            pid = urllib.parse.unquote(path.split("/api/plans/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM plans WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/apartments/"):
            aid = urllib.parse.unquote(path.split("/api/apartments/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM apartments WHERE id = ?", (aid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/market/"):
            mid = urllib.parse.unquote(path.split("/api/market/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM market_items WHERE id = ?", (mid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/delivery/stops/"):
            sid = urllib.parse.unquote(path.split("/api/delivery/stops/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                if sid == "all":
                    conn.execute("DELETE FROM delivery_stops")
                else:
                    conn.execute("DELETE FROM delivery_stops WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/ikomek/"):
            iid = urllib.parse.unquote(path.split("/api/ikomek/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM ikomek_reports WHERE id = ?", (iid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/garage/"):
            cid = urllib.parse.unquote(path.split("/api/garage/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM garage_vehicles WHERE id = ?", (cid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/api/map/notes/"):
            nid = urllib.parse.unquote(path.split("/api/map/notes/", 1)[1])
            with DB_LOCK:
                conn = get_db()
                conn.execute("DELETE FROM map_notes WHERE id = ?", (nid,))
                conn.commit()
                conn.close()
            self._send_json(200, {"ok": True})
            return

        self._send_json(404, {"error": "Not found"})

    def _serve_static(self, req_path: str) -> None:
        if not DIST_DIR.exists():
            msg = "Сначала соберите фронтенд: npm run build".encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        clean = req_path.lstrip("/")
        candidate = (DIST_DIR / clean).resolve()
        if not str(candidate).startswith(str(DIST_DIR.resolve())) or not candidate.is_file():
            candidate = DIST_DIR / "index.html"

        ctype, _ = mimetypes.guess_type(str(candidate))
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), QalaPythonHandler)
    print(f"QALA Python-сервер запущен на http://0.0.0.0:{PORT} (БД: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
