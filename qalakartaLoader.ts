import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type {
  QalaKartaArea,
  QalaKartaBuilding,
  QalaKartaPlaceItem,
  QalaKartaRoad,
  QalaKartaSignItem,
  QalaKartaStats,
  QalaKartaViewportData,
  QalaKartaWaterway,
} from './src/types/qala.ts';

const LAT0 = 51.1283;
const LON0 = 71.4305;
const M_PER_DEG_LAT = 111_320.0;
const M_PER_DEG_LON = 111_320.0 * Math.cos((LAT0 * Math.PI) / 180);

function xyToLatLng(x: number, y: number): [number, number] {
  return [LAT0 - y / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];
}

const ROAD_CLASS: Record<string, number> = {
  motorway: 0,
  motorway_link: 0,
  trunk: 0,
  trunk_link: 0,
  primary: 1,
  primary_link: 1,
  secondary: 2,
  secondary_link: 2,
  tertiary: 2,
  tertiary_link: 2,
  residential: 3,
  unclassified: 3,
  living_street: 3,
  road: 3,
  service: 4,
  busway: 4,
  pedestrian: 5,
  footway: 5,
  path: 5,
  steps: 5,
  cycleway: 5,
  track: 5,
};

const SIGN_NAMES: Record<string, string> = {
  L: 'Светофор',
  C: 'Пешеходный переход',
  J: 'Остановка транспорта',
  K: 'Камера «Сергек»',
  F: 'Парковочный знак',
  R: 'Ж/Д переезд',
  P: 'Пост / Рубеж',
  S: 'Знак «Стоп» (2.5)',
  G: '«Уступи дорогу» (2.4)',
  V: 'Контроль скорости',
  H: 'Ограничение скорости',
  U: 'Разворот',
  Z: 'Пешеходная зона',
  Y: 'Одностороннее движение',
  M: 'Дорожная камера',
  T: 'Развязка / Светофор',
  B: 'Остановочный карман',
  Q: 'Инфо-указатель',
  E: 'Въезд запрещён',
};

type BBox = [number, number, number, number]; // minLat, minLng, maxLat, maxLng

interface IndexedArea extends QalaKartaArea {
  bbox: BBox;
  span: number;
}

interface IndexedWaterway extends QalaKartaWaterway {
  bbox: BBox;
}

interface IndexedRoad extends QalaKartaRoad {
  bbox: BBox;
}

interface IndexedBuilding extends QalaKartaBuilding {
  bbox: BBox;
}

export interface QalaKartaAddressEntry {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

interface QalaKartaStore {
  areas: IndexedArea[];
  waterways: IndexedWaterway[];
  roads: IndexedRoad[];
  buildings: IndexedBuilding[];
  places: QalaKartaPlaceItem[];
  signs: QalaKartaSignItem[];
  addresses: QalaKartaAddressEntry[];
  stats: QalaKartaStats;
}

let cachedStore: QalaKartaStore | null = null;
let loadPromise: Promise<QalaKartaStore> | null = null;

function computeBBox(pts: Array<[number, number]>): BBox {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (let i = 0; i < pts.length; i += 1) {
    const [lat, lng] = pts[i];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [minLat, minLng, maxLat, maxLng];
}

function boxesIntersect(
  b: BBox,
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): boolean {
  return b[2] >= minLat && b[0] <= maxLat && b[3] >= minLng && b[1] <= maxLng;
}

function parseBuildingHeight(tags: Record<string, string>): number {
  const rawH = String(tags.height || '')
    .replace('m', '')
    .trim();
  const hNum = Number.parseFloat(rawH);
  if (Number.isFinite(hNum) && hNum > 1) return hNum;
  const lv = Number.parseFloat(String(tags['building:levels'] || ''));
  if (Number.isFinite(lv) && lv > 0) return Math.max(1, lv) * 3.2;
  const b = tags.building;
  return b === 'apartments' || b === 'residential' || b === 'yes' ? 9.6 : 6.4;
}

async function buildStore(): Promise<QalaKartaStore> {
  const zipPath = path.resolve(process.cwd(), 'public/assets/aistudio/QalaKarta_a07b787c.zip');
  const empty: QalaKartaStore = {
    areas: [],
    waterways: [],
    roads: [],
    buildings: [],
    places: [],
    signs: [],
    addresses: [],
    stats: {
      totalElements: 0,
      buildings: 0,
      roads: 0,
      places: 0,
      signs: 0,
      addresses: 0,
      isReady: false,
    },
  };

  if (!fs.existsSync(zipPath)) {
    return empty;
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const gzEntry = zip.file('QalaKarta/bundled/astana_full.json.gz');
  const pxEntry = zip.file('QalaKarta/bundled/places_extra.json');
  const signsEntry = zip.file('QalaKarta/bundled/signs.json');

  const areas: IndexedArea[] = [];
  const waterways: IndexedWaterway[] = [];
  const roads: IndexedRoad[] = [];
  const buildings: IndexedBuilding[] = [];
  const places: QalaKartaPlaceItem[] = [];
  const signs: QalaKartaSignItem[] = [];
  const addresses: QalaKartaAddressEntry[] = [];

  let totalElements = 0;

  if (gzEntry) {
    const gzBuf = await gzEntry.async('nodebuffer');
    const full = JSON.parse(zlib.gunzipSync(gzBuf).toString('utf-8')) as {
      elements?: Array<{
        type?: string;
        id?: number;
        lat?: number;
        lon?: number;
        tags?: Record<string, string>;
        geometry?: Array<{ lat: number; lon: number }>;
      }>;
    };

    const elements = full.elements || [];
    totalElements = elements.length;

    for (const el of elements) {
      const tags = el.tags || {};
      const id = Number(el.id || 0);

      if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
        const street = tags['addr:street'] || '';
        const house = tags['addr:housenumber'] || '';
        const name = tags['name:ru'] || tags.name || tags['name:kk'] || '';
        const addr = street && house ? `${street}, ${house}` : tags['addr:full'] || '';
        if (addr || (name && (tags.amenity || tags.shop || tags.office || tags.tourism || tags.healthcare))) {
          addresses.push({
            id: `qkn-${id}`,
            name: name || addr,
            address: addr || 'Астана',
            category: tags.amenity || tags.shop || tags.healthcare || 'address',
            lat: el.lat,
            lng: el.lon,
          });
        }
        continue;
      }

      if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) {
        continue;
      }

      const pts: Array<[number, number]> = el.geometry.map((g) => [
        Number(g.lat.toFixed(6)),
        Number(g.lon.toFixed(6)),
      ]);
      const bbox = computeBBox(pts);
      const name = tags['name:ru'] || tags.name || tags['name:kk'] || '';

      if (tags.building) {
        const street = tags['addr:street'] || '';
        const house = tags['addr:housenumber'] || '';
        const addr = street && house ? `${street}, ${house}` : tags['addr:full'] || '';
        const bld: IndexedBuilding = {
          id,
          name,
          addr,
          height: parseBuildingHeight(tags),
          levels: tags['building:levels'],
          amenity: tags.amenity,
          shop: tags.shop,
          hours: tags.opening_hours,
          phone: tags.phone || tags['contact:phone'],
          website: tags.website,
          pts,
          bbox,
        };
        buildings.push(bld);
        if (addr || name) {
          const cLat = (bbox[0] + bbox[2]) / 2;
          const cLng = (bbox[1] + bbox[3]) / 2;
          addresses.push({
            id: `qkb-${id}`,
            name: name || addr,
            address: addr || 'Астана',
            category: tags.amenity || tags.shop || 'building',
            lat: cLat,
            lng: cLng,
          });
        }
        continue;
      }

      if (tags.highway && tags.area !== 'yes') {
        const cls = ROAD_CLASS[tags.highway] ?? 3;
        const owRaw = tags.oneway || '';
        const oneway =
          owRaw === 'yes' || owRaw === '1' || owRaw === 'true' || tags.junction === 'roundabout'
            ? 1
            : owRaw === '-1'
              ? -1
              : 0;
        roads.push({
          id,
          cls,
          oneway,
          bridge: Boolean(tags.bridge && tags.bridge !== 'no'),
          name,
          pts,
          bbox,
        });
        continue;
      }

      const ww = tags.waterway;
      if (ww === 'river' || ww === 'canal' || ww === 'stream') {
        waterways.push({
          id,
          wide: ww === 'river' || ww === 'canal',
          name,
          pts,
          bbox,
        });
        continue;
      }

      let areaKind: QalaKartaArea['kind'] | null = null;
      if (tags.natural === 'water' || ww === 'riverbank' || tags.landuse === 'reservoir') {
        areaKind = 'water';
      } else if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse === 'recreation_ground' || tags.landuse === 'grass') {
        areaKind = 'park';
      } else if (tags.natural === 'wood' || tags.landuse === 'forest') {
        areaKind = 'wood';
      } else if (tags.leisure === 'pitch' || tags.leisure === 'stadium' || tags.leisure === 'sports_centre') {
        areaKind = 'sport';
      } else if (tags.landuse === 'industrial') {
        areaKind = 'industrial';
      } else if (tags.landuse === 'residential') {
        areaKind = 'residential';
      } else if (tags.place === 'suburb' || tags.place === 'quarter' || tags.district) {
        areaKind = 'district';
      }

      if (areaKind && pts.length >= 3) {
        const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
        areas.push({ id, kind: areaKind, name, pts, bbox, span });
      }
    }
  }

  if (pxEntry) {
    const px = JSON.parse(await pxEntry.async('string')) as { p?: unknown[][] };
    const rows = Array.isArray(px.p) ? px.p : [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < 3) continue;
      const x = Number(row[0]);
      const y = Number(row[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const [lat, lng] = xyToLatLng(x, y);
      const name = String(row[2] || '').trim();
      if (!name) continue;
      const cat = String(row[3] || 'place').trim() || 'place';
      const addr = String(row[4] || '').trim();
      const phone = String(row[5] || '').trim();
      const website = String(row[6] || '').trim();
      const hours = String(row[8] || '').trim();
      places.push({
        id: `qkp-${i}`,
        name,
        cat,
        addr,
        phone,
        website,
        hours,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      });
    }
  }

  if (signsEntry) {
    const rawSigns = JSON.parse(await signsEntry.async('string')) as unknown[][];
    for (let i = 0; i < rawSigns.length; i += 1) {
      const row = rawSigns[i];
      if (!Array.isArray(row) || row.length < 3) continue;
      const code = String(row[0] || '').trim();
      const x = Number(row[1]);
      const y = Number(row[2]);
      if (!code || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const [lat, lng] = xyToLatLng(x, y);
      const extra = row[3];
      signs.push({
        id: `qks-${i}`,
        code,
        name: SIGN_NAMES[code] || `Знак (${code})`,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        hits: typeof extra === 'number' ? extra : undefined,
        label: typeof extra === 'string' ? extra : undefined,
      });
    }
  }

  return {
    areas,
    waterways,
    roads,
    buildings,
    places,
    signs,
    addresses,
    stats: {
      totalElements,
      buildings: buildings.length,
      roads: roads.length,
      places: places.length,
      signs: signs.length,
      addresses: addresses.length,
      isReady: true,
    },
  };
}

export async function getQalaKartaStore(): Promise<QalaKartaStore> {
  if (cachedStore) return cachedStore;
  if (!loadPromise) {
    loadPromise = buildStore().then((s) => {
      cachedStore = s;
      return s;
    });
  }
  return loadPromise;
}

export async function queryQalaKartaViewport(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  zoom: number;
  includeBuildings?: boolean;
  includeSigns?: boolean;
  includePlaces?: boolean;
}): Promise<QalaKartaViewportData> {
  const store = await getQalaKartaStore();
  const { minLat, maxLat, minLng, maxLng, zoom } = params;

  const areasOut: QalaKartaArea[] = [];
  const minAreaSpan = zoom < 12 ? 0.004 : zoom < 13.5 ? 0.001 : 0;
  for (const a of store.areas) {
    if (a.kind === 'residential' && zoom < 13) continue;
    if (a.span < minAreaSpan && a.kind !== 'water') continue;
    if (boxesIntersect(a.bbox, minLat, minLng, maxLat, maxLng)) {
      areasOut.push({ id: a.id, kind: a.kind, name: a.name, pts: a.pts });
      if (areasOut.length >= 1600) break;
    }
  }

  const waterwaysOut: QalaKartaWaterway[] = [];
  for (const w of store.waterways) {
    if (!w.wide && zoom < 13.2) continue;
    if (boxesIntersect(w.bbox, minLat, minLng, maxLat, maxLng)) {
      waterwaysOut.push({ id: w.id, wide: w.wide, name: w.name, pts: w.pts });
    }
  }

  const maxRoadCls = zoom < 12.2 ? 2 : zoom < 13.6 ? 3 : zoom < 14.5 ? 4 : 5;
  const roadsOut: QalaKartaRoad[] = [];
  for (const r of store.roads) {
    if (r.cls > maxRoadCls) continue;
    if (boxesIntersect(r.bbox, minLat, minLng, maxLat, maxLng)) {
      roadsOut.push({
        id: r.id,
        cls: r.cls,
        oneway: r.oneway,
        bridge: r.bridge,
        name: r.name,
        pts: r.pts,
      });
      if (roadsOut.length >= 4200) break;
    }
  }

  const buildingsOut: QalaKartaBuilding[] = [];
  if (params.includeBuildings !== false && zoom >= 14.0) {
    for (const b of store.buildings) {
      if (boxesIntersect(b.bbox, minLat, minLng, maxLat, maxLng)) {
        buildingsOut.push({
          id: b.id,
          name: b.name,
          addr: b.addr,
          height: b.height,
          levels: b.levels,
          amenity: b.amenity,
          shop: b.shop,
          hours: b.hours,
          phone: b.phone,
          website: b.website,
          pts: b.pts,
        });
        if (buildingsOut.length >= 2200) break;
      }
    }
  }

  const placesOut: QalaKartaPlaceItem[] = [];
  if (params.includePlaces !== false && zoom >= 12.6) {
    const limit = zoom >= 14.5 ? 420 : 180;
    for (const p of store.places) {
      if (p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng) {
        placesOut.push(p);
        if (placesOut.length >= limit) break;
      }
    }
  }

  const signsOut: QalaKartaSignItem[] = [];
  if (params.includeSigns !== false && zoom >= 13.2) {
    const majorOnly = zoom < 14.6;
    const limit = zoom >= 15.2 ? 600 : 260;
    for (const s of store.signs) {
      if (majorOnly && s.code !== 'K' && s.code !== 'L' && s.code !== 'R' && s.code !== 'P') {
        continue;
      }
      if (s.lat >= minLat && s.lat <= maxLat && s.lng >= minLng && s.lng <= maxLng) {
        signsOut.push(s);
        if (signsOut.length >= limit) break;
      }
    }
  }

  return {
    areas: areasOut,
    waterways: waterwaysOut,
    roads: roadsOut,
    buildings: buildingsOut,
    places: placesOut,
    signs: signsOut,
    stats: store.stats,
  };
}

export async function searchQalaKarta(query: string, limit = 8): Promise<QalaKartaAddressEntry[]> {
  const store = await getQalaKartaStore();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: QalaKartaAddressEntry[] = [];
  const seen = new Set<string>();

  for (const p of store.places) {
    if (p.name.toLowerCase().includes(q) || p.addr.toLowerCase().includes(q)) {
      const k = `${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({
          id: p.id,
          name: p.name,
          address: p.addr || 'Астана',
          category: p.cat,
          lat: p.lat,
          lng: p.lng,
        });
        if (out.length >= limit) return out;
      }
    }
  }

  for (const a of store.addresses) {
    if (a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q)) {
      const k = `${a.name.toLowerCase()}|${a.lat.toFixed(4)}|${a.lng.toFixed(4)}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(a);
        if (out.length >= limit) return out;
      }
    }
  }

  return out;
}
