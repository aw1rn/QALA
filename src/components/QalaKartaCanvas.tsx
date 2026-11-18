import { useCallback, useEffect, useRef, useState } from 'react';
import { ASTANA_CENTER } from '../data/astanaData';
import type {
  ApartmentListing,
  AstanaBusStop,
  AstanaExtraPlace,
  AstanaNoParkingSign,
  AstanaOsmParking,
  AstanaParking,
  AstanaPlace,
  AstanaSergekPoint,
  AstanaTrafficLight,
  BusRouteInfo,
  DeliveryStop,
  LiveBusMarker,
  MapBookmark,
  MapNote,
  QalaKartaBuilding,
  QalaKartaPlaceItem,
  QalaKartaSignItem,
  QalaKartaStats,
  QalaKartaThemeId,
  QalaKartaViewportData,
  SergekCamera,
  TomTomIncident,
  TrafficSegment,
} from '../types/qala';
import type { SelectedMapFeature } from './AstanaMap';

const LAT0 = 51.1283;
const LON0 = 71.4305;
const M_PER_DEG_LAT = 111_320.0;
const M_PER_DEG_LON = 111_320.0 * Math.cos((LAT0 * Math.PI) / 180);
const EQUATOR_METERS = 40_075_016.686;

function zoomToScale(zoom: number): number {
  return (256 * Math.pow(2, zoom)) / (EQUATOR_METERS * Math.cos((LAT0 * Math.PI) / 180));
}

export interface QalaKartaThemePalette {
  id: QalaKartaThemeId;
  name: string;
  subtitle: string;
  swatch: string;
  ground: string;
  water: string;
  park: string;
  wood: string;
  sport: string;
  industrial: string;
  residential: string;
  building: string;
  buildingEdge: string;
  buildingWall: string;
  buildingSel: string;
  roadFill: [string, string, string, string, string, string];
  roadEdge: [string, string, string, string, string, string];
  route: string;
  text: string;
  textSoft: string;
  halo: string;
  dark: boolean;
}

export const QALAKARTA_THEMES: Record<QalaKartaThemeId, QalaKartaThemePalette> = {
  samal: {
    id: 'samal',
    name: 'Самал',
    subtitle: 'Светлая бирюза',
    swatch: '#7fc4d8',
    ground: '#eaf4f1',
    water: '#7fc4d8',
    park: '#bfe3c4',
    wood: '#a9d6b0',
    sport: '#cdeac0',
    industrial: '#dfe9e6',
    residential: '#f1f8f6',
    building: '#d4e4e0',
    buildingEdge: '#a2c2bb',
    buildingWall: '#9cbab3',
    buildingSel: '#ff7a59',
    roadFill: ['#ff7a59', '#ffb199', '#ffffff', '#ffffff', '#f6fbfa', '#9fb8b2'],
    roadEdge: ['#c9502f', '#e08566', '#b4cdc7', '#c3d8d3', '#d2e2de', '#9fb8b2'],
    route: '#7b3fe4',
    text: '#143a3a',
    textSoft: '#4d7370',
    halo: '#ffffff',
    dark: false,
  },
  oyu: {
    id: 'oyu',
    name: 'Ою',
    subtitle: 'Золото и синева',
    swatch: '#d6b26a',
    ground: '#e9edf3',
    water: '#b7cdea',
    park: '#cfe2c8',
    wood: '#bcd6b4',
    sport: '#d8e6c4',
    industrial: '#dcdfe6',
    residential: '#eef1f5',
    building: '#d2d9e4',
    buildingEdge: '#a5b3c7',
    buildingWall: '#9aa8bd',
    buildingSel: '#d6b26a',
    roadFill: ['#f0c877', '#f6dca0', '#ffffff', '#ffffff', '#f7f9fc', '#c8b89a'],
    roadEdge: ['#b8893a', '#c9a55e', '#b6c0d0', '#c3ccd9', '#d2d9e3', '#c8b89a'],
    route: '#2747c7',
    text: '#16223d',
    textSoft: '#4a5876',
    halo: '#ffffff',
    dark: false,
  },
  tun: {
    id: 'tun',
    name: 'Түн',
    subtitle: 'Ночной неон',
    swatch: '#1a2436',
    ground: '#0e1522',
    water: '#12304a',
    park: '#132a22',
    wood: '#11261d',
    sport: '#172e24',
    industrial: '#151d2b',
    residential: '#111a28',
    building: '#1d293e',
    buildingEdge: '#324564',
    buildingWall: '#121a29',
    buildingSel: '#35e0c6',
    roadFill: ['#7a6539', '#524d3b', '#2e3c54', '#243044', '#1d2738', '#3a3528'],
    roadEdge: ['#0e1522', '#0e1522', '#0e1522', '#0e1522', '#0e1522', '#3a3528'],
    route: '#35e0c6',
    text: '#e8eef5',
    textSoft: '#9fb0c6',
    halo: '#0e1522',
    dark: true,
  },
  dala: {
    id: 'dala',
    name: 'Дала',
    subtitle: 'Тёплая степь',
    swatch: '#c8553a',
    ground: '#f1e9d8',
    water: '#8fcfd0',
    park: '#c9d6a8',
    wood: '#b7c796',
    sport: '#d6dcae',
    industrial: '#e4dccb',
    residential: '#f5efe2',
    building: '#e3d5bd',
    buildingEdge: '#bfa985',
    buildingWall: '#b9a27e',
    buildingSel: '#c8553a',
    roadFill: ['#c8553a', '#e08a5b', '#fffaf0', '#fffaf0', '#f8f1e3', '#b9a27c'],
    roadEdge: ['#8f3520', '#b5623a', '#d2c3a6', '#dccfb6', '#e4d9c4', '#b9a27c'],
    route: '#1f7f86',
    text: '#3b2a1c',
    textSoft: '#7a654c',
    halo: '#fffaf0',
    dark: false,
  },
  syzba: {
    id: 'syzba',
    name: 'Сызба',
    subtitle: 'Архитектурный чертёж',
    swatch: '#0f3f78',
    ground: '#0b2a52',
    water: '#0f3f78',
    park: '#0e3a5c',
    wood: '#0e3a5c',
    sport: '#10406a',
    industrial: '#0c2e58',
    residential: '#0b2a52',
    building: '#10396e',
    buildingEdge: '#6fb1ee',
    buildingWall: '#092244',
    buildingSel: '#ffd34d',
    roadFill: ['#ffffff', '#cfe6ff', '#8fc3f3', '#6aa6dc', '#4d87bd', '#4d87bd'],
    roadEdge: ['#0b2a52', '#0b2a52', '#0b2a52', '#0b2a52', '#0b2a52', '#0b2a52'],
    route: '#ffd34d',
    text: '#ffffff',
    textSoft: '#b6d6f5',
    halo: '#0b2a52',
    dark: true,
  },
};

function pointInPolygon(lat: number, lng: number, pts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][0];
    const xi = pts[i][1];
    const yj = pts[j][0];
    const xj = pts[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawRoundedBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
  borderColor = '#ffffff'
) {
  ctx.font = '700 11px system-ui, -apple-system, sans-serif';
  const padX = 7;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 21;
  const rx = x - w / 2;
  const ry = y - h / 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = borderColor;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

interface QalaKartaCanvasProps {
  center?: [number, number];
  zoom?: number;
  qkTheme: QalaKartaThemeId;
  view3d: boolean;
  showRoadSigns: boolean;
  showQalaPlaces: boolean;
  showIsochrone: boolean;
  places?: AstanaPlace[];
  apartments?: ApartmentListing[];
  selectedApartmentId?: string | null;
  deliveryStops?: DeliveryStop[];
  routeCoordinates?: Array<[number, number]>;
  trafficSegments?: TrafficSegment[];
  sergekCameras?: SergekCamera[];
  paidParkings?: AstanaParking[];
  osmParkings?: AstanaOsmParking[];
  noParkingSigns?: AstanaNoParkingSign[];
  busStops?: AstanaBusStop[];
  trafficLights?: AstanaTrafficLight[];
  sergekPoints?: AstanaSergekPoint[];
  extraPlaces?: AstanaExtraPlace[];
  busRoute?: BusRouteInfo | null;
  taxiEndpoints?: {
    from?: { name: string; lat: number; lng: number };
    to?: { name: string; lat: number; lng: number };
  } | null;
  viaWaypoint?: { name: string; lat: number; lng: number } | null;
  incidents?: TomTomIncident[];
  courierPosition?: { lat: number; lng: number; label: string } | null;
  userLocation?: [number, number] | null;
  bookmarks?: MapBookmark[];
  mapNotes?: MapNote[];
  liveBuses?: LiveBusMarker[];
  simCarPosition?: [number, number] | null;
  onSelectApartment?: (apt: ApartmentListing) => void;
  onSelectFeature?: (feature: SelectedMapFeature) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onStatsLoaded?: (stats: QalaKartaStats) => void;
  onViewportChange?: (lat: number, lng: number, zoom: number) => void;
  className?: string;
}

export function QalaKartaCanvas({
  center = ASTANA_CENTER,
  zoom = 13.8,
  qkTheme,
  view3d,
  showRoadSigns,
  showQalaPlaces,
  showIsochrone,
  places = [],
  apartments = [],
  selectedApartmentId,
  deliveryStops = [],
  routeCoordinates = [],
  trafficSegments = [],
  sergekCameras = [],
  paidParkings = [],
  osmParkings = [],
  noParkingSigns = [],
  busStops = [],
  trafficLights = [],
  extraPlaces = [],
  busRoute = null,
  taxiEndpoints = null,
  viaWaypoint = null,
  incidents = [],
  courierPosition = null,
  userLocation = null,
  bookmarks = [],
  mapNotes = [],
  liveBuses = [],
  simCarPosition = null,
  onSelectApartment,
  onSelectFeature,
  onMapClick,
  onStatsLoaded,
  onViewportChange,
  className = 'h-full w-full',
}: QalaKartaCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const viewRef = useRef<{ lat: number; lng: number; zoom: number }>({
    lat: center[0],
    lng: center[1],
    zoom: Math.max(11, Math.min(18.5, zoom)),
  });
  const lastPropViewRef = useRef<{ lat: number; lng: number; zoom: number }>({
    lat: center[0],
    lng: center[1],
    zoom,
  });

  const dataRef = useRef<QalaKartaViewportData | null>(null);
  const selectedBuildingIdRef = useRef<number | null>(null);
  const [loadingViewport, setLoadingViewport] = useState(false);
  const [hoverHint, setHoverHint] = useState<string | null>(null);
  const [displayZoom, setDisplayZoom] = useState<number>(viewRef.current.zoom);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
  });

  const fetchTimerRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchViewportData = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(240, rect.height);
    const { lat, lng, zoom: z } = viewRef.current;
    const s = zoomToScale(z);
    const padFactor = 1.3;
    const halfLat = ((h / 2) / (M_PER_DEG_LAT * s)) * padFactor;
    const halfLng = ((w / 2) / (M_PER_DEG_LON * s)) * padFactor;

    const minLat = lat - halfLat;
    const maxLat = lat + halfLat;
    const minLng = lng - halfLng;
    const maxLng = lng + halfLng;

    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    setLoadingViewport(true);

    try {
      const qs = new URLSearchParams({
        minLat: minLat.toFixed(6),
        maxLat: maxLat.toFixed(6),
        minLng: minLng.toFixed(6),
        maxLng: maxLng.toFixed(6),
        zoom: z.toFixed(2),
        buildings: '1',
        signs: showRoadSigns ? '1' : '0',
        places: showQalaPlaces ? '1' : '0',
      });
      const res = await fetch(`/api/qalakarta/viewport?${qs.toString()}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const json = (await res.json()) as QalaKartaViewportData;
      dataRef.current = json;
      if (json.stats?.isReady && onStatsLoaded) {
        onStatsLoaded(json.stats);
      }
      renderCanvasRef.current();
    } catch {
      // aborted or transient
    } finally {
      setLoadingViewport(false);
    }
  }, [onStatsLoaded, showQalaPlaces, showRoadSigns]);

  const scheduleFetch = useCallback(
    (delayMs = 120) => {
      if (fetchTimerRef.current !== null) {
        window.clearTimeout(fetchTimerRef.current);
      }
      fetchTimerRef.current = window.setTimeout(() => {
        void fetchViewportData();
      }, delayMs);
    },
    [fetchViewportData]
  );

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const theme = QALAKARTA_THEMES[qkTheme] || QALAKARTA_THEMES.samal;
    const { lat: cLat, lng: cLng, zoom: z } = viewRef.current;
    const s = zoomToScale(z);

    const toXY = (lat: number, lng: number): [number, number] => [
      width / 2 + (lng - cLng) * M_PER_DEG_LON * s,
      height / 2 - (lat - cLat) * M_PER_DEG_LAT * s,
    ];

    // 1. Background ground
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, width, height);

    // Subtle blueprint grid in syzba theme
    if (theme.id === 'syzba') {
      ctx.strokeStyle = 'rgba(111, 177, 238, 0.08)';
      ctx.lineWidth = 1;
      const step = 48;
      for (let gx = 0; gx < width; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = 0; gy < height; gy += step) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }
    }

    const qk = dataRef.current;
    if (qk) {
      // 2. Areas (order matters: residential -> industrial -> park/wood/sport -> water)
      const areaOrder: Record<string, number> = {
        residential: 0,
        industrial: 1,
        park: 2,
        wood: 3,
        sport: 4,
        water: 5,
        district: 6,
      };
      const sortedAreas = [...qk.areas].sort(
        (a, b) => (areaOrder[a.kind] ?? 0) - (areaOrder[b.kind] ?? 0)
      );

      for (const a of sortedAreas) {
        if (a.pts.length < 3) continue;
        ctx.beginPath();
        const [x0, y0] = toXY(a.pts[0][0], a.pts[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < a.pts.length; i += 1) {
          const [xi, yi] = toXY(a.pts[i][0], a.pts[i][1]);
          ctx.lineTo(xi, yi);
        }
        ctx.closePath();

        if (a.kind === 'district') {
          ctx.save();
          ctx.setLineDash([6, 5]);
          ctx.strokeStyle = theme.dark ? 'rgba(159,176,198,0.28)' : 'rgba(20,58,58,0.2)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          continue;
        }

        ctx.fillStyle =
          a.kind === 'water'
            ? theme.water
            : a.kind === 'park'
              ? theme.park
              : a.kind === 'wood'
                ? theme.wood
                : a.kind === 'sport'
                  ? theme.sport
                  : a.kind === 'industrial'
                    ? theme.industrial
                    : theme.residential;
        ctx.fill();
      }

      // 3. Waterways (Esim river & streams)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const w of qk.waterways) {
        if (w.pts.length < 2) continue;
        ctx.beginPath();
        const [x0, y0] = toXY(w.pts[0][0], w.pts[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < w.pts.length; i += 1) {
          const [xi, yi] = toXY(w.pts[i][0], w.pts[i][1]);
          ctx.lineTo(xi, yi);
        }
        ctx.strokeStyle = theme.water;
        ctx.lineWidth = Math.max(w.wide ? 4 : 1.5, (w.wide ? 18 : 5) * s);
        ctx.stroke();
      }

      // 4. Roads (two passes: casing/edge then fill, ordered by minor->major)
      const baseWidthsMeters = [14, 10.5, 7.8, 5.6, 3.8, 2.2];
      const roadsByCls = [...qk.roads].sort((a, b) => b.cls - a.cls);

      // Edge pass
      for (const r of roadsByCls) {
        if (r.pts.length < 2) continue;
        const wPx = Math.max(r.cls <= 1 ? 2.5 : 1.2, (baseWidthsMeters[r.cls] || 4) * s);
        ctx.beginPath();
        const [x0, y0] = toXY(r.pts[0][0], r.pts[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < r.pts.length; i += 1) {
          const [xi, yi] = toXY(r.pts[i][0], r.pts[i][1]);
          ctx.lineTo(xi, yi);
        }
        ctx.strokeStyle = theme.roadEdge[r.cls] || theme.roadEdge[3];
        ctx.lineWidth = wPx + (r.bridge ? 4 : 2);
        if (r.cls === 5) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Fill pass
      for (const r of roadsByCls) {
        if (r.pts.length < 2) continue;
        const wPx = Math.max(r.cls <= 1 ? 1.8 : 0.9, (baseWidthsMeters[r.cls] || 4) * s);
        ctx.beginPath();
        const [x0, y0] = toXY(r.pts[0][0], r.pts[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < r.pts.length; i += 1) {
          const [xi, yi] = toXY(r.pts[i][0], r.pts[i][1]);
          ctx.lineTo(xi, yi);
        }
        ctx.strokeStyle = theme.roadFill[r.cls] || theme.roadFill[3];
        ctx.lineWidth = wPx;
        if (r.cls === 5) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 5. Traffic flow overlay from QALA
    for (const seg of trafficSegments) {
      if (seg.coords.length < 2) continue;
      ctx.beginPath();
      const [x0, y0] = toXY(seg.coords[0][0], seg.coords[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < seg.coords.length; i += 1) {
        const [xi, yi] = toXY(seg.coords[i][0], seg.coords[i][1]);
        ctx.lineTo(xi, yi);
      }
      ctx.strokeStyle =
        seg.level === 'busy'
          ? 'rgba(225, 29, 72, 0.78)'
          : seg.level === 'moderate'
            ? 'rgba(245, 158, 11, 0.78)'
            : 'rgba(16, 185, 129, 0.65)';
      ctx.lineWidth = Math.max(3, 6 * s);
      ctx.stroke();
    }

    // 6. Isochrone 5 / 10 / 15 min reachability overlay
    if (showIsochrone) {
      const isoLat = userLocation?.[0] ?? taxiEndpoints?.from?.lat ?? cLat;
      const isoLng = userLocation?.[1] ?? taxiEndpoints?.from?.lng ?? cLng;
      const [ix, iy] = toXY(isoLat, isoLng);
      const zones = [
        { min: 15, radiusM: 1250, label: '15 мин пешком (~1.25 км)', fill: 'rgba(124, 58, 237, 0.08)', stroke: 'rgba(124, 58, 237, 0.5)' },
        { min: 10, radiusM: 830, label: '10 мин (~830 м)', fill: 'rgba(14, 165, 233, 0.10)', stroke: 'rgba(14, 165, 233, 0.6)' },
        { min: 5, radiusM: 420, label: '5 мин (~420 м)', fill: 'rgba(16, 185, 129, 0.14)', stroke: 'rgba(16, 185, 129, 0.75)' },
      ];
      for (const zn of zones) {
        const rx = zn.radiusM * s;
        ctx.save();
        ctx.beginPath();
        // Slight octagonal urban reachability polygon matching Astana grid
        for (let k = 0; k < 16; k += 1) {
          const ang = (k / 16) * Math.PI * 2;
          const wobble = 1 - 0.07 * Math.abs(Math.sin(ang * 2));
          const px = ix + Math.cos(ang) * rx * wobble;
          const py = iy + Math.sin(ang) * rx * wobble;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = zn.fill;
        ctx.fill();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = zn.stroke;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
        if (rx > 32) {
          drawRoundedBadge(ctx, ix, iy - rx + 10, zn.label, 'rgba(15,23,42,0.82)', '#ffffff', zn.stroke);
        }
      }
    }

    // 7. Buildings (with true 2.5D extrusion when view3d && zoom >= 14.3)
    if (qk && qk.buildings.length > 0) {
      const use3d = view3d && z >= 14.3;
      const sortedBuildings = use3d
        ? [...qk.buildings].sort((a, b) => (b.pts[0]?.[0] || 0) - (a.pts[0]?.[0] || 0))
        : qk.buildings;

      for (const b of sortedBuildings) {
        if (b.pts.length < 3) continue;
        const screenPts = b.pts.map((pt) => toXY(pt[0], pt[1]));
        const isSel = selectedBuildingIdRef.current === b.id;

        if (!use3d) {
          ctx.beginPath();
          ctx.moveTo(screenPts[0][0], screenPts[0][1]);
          for (let i = 1; i < screenPts.length; i += 1) {
            ctx.lineTo(screenPts[i][0], screenPts[i][1]);
          }
          ctx.closePath();
          ctx.fillStyle = isSel ? theme.buildingSel : theme.building;
          ctx.fill();
          if (z >= 14.4) {
            ctx.strokeStyle = theme.buildingEdge;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
          continue;
        }

        // 3D Oblique Extrusion
        const liftPx = Math.min(58, Math.max(3, b.height * s * 0.42));
        const dx = liftPx * 0.24;
        const dy = -liftPx;

        // Footprint shadow
        ctx.beginPath();
        ctx.moveTo(screenPts[0][0], screenPts[0][1]);
        for (let i = 1; i < screenPts.length; i += 1) {
          ctx.lineTo(screenPts[i][0], screenPts[i][1]);
        }
        ctx.closePath();
        ctx.fillStyle = theme.dark ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.09)';
        ctx.fill();

        // Extruded side walls
        ctx.fillStyle = isSel ? '#c2410c' : theme.buildingWall;
        ctx.strokeStyle = theme.buildingEdge;
        ctx.lineWidth = 0.6;
        for (let i = 0; i < screenPts.length; i += 1) {
          const [x1, y1] = screenPts[i];
          const [x2, y2] = screenPts[(i + 1) % screenPts.length];
          // Draw visible faces
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x2 + dx, y2 + dy);
          ctx.lineTo(x1 + dx, y1 + dy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Elevated roof
        ctx.beginPath();
        ctx.moveTo(screenPts[0][0] + dx, screenPts[0][1] + dy);
        for (let i = 1; i < screenPts.length; i += 1) {
          ctx.lineTo(screenPts[i][0] + dx, screenPts[i][1] + dy);
        }
        ctx.closePath();
        ctx.fillStyle = isSel ? theme.buildingSel : theme.building;
        ctx.fill();
        ctx.strokeStyle = theme.buildingEdge;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 8. Paid Parking Zones & No-Parking 3.27 lines
    for (const pk of paidParkings) {
      if (pk.ring && pk.ring.length >= 3) {
        ctx.beginPath();
        const [x0, y0] = toXY(pk.ring[0][0], pk.ring[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < pk.ring.length; i += 1) {
          const [xi, yi] = toXY(pk.ring[i][0], pk.ring[i][1]);
          ctx.lineTo(xi, yi);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      const [px, py] = toXY(pk.lat, pk.lng);
      if (px > -30 && px < width + 30 && py > -30 && py < height + 30 && z >= 13.0) {
        drawRoundedBadge(ctx, px, py, 'P', '#2563EB', '#ffffff');
      }
    }

    if (z >= 14.0) {
      for (const np of noParkingSigns) {
        if (np.line.length < 2) continue;
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#E11D48';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const [x0, y0] = toXY(np.line[0][0], np.line[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < np.line.length; i += 1) {
          const [xi, yi] = toXY(np.line[i][0], np.line[i][1]);
          ctx.lineTo(xi, yi);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 9. Bus Route & Active Navigation Route
    if (busRoute && busRoute.waypoints.length >= 2) {
      ctx.beginPath();
      const [x0, y0] = toXY(busRoute.waypoints[0].lat, busRoute.waypoints[0].lng);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < busRoute.waypoints.length; i += 1) {
        const [xi, yi] = toXY(busRoute.waypoints[i].lat, busRoute.waypoints[i].lng);
        ctx.lineTo(xi, yi);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = busRoute.color || '#0284C7';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      for (const wp of busRoute.waypoints) {
        const [wx, wy] = toXY(wp.lat, wp.lng);
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = busRoute.color || '#0284C7';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    if (routeCoordinates.length >= 2) {
      ctx.beginPath();
      const [x0, y0] = toXY(routeCoordinates[0][0], routeCoordinates[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < routeCoordinates.length; i += 1) {
        const [xi, yi] = toXY(routeCoordinates[i][0], routeCoordinates[i][1]);
        ctx.lineTo(xi, yi);
      }
      ctx.strokeStyle = theme.halo;
      ctx.lineWidth = 8.5;
      ctx.stroke();
      ctx.strokeStyle = theme.route;
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    if (taxiEndpoints?.from) {
      const [fx, fy] = toXY(taxiEndpoints.from.lat, taxiEndpoints.from.lng);
      drawRoundedBadge(ctx, fx, fy, `A · ${taxiEndpoints.from.name.slice(0, 14)}`, '#10B981', '#ffffff');
    }
    if (viaWaypoint) {
      const [vx, vy] = toXY(viaWaypoint.lat, viaWaypoint.lng);
      drawRoundedBadge(ctx, vx, vy, `Через: ${viaWaypoint.name.slice(0, 12)}`, '#7C3AED', '#ffffff');
    }
    if (taxiEndpoints?.to) {
      const [tx, ty] = toXY(taxiEndpoints.to.lat, taxiEndpoints.to.lng);
      drawRoundedBadge(ctx, tx, ty, `B · ${taxiEndpoints.to.name.slice(0, 14)}`, '#E11D48', '#ffffff');
    }

    // 10. Incidents
    for (const inc of incidents) {
      if (inc.coords.length < 2) continue;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const [x0, y0] = toXY(inc.coords[0][0], inc.coords[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < inc.coords.length; i += 1) {
        const [xi, yi] = toXY(inc.coords[i][0], inc.coords[i][1]);
        ctx.lineTo(xi, yi);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 11. QalaKarta Road Signs (6,310 signs from signs.json)
    if (qk && showRoadSigns && z >= 13.4) {
      for (const sg of qk.signs) {
        const [sx, sy] = toXY(sg.lat, sg.lng);
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;

        let color = '#64748B';
        let ch = sg.code;
        if (sg.code === 'K') {
          color = '#7C3AED';
          ch = '📷';
        } else if (sg.code === 'L') {
          color = '#D97706';
          ch = '🚦';
        } else if (sg.code === 'J' || sg.code === 'B') {
          color = '#0284C7';
          ch = '🚌';
        } else if (sg.code === 'F') {
          color = '#2563EB';
          ch = 'P';
        } else if (sg.code === 'C') {
          color = '#059669';
          ch = '🚶';
        } else if (sg.code === 'V' || sg.code === 'H' || sg.code === 'S') {
          color = '#E11D48';
        }

        ctx.beginPath();
        ctx.arc(sx, sy, z >= 15.2 ? 8 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        if (z >= 15.2) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 9px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ch, sx, sy + 0.5);
        }
      }
    }

    // Label collision registry
    const placedLabels: Array<[number, number, number, number]> = [];
    const canPlaceLabel = (lx: number, ly: number, lw: number, lh: number): boolean => {
      if (lx < 4 || ly < 4 || lx + lw > width - 4 || ly + lh > height - 4) return false;
      for (const [ox, oy, ow, oh] of placedLabels) {
        if (lx < ox + ow && lx + lw > ox && ly < oy + oh && ly + lh > oy) {
          return false;
        }
      }
      placedLabels.push([lx, ly, lw, lh]);
      return true;
    };

    // 12. Street & District Labels from QalaKarta vector data
    if (qk && z >= 13.6) {
      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const namedRoadSeen = new Set<string>();

      for (const r of qk.roads) {
        if (r.cls > (z >= 15.2 ? 3 : 2) || !r.name || namedRoadSeen.has(r.name)) continue;
        const mid = r.pts[Math.floor(r.pts.length / 2)];
        if (!mid) continue;
        const [rx, ry] = toXY(mid[0], mid[1]);
        const tw = ctx.measureText(r.name).width;
        if (canPlaceLabel(rx - tw / 2 - 6, ry - 8, tw + 12, 16)) {
          namedRoadSeen.add(r.name);
          ctx.lineWidth = 3;
          ctx.strokeStyle = theme.halo;
          ctx.strokeText(r.name, rx, ry);
          ctx.fillStyle = theme.textSoft;
          ctx.fillText(r.name, rx, ry);
        }
      }
    }

    // 13. House numbers & Named buildings when zoomed closely
    if (qk && z >= 15.7) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of qk.buildings) {
        const houseMatch = b.addr ? b.addr.match(/,\s*([^,]+)$/) : null;
        const label = b.name || (houseMatch ? houseMatch[1] : '');
        if (!label || b.pts.length === 0) continue;
        let sumLat = 0;
        let sumLng = 0;
        for (const p of b.pts) {
          sumLat += p[0];
          sumLng += p[1];
        }
        const [bx, by] = toXY(sumLat / b.pts.length, sumLng / b.pts.length);
        const short = label.length > 18 ? `${label.slice(0, 17)}…` : label;
        const tw = ctx.measureText(short).width;
        if (canPlaceLabel(bx - tw / 2 - 4, by - 7, tw + 8, 14)) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = theme.halo;
          ctx.strokeText(short, bx, by);
          ctx.fillStyle = theme.text;
          ctx.fillText(short, bx, by);
        }
      }
    }

    // 14. QalaKarta POIs (6,120 places from places_extra.json)
    if (qk && showQalaPlaces && z >= 13.0) {
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const p of qk.places) {
        const [px, py] = toXY(p.lat, p.lng);
        if (px < -10 || px > width + 10 || py < -10 || py > height + 10) continue;

        ctx.beginPath();
        ctx.arc(px, py, 3.8, 0, Math.PI * 2);
        ctx.fillStyle =
          p.cat.includes('food') || p.cat.includes('cafe') || p.cat.includes('rest')
            ? '#EA580C'
            : p.cat.includes('shop') || p.cat.includes('mall')
              ? '#0284C7'
              : p.cat.includes('med') || p.cat.includes('pharm')
                ? '#10B981'
                : '#4F46E5';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (z >= 14.2) {
          const short = p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name;
          const tw = ctx.measureText(short).width;
          if (canPlaceLabel(px + 6, py - 8, tw + 8, 16)) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = theme.halo;
            ctx.strokeText(short, px + 7, py);
            ctx.fillStyle = theme.text;
            ctx.fillText(short, px + 7, py);
          }
        }
      }
    }

    // 15. QALA Overlay Markers: Landmarks, Sergek, Bus Stops, Apartments, Bookmarks, Notes
    for (const pl of places) {
      const [px, py] = toXY(pl.lat, pl.lng);
      if (px < -40 || px > width + 40 || py < -40 || py > height + 40) continue;
      if (z >= 11.5) {
        drawRoundedBadge(ctx, px, py, pl.name, theme.dark ? '#1e293b' : '#0f172a', '#ffffff', '#38bdf8');
      }
    }

    for (const cam of sergekCameras) {
      const [cx, cy] = toXY(cam.lat, cam.lng);
      if (cx < -20 || cx > width + 20 || cy < -20 || cy > height + 20) continue;
      drawRoundedBadge(ctx, cx, cy, `📷 ${cam.limitKmh}`, '#7C3AED', '#ffffff');
    }

    if (z >= 14.3) {
      for (const bs of busStops.slice(0, 260)) {
        const [bx, by] = toXY(bs.lat, bs.lng);
        if (bx < -20 || bx > width + 20 || by < -20 || by > height + 20) continue;
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0284C7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      for (const tl of trafficLights.slice(0, 220)) {
        const [tx, ty] = toXY(tl.lat, tl.lng);
        if (tx < -20 || tx > width + 20 || ty < -20 || ty > height + 20) continue;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#F59E0B';
        ctx.fill();
      }
    }

    for (const ep of extraPlaces.slice(0, 180)) {
      const [ex, ey] = toXY(ep.lat, ep.lng);
      if (ex < -20 || ex > width + 20 || ey < -20 || ey > height + 20) continue;
      ctx.beginPath();
      ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0F766E';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (const op of osmParkings.slice(0, 120)) {
      const [ox, oy] = toXY(op.lat, op.lng);
      if (ox < -20 || ox > width + 20 || oy < -20 || oy > height + 20) continue;
      if (z >= 14.2) {
        drawRoundedBadge(ctx, ox, oy, 'P', '#0284C7', '#ffffff');
      }
    }

    for (const apt of apartments) {
      const [ax, ay] = toXY(apt.lat, apt.lng);
      if (ax < -40 || ax > width + 40 || ay < -40 || ay > height + 40) continue;
      const lbl = apt.price >= 1000 ? `${Math.round(apt.price / 1000)}k ₸` : `${apt.price} ₸`;
      drawRoundedBadge(
        ctx,
        ax,
        ay,
        lbl,
        apt.id === selectedApartmentId ? '#059669' : '#0F172A',
        '#ffffff',
        '#34D399'
      );
    }

    deliveryStops.forEach((st, idx) => {
      const [dx, dy] = toXY(st.lat, st.lng);
      drawRoundedBadge(ctx, dx, dy, `${idx + 1}`, st.done ? '#16A34A' : '#EA580C', '#ffffff');
    });

    for (const bm of bookmarks) {
      const [bx, by] = toXY(bm.lat, bm.lng);
      const glyph = bm.kind === 'home' ? '🏠' : bm.kind === 'work' ? '💼' : bm.kind === 'parking' ? '🅿️' : '⭐';
      drawRoundedBadge(ctx, bx, by, `${glyph} ${bm.label}`, '#0F172A', '#ffffff', '#F59E0B');
    }

    for (const mn of mapNotes) {
      const [nx, ny] = toXY(mn.lat, mn.lng);
      const glyph = mn.kind === 'parked_car' ? '🚗' : mn.kind === 'family_zone' ? '🛡️' : '📌';
      const bg = mn.kind === 'parked_car' ? '#059669' : mn.kind === 'family_zone' ? '#7C3AED' : '#E11D48';
      drawRoundedBadge(ctx, nx, ny, `${glyph} ${mn.title}`, bg, '#ffffff');
    }

    for (const bus of liveBuses) {
      const [bx, by] = toXY(bus.lat, bus.lng);
      drawRoundedBadge(ctx, bx, by, `🚌 №${bus.number} · ${bus.etaMin}м`, bus.color || '#0284C7', '#ffffff');
    }

    if (simCarPosition) {
      const [sx, sy] = toXY(simCarPosition[0], simCarPosition[1]);
      drawRoundedBadge(ctx, sx, sy, '🚘 Навигатор', '#F59E0B', '#0F172A');
    }

    if (courierPosition) {
      const [cx, cy] = toXY(courierPosition.lat, courierPosition.lng);
      drawRoundedBadge(ctx, cx, cy, `🛵 ${courierPosition.label}`, '#EA580C', '#ffffff');
    }

    if (userLocation) {
      const [ux, uy] = toXY(userLocation[0], userLocation[1]);
      ctx.beginPath();
      ctx.arc(ux, uy, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ux, uy, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#2563EB';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    ctx.restore();
  }, [
    apartments,
    bookmarks,
    busRoute,
    busStops,
    courierPosition,
    deliveryStops,
    extraPlaces,
    incidents,
    liveBuses,
    mapNotes,
    noParkingSigns,
    osmParkings,
    paidParkings,
    places,
    qkTheme,
    routeCoordinates,
    selectedApartmentId,
    sergekCameras,
    showIsochrone,
    showQalaPlaces,
    showRoadSigns,
    simCarPosition,
    taxiEndpoints,
    trafficLights,
    trafficSegments,
    userLocation,
    viaWaypoint,
    view3d,
  ]);

  const renderCanvasRef = useRef(renderCanvas);
  renderCanvasRef.current = renderCanvas;

  // Sync external center/zoom props when changed by QalaMapModule
  useEffect(() => {
    const prev = lastPropViewRef.current;
    const propChanged =
      Math.abs(prev.lat - center[0]) + Math.abs(prev.lng - center[1]) + Math.abs(prev.zoom - zoom) > 0.0001;
    if (!propChanged) return;
    lastPropViewRef.current = { lat: center[0], lng: center[1], zoom };

    const cur = viewRef.current;
    const alreadyAtTarget =
      Math.abs(cur.lat - center[0]) + Math.abs(cur.lng - center[1]) + Math.abs(cur.zoom - zoom) < 0.0002;
    if (alreadyAtTarget) return;

    viewRef.current = {
      lat: center[0],
      lng: center[1],
      zoom: Math.max(11, Math.min(18.5, zoom)),
    };
    setDisplayZoom(viewRef.current.zoom);
    renderCanvas();
    scheduleFetch(40);
  }, [center, zoom, renderCanvas, scheduleFetch]);

  // Initial fetch & ResizeObserver
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      renderCanvasRef.current();
    });
    ro.observe(el);
    renderCanvasRef.current();
    scheduleFetch(30);
    return () => {
      ro.disconnect();
      if (fetchTimerRef.current !== null) {
        window.clearTimeout(fetchTimerRef.current);
      }
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
    };
  }, [scheduleFetch]);

  // Re-render whenever theme/layers/3d/overlays change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Re-fetch viewport when sign/place filters change
  useEffect(() => {
    scheduleFetch(60);
  }, [showRoadSigns, showQalaPlaces, scheduleFetch]);

  const zoomAt = useCallback(
    (newZoomRaw: number, pivotX?: number, pivotY?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = pivotX ?? rect.width / 2;
      const py = pivotY ?? rect.height / 2;

      const oldZ = viewRef.current.zoom;
      const newZ = Math.max(11, Math.min(18.5, newZoomRaw));
      if (Math.abs(newZ - oldZ) < 0.001) return;

      const sOld = zoomToScale(oldZ);
      const sNew = zoomToScale(newZ);

      const anchorLng = viewRef.current.lng + (px - rect.width / 2) / (M_PER_DEG_LON * sOld);
      const anchorLat = viewRef.current.lat - (py - rect.height / 2) / (M_PER_DEG_LAT * sOld);

      viewRef.current = {
        lat: anchorLat + (py - rect.height / 2) / (M_PER_DEG_LAT * sNew),
        lng: anchorLng - (px - rect.width / 2) / (M_PER_DEG_LON * sNew),
        zoom: newZ,
      };
      setDisplayZoom(newZ);
      renderCanvas();
      scheduleFetch(140);
      onViewportChange?.(viewRef.current.lat, viewRef.current.lng, newZ);
    },
    [onViewportChange, renderCanvas, scheduleFetch]
  );

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const delta = e.deltaY < 0 ? 0.55 : -0.55;
    zoomAt(viewRef.current.zoom + delta, e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleHitTestAndSelect = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const { lat: cLat, lng: cLng, zoom: z } = viewRef.current;
    const s = zoomToScale(z);

    const clickLng = cLng + (sx - rect.width / 2) / (M_PER_DEG_LON * s);
    const clickLat = cLat - (sy - rect.height / 2) / (M_PER_DEG_LAT * s);

    const toXY = (lat: number, lng: number): [number, number] => [
      rect.width / 2 + (lng - cLng) * M_PER_DEG_LON * s,
      rect.height / 2 - (lat - cLat) * M_PER_DEG_LAT * s,
    ];

    const distPx = (lat: number, lng: number) => {
      const [px, py] = toXY(lat, lng);
      return Math.hypot(px - sx, py - sy);
    };

    // 1. Apartments
    for (const apt of apartments) {
      if (distPx(apt.lat, apt.lng) <= 22) {
        onSelectApartment?.(apt);
        return;
      }
    }

    // 2. Bookmarks
    for (const bm of bookmarks) {
      if (distPx(bm.lat, bm.lng) <= 22) {
        onSelectFeature?.({
          kind: bm.kind === 'parking' ? 'parking' : 'place',
          title: bm.label,
          subtitle: bm.address,
          lat: bm.lat,
          lng: bm.lng,
          details: [['Закладка QALA', bm.address]],
        });
        return;
      }
    }

    // 3. Paid parkings
    for (const pk of paidParkings) {
      if (distPx(pk.lat, pk.lng) <= 22) {
        onSelectFeature?.({
          kind: 'parking',
          title: `Парковка №${pk.num}`,
          subtitle: pk.addr,
          lat: pk.lat,
          lng: pk.lng,
          details: [
            ['Тариф', `${pk.price} ₸/ч`],
            ['Мест', String(pk.spaces)],
            ['Зона', pk.zone],
          ],
        });
        return;
      }
    }

    // 4. QALA landmarks
    for (const pl of places) {
      if (distPx(pl.lat, pl.lng) <= 26) {
        onSelectFeature?.({
          kind: 'place',
          title: pl.name,
          subtitle: pl.address,
          lat: pl.lat,
          lng: pl.lng,
          details: pl.info ? [['Инфо', pl.info]] : undefined,
        });
        return;
      }
    }

    // 5. QalaKarta POIs (6,120 places)
    const qk = dataRef.current;
    if (qk && showQalaPlaces) {
      let bestPlace: QalaKartaPlaceItem | null = null;
      let bestDist = 16;
      for (const p of qk.places) {
        const d = distPx(p.lat, p.lng);
        if (d < bestDist) {
          bestDist = d;
          bestPlace = p;
        }
      }
      if (bestPlace) {
        const details: Array<[string, string]> = [['Категория', bestPlace.cat]];
        if (bestPlace.addr) details.push(['Адрес', bestPlace.addr]);
        if (bestPlace.hours) details.push(['Время работы', bestPlace.hours]);
        if (bestPlace.phone) details.push(['Телефон', bestPlace.phone]);
        if (bestPlace.website) details.push(['Сайт', bestPlace.website]);
        onSelectFeature?.({
          kind: 'place',
          title: bestPlace.name,
          subtitle: bestPlace.addr || bestPlace.cat,
          lat: bestPlace.lat,
          lng: bestPlace.lng,
          details,
        });
        return;
      }
    }

    // 6. QalaKarta Road Signs (6,310 signs)
    if (qk && showRoadSigns && z >= 13.4) {
      let bestSign: QalaKartaSignItem | null = null;
      let bestDist = 14;
      for (const sg of qk.signs) {
        const d = distPx(sg.lat, sg.lng);
        if (d < bestDist) {
          bestDist = d;
          bestSign = sg;
        }
      }
      if (bestSign) {
        const details: Array<[string, string]> = [
          ['Код знака', bestSign.code],
          ['Источник', 'QalaKarta · Дорожные знаки'],
        ];
        if (bestSign.hits) details.push(['Фиксаций', String(bestSign.hits)]);
        if (bestSign.label) details.push(['Пояснение', bestSign.label]);
        onSelectFeature?.({
          kind:
            bestSign.code === 'K'
              ? 'camera'
              : bestSign.code === 'L'
                ? 'trafficLight'
                : bestSign.code === 'J' || bestSign.code === 'B'
                  ? 'bus'
                  : 'noParking',
          title: bestSign.name,
          subtitle: 'Объект дорожной сети QalaKarta',
          lat: bestSign.lat,
          lng: bestSign.lng,
          details,
        });
        return;
      }
    }

    // 7. QalaKarta Buildings (point-in-polygon)
    if (qk && qk.buildings.length > 0) {
      let hitBuilding: QalaKartaBuilding | null = null;
      for (let i = qk.buildings.length - 1; i >= 0; i -= 1) {
        const b = qk.buildings[i];
        if (pointInPolygon(clickLat, clickLng, b.pts)) {
          hitBuilding = b;
          break;
        }
      }
      if (hitBuilding) {
        selectedBuildingIdRef.current = hitBuilding.id;
        renderCanvas();
        const details: Array<[string, string]> = [
          ['Высота (3D)', `${hitBuilding.height.toFixed(1)} м`],
        ];
        if (hitBuilding.levels) details.push(['Этажей', hitBuilding.levels]);
        if (hitBuilding.addr) details.push(['Адрес', hitBuilding.addr]);
        if (hitBuilding.amenity) details.push(['Назначение', hitBuilding.amenity]);
        if (hitBuilding.shop) details.push(['Магазин', hitBuilding.shop]);
        if (hitBuilding.hours) details.push(['Часы', hitBuilding.hours]);
        if (hitBuilding.phone) details.push(['Телефон', hitBuilding.phone]);
        onSelectFeature?.({
          kind: 'place',
          title: hitBuilding.name || hitBuilding.addr || `Здание #${hitBuilding.id}`,
          subtitle: hitBuilding.addr || 'Здание Астаны · QalaKarta',
          lat: clickLat,
          lng: clickLng,
          details,
        });
        return;
      }
    }

    selectedBuildingIdRef.current = null;
    renderCanvas();
    onMapClick?.(clickLat, clickLng);
  };

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden select-none ${className}`}>
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = {
            active: true,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const st = dragRef.current;
          if (!st.active || st.pointerId !== e.pointerId) {
            // Quick building/POI hover hint
            const qk = dataRef.current;
            if (qk && viewRef.current.zoom >= 14.5) {
              const rect = e.currentTarget.getBoundingClientRect();
              const sx = e.clientX - rect.left;
              const sy = e.clientY - rect.top;
              const s = zoomToScale(viewRef.current.zoom);
              const lat = viewRef.current.lat - (sy - rect.height / 2) / (M_PER_DEG_LAT * s);
              const lng = viewRef.current.lng + (sx - rect.width / 2) / (M_PER_DEG_LON * s);
              const hit = qk.buildings.find((b) => (b.name || b.addr) && pointInPolygon(lat, lng, b.pts));
              setHoverHint(hit ? `${hit.name || hit.addr}${hit.levels ? ` · ${hit.levels} эт.` : ''}` : null);
            } else if (hoverHint) {
              setHoverHint(null);
            }
            return;
          }

          const dx = e.clientX - st.lastX;
          const dy = e.clientY - st.lastY;
          st.lastX = e.clientX;
          st.lastY = e.clientY;
          if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) > 5) {
            st.moved = true;
          }

          const s = zoomToScale(viewRef.current.zoom);
          viewRef.current = {
            ...viewRef.current,
            lat: viewRef.current.lat + dy / (M_PER_DEG_LAT * s),
            lng: viewRef.current.lng - dx / (M_PER_DEG_LON * s),
          };
          renderCanvas();
        }}
        onPointerUp={(e) => {
          const st = dragRef.current;
          if (!st.active || st.pointerId !== e.pointerId) return;
          st.active = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          if (!st.moved) {
            handleHitTestAndSelect(e.clientX, e.clientY);
          } else {
            scheduleFetch(90);
            onViewportChange?.(viewRef.current.lat, viewRef.current.lng, viewRef.current.zoom);
          }
        }}
        className="h-full w-full cursor-grab active:cursor-grabbing touch-none block"
      />

      {/* Hover Building Tooltip */}
      {hoverHint && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 z-[460] rounded-xl bg-slate-900/90 px-3 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md">
          🏢 {hoverHint}
        </div>
      )}

      {/* Zoom & QalaKarta Status Controls (Bottom-Right) */}
      <div className="pointer-events-none absolute bottom-4 right-3.5 z-[470] flex flex-col items-end gap-1.5">
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/85 text-slate-900 shadow-xl backdrop-blur-md dark:border-white/15 dark:bg-slate-900/85 dark:text-slate-100">
          <button
            type="button"
            onClick={() => zoomAt(viewRef.current.zoom + 0.8)}
            title="Приблизить"
            aria-label="Приблизить карту"
            className="flex h-9 w-9 items-center justify-center text-base font-extrabold hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            +
          </button>
          <div className="border-y border-slate-200/70 px-1 py-0.5 text-center font-mono text-[9px] font-bold opacity-75 dark:border-white/10">
            {displayZoom.toFixed(1)}
          </div>
          <button
            type="button"
            onClick={() => zoomAt(viewRef.current.zoom - 0.8)}
            title="Отдалить"
            aria-label="Отдалить карту"
            className="flex h-9 w-9 items-center justify-center text-base font-extrabold hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            −
          </button>
        </div>

        <div className="rounded-xl bg-slate-900/75 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md">
          {loadingViewport ? 'QalaKarta · загрузка…' : 'QalaKarta Vector Engine · Астана'}
        </div>
      </div>
    </div>
  );
}
