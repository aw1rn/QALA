import {
  AlertTriangle,
  ArrowUpDown,
  Ban,
  Bookmark,
  Box,
  Building2,
  Bus,
  Camera,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  CreditCard,
  Gauge,
  History,
  Home as HomeIcon,
  Layers,
  LocateFixed,
  MapPin,
  Maximize,
  Minimize,
  Navigation,
  Palette,
  ParkingSquare,
  PhoneCall,
  Pin,
  Play,
  Plus,
  Radio,
  Search,
  Siren,
  Square,
  Star,
  TrafficCone,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASTANA_CENTER,
  ASTANA_PLACES,
  ASTANA_SERGEK_CAMERAS,
  ASTANA_TRAFFIC_SEGMENTS,
  BUS_ROUTES,
  TAXI_TARIFFS,
} from '../data/astanaData';
import type {
  ApartmentListing,
  AstanaMapLayers,
  AstanaPlace,
  AvtobysState,
  BookmarkKind,
  BusRouteInfo,
  CurrentGeoState,
  GeoSearchResult,
  LiveBusMarker,
  MapBookmark,
  MapLayerVisibility,
  MapNote,
  MapObjectCategory,
  MapSortMode,
  ParkingSession,
  QalaKartaStats,
  QalaKartaThemeId,
  RouteHistoryItem,
  RouteResult,
  TaxiTariffId,
  TomTomIncident,
} from '../types/qala';
import { AstanaMap, type SelectedMapFeature } from './AstanaMap';
import { QALAKARTA_THEMES, QalaKartaCanvas } from './QalaKartaCanvas';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pointNearPolyline(
  lat: number,
  lng: number,
  coords: Array<[number, number]>,
  thresholdMeters = 140
): boolean {
  for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 80))) {
    if (haversineMeters(lat, lng, coords[i][0], coords[i][1]) <= thresholdMeters) {
      return true;
    }
  }
  return false;
}

interface UnifiedMapItem {
  id: string;
  kind: Exclude<MapObjectCategory, 'all'>;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  distanceM: number;
  price: number;
  activity: number;
  badge: string;
  details?: Array<[string, string]>;
}

type PoiSubCategory =
  | 'all'
  | 'fuel'
  | 'pharmacy'
  | 'clinic'
  | 'cinema'
  | 'bank'
  | 'warm_stop'
  | 'ev'
  | 'coworking'
  | 'eco'
  | 'accessible';

const POI_SUBCATEGORIES: Array<{ id: PoiSubCategory; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'warm_stop', label: 'Тёплые ост.' },
  { id: 'ev', label: 'ЭЗС' },
  { id: 'coworking', label: 'Коворкинги' },
  { id: 'eco', label: 'Эко-пункты' },
  { id: 'accessible', label: 'Доступность' },
  { id: 'fuel', label: 'АЗС' },
  { id: 'pharmacy', label: 'Аптеки' },
  { id: 'clinic', label: 'Клиники' },
  { id: 'cinema', label: 'Кино' },
  { id: 'bank', label: 'Банки' },
];

interface QalaMapModuleProps {
  initialMode?: 'map' | 'bus' | 'taxi';
  initialDestination?: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null;
  initialRouteCoords?: Array<[number, number]>;
  apartments?: ApartmentListing[];
  currentLocation?: CurrentGeoState;
  isDetectingLocation?: boolean;
  onRefreshLocation?: () => Promise<CurrentGeoState | void>;
  onSetManualLocation?: (lat: number, lng: number, label?: string) => Promise<CurrentGeoState | void>;
  onToggleLiveTracking?: () => boolean;
  onWalletChange?: () => Promise<void>;
  onBookTaxi: (title: string, amount: number) => Promise<void>;
  onNotify: (msg: string) => void;
}

export function QalaMapModule({
  initialMode = 'map',
  initialDestination,
  initialRouteCoords,
  apartments = [],
  currentLocation,
  isDetectingLocation = false,
  onRefreshLocation,
  onSetManualLocation,
  onToggleLiveTracking,
  onWalletChange,
  onBookTaxi,
  onNotify,
}: QalaMapModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'map' | 'bus' | 'taxi'>(initialMode);
  const [tariffId, setTariffId] = useState<TaxiTariffId>('comfort');
  const [searchQuery, setSearchQuery] = useState('');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showLayerDrawer, setShowLayerDrawer] = useState(false);

  // Fullscreen state (Web Fullscreen API + CSS fallback)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const isFullscreen = isNativeFullscreen || isCssFullscreen;

  // Map data layers fetched from /api/map/layers
  const [layersData, setLayersData] = useState<AstanaMapLayers>({
    parkings: [],
    osmParkings: [],
    noParkingSigns: [],
    busStops: [],
    trafficLights: [],
    sergekCameras: [],
    speedCameras: [],
    crossings: [],
    placesExtra: [],
    tomtomConfigured: false,
  });

  // All toggleable layers
  const [visibility, setVisibility] = useState<MapLayerVisibility>({
    parkings: true,
    noParking: false,
    busStops: initialMode === 'bus' || initialMode === 'map',
    cameras: true,
    trafficLights: true,
    traffic: initialMode === 'taxi',
    tomtomLive: false,
    places: false,
    apartments: false,
  });
  const [showIncidents, setShowIncidents] = useState(true);
  const [incidents, setIncidents] = useState<TomTomIncident[]>([]);

  // Sorting & category filtering
  const [categoryFilter, setCategoryFilter] = useState<MapObjectCategory>('all');
  const [poiSubCategory, setPoiSubCategory] = useState<PoiSubCategory>('all');
  const [sortMode, setSortMode] = useState<MapSortMode>('distance');

  // Active routing & focus
  const [fromPlace, setFromPlace] = useState<AstanaPlace>(ASTANA_PLACES[0]);
  const [viaPlace, setViaPlace] = useState<AstanaPlace | null>(null);
  const [toPlace, setToPlace] = useState<AstanaPlace>(ASTANA_PLACES[1]);
  const [pickPinTarget, setPickPinTarget] = useState<'from' | 'via' | 'to' | 'me' | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeHistory, setRouteHistory] = useState<RouteHistoryItem[]>([]);
  const [showRouteHistory, setShowRouteHistory] = useState(false);
  const [selectedBusRoute, setSelectedBusRoute] = useState<BusRouteInfo | null>(
    initialMode === 'bus' ? BUS_ROUTES[0] : null
  );
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    currentLocation ? [currentLocation.lat, currentLocation.lng] : ASTANA_CENTER
  );
  const [mapZoom, setMapZoom] = useState<number>(initialMode === 'map' ? 14.8 : 13.4);
  const [selectedFeature, setSelectedFeature] = useState<SelectedMapFeature | null>(null);

  // QalaKarta Custom Vector 3D Engine state
  const [mapEngine, setMapEngine] = useState<'qalakarta' | 'osm'>(() => {
    try {
      const saved = localStorage.getItem('qala_map_engine_v1');
      if (saved === 'osm' || saved === 'qalakarta') return saved;
    } catch {
      // ignore
    }
    return 'qalakarta';
  });
  const [qkTheme, setQkTheme] = useState<QalaKartaThemeId>(() => {
    try {
      const saved = localStorage.getItem('qalakarta_theme_v1') as QalaKartaThemeId | null;
      if (saved && saved in QALAKARTA_THEMES) return saved;
    } catch {
      // ignore
    }
    return 'samal';
  });
  const [qkView3d, setQkView3d] = useState(true);
  const [qkShowSigns, setQkShowSigns] = useState(true);
  const [qkShowPlaces, setQkShowPlaces] = useState(true);
  const [qkIsochrone, setQkIsochrone] = useState(false);
  const [qkStats, setQkStats] = useState<QalaKartaStats | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('qala_map_engine_v1', mapEngine);
    } catch {
      // ignore
    }
  }, [mapEngine]);

  useEffect(() => {
    try {
      localStorage.setItem('qalakarta_theme_v1', qkTheme);
    } catch {
      // ignore
    }
  }, [qkTheme]);

  useEffect(() => {
    fetch('/api/qalakarta/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: QalaKartaStats | null) => {
        if (d?.isReady) setQkStats(d);
      })
      .catch(() => undefined);
  }, []);

  // Phase 2 & 3: GPS Geolocation, Bookmarks, Voice Navigation, Radar Warnings, Live Bus Tracking, Parking Timer, Avtobys, SOS
  const [localGps, setLocalGps] = useState<[number, number] | null>(null);
  const [localGpsLoading, setLocalGpsLoading] = useState(false);
  const effectiveLocation: [number, number] | null = useMemo(
    () =>
      currentLocation
        ? [currentLocation.lat, currentLocation.lng]
        : localGps,
    [currentLocation, localGps]
  );
  const gpsLoading = isDetectingLocation || localGpsLoading;

  const [bookmarks, setBookmarks] = useState<MapBookmark[]>([]);
  const [showBookmarkForm, setShowBookmarkForm] = useState(false);
  const [bookmarkLabelInput, setBookmarkLabelInput] = useState('');
  const [bookmarkKindInput, setBookmarkKindInput] = useState<BookmarkKind>('favorite');

  // Phase 4: Live geo search, Parked car pin & Personal Map Notes
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [geoSearching, setGeoSearching] = useState(false);
  const [mapNotes, setMapNotes] = useState<MapNote[]>([]);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [noteTitleInput, setNoteTitleInput] = useState('');
  const [noteTextInput, setNoteTextInput] = useState('');
  const [noteRatingInput, setNoteRatingInput] = useState(5);

  const [parkingSessions, setParkingSessions] = useState<ParkingSession[]>([]);
  const [parkingDurationMin, setParkingDurationMin] = useState<number>(60);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [avtobys, setAvtobys] = useState<AvtobysState>({
    balance: 2200,
    cardNumber: '9643 1084 5512 0194',
    trips: [],
  });
  const [showSosModal, setShowSosModal] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSimulatingDrive, setIsSimulatingDrive] = useState(false);
  const [simStepIdx, setSimStepIdx] = useState(0);
  const [radarAlert, setRadarAlert] = useState<string | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());

  const [busFromId, setBusFromId] = useState<string>(ASTANA_PLACES[0]?.id || 'baiterek');
  const [busToId, setBusToId] = useState<string>(ASTANA_PLACES[2]?.id || 'expo');
  const [busTick, setBusTick] = useState(0);

  const speakRu = useCallback((text: string, force = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!force && !voiceEnabled) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ru-RU';
      utter.rate = 1.03;
      const voices = window.speechSynthesis.getVoices();
      const ruVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ru'));
      if (ruVoice) utter.voice = ruVoice;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore speech synthesis restrictions
    }
  }, [voiceEnabled]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const r = await fetch('/api/map/bookmarks');
      if (r.ok) {
        const d = (await r.json()) as { bookmarks?: MapBookmark[] };
        setBookmarks(d.bookmarks || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadRouteHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/map/routes/history');
      if (r.ok) {
        const d = (await r.json()) as {
          routes?: RouteHistoryItem[];
          history?: RouteHistoryItem[];
        };
        setRouteHistory(d.routes || d.history || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadMapNotes = useCallback(async () => {
    try {
      const r = await fetch('/api/map/notes');
      if (r.ok) {
        const d = (await r.json()) as { notes?: MapNote[] };
        setMapNotes(d.notes || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadParkingSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/parking/sessions');
      if (r.ok) {
        const d = (await r.json()) as { sessions?: ParkingSession[] };
        setParkingSessions(d.sessions || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadAvtobys = useCallback(async () => {
    try {
      const r = await fetch('/api/avtobys');
      if (r.ok) {
        setAvtobys((await r.json()) as AvtobysState);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch('/api/map/layers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AstanaMapLayers | null) => {
        if (data) {
          setLayersData(data);
          if (data.tomtomConfigured) {
            setVisibility((prev) => ({ ...prev, tomtomLive: true }));
          }
        }
      })
      .catch(() => {});
    fetch('/api/map/tomtom/incidents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { incidents?: TomTomIncident[] } | null) => {
        if (data?.incidents) setIncidents(data.incidents);
      })
      .catch(() => {});
    loadBookmarks();
    loadRouteHistory();
    loadMapNotes();
    loadParkingSessions();
    loadAvtobys();
  }, [loadAvtobys, loadBookmarks, loadMapNotes, loadParkingSessions, loadRouteHistory]);

  // Debounced Live Geo Search (/api/geo/search)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setGeoResults([]);
      setGeoSearching(false);
      return;
    }
    setGeoSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = (await res.json()) as { results?: GeoSearchResult[] };
          setGeoResults(data.results || []);
        }
      } catch {
        setGeoResults([]);
      } finally {
        setGeoSearching(false);
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const activeParkingSession = useMemo(
    () => parkingSessions.find((s) => s.active) || null,
    [parkingSessions]
  );

  useEffect(() => {
    if (!activeParkingSession) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeParkingSession]);

  const parkingRemainingSec = activeParkingSession
    ? Math.max(0, Math.floor((new Date(activeParkingSession.endsAt).getTime() - nowTick) / 1000))
    : 0;

  useEffect(() => {
    setMode(initialMode);
    if (initialMode === 'taxi') {
      setVisibility((prev) => ({ ...prev, traffic: true, cameras: true, trafficLights: true }));
    } else if (initialMode === 'bus') {
      setVisibility((prev) => ({ ...prev, busStops: true }));
      setSelectedBusRoute((prev) => prev || BUS_ROUTES[0]);
    }
  }, [initialMode]);

  useEffect(() => {
    if (initialDestination) {
      const dest: AstanaPlace = {
        id: 'custom-dest',
        name: initialDestination.name,
        category: 'landmark',
        address: initialDestination.address,
        lat: initialDestination.lat,
        lng: initialDestination.lng,
      };
      setToPlace(dest);
      setMapCenter([dest.lat, dest.lng]);
      setMapZoom(14);
      setSelectedFeature({
        kind: 'place',
        title: dest.name,
        subtitle: dest.address,
        lat: dest.lat,
        lng: dest.lng,
      });
    }
  }, [initialDestination]);

  // Web Fullscreen API listener
  useEffect(() => {
    const onFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;
      setIsNativeFullscreen(Boolean(fsEl && fsEl === containerRef.current));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    const doc = document as unknown as {
      fullscreenElement?: Element | null;
      webkitFullscreenElement?: Element | null;
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const activeFsEl = doc.fullscreenElement || doc.webkitFullscreenElement;

    if (activeFsEl || isCssFullscreen) {
      setIsCssFullscreen(false);
      if (activeFsEl) {
        try {
          if (doc.exitFullscreen) await doc.exitFullscreen();
          else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      const target = el as unknown as {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      } else {
        setIsCssFullscreen(true);
      }
    } catch {
      setIsCssFullscreen(true);
    }
  }, [isCssFullscreen]);

  const buildRoute = useCallback(
    async (from: AstanaPlace, to: AstanaPlace, via?: AstanaPlace | null) => {
      try {
        const pts: Array<[number, number]> = via
          ? [
              [from.lat, from.lng],
              [via.lat, via.lng],
              [to.lat, to.lng],
            ]
          : [
              [from.lat, from.lng],
              [to.lat, to.lng],
            ];
        const res = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: pts }),
        });
        if (res.ok) {
          const json = (await res.json()) as RouteResult;
          setRouteResult(json);
          return json;
        }
      } catch {
        // ignore
      }
      return null;
    },
    []
  );

  useEffect(() => {
    if (initialRouteCoords && initialRouteCoords.length >= 2) {
      setRouteResult({
        distanceKm: 23.6,
        durationMin: 35,
        coordinates: initialRouteCoords,
        isLiveOsrm: true,
      });
    } else if (mode === 'taxi' || initialDestination) {
      void buildRoute(fromPlace, toPlace, viaPlace);
    }
  }, [buildRoute, fromPlace, initialDestination, initialRouteCoords, mode, toPlace, viaPlace]);

  const recordRouteHistory = useCallback(
    async (
      from: AstanaPlace,
      to: AstanaPlace,
      via: AstanaPlace | null,
      route: RouteResult | null,
      tripMode: 'taxi' | 'car' | 'bus' = 'taxi'
    ) => {
      try {
        await fetch('/api/map/routes/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromName: from.name,
            toName: to.name,
            viaName: via?.name || '',
            fromLat: from.lat,
            fromLng: from.lng,
            toLat: to.lat,
            toLng: to.lng,
            viaLat: via?.lat ?? null,
            viaLng: via?.lng ?? null,
            distanceKm: route?.distanceKm || 4.2,
            durationMin: route?.durationMin || 12,
            mode: tripMode,
          }),
        });
        await loadRouteHistory();
      } catch {
        // ignore
      }
    },
    [loadRouteHistory]
  );

  const handleGoHome = useCallback(() => {
    const homeBm = bookmarks.find((b) => b.kind === 'home');
    const dest: AstanaPlace = homeBm
      ? {
          id: 'home-bm',
          name: homeBm.label || 'Дом',
          category: 'landmark',
          address: homeBm.address,
          lat: homeBm.lat,
          lng: homeBm.lng,
        }
      : {
          id: 'home-default',
          name: 'Дом · Нұржол, 14',
          category: 'landmark',
          address: 'бульвар Нұржол, 14',
          lat: 51.1282,
          lng: 71.4304,
        };
    if (effectiveLocation) {
      setFromPlace({
        id: 'gps-from',
        name: currentLocation?.address || 'Моё местоположение',
        category: 'landmark',
        address: currentLocation?.address || 'Текущее GPS',
        lat: effectiveLocation[0],
        lng: effectiveLocation[1],
      });
    }
    setToPlace(dest);
    setMode('taxi');
    setMapCenter([dest.lat, dest.lng]);
    onNotify(`Построен маршрут домой: ${dest.name}`);
  }, [bookmarks, currentLocation?.address, effectiveLocation, onNotify]);

  // Count Traffic Lights & Sergek Cameras along active route
  const routeSafetyStats = useMemo(() => {
    const coords = routeResult?.coordinates || [];
    if (coords.length < 2) return { lights: 0, cameras: 0 };
    let lights = 0;
    let cameras = 0;
    for (const tl of layersData.trafficLights) {
      if (pointNearPolyline(tl.lat, tl.lng, coords, 90)) lights += 1;
    }
    for (const sk of layersData.sergekCameras) {
      if (pointNearPolyline(sk.lat, sk.lng, coords, 110)) cameras += 1;
    }
    return { lights, cameras };
  }, [layersData.sergekCameras, layersData.trafficLights, routeResult]);

  // Helper: Find top 5 nearest parkings (ЦОДД + OSM) around any point
  const getNearestParkings = useCallback(
    (lat: number, lng: number, limit = 5) => {
      const items: Array<{
        id: string;
        title: string;
        lat: number;
        lng: number;
        distM: number;
        walkMin: number;
        price: number;
        spaces: number;
      }> = [];

      for (const pk of layersData.parkings) {
        const distM = Math.round(haversineMeters(lat, lng, pk.lat, pk.lng));
        items.push({
          id: pk.id,
          title: pk.addr || `Парковка №${pk.num}`,
          lat: pk.lat,
          lng: pk.lng,
          distM,
          walkMin: Math.max(1, Math.round(distM / 75)),
          price: pk.price,
          spaces: pk.spaces,
        });
      }
      for (const op of layersData.osmParkings) {
        const distM = Math.round(haversineMeters(lat, lng, op.lat, op.lng));
        items.push({
          id: op.id,
          title: op.name,
          lat: op.lat,
          lng: op.lng,
          distM,
          walkMin: Math.max(1, Math.round(distM / 75)),
          price: 0,
          spaces: 0,
        });
      }
      items.sort((a, b) => a.distM - b.distM);
      return items.slice(0, limit);
    },
    [layersData.osmParkings, layersData.parkings]
  );

  const nearbyToFeature = useMemo(() => {
    if (!selectedFeature) return [];
    return getNearestParkings(selectedFeature.lat, selectedFeature.lng, 3);
  }, [getNearestParkings, selectedFeature]);

  const nearbyToTaxiDest = useMemo(() => {
    if (mode !== 'taxi') return [];
    return getNearestParkings(toPlace.lat, toPlace.lng, 4);
  }, [getNearestParkings, mode, toPlace.lat, toPlace.lng]);

  // Request live GPS geolocation (using shared hook when provided)
  const handleLocateMe = useCallback(async () => {
    if (onRefreshLocation) {
      const res = await onRefreshLocation();
      if (res) {
        setMapCenter([res.lat, res.lng]);
        setMapZoom(15);
        onNotify(`Геопозиция (${res.source === 'gps' ? 'GPS' : res.source === 'manual' ? 'Точка' : 'IP'}): ${res.address}`);
      }
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify('Геолокация не поддерживается — нажмите «Указать себя» на карте');
      return;
    }
    setLocalGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setLocalGps(coords);
        setMapCenter(coords);
        setMapZoom(15);
        setLocalGpsLoading(false);
        onNotify('Ваше местоположение определено по GPS');
      },
      () => {
        setLocalGpsLoading(false);
        onNotify('Нет доступа к GPS в браузере — нажмите «Указать себя» на карте');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, [onNotify, onRefreshLocation]);

  const handleStartParkingTimer = useCallback(
    async (title: string, zone: string, pricePerHour: number, durationMin: number) => {
      try {
        const res = await fetch('/api/parking/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parkingTitle: title,
            zone,
            pricePerHour,
            durationMin,
          }),
        });
        if (res.ok) {
          await loadParkingSessions();
          await onWalletChange?.();
          onNotify(`Паркомат запущен на ${durationMin} мин (${Math.round((pricePerHour * durationMin) / 60)} ₸)`);
        }
      } catch {
        onNotify('Не удалось запустить таймер парковки');
      }
    },
    [loadParkingSessions, onNotify, onWalletChange]
  );

  const handleExtendParking = useCallback(
    async (sessionId: string, extendMin: number) => {
      const res = await fetch(`/api/parking/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extendMin }),
      });
      if (res.ok) {
        await loadParkingSessions();
        await onWalletChange?.();
        onNotify(`Парковка продлена на +${extendMin} мин`);
      }
    },
    [loadParkingSessions, onNotify, onWalletChange]
  );

  const handleStopParking = useCallback(
    async (sessionId: string) => {
      const res = await fetch(`/api/parking/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) {
        await loadParkingSessions();
        onNotify('Парковочная сессия завершена');
      }
    },
    [loadParkingSessions, onNotify]
  );

  const handleAvtobysAction = useCallback(
    async (action: 'topup' | 'pay', amountOrFare = 1000) => {
      const payload =
        action === 'topup'
          ? { action: 'topup', amount: amountOrFare }
          : {
              action: 'pay',
              busNumber: selectedBusRoute?.number || '10',
              routeTitle: selectedBusRoute?.route || 'Маршрут по Астане',
              fare: 110,
            };
      const res = await fetch('/api/avtobys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as AvtobysState & { error?: string };
      if (!res.ok) {
        onNotify(json.error || 'Ошибка карты Avtobys');
        return;
      }
      setAvtobys({
        balance: json.balance,
        cardNumber: json.cardNumber,
        trips: json.trips || [],
      });
      await onWalletChange?.();
      onNotify(
        action === 'topup'
          ? `Карта Avtobys пополнена на +${amountOrFare} ₸`
          : `Оплата проезда №${selectedBusRoute?.number || '10'} · 110 ₸`
      );
    },
    [onNotify, onWalletChange, selectedBusRoute]
  );

  // Save & Delete Map Bookmarks
  const handleSaveBookmark = useCallback(
    async (label: string, kind: BookmarkKind, address: string, lat: number, lng: number) => {
      try {
        const res = await fetch('/api/map/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, kind, address, lat, lng }),
        });
        if (res.ok) {
          await loadBookmarks();
          setShowBookmarkForm(false);
          setBookmarkLabelInput('');
          onNotify(`Закладка «${label}» сохранена`);
        }
      } catch {
        onNotify('Не удалось сохранить закладку');
      }
    },
    [loadBookmarks, onNotify]
  );

  const handleDeleteBookmark = useCallback(
    async (id: string, label: string) => {
      try {
        await fetch(`/api/map/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadBookmarks();
        onNotify(`Закладка «${label}» удалена`);
      } catch {
        // ignore
      }
    },
    [loadBookmarks, onNotify]
  );

  // Phase 4: Parked Car Pin, Nearest Free Parking & Map Notes Handlers
  const parkedCarNote = useMemo(
    () => mapNotes.find((n) => n.kind === 'parked_car') || null,
    [mapNotes]
  );

  const parkedCarDistance = useMemo(() => {
    if (!parkedCarNote) return null;
    const ref = effectiveLocation || mapCenter;
    const distM = Math.round(haversineMeters(ref[0], ref[1], parkedCarNote.lat, parkedCarNote.lng));
    const walkMin = Math.max(1, Math.round(distM / 75));
    return { distM, walkMin };
  }, [effectiveLocation, mapCenter, parkedCarNote]);

  const handleParkCarHere = useCallback(async () => {
    const coords = effectiveLocation || mapCenter;
    const address =
      currentLocation?.address || `Астана (${coords[0].toFixed(4)}, ${coords[1].toFixed(4)})`;
    const res = await fetch('/api/map/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Моё авто (парковка)',
        note: `Зафиксировано в ${new Date().toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        kind: 'parked_car',
        rating: 5,
        address,
        lat: coords[0],
        lng: coords[1],
      }),
    });
    if (res.ok) {
      await loadMapNotes();
      setMapCenter(coords);
      setMapZoom(16);
      onNotify(`Точка парковки авто сохранена: ${address}`);
    }
  }, [currentLocation?.address, effectiveLocation, loadMapNotes, mapCenter, onNotify]);

  const handleSaveMapNote = useCallback(
    async (
      title: string,
      note: string,
      rating: number,
      address: string,
      lat: number,
      lng: number
    ) => {
      const res = await fetch('/api/map/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Заметка на карте',
          note: note.trim(),
          kind: 'note',
          rating,
          address,
          lat,
          lng,
        }),
      });
      if (res.ok) {
        await loadMapNotes();
        setNoteTitleInput('');
        setNoteTextInput('');
        onNotify(`Заметка «${title}» сохранена на карте`);
      }
    },
    [loadMapNotes, onNotify]
  );

  const handleDeleteMapNote = useCallback(
    async (id: string) => {
      await fetch(`/api/map/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadMapNotes();
    },
    [loadMapNotes]
  );

  const handleFindNearestFreeParking = useCallback(() => {
    const ref = effectiveLocation || mapCenter;
    const candidates = getNearestParkings(ref[0], ref[1], 40).filter((p) => p.price === 0);
    const best = candidates[0] || getNearestParkings(ref[0], ref[1], 1)[0];
    if (!best) {
      onNotify('Парковки ещё загружаются');
      return;
    }
    setVisibility((v) => ({ ...v, parkings: true }));
    setMapCenter([best.lat, best.lng]);
    setMapZoom(16);
    setSelectedFeature({
      kind: 'parking',
      title: best.title,
      subtitle:
        best.price === 0
          ? `Бесплатная парковка · ${best.distM} м (${best.walkMin} мин пешком)`
          : `Парковка · ${best.distM} м (${best.walkMin} мин)`,
      lat: best.lat,
      lng: best.lng,
      details: [
        ['Тариф', best.price === 0 ? 'Бесплатно' : `${best.price} ₸/час`],
        ['Расстояние', `${best.distM} м (~${best.walkMin} мин)`],
      ],
    });
    onNotify(`Ближайшая бесплатная парковка: ${best.title} (${best.distM} м)`);
  }, [effectiveLocation, getNearestParkings, mapCenter, onNotify]);

  // Voice announcement when route is built & voiceEnabled is ON
  useEffect(() => {
    if (!voiceEnabled || !routeResult || routeResult.coordinates.length < 2) return;
    speakRu(
      `Маршрут построен: ${routeResult.distanceKm} километра, время в пути ${routeResult.durationMin} минут. Светофоров по пути: ${routeSafetyStats.lights}, камер Сергек: ${routeSafetyStats.cameras}.`
    );
  }, [routeResult, routeSafetyStats.cameras, routeSafetyStats.lights, speakRu, voiceEnabled]);

  // Drive simulation timer for Sergek / 3.27 radar alerts
  useEffect(() => {
    if (!isSimulatingDrive || !routeResult?.coordinates.length) {
      return;
    }
    const coords = routeResult.coordinates;
    const timer = window.setInterval(() => {
      setSimStepIdx((prev) => {
        const next = prev + Math.max(1, Math.floor(coords.length / 36));
        if (next >= coords.length) {
          setIsSimulatingDrive(false);
          setRadarAlert(null);
          if (voiceEnabled) speakRu('Вы прибыли в точку назначения.', true);
          onNotify('Симуляция поездки завершена');
          return 0;
        }
        return next;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [isSimulatingDrive, onNotify, routeResult, speakRu, voiceEnabled]);

  const simCarPosition = useMemo<[number, number] | null>(() => {
    if (!isSimulatingDrive || !routeResult?.coordinates.length) return null;
    const idx = Math.min(simStepIdx, routeResult.coordinates.length - 1);
    return routeResult.coordinates[idx] || null;
  }, [isSimulatingDrive, routeResult, simStepIdx]);

  // Check Sergek & Sign 3.27 proximity while driving simulation runs
  useEffect(() => {
    if (!simCarPosition) {
      setRadarAlert(null);
      return;
    }
    const [lat, lng] = simCarPosition;

    for (const cam of ASTANA_SERGEK_CAMERAS) {
      const dist = Math.round(haversineMeters(lat, lng, cam.lat, cam.lng));
      if (dist <= 200) {
        const msg = `⚠️ Камера «${cam.name}» (${cam.limitKmh} км/ч) · ${dist} м`;
        setRadarAlert(msg);
        if (!spokenIdsRef.current.has(cam.id)) {
          spokenIdsRef.current.add(cam.id);
          if (voiceEnabled) speakRu(`Внимание! Камера Сергек, ограничение ${cam.limitKmh} километров в час.`);
        }
        return;
      }
    }

    for (const sk of layersData.sergekCameras) {
      const dist = Math.round(haversineMeters(lat, lng, sk.lat, sk.lng));
      if (dist <= 160) {
        const msg = `⚠️ Камера «Сергек» впереди · ${dist} м`;
        setRadarAlert(msg);
        if (!spokenIdsRef.current.has(sk.id)) {
          spokenIdsRef.current.add(sk.id);
          if (voiceEnabled) speakRu('Внимание! Впереди комплекс видеофиксации Сергек.');
        }
        return;
      }
    }

    for (const sg of layersData.noParkingSigns) {
      const p0 = sg.line[0];
      if (!p0) continue;
      const dist = Math.round(haversineMeters(lat, lng, p0[0], p0[1]));
      if (dist <= 110) {
        const msg = `🚫 Зона знака ${sg.sign} рядом · ${dist} м`;
        setRadarAlert(msg);
        if (!spokenIdsRef.current.has(sg.id)) {
          spokenIdsRef.current.add(sg.id);
          if (voiceEnabled) speakRu(`Рядом зона действия знака ${sg.sign}, стоянка запрещена.`);
        }
        return;
      }
    }

    setRadarAlert(null);
  }, [layersData.noParkingSigns, layersData.sergekCameras, simCarPosition, speakRu, voiceEnabled]);

  // Bus A->B matcher + live animated buses along active route
  useEffect(() => {
    if (mode !== 'bus') return;
    const t = window.setInterval(() => {
      setBusTick((v) => v + 1);
    }, 1200);
    return () => window.clearInterval(t);
  }, [mode]);

  const rankedBusRoutes = useMemo(() => {
    const placeA = ASTANA_PLACES.find((p) => p.id === busFromId);
    const placeB = ASTANA_PLACES.find((p) => p.id === busToId);
    if (!placeA || !placeB) {
      return BUS_ROUTES.map((b) => ({ route: b, nearAM: 0, nearBM: 0, score: 0 }));
    }
    return [...BUS_ROUTES]
      .map((b) => {
        let nearAM = Infinity;
        let nearBM = Infinity;
        for (const wp of b.waypoints) {
          nearAM = Math.min(nearAM, haversineMeters(placeA.lat, placeA.lng, wp.lat, wp.lng));
          nearBM = Math.min(nearBM, haversineMeters(placeB.lat, placeB.lng, wp.lat, wp.lng));
        }
        return {
          route: b,
          nearAM: Math.round(nearAM),
          nearBM: Math.round(nearBM),
          score: Math.round(nearAM + nearBM),
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [busFromId, busToId]);

  const liveBuses = useMemo<LiveBusMarker[]>(() => {
    if (mode !== 'bus' || !selectedBusRoute || selectedBusRoute.waypoints.length < 2) return [];
    const wps = selectedBusRoute.waypoints;
    const totalSegs = wps.length - 1;
    const buildBus = (id: string, phaseOffset: number): LiveBusMarker => {
      const cycle = ((busTick * 0.14 + phaseOffset) % totalSegs + totalSegs) % totalSegs;
      const segIdx = Math.floor(cycle);
      const frac = cycle - segIdx;
      const a = wps[segIdx];
      const b = wps[Math.min(segIdx + 1, wps.length - 1)];
      const lat = a.lat + (b.lat - a.lat) * frac;
      const lng = a.lng + (b.lng - a.lng) * frac;
      const distM = haversineMeters(lat, lng, b.lat, b.lng);
      const etaMin = Math.max(1, Math.round(distM / 340));
      return {
        id,
        number: selectedBusRoute.number,
        lat,
        lng,
        color: selectedBusRoute.color,
        nextStop: b.name,
        etaMin,
      };
    };
    return [buildBus('bus-1', 0.15), buildBus('bus-2', totalSegs * 0.55)];
  }, [busTick, mode, selectedBusRoute]);

  // Unified Sortable & Filterable List of Astana Map Objects
  const filteredExtraPlaces = useMemo(() => {
    if (poiSubCategory === 'all') return layersData.placesExtra;
    return layersData.placesExtra.filter((ex) => {
      const cat = ex.category.toLowerCase();
      if (poiSubCategory === 'warm_stop') return cat === 'warm_stop' || cat.includes('тёпл');
      if (poiSubCategory === 'ev') return cat === 'ev' || cat.includes('эзс') || cat.includes('charg');
      if (poiSubCategory === 'coworking') return cat === 'coworking' || cat.includes('коворк');
      if (poiSubCategory === 'eco') return cat === 'eco' || cat.includes('эко') || cat.includes('recycl');
      if (poiSubCategory === 'accessible') return cat === 'accessible' || cat.includes('доступ');
      if (poiSubCategory === 'fuel') return cat.includes('fuel') || cat.includes('азс') || cat.includes('gas');
      if (poiSubCategory === 'pharmacy') return cat.includes('pharm') || cat.includes('аптек');
      if (poiSubCategory === 'clinic') return cat.includes('clinic') || cat.includes('hosp') || cat.includes('клиник') || cat.includes('больниц');
      if (poiSubCategory === 'cinema') return cat.includes('cinem') || cat.includes('кино');
      if (poiSubCategory === 'bank') return cat.includes('bank') || cat.includes('atm') || cat.includes('банк');
      return true;
    });
  }, [layersData.placesExtra, poiSubCategory]);

  const sortedItems = useMemo<UnifiedMapItem[]>(() => {
    const refLat = effectiveLocation ? effectiveLocation[0] : mapCenter[0];
    const refLng = effectiveLocation ? effectiveLocation[1] : mapCenter[1];
    const q = searchQuery.trim().toLowerCase();
    const list: UnifiedMapItem[] = [];

    if (categoryFilter === 'all' || categoryFilter === 'parking') {
      for (const pk of layersData.parkings) {
        const title = pk.addr || `Парковка №${pk.num}`;
        if (
          q &&
          !title.toLowerCase().includes(q) &&
          !pk.zone.toLowerCase().includes(q) &&
          !pk.desc.toLowerCase().includes(q)
        ) {
          continue;
        }
        list.push({
          id: pk.id,
          kind: 'parking',
          title,
          subtitle: `Зона ${pk.zone || pk.num} · ${pk.spaces} мест`,
          lat: pk.lat,
          lng: pk.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, pk.lat, pk.lng)),
          price: pk.price,
          activity: pk.spaces,
          badge: pk.price > 0 ? `${pk.price} ₸/ч` : 'Беспл.',
          details: [
            ['Тариф', pk.price > 0 ? `${pk.price} ₸/ч` : 'Бесплатно'],
            ['Мест', String(pk.spaces || '—')],
            ['Зона', pk.zone || pk.num],
            ['Описание', pk.desc || 'ЦОДД Астаны'],
          ],
        });
      }
    }

    if (categoryFilter === 'all' || categoryFilter === 'bus') {
      for (const bs of layersData.busStops) {
        if (
          q &&
          !bs.name.toLowerCase().includes(q) &&
          !bs.nameKk.toLowerCase().includes(q) &&
          !bs.routes.toLowerCase().includes(q)
        ) {
          continue;
        }
        list.push({
          id: bs.id,
          kind: 'bus',
          title: bs.name,
          subtitle: bs.routes ? `Маршруты: ${bs.routes}` : 'Остановка общественного транспорта',
          lat: bs.lat,
          lng: bs.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, bs.lat, bs.lng)),
          price: 110,
          activity: bs.routes ? bs.routes.split(/[;,]/).length : 1,
          badge: 'Авт.',
          details: bs.routes ? [['Маршруты', bs.routes]] : undefined,
        });
      }
    }

    if (categoryFilter === 'all' || categoryFilter === 'camera') {
      for (const cam of ASTANA_SERGEK_CAMERAS) {
        if (q && !cam.name.toLowerCase().includes(q) && !cam.intersection.toLowerCase().includes(q)) {
          continue;
        }
        list.push({
          id: cam.id,
          kind: 'camera',
          title: cam.name,
          subtitle: cam.intersection,
          lat: cam.lat,
          lng: cam.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, cam.lat, cam.lng)),
          price: 0,
          activity: 999999,
          badge: `${cam.limitKmh} км/ч`,
          details: [['Лимит скорости', `${cam.limitKmh} км/ч`]],
        });
      }
      for (const sk of layersData.sergekCameras) {
        if (q && !'сергек камера видеофиксация'.includes(q)) continue;
        list.push({
          id: sk.id,
          kind: 'camera',
          title: 'Комплекс «Сергек»',
          subtitle: sk.hits
            ? `${sk.hits.toLocaleString('ru-RU')} авто/нед`
            : `${sk.lat.toFixed(4)}, ${sk.lng.toFixed(4)}`,
          lat: sk.lat,
          lng: sk.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, sk.lat, sk.lng)),
          price: 0,
          activity: sk.hits || 100,
          badge: 'Сергек',
          details: sk.hits
            ? [['Трафик', `${sk.hits.toLocaleString('ru-RU')} авто/нед`]]
            : undefined,
        });
      }
    }

    if (categoryFilter === 'all' || categoryFilter === 'trafficLight') {
      for (const tl of layersData.trafficLights) {
        if (q && !'светофор перекресток'.includes(q)) continue;
        list.push({
          id: tl.id,
          kind: 'trafficLight',
          title: 'Светофорный объект',
          subtitle: `${tl.lat.toFixed(5)}, ${tl.lng.toFixed(5)}`,
          lat: tl.lat,
          lng: tl.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, tl.lat, tl.lng)),
          price: 0,
          activity: 1,
          badge: 'Свет.',
        });
      }
    }

    if (categoryFilter === 'all' || categoryFilter === 'place') {
      for (const p of ASTANA_PLACES) {
        if (
          q &&
          !p.name.toLowerCase().includes(q) &&
          !p.address.toLowerCase().includes(q)
        ) {
          continue;
        }
        list.push({
          id: p.id,
          kind: 'place',
          title: p.name,
          subtitle: p.address,
          lat: p.lat,
          lng: p.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, p.lat, p.lng)),
          price: 0,
          activity: 500,
          badge: 'Место',
          details: p.info ? [['Инфо', p.info]] : undefined,
        });
      }
      for (const ex of filteredExtraPlaces) {
        if (
          q &&
          !ex.name.toLowerCase().includes(q) &&
          !ex.address.toLowerCase().includes(q) &&
          !ex.category.toLowerCase().includes(q)
        ) {
          continue;
        }
        list.push({
          id: ex.id,
          kind: 'place',
          title: ex.name,
          subtitle: ex.address || ex.category,
          lat: ex.lat,
          lng: ex.lng,
          distanceM: Math.round(haversineMeters(refLat, refLng, ex.lat, ex.lng)),
          price: 0,
          activity: 200,
          badge: ex.category,
          details: [
            ['Категория', ex.category],
            ...(ex.phone ? ([['Телефон', ex.phone]] as Array<[string, string]>) : []),
            ...(ex.hours ? ([['Часы', ex.hours]] as Array<[string, string]>) : []),
          ],
        });
      }
    }

    list.sort((a, b) => {
      if (sortMode === 'name') return a.title.localeCompare(b.title, 'ru');
      if (sortMode === 'priceAsc') return a.price - b.price || a.distanceM - b.distanceM;
      if (sortMode === 'priceDesc') return b.price - a.price || a.distanceM - b.distanceM;
      if (sortMode === 'activity') return b.activity - a.activity || a.distanceM - b.distanceM;
      return a.distanceM - b.distanceM;
    });

    return list.slice(0, 120);
  }, [
    categoryFilter,
    effectiveLocation,
    filteredExtraPlaces,
    layersData.busStops,
    layersData.parkings,
    layersData.sergekCameras,
    layersData.trafficLights,
    mapCenter,
    searchQuery,
    sortMode,
  ]);

  const toggleLayer = (key: keyof MapLayerVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyLayerPreset = (preset: 'all' | 'driver' | 'transit' | 'minimal') => {
    if (preset === 'all') {
      setVisibility({
        parkings: true,
        noParking: true,
        busStops: true,
        cameras: true,
        trafficLights: true,
        traffic: true,
        tomtomLive: layersData.tomtomConfigured,
        places: true,
        apartments: true,
      });
    } else if (preset === 'driver') {
      setVisibility({
        parkings: true,
        noParking: true,
        busStops: false,
        cameras: true,
        trafficLights: true,
        traffic: true,
        tomtomLive: layersData.tomtomConfigured,
        places: false,
        apartments: false,
      });
    } else if (preset === 'transit') {
      setVisibility({
        parkings: false,
        noParking: false,
        busStops: true,
        cameras: false,
        trafficLights: true,
        traffic: true,
        tomtomLive: false,
        places: false,
        apartments: false,
      });
    } else {
      setVisibility({
        parkings: false,
        noParking: false,
        busStops: false,
        cameras: false,
        trafficLights: false,
        traffic: false,
        tomtomLive: false,
        places: false,
        apartments: false,
      });
    }
  };

  const distanceKm = routeResult?.distanceKm || 4.2;
  const activeTariff = TAXI_TARIFFS.find((t) => t.id === tariffId) || TAXI_TARIFFS[1];
  const calcTariffPrice = (baseFare: number, perKm: number) =>
    Math.max(700, Math.round((baseFare + distanceKm * perKm) / 50) * 50);
  const estimatedTaxiPrice = calcTariffPrice(activeTariff.baseFare, activeTariff.perKm);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      let resolvedAddress = `Астана (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      let resolvedLandmark = '';
      try {
        const revRes = await fetch(
          `/api/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
        );
        if (revRes.ok) {
          const rev = (await revRes.json()) as {
            address?: string;
            nearestLandmark?: string;
          };
          if (rev.address) resolvedAddress = rev.address;
          if (rev.nearestLandmark) resolvedLandmark = rev.nearestLandmark;
        }
      } catch {
        // fallback to coords
      }

      if (pickPinTarget === 'me') {
        if (onSetManualLocation) {
          await onSetManualLocation(lat, lng, resolvedAddress);
        } else {
          setLocalGps([lat, lng]);
        }
        setMapCenter([lat, lng]);
        setMapZoom(15);
        setPickPinTarget(null);
        onNotify(`Моё гео обновлено: ${resolvedAddress}`);
        return;
      }

      if (!pickPinTarget) {
        setSelectedFeature({
          kind: 'place',
          title: resolvedAddress,
          subtitle: resolvedLandmark ? `Рядом: ${resolvedLandmark}` : 'Выбранная точка на карте Астаны',
          lat,
          lng,
          details: [
            ['Координаты', `${lat.toFixed(5)}, ${lng.toFixed(5)}`],
            ...(resolvedLandmark ? ([['Ориентир', resolvedLandmark]] as Array<[string, string]>) : []),
          ],
        });
        return;
      }

      const customPoint: AstanaPlace = {
        id: `pin-${pickPinTarget}-${Date.now()}`,
        name: resolvedAddress,
        category: 'landmark',
        address: resolvedLandmark ? `Рядом: ${resolvedLandmark}` : 'Выбрано на карте Астаны',
        lat,
        lng,
      };
      if (pickPinTarget === 'from') {
        setFromPlace(customPoint);
        onNotify(`Точка А: ${resolvedAddress}`);
      } else if (pickPinTarget === 'via') {
        setViaPlace(customPoint);
        onNotify(`Заезд C: ${resolvedAddress}`);
      } else {
        setToPlace(customPoint);
        onNotify(`Точка Б: ${resolvedAddress}`);
      }
      setPickPinTarget(null);
    },
    [onNotify, onSetManualLocation, pickPinTarget]
  );

  const layerItems: Array<{
    key: keyof MapLayerVisibility;
    label: string;
    count: number | string;
    icon: typeof ParkingSquare;
    activeClass: string;
    disabled?: boolean;
  }> = [
    {
      key: 'parkings',
      label: 'Парковки ЦОДД',
      count: layersData.parkings.length + layersData.osmParkings.length,
      icon: ParkingSquare,
      activeClass: 'bg-blue-600 text-white',
    },
    {
      key: 'noParking',
      label: 'Знаки 3.27/3.28',
      count: layersData.noParkingSigns.length,
      icon: Ban,
      activeClass: 'bg-rose-600 text-white',
    },
    {
      key: 'busStops',
      label: 'Остановки',
      count: layersData.busStops.length,
      icon: Bus,
      activeClass: 'bg-sky-600 text-white',
    },
    {
      key: 'cameras',
      label: 'Камеры Сергек',
      count: layersData.sergekCameras.length + ASTANA_SERGEK_CAMERAS.length,
      icon: Camera,
      activeClass: 'bg-violet-600 text-white',
    },
    {
      key: 'trafficLights',
      label: 'Светофоры',
      count: layersData.trafficLights.length,
      icon: TrafficCone,
      activeClass: 'bg-amber-500 text-slate-950',
    },
    {
      key: 'traffic',
      label: 'Пробки',
      count: ASTANA_TRAFFIC_SEGMENTS.length,
      icon: Gauge,
      activeClass: 'bg-rose-600 text-white',
    },
    {
      key: 'tomtomLive',
      label: 'TomTom Live',
      count: layersData.tomtomConfigured ? 'API' : 'Нет ключа',
      icon: Radio,
      activeClass: 'bg-emerald-600 text-white',
      disabled: !layersData.tomtomConfigured,
    },
    {
      key: 'places',
      label: 'Места и АЗС',
      count: layersData.placesExtra.length,
      icon: MapPin,
      activeClass: 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950',
    },
    {
      key: 'apartments',
      label: 'Жильё Qala Үй',
      count: apartments.length,
      icon: Building2,
      activeClass: 'bg-emerald-700 text-white',
    },
  ];

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9999] h-screen w-screen bg-slate-950 overflow-hidden'
          : 'relative h-[calc(100vh-132px)] min-h-[580px] w-full overflow-hidden rounded-3xl border border-white/80 dark:border-white/15 shadow-2xl'
      }
    >
      {/* FULL-BLEED INTERACTIVE ASTANA MAP (QalaKarta Vector 3D or OSM Leaflet) */}
      {mapEngine === 'qalakarta' ? (
        <QalaKartaCanvas
          center={mapCenter}
          zoom={mapZoom}
          qkTheme={qkTheme}
          view3d={qkView3d}
          showRoadSigns={qkShowSigns}
          showQalaPlaces={qkShowPlaces}
          showIsochrone={qkIsochrone}
          places={ASTANA_PLACES}
          apartments={visibility.apartments ? apartments : []}
          paidParkings={visibility.parkings ? layersData.parkings : []}
          osmParkings={visibility.parkings ? layersData.osmParkings : []}
          noParkingSigns={visibility.noParking ? layersData.noParkingSigns : []}
          busStops={visibility.busStops ? layersData.busStops : []}
          trafficLights={visibility.trafficLights ? layersData.trafficLights : []}
          sergekPoints={visibility.cameras ? layersData.sergekCameras : []}
          sergekCameras={visibility.cameras ? ASTANA_SERGEK_CAMERAS : []}
          extraPlaces={visibility.places ? filteredExtraPlaces : []}
          trafficSegments={visibility.traffic ? ASTANA_TRAFFIC_SEGMENTS : []}
          incidents={showIncidents ? incidents : []}
          busRoute={mode === 'bus' ? selectedBusRoute : null}
          routeCoordinates={mode !== 'bus' ? routeResult?.coordinates || [] : []}
          taxiEndpoints={
            mode === 'taxi' || routeResult?.coordinates?.length
              ? {
                  from: { name: fromPlace.name, lat: fromPlace.lat, lng: fromPlace.lng },
                  to: { name: toPlace.name, lat: toPlace.lat, lng: toPlace.lng },
                }
              : null
          }
          viaWaypoint={
            mode === 'taxi' && viaPlace
              ? { name: viaPlace.name, lat: viaPlace.lat, lng: viaPlace.lng }
              : null
          }
          userLocation={effectiveLocation}
          bookmarks={bookmarks}
          mapNotes={mapNotes}
          liveBuses={liveBuses}
          simCarPosition={simCarPosition}
          onSelectFeature={(f) => {
            setSelectedFeature(f);
            setShowBookmarkForm(false);
          }}
          onMapClick={handleMapClick}
          onStatsLoaded={(s) => setQkStats(s)}
          onViewportChange={(lat, lng, z) => {
            setMapCenter([lat, lng]);
            setMapZoom(z);
          }}
          className="h-full w-full"
        />
      ) : (
        <AstanaMap
          center={mapCenter}
          zoom={Math.round(mapZoom)}
          places={ASTANA_PLACES}
          apartments={visibility.apartments ? apartments : []}
          paidParkings={visibility.parkings ? layersData.parkings : []}
          osmParkings={visibility.parkings ? layersData.osmParkings : []}
          noParkingSigns={visibility.noParking ? layersData.noParkingSigns : []}
          busStops={visibility.busStops ? layersData.busStops : []}
          trafficLights={visibility.trafficLights ? layersData.trafficLights : []}
          sergekPoints={visibility.cameras ? layersData.sergekCameras : []}
          sergekCameras={visibility.cameras ? ASTANA_SERGEK_CAMERAS : []}
          extraPlaces={visibility.places ? filteredExtraPlaces : []}
          trafficSegments={visibility.traffic ? ASTANA_TRAFFIC_SEGMENTS : []}
          incidents={showIncidents ? incidents : []}
          tomtomLiveEnabled={visibility.tomtomLive && layersData.tomtomConfigured}
          busRoute={mode === 'bus' ? selectedBusRoute : null}
          routeCoordinates={mode !== 'bus' ? routeResult?.coordinates || [] : []}
          taxiEndpoints={
            mode === 'taxi' || routeResult?.coordinates?.length
              ? {
                  from: { name: fromPlace.name, lat: fromPlace.lat, lng: fromPlace.lng },
                  to: { name: toPlace.name, lat: toPlace.lat, lng: toPlace.lng },
                }
              : null
          }
          viaWaypoint={
            mode === 'taxi' && viaPlace
              ? { name: viaPlace.name, lat: viaPlace.lat, lng: viaPlace.lng }
              : null
          }
          userLocation={effectiveLocation}
          bookmarks={bookmarks}
          mapNotes={mapNotes}
          liveBuses={liveBuses}
          simCarPosition={simCarPosition}
          onSelectFeature={(f) => {
            setSelectedFeature(f);
            setShowBookmarkForm(false);
          }}
          onMapClick={handleMapClick}
          className="h-full w-full"
        />
      )}

      {/* FLOATING LIVE RADAR / SERGEK, PARKED CAR OR ACTIVE PARKING TIMER BANNER */}
      <div className="pointer-events-none absolute top-3.5 left-1/2 z-[520] flex -translate-x-1/2 flex-col items-center gap-1.5">
        {parkedCarNote && parkedCarDistance && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-700/95 px-3 py-1.5 text-[11px] font-bold text-white shadow-xl backdrop-blur-md">
            <span>🚗</span>
            <span className="truncate max-w-[140px]">Авто: {parkedCarDistance.distM} м ({parkedCarDistance.walkMin} мин)</span>
            <button
              type="button"
              onClick={() => {
                setToPlace({
                  id: 'parked-car-dest',
                  name: 'Моё авто',
                  category: 'parking',
                  address: parkedCarNote.address,
                  lat: parkedCarNote.lat,
                  lng: parkedCarNote.lng,
                });
                setMode('taxi');
                setMapCenter([parkedCarNote.lat, parkedCarNote.lng]);
                setMapZoom(16);
              }}
              className="rounded-lg bg-white/20 px-2 py-0.5 text-[10px] hover:bg-white/30"
            >
              К авто
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteMapNote(parkedCarNote.id)}
              aria-label="Убрать точку парковки авто"
              className="rounded-lg bg-black/20 px-1.5 py-0.5 text-[10px] hover:bg-black/35"
            >
              ×
            </button>
          </div>
        )}
        {radarAlert && (
          <div className="rounded-2xl border border-rose-400/50 bg-rose-600/95 px-4 py-2 text-xs font-extrabold text-white shadow-2xl backdrop-blur-md whitespace-nowrap">
            {radarAlert}
          </div>
        )}
        {activeParkingSession && (
          <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-xs font-bold shadow-2xl backdrop-blur-md ${
              parkingRemainingSec <= 300
                ? 'border-rose-400 bg-rose-600 text-white'
                : 'border-blue-400/50 bg-slate-900/90 text-white'
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[150px]">{activeParkingSession.parkingTitle}</span>
            <span className="font-mono tabular-nums">
              {String(Math.floor(parkingRemainingSec / 60)).padStart(2, '0')}:
              {String(parkingRemainingSec % 60).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => void handleExtendParking(activeParkingSession.id, 30)}
              className="rounded-lg bg-white/20 px-2 py-0.5 text-[10px] hover:bg-white/30"
            >
              +30м
            </button>
            <button
              type="button"
              onClick={() => void handleStopParking(activeParkingSession.id)}
              className="rounded-lg bg-rose-500 px-2 py-0.5 text-[10px] hover:bg-rose-400"
            >
              Стоп
            </button>
          </div>
        )}
      </div>

      {/* TOP-RIGHT FLOATING ACTION CONTROLS (SOS + GPS + Pin Me + Layers Drawer + Fullscreen) */}
      <div className="pointer-events-none absolute top-3.5 right-3.5 z-[500] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setShowSosModal(true)}
            title="Экстренные службы Астаны (109 / 112)"
            className="flex min-h-[40px] items-center gap-1 rounded-2xl bg-rose-600 px-3 py-2 text-xs font-extrabold text-white shadow-lg hover:bg-rose-500"
          >
            <Siren className="h-3.5 w-3.5" />
            <span>109</span>
          </button>

          <button
            type="button"
            onClick={() => void handleLocateMe()}
            title={
              currentLocation
                ? `${currentLocation.address} (${currentLocation.source.toUpperCase()})`
                : 'Моё местоположение (GPS)'
            }
            aria-label="Моё местоположение (GPS)"
            className={`liquid-glass flex min-h-[40px] items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold shadow-lg transition-colors ${
              effectiveLocation
                ? 'text-blue-600 dark:text-sky-400 ring-2 ring-blue-500/40'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            <LocateFixed className={`h-4 w-4 ${gpsLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline max-w-[140px] truncate">
              {gpsLoading ? 'Поиск GPS…' : currentLocation?.address || 'Моё GPS'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPickPinTarget((prev) => (prev === 'me' ? null : 'me'))}
            title="Указать своё местоположение вручную на карте"
            className={`liquid-glass flex min-h-[40px] items-center gap-1 rounded-2xl px-2.5 py-2 text-xs font-bold shadow-lg transition-colors ${
              pickPinTarget === 'me'
                ? 'bg-blue-600 text-white'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">
              {pickPinTarget === 'me' ? 'Клик на карту…' : 'Я здесь'}
            </span>
          </button>

          {onToggleLiveTracking && (
            <button
              type="button"
              onClick={() => {
                const on = onToggleLiveTracking();
                onNotify(on ? 'Непрерывный GPS-трекинг включён' : 'GPS-трекинг остановлен');
              }}
              title="Автообновление геопозиции в реальном времени"
              className={`liquid-glass flex min-h-[40px] items-center gap-1 rounded-2xl px-2.5 py-2 text-[11px] font-bold shadow-lg ${
                currentLocation?.tracking
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{currentLocation?.tracking ? 'Трекинг' : 'Live'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleParkCarHere()}
            title="Запомнить где я припарковал авто"
            className={`liquid-glass flex min-h-[40px] items-center gap-1 rounded-2xl px-2.5 py-2 text-xs font-bold shadow-lg transition-colors ${
              parkedCarNote
                ? 'bg-emerald-600 text-white'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            <Car className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Я припарковался</span>
          </button>

          <button
            type="button"
            onClick={handleFindNearestFreeParking}
            title="Найти ближайшую бесплатную парковку рядом"
            className="liquid-glass flex min-h-[40px] items-center gap-1 rounded-2xl px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-lg"
          >
            <ParkingSquare className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden xl:inline">Беспл. P</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNotesDrawer((v) => !v)}
            title="Мои заметки на карте"
            className={`liquid-glass flex min-h-[40px] items-center gap-1 rounded-2xl px-2.5 py-2 text-xs font-bold shadow-lg ${
              showNotesDrawer ? 'bg-rose-600 text-white' : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            <Pin className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Заметки ({mapNotes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLayerDrawer((v) => !v)}
            className="liquid-glass flex min-h-[40px] items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-lg"
          >
            <Layers className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>Слои карты</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Выйти из полного экрана' : 'Карта на весь экран'}
            aria-label={isFullscreen ? 'Выйти из полного экрана' : 'Карта на весь экран'}
            className="liquid-glass flex h-10 w-10 items-center justify-center rounded-2xl text-slate-900 dark:text-slate-100 shadow-lg hover:scale-105 transition-transform"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>

        {/* QALAKARTA ENGINE & THEME TOOLBAR */}
        <div className="pointer-events-auto liquid-glass flex flex-wrap items-center justify-end gap-1.5 rounded-2xl px-2.5 py-1.5 shadow-lg">
          <div className="flex rounded-xl bg-white/70 p-0.5 border border-white/80 dark:bg-slate-900/70 dark:border-white/10">
            <button
              type="button"
              onClick={() => setMapEngine('qalakarta')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-colors ${
                mapEngine === 'qalakarta'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              QalaKarta · 3D
            </button>
            <button
              type="button"
              onClick={() => setMapEngine('osm')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                mapEngine === 'osm'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              OSM Карта
            </button>
          </div>

          {mapEngine === 'qalakarta' && (
            <>
              <div className="flex items-center gap-1 rounded-xl bg-white/60 px-1.5 py-0.5 dark:bg-slate-900/60">
                <Palette className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 mr-0.5" />
                {(Object.keys(QALAKARTA_THEMES) as QalaKartaThemeId[]).map((tid) => {
                  const t = QALAKARTA_THEMES[tid];
                  const active = qkTheme === tid;
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setQkTheme(tid)}
                      title={`Тема «${t.name}» (${t.subtitle})`}
                      className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold transition-all ${
                        active
                          ? 'bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-950'
                          : 'text-slate-700 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-black/15"
                        style={{ backgroundColor: t.swatch }}
                      />
                      <span className="hidden sm:inline">{t.name}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setQkView3d((v) => !v)}
                title="3D-здания (при приближении)"
                className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
                  qkView3d
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Box className="h-3.5 w-3.5" />
                <span>3D</span>
              </button>

              <button
                type="button"
                onClick={() => setQkShowSigns((v) => !v)}
                title="Дорожные знаки, светофоры и камеры (6 310)"
                className={`rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
                  qkShowSigns
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Знаки {qkStats ? `(${qkStats.signs.toLocaleString('ru-RU')})` : ''}
              </button>

              <button
                type="button"
                onClick={() => setQkShowPlaces((v) => !v)}
                title="Места и организации города (6 120)"
                className={`rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
                  qkShowPlaces
                    ? 'bg-teal-600 text-white'
                    : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                POI {qkStats ? `(${qkStats.places.toLocaleString('ru-RU')})` : ''}
              </button>

              <button
                type="button"
                onClick={() => setQkIsochrone((v) => !v)}
                title="Зона доступности 5 / 10 / 15 минут пешком"
                className={`rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
                  qkIsochrone
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                5/10/15м
              </button>

              {qkStats && (
                <span className="hidden 2xl:inline-flex items-center rounded-xl bg-slate-900/10 px-2 py-1 font-mono text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                  {Math.round(qkStats.totalElements / 1000)}k элем · {Math.round(qkStats.buildings / 1000)}k зданий
                </span>
              )}
            </>
          )}
        </div>

        {/* FLOATING LAYERS TOGGLE POPOVER */}
        {showLayerDrawer && (
          <div className="pointer-events-auto liquid-glass w-72 sm:w-80 rounded-3xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Слои QalaKarta
              </div>
              <button
                type="button"
                onClick={() => setShowLayerDrawer(false)}
                className="rounded-lg p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'all', label: 'Все' },
                  { id: 'driver', label: 'Авто' },
                  { id: 'transit', label: 'Транспорт' },
                  { id: 'minimal', label: 'Сброс' },
                ] as const
              ).map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => applyLayerPreset(pr.id)}
                  className="rounded-xl bg-white/70 px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-white dark:bg-slate-800/80 dark:text-slate-200"
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
              {layerItems.map((layer) => {
                const Icon = layer.icon;
                const active = visibility[layer.key];
                return (
                  <button
                    key={layer.key}
                    type="button"
                    disabled={layer.disabled}
                    onClick={() => toggleLayer(layer.key)}
                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-xs font-semibold transition-all ${
                      layer.disabled
                        ? 'opacity-55 cursor-not-allowed bg-white/40 text-slate-500 dark:bg-slate-900/40'
                        : active
                        ? `${layer.activeClass} shadow-sm`
                        : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/65 dark:text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{layer.label}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums opacity-85">
                      {layer.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-white/55 px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-900/55 dark:text-slate-400">
              {layersData.tomtomConfigured
                ? 'TomTom Traffic API ключ активен на сервере — живые тайлы пробок и маршруты с задержками.'
                : 'Для живых тайлов TomTom добавьте TOMTOM_API_KEY в переменные окружения (.env / Secrets). Сейчас работает расчётная модель и OSRM.'}
            </div>
          </div>
        )}

        {/* FLOATING PERSONAL MAP NOTES DRAWER */}
        {showNotesDrawer && (
          <div className="pointer-events-auto liquid-glass w-72 sm:w-80 rounded-3xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Мои места и заметки
              </div>
              <button
                type="button"
                onClick={() => setShowNotesDrawer(false)}
                className="rounded-lg p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!noteTitleInput.trim()) return;
                const c = effectiveLocation || mapCenter;
                await handleSaveMapNote(
                  noteTitleInput,
                  noteTextInput,
                  noteRatingInput,
                  currentLocation?.address || 'Астана',
                  c[0],
                  c[1]
                );
              }}
              className="space-y-2 rounded-2xl bg-white/70 p-2.5 dark:bg-slate-900/60"
            >
              <input
                type="text"
                value={noteTitleInput}
                onChange={(e) => setNoteTitleInput(e.target.value)}
                placeholder="Название места (например: Вкусный кофе)"
                className="w-full rounded-xl border border-white/80 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="text"
                value={noteTextInput}
                onChange={(e) => setNoteTextInput(e.target.value)}
                placeholder="Короткая заметка…"
                className="w-full rounded-xl border border-white/80 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNoteRatingInput(st)}
                      className={st <= noteRatingInput ? 'text-amber-500' : 'text-slate-300'}
                    >
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-500"
                >
                  Добавить пин
                </button>
              </div>
            </form>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {mapNotes.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  Личных меток пока нет
                </div>
              ) : (
                mapNotes.map((mn) => (
                  <div
                    key={mn.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-white/75 px-3 py-2 text-xs dark:bg-slate-800/75"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMapCenter([mn.lat, mn.lng]);
                        setMapZoom(16);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-bold text-slate-900 dark:text-slate-100">
                        {mn.kind === 'parked_car' ? '🚗 ' : mn.kind === 'family_zone' ? '🛡️ ' : '📌 '}
                        {mn.title}
                      </div>
                      <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {mn.note || mn.address}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMapNote(mn.id)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label="Удалить заметку"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* COLLAPSED LEFT PANEL EXPAND BUTTON */}
      {panelCollapsed && (
        <button
          type="button"
          onClick={() => setPanelCollapsed(false)}
          className="liquid-glass absolute top-3.5 left-3.5 z-[500] flex min-h-[42px] items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-xl"
        >
          <Compass className="h-4 w-4 text-sky-600" />
          <span>Панель карты</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* FLOATING LEFT LIQUID GLASS PANEL (Map Layers + Sorting + Taxi + Bus) */}
      {!panelCollapsed && (
        <div className="liquid-glass absolute top-3.5 bottom-3.5 left-3.5 z-[450] flex w-[calc(100%-28px)] max-w-[390px] flex-col overflow-hidden rounded-3xl p-4 space-y-3 shadow-2xl">
          {/* Panel Header & Mode Switcher */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100 truncate">
              {mode === 'taxi' ? 'Qala Taxi' : mode === 'bus' ? 'Автобусы' : 'Qala Карта'}
            </h2>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !voiceEnabled;
                  setVoiceEnabled(next);
                  if (next) {
                    speakRu('Голосовой ассистент навигации QALA включён.', true);
                    onNotify('Голосовые подсказки навигации включены');
                  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    onNotify('Голосовые подсказки отключены');
                  }
                }}
                title={voiceEnabled ? 'Отключить голос' : 'Включить голос навигатора'}
                aria-label={voiceEnabled ? 'Отключить голос' : 'Включить голос навигатора'}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  voiceEnabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white/70 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <div className="flex rounded-xl bg-white/60 p-0.5 border border-white/70 dark:bg-slate-900/60 dark:border-white/15">
                {(
                  [
                    { id: 'map', label: 'Карта' },
                    { id: 'taxi', label: 'Taxi' },
                    { id: 'bus', label: 'Bus' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMode(t.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      mode === t.id
                        ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPanelCollapsed(true)}
                title="Свернуть панель"
                aria-label="Свернуть панель"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Saved Map Bookmarks Bar (Дом / Работа / Парковка / Избранное) */}
          {bookmarks.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 shrink-0">
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center rounded-xl bg-white/75 dark:bg-slate-800/80 border border-white/70 dark:border-white/10 shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMapCenter([bm.lat, bm.lng]);
                      setMapZoom(16);
                      setSelectedFeature({
                        kind: bm.kind === 'parking' ? 'parking' : 'place',
                        title: bm.label,
                        subtitle: bm.address,
                        lat: bm.lat,
                        lng: bm.lng,
                        details: [['Закладка', bm.address]],
                      });
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:text-sky-700 dark:text-slate-100 whitespace-nowrap"
                  >
                    <span>
                      {bm.kind === 'home'
                        ? '🏠'
                        : bm.kind === 'work'
                        ? '💼'
                        : bm.kind === 'parking'
                        ? '🅿️'
                        : '⭐'}
                    </span>
                    <span>{bm.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBookmark(bm.id, bm.label)}
                    title="Удалить закладку"
                    aria-label={`Удалить закладку ${bm.label}`}
                    className="pr-1.5 text-slate-400 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inline Quick Layer Toggles */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleLayer('parkings')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                visibility.parkings ? 'bg-blue-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <ParkingSquare className="h-3 w-3" />
              Парковки ({layersData.parkings.length})
            </button>
            <button
              type="button"
              onClick={() => toggleLayer('busStops')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                visibility.busStops ? 'bg-sky-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <Bus className="h-3 w-3" />
              Остановки ({layersData.busStops.length})
            </button>
            <button
              type="button"
              onClick={() => toggleLayer('cameras')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                visibility.cameras ? 'bg-violet-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <Camera className="h-3 w-3" />
              Камеры ({layersData.sergekCameras.length})
            </button>
            <button
              type="button"
              onClick={() => toggleLayer('trafficLights')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                visibility.trafficLights
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <TrafficCone className="h-3 w-3" />
              Светофоры ({layersData.trafficLights.length})
            </button>
            <button
              type="button"
              onClick={() => toggleLayer('traffic')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                visibility.traffic ? 'bg-rose-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <Gauge className="h-3 w-3" />
              Пробки
            </button>
            <button
              type="button"
              onClick={() => setShowIncidents((v) => !v)}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                showIncidents ? 'bg-orange-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              События ({incidents.length})
            </button>
          </div>

          {/* MODE: BUS ROUTES WITH A->B MATCHER & LIVE TRACKER */}
          {mode === 'bus' ? (
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              {/* Avtobys Virtual Transport Card */}
              <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 p-3.5 text-white shadow-md space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-sky-200" />
                    <span className="font-display text-xs font-extrabold tracking-wide">
                      Карта Avtobys · Астана
                    </span>
                  </div>
                  <span className="font-mono text-[10px] opacity-80">
                    •• {avtobys.cardNumber.slice(-4)}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-sky-100/80">
                      Баланс
                    </div>
                    <div className="font-mono text-xl font-extrabold tabular-nums">
                      {avtobys.balance.toLocaleString('ru-RU')} ₸
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleAvtobysAction('topup', 1000)}
                      className="rounded-xl bg-white/20 px-2.5 py-1.5 text-[11px] font-bold hover:bg-white/30"
                    >
                      +1 000 ₸
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAvtobysAction('pay')}
                      className="rounded-xl bg-amber-400 px-2.5 py-1.5 text-[11px] font-extrabold text-slate-950 hover:bg-amber-300"
                    >
                      Проезд 110 ₸
                    </button>
                  </div>
                </div>
                {avtobys.trips.length > 0 && (
                  <div className="border-t border-white/20 pt-1.5 text-[10px] text-sky-100/90 flex justify-between">
                    <span className="truncate">
                      Посл.: №{avtobys.trips[0].busNumber} · {avtobys.trips[0].routeTitle}
                    </span>
                    <span className="font-mono shrink-0 ml-2">-{avtobys.trips[0].fare} ₸</span>
                  </div>
                )}
              </div>

              {/* A -> B Bus Route Finder */}
              <div className="rounded-2xl bg-white/65 p-3 space-y-2 dark:bg-slate-900/60">
                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  Подбор автобуса A → B
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={busFromId}
                    onChange={(e) => setBusFromId(e.target.value)}
                    aria-label="Автобус откуда"
                    className="rounded-xl border border-white/80 bg-white/85 px-2.5 py-1.5 text-[11px] font-medium text-slate-900 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {ASTANA_PLACES.map((p) => (
                      <option key={p.id} value={p.id}>
                        От: {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={busToId}
                    onChange={(e) => setBusToId(e.target.value)}
                    aria-label="Автобус куда"
                    className="rounded-xl border border-white/80 bg-white/85 px-2.5 py-1.5 text-[11px] font-medium text-slate-900 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {ASTANA_PLACES.map((p) => (
                      <option key={p.id} value={p.id}>
                        До: {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Active Buses Status */}
              {liveBuses.length > 0 && selectedBusRoute && (
                <div className="rounded-2xl border border-sky-400/40 bg-sky-500/15 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-sky-900 dark:text-sky-200">
                    <span>🚌 Автобусы №{selectedBusRoute.number} на линии</span>
                    <span className="font-mono text-[10px] uppercase">Live GPS</span>
                  </div>
                  {liveBuses.map((lb, idx) => (
                    <div
                      key={lb.id}
                      className="flex items-center justify-between text-[11px] text-slate-800 dark:text-slate-200"
                    >
                      <span className="truncate">
                        Борт #{idx + 1} → ост. «{lb.nextStop}»
                      </span>
                      <span className="font-mono font-bold text-sky-700 dark:text-sky-300 shrink-0 ml-2">
                        ~{lb.etaMin} мин
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {rankedBusRoutes.map(({ route: b, nearAM, nearBM }, idx) => {
                const active = selectedBusRoute?.number === b.number;
                const isBestMatch = idx === 0 && busFromId !== busToId;
                return (
                  <button
                    key={b.number}
                    type="button"
                    onClick={() => {
                      setSelectedBusRoute(b);
                      setVisibility((v) => ({ ...v, busStops: true }));
                    }}
                    className={`w-full rounded-2xl p-3 text-left text-xs transition-all ${
                      active
                        ? 'bg-sky-500/20 ring-2 ring-sky-500 shadow-sm'
                        : 'bg-white/70 hover:bg-white dark:bg-slate-900/65 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-lg px-2.5 py-0.5 font-mono font-bold text-white"
                          style={{ backgroundColor: b.color }}
                        >
                          № {b.number}
                        </span>
                        {isBestMatch && (
                          <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Лучший
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        {b.interval} · {b.fare}
                      </span>
                    </div>
                    <div className="mt-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      {b.route}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Остановок: {b.waypoints.length}</span>
                      {nearAM > 0 && (
                        <span className="font-mono">
                          до А ~{nearAM}м · до Б ~{nearBM}м
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : mode === 'taxi' ? (
            /* MODE: TAXI ROUTE, MULTI-STOP, ROUTE HISTORY, VOICE RADAR & NEARBY PARKING */
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950"
                >
                  <HomeIcon className="h-3.5 w-3.5" />
                  1-клик Домой
                </button>
                <button
                  type="button"
                  onClick={() => setShowRouteHistory((v) => !v)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-white/80 px-3 py-2 text-[11px] font-bold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
                >
                  <History className="h-3.5 w-3.5 text-amber-600" />
                  История ({routeHistory.length})
                </button>
              </div>

              {showRouteHistory && (
                <div className="rounded-2xl bg-white/75 p-3 space-y-1.5 dark:bg-slate-900/75">
                  <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    Недавние маршруты
                  </div>
                  {routeHistory.length === 0 ? (
                    <div className="text-[11px] text-slate-500">История маршрутов пока пуста</div>
                  ) : (
                    routeHistory.slice(0, 6).map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-1.5 text-[11px] dark:bg-slate-800"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFromPlace({
                              id: 'hist-from',
                              name: h.fromName,
                              category: 'landmark',
                              address: h.fromName,
                              lat: h.fromLat,
                              lng: h.fromLng,
                            });
                            setToPlace({
                              id: 'hist-to',
                              name: h.toName,
                              category: 'landmark',
                              address: h.toName,
                              lat: h.toLat,
                              lng: h.toLng,
                            });
                            if (h.viaName && h.viaLat && h.viaLng) {
                              setViaPlace({
                                id: 'hist-via',
                                name: h.viaName,
                                category: 'landmark',
                                address: h.viaName,
                                lat: h.viaLat,
                                lng: h.viaLng,
                              });
                            } else {
                              setViaPlace(null);
                            }
                            setShowRouteHistory(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {h.fromName} {h.viaName ? `→ ${h.viaName} ` : ''}→ {h.toName}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {h.distanceKm} км · {h.durationMin} мин
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/map/routes/history/${encodeURIComponent(h.id)}`, {
                              method: 'DELETE',
                            });
                            await loadRouteHistory();
                          }}
                          className="text-slate-400 hover:text-rose-600"
                          aria-label="Удалить из истории"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="rounded-2xl bg-white/65 p-3.5 space-y-2.5 dark:bg-slate-900/60">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-500">Откуда (A)</label>
                    <div className="flex items-center gap-1">
                      {effectiveLocation && (
                        <button
                          type="button"
                          onClick={() =>
                            setFromPlace({
                              id: 'gps-from',
                              name: currentLocation?.address || 'Моё GPS местоположение',
                              category: 'landmark',
                              address: currentLocation?.address || 'Текущие координаты GPS',
                              lat: effectiveLocation[0],
                              lng: effectiveLocation[1],
                            })
                          }
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600 text-white"
                        >
                          От GPS
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPickPinTarget(pickPinTarget === 'from' ? null : 'from')}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          pickPinTarget === 'from'
                            ? 'bg-rose-500 text-white'
                            : 'bg-white/80 text-sky-700 dark:bg-slate-800 dark:text-sky-400'
                        }`}
                      >
                        {pickPinTarget === 'from' ? 'Кликните на карту…' : 'На карте'}
                      </button>
                    </div>
                  </div>
                  <select
                    value={fromPlace.id}
                    onChange={(e) => {
                      const p = ASTANA_PLACES.find((x) => x.id === e.target.value);
                      if (p) setFromPlace(p);
                    }}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/85 px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[
                      ...ASTANA_PLACES,
                      ...(fromPlace.id.startsWith('pin-') ||
                      fromPlace.id === 'gps-from' ||
                      fromPlace.id === 'hist-from'
                        ? [fromPlace]
                        : []),
                    ].map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Via Stop (C) */}
                {viaPlace ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-violet-700 dark:text-violet-400">
                        Заезд по пути (C)
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPickPinTarget(pickPinTarget === 'via' ? null : 'via')}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/80 text-violet-700 dark:bg-slate-800"
                        >
                          {pickPinTarget === 'via' ? 'Клик на карту…' : 'На карте'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setViaPlace(null)}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600"
                        >
                          Убрать
                        </button>
                      </div>
                    </div>
                    <select
                      value={viaPlace.id}
                      onChange={(e) => {
                        const p = ASTANA_PLACES.find((x) => x.id === e.target.value);
                        if (p) setViaPlace(p);
                      }}
                      className="mt-1 w-full rounded-xl border border-violet-300/70 bg-white/85 px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {[
                        ...ASTANA_PLACES,
                        ...(viaPlace.id.startsWith('pin-') || viaPlace.id === 'hist-via'
                          ? [viaPlace]
                          : []),
                      ].map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setViaPlace(ASTANA_PLACES[3] || ASTANA_PLACES[0])}
                    className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-400/50 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-white/70 dark:text-slate-300"
                  >
                    <Plus className="h-3 w-3" />
                    Добавить заезд (точка C)
                  </button>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-500">Куда (B)</label>
                    <button
                      type="button"
                      onClick={() => setPickPinTarget(pickPinTarget === 'to' ? null : 'to')}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        pickPinTarget === 'to'
                          ? 'bg-rose-500 text-white'
                          : 'bg-white/80 text-sky-700 dark:bg-slate-800 dark:text-sky-400'
                      }`}
                    >
                      {pickPinTarget === 'to' ? 'Кликните на карту…' : 'Указать на карте'}
                    </button>
                  </div>
                  <select
                    value={toPlace.id}
                    onChange={(e) => {
                      const p = ASTANA_PLACES.find((x) => x.id === e.target.value);
                      if (p) setToPlace(p);
                    }}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/85 px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[
                      ...ASTANA_PLACES,
                      ...(toPlace.id.startsWith('pin-') ||
                      toPlace.id === 'custom-dest' ||
                      toPlace.id === 'feature-dest' ||
                      toPlace.id === 'home-bm' ||
                      toPlace.id === 'home-default' ||
                      toPlace.id === 'hist-to' ||
                      toPlace.id.startsWith('park-dest')
                        ? [toPlace]
                        : []),
                    ].map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {routeResult && (
                  <div className="space-y-2 pt-2 border-t border-slate-900/10 text-xs dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        <Navigation className="h-3.5 w-3.5 text-blue-600" />
                        {routeResult.distanceKm} км · {routeResult.durationMin} мин
                      </span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                        Подача {activeTariff.etaMin}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                      <span>
                        Светофоры: {routeSafetyStats.lights} · Сергек: {routeSafetyStats.cameras}
                      </span>
                    </div>

                    {/* Voice Navigator & Sergek Radar Simulation Controls */}
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSimStepIdx(0);
                          spokenIdsRef.current.clear();
                          setIsSimulatingDrive((v) => !v);
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[11px] font-bold transition-colors ${
                          isSimulatingDrive
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                        }`}
                      >
                        {isSimulatingDrive ? (
                          <>
                            <Square className="h-3 w-3 fill-current" />
                            Стоп радар
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-current" />
                            Ехать с радаром
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          speakRu(
                            `Маршрут от ${fromPlace.name} до ${toPlace.name}. Дистанция ${routeResult.distanceKm} километра, около ${routeResult.durationMin} минут. По пути ${routeSafetyStats.lights} светофоров и ${routeSafetyStats.cameras} камер Сергек.`,
                            true
                          );
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-white/85 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
                      >
                        <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
                        Озвучить путь
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {TAXI_TARIFFS.map((t) => {
                    const price = calcTariffPrice(t.baseFare, t.perKm);
                    const selected = tariffId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTariffId(t.id)}
                        className={`rounded-xl p-2.5 text-left transition-all border ${
                          selected
                            ? 'border-amber-500 bg-amber-400/25 shadow-xs'
                            : 'border-white/70 bg-white/70 hover:bg-white dark:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-100">
                          <span>{t.name}</span>
                          <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                            <Users className="h-3 w-3" />
                            {t.seats}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-xs font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                          {price.toLocaleString('ru-RU')} ₸
                        </div>
                        <div className="truncate text-[10px] text-slate-500">{t.etaMin}</div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await onBookTaxi(
                      `Qala Taxi (${activeTariff.name}): ${fromPlace.name}${viaPlace ? ` → ${viaPlace.name}` : ''} → ${toPlace.name}`,
                      estimatedTaxiPrice
                    );
                    await recordRouteHistory(fromPlace, toPlace, viaPlace, routeResult, 'taxi');
                    onNotify(
                      `Такси «${activeTariff.name}» заказано · ${estimatedTaxiPrice.toLocaleString('ru-RU')} ₸`
                    );
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  <Car className="h-4 w-4" />
                  Заказать {activeTariff.name} · {estimatedTaxiPrice.toLocaleString('ru-RU')} ₸
                </button>
              </div>

              {/* Nearby Parkings Around Destination (Point B) */}
              {nearbyToTaxiDest.length > 0 && (
                <div className="rounded-2xl bg-white/65 p-3 space-y-2 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <ParkingSquare className="h-3.5 w-3.5 text-blue-600" />
                      Парковки рядом с «{toPlace.name}»
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {nearbyToTaxiDest.map((pk) => (
                      <div
                        key={pk.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-2 text-[11px] dark:bg-slate-800/80"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {pk.title}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {pk.distM} м · {pk.walkMin} мин пешком ·{' '}
                            {pk.price > 0 ? `${pk.price} ₸/ч` : 'Беспл.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setToPlace({
                              id: `park-dest-${pk.id}`,
                              name: pk.title,
                              category: 'parking',
                              address: 'Парковка ЦОДД',
                              lat: pk.lat,
                              lng: pk.lng,
                            });
                            setVisibility((v) => ({ ...v, parkings: true }));
                          }}
                          className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-blue-500 shrink-0"
                        >
                          Маршрут
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* MODE: FULL MAP EXPLORER WITH LIVE GEO SEARCH, CATEGORY FILTER & SORTING */
            <div className="flex min-h-0 flex-1 flex-col space-y-2.5">
              {/* Live Address / Geo Search Box (/api/geo/search) */}
              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск улицы, ЖК, объекта в Астане…"
                  className="w-full rounded-xl border border-white/80 bg-white/75 py-2 pr-3.5 pl-10 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
                />
              </div>

              {(geoSearching || geoResults.length > 0) && searchQuery.trim().length >= 2 && (
                <div className="shrink-0 rounded-2xl bg-white/90 p-2 space-y-1 shadow-md max-h-40 overflow-y-auto dark:bg-slate-900/90">
                  <div className="px-1.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                    {geoSearching ? 'Поиск адресов Астаны…' : `Найдено адресов и мест: ${geoResults.length}`}
                  </div>
                  {geoResults.map((gr) => (
                    <div
                      key={gr.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-1.5 text-[11px] dark:bg-slate-800/80"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMapCenter([gr.lat, gr.lng]);
                          setMapZoom(16);
                          setSelectedFeature({
                            kind: 'place',
                            title: gr.name,
                            subtitle: gr.address,
                            lat: gr.lat,
                            lng: gr.lng,
                            details: [['Источник', gr.source === 'nominatim' ? 'OpenStreetMap' : 'База Астаны']],
                          });
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate font-bold text-slate-900 dark:text-slate-100">
                          {gr.name}
                        </div>
                        <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {gr.address}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToPlace({
                            id: `pin-geo-${Date.now()}`,
                            name: gr.name,
                            category: 'landmark',
                            address: gr.address,
                            lat: gr.lat,
                            lng: gr.lng,
                          });
                          setMode('taxi');
                        }}
                        className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-950 shrink-0"
                      >
                        Туда
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Category Filter Tabs */}
              <div className="flex gap-1 overflow-x-auto pb-0.5 shrink-0">
                {(
                  [
                    { id: 'all', label: 'Все' },
                    { id: 'parking', label: 'Парковки' },
                    { id: 'bus', label: 'Остановки' },
                    { id: 'camera', label: 'Камеры' },
                    { id: 'trafficLight', label: 'Светофоры' },
                    { id: 'place', label: 'Места' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(cat.id);
                      if (cat.id === 'place') {
                        setVisibility((v) => ({ ...v, places: true }));
                      }
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      categoryFilter === cat.id
                        ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'bg-white/60 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {(categoryFilter === 'place' || visibility.places) && (
                <div className="flex gap-1 overflow-x-auto pb-0.5 shrink-0">
                  {POI_SUBCATEGORIES.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => {
                        setPoiSubCategory(sc.id);
                        setVisibility((v) => ({ ...v, places: true }));
                      }}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                        poiSubCategory === sc.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/55 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Sorting Selector */}
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-1.5 text-[11px] shrink-0 dark:bg-slate-900/60">
                <span className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-400">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Сортировка:
                </span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as MapSortMode)}
                  aria-label="Сортировка объектов карты"
                  className="bg-transparent font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="distance">По расстоянию</option>
                  <option value="name">По алфавиту (А–Я)</option>
                  <option value="priceAsc">Сначала дешевле</option>
                  <option value="priceDesc">Сначала дороже</option>
                  <option value="activity">По интенсивности</option>
                </select>
              </div>

              {/* Sorted Results List */}
              <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                {sortedItems.length === 0 ? (
                  <div className="rounded-2xl bg-white/55 p-6 text-center text-xs text-slate-600">
                    Ничего не найдено по вашему запросу.
                  </div>
                ) : (
                  sortedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMapCenter([item.lat, item.lng]);
                        setMapZoom(16);
                        setSelectedFeature({
                          kind: item.kind,
                          title: item.title,
                          subtitle: item.subtitle,
                          lat: item.lat,
                          lng: item.lng,
                          details: item.details,
                        });
                      }}
                      className="liquid-glass-subtle flex w-full items-start justify-between gap-2.5 rounded-2xl p-2.5 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </div>
                        <div className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                          {item.subtitle}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                          {item.badge}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 tabular-nums">
                          {item.distanceM < 1000
                            ? `${item.distanceM} м`
                            : `${(item.distanceM / 1000).toFixed(1)} км`}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SELECTED OBJECT DETAIL CARD (BOTTOM RIGHT) */}
      {selectedFeature && (
        <div className="liquid-glass absolute right-3.5 bottom-3.5 z-[500] w-80 max-w-[calc(100%-28px)] max-h-[65vh] overflow-y-auto rounded-3xl p-4 space-y-2.5 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                {selectedFeature.title}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {selectedFeature.subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFeature(null)}
              className="rounded-lg p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedFeature.details && selectedFeature.details.length > 0 && (
            <div className="space-y-1 border-t border-slate-900/10 pt-2 text-[11px] dark:border-white/10">
              {selectedFeature.details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-slate-500 dark:text-slate-400">{k}</span>
                  <span className="font-semibold text-right text-slate-900 dark:text-slate-100">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Nearby Parkings Around Selected Point */}
          {nearbyToFeature.length > 0 && selectedFeature.kind !== 'parking' && (
            <div className="space-y-1.5 border-t border-slate-900/10 pt-2 dark:border-white/10">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <ParkingSquare className="h-3.5 w-3.5 text-blue-600" />
                Ближайшие парковки рядом:
              </div>
              {nearbyToFeature.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 text-[11px] dark:bg-slate-800/70"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                      {pk.title}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      {pk.distM} м · {pk.walkMin} мин ·{' '}
                      {pk.price > 0 ? `${pk.price} ₸/ч` : 'Беспл.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setToPlace({
                        id: `park-dest-${pk.id}`,
                        name: pk.title,
                        category: 'parking',
                        address: 'Парковка ЦОДД',
                        lat: pk.lat,
                        lng: pk.lng,
                      });
                      setMode('taxi');
                      setVisibility((v) => ({ ...v, parkings: true }));
                      setPanelCollapsed(false);
                    }}
                    className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-bold text-white shrink-0"
                  >
                    Маршрут
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* CODD Paid Parking Timer inside Parking Feature Card */}
          {selectedFeature.kind === 'parking' && (
            <div className="space-y-2 rounded-2xl bg-blue-500/10 p-3 border border-blue-400/30">
              <div className="flex items-center justify-between text-[11px] font-bold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Паркомат ЦОДД Астаны
                </span>
                <span className="font-mono">
                  {selectedFeature.details?.find(([k]) => k === 'Тариф')?.[1] || '100 ₸/час'}
                </span>
              </div>
              <div className="flex gap-1">
                {[30, 60, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setParkingDurationMin(m)}
                    className={`flex-1 rounded-lg py-1 text-[10px] font-bold ${
                      parkingDurationMin === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/80 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {m < 60 ? `${m} мин` : `${m / 60} ч`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const tariffStr =
                    selectedFeature.details?.find(([k]) => k === 'Тариф')?.[1] || '100';
                  const parsedRate = Number.parseInt(tariffStr.replace(/[^\d]/g, ''), 10) || 100;
                  const zone =
                    selectedFeature.details?.find(([k]) => k === 'Зона')?.[1] || 'ЦОДД';
                  void handleStartParkingTimer(
                    selectedFeature.title,
                    zone,
                    parsedRate,
                    parkingDurationMin
                  );
                }}
                className="w-full rounded-xl bg-blue-600 py-2 text-[11px] font-bold text-white hover:bg-blue-500"
              >
                Оплатить парковку ({parkingDurationMin} мин)
              </button>
            </div>
          )}

          {/* Save to Bookmarks Inline Form */}
          {showBookmarkForm && (
            <div className="space-y-2 rounded-2xl bg-white/80 p-2.5 dark:bg-slate-800/80">
              <div className="flex gap-1">
                {(
                  [
                    { id: 'home', label: '🏠 Дом' },
                    { id: 'work', label: '💼 Работа' },
                    { id: 'parking', label: '🅿️ Парк.' },
                    { id: 'favorite', label: '⭐ Место' },
                  ] as const
                ).map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setBookmarkKindInput(k.id)}
                    className={`flex-1 rounded-lg py-1 text-[10px] font-bold ${
                      bookmarkKindInput === k.id
                        ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={bookmarkLabelInput}
                  onChange={(e) => setBookmarkLabelInput(e.target.value)}
                  placeholder={selectedFeature.title}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300/80 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleSaveBookmark(
                      bookmarkLabelInput.trim() || selectedFeature.title,
                      bookmarkKindInput,
                      selectedFeature.subtitle,
                      selectedFeature.lat,
                      selectedFeature.lng
                    )
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  ОК
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setToPlace({
                  id: 'feature-dest',
                  name: selectedFeature.title,
                  category: 'landmark',
                  address: selectedFeature.subtitle,
                  lat: selectedFeature.lat,
                  lng: selectedFeature.lng,
                });
                setMode('taxi');
                setPanelCollapsed(false);
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 py-2 text-[11px] font-bold text-slate-950 hover:bg-amber-400"
            >
              <Car className="h-3.5 w-3.5" />
              Такси
            </button>
            <button
              type="button"
              onClick={() => {
                setBookmarkLabelInput(selectedFeature.title.slice(0, 28));
                setBookmarkKindInput(selectedFeature.kind === 'parking' ? 'parking' : 'favorite');
                setShowBookmarkForm((v) => !v);
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-white/80 py-2 text-[11px] font-semibold text-slate-900 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
            >
              <Bookmark className="h-3.5 w-3.5 text-amber-500" />
              В закладки
            </button>
            <button
              type="button"
              onClick={() =>
                void handleSaveMapNote(
                  selectedFeature.title,
                  selectedFeature.subtitle,
                  5,
                  selectedFeature.subtitle,
                  selectedFeature.lat,
                  selectedFeature.lng
                )
              }
              className="flex items-center justify-center gap-1 rounded-xl bg-rose-600/90 py-2 text-[11px] font-semibold text-white hover:bg-rose-600"
            >
              <Pin className="h-3.5 w-3.5" />
              Заметка
            </button>
            <button
              type="button"
              onClick={() => {
                setMapCenter([selectedFeature.lat, selectedFeature.lng]);
                setMapZoom(17);
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-white/80 py-2 text-[11px] font-semibold text-slate-900 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
            >
              <Navigation className="h-3.5 w-3.5" />
              Ближе
            </button>
          </div>
        </div>
      )}

      {/* 109 iKomek / SOS Astana Emergency Modal */}
      {showSosModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
          onClick={() => setShowSosModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-md rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-600 text-white">
                  <Siren className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Экстренные службы Астаны
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Быстрый вызов и передача текущих координат
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSosModal(false)}
                className="rounded-xl p-1.5 text-slate-500 hover:bg-white/70 dark:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-white/75 p-3.5 space-y-2 dark:bg-slate-900/75">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Ваша геопозиция сейчас:
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {currentLocation?.address || 'Центр Астаны'}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                  {(effectiveLocation?.[0] || ASTANA_CENTER[0]).toFixed(5)},{' '}
                  {(effectiveLocation?.[1] || ASTANA_CENTER[1]).toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const lat = (effectiveLocation?.[0] || ASTANA_CENTER[0]).toFixed(5);
                    const lng = (effectiveLocation?.[1] || ASTANA_CENTER[1]).toFixed(5);
                    const text = `Астана, ${currentLocation?.address || ''} (${lat}, ${lng})`;
                    try {
                      await navigator.clipboard.writeText(text);
                      onNotify('Координаты и адрес скопированы');
                    } catch {
                      onNotify(text);
                    }
                  }}
                  className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white dark:bg-sky-500 dark:text-slate-950"
                >
                  <Copy className="h-3 w-3" />
                  Копировать GPS
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {[
                { num: '109', title: 'iKomek Астана · Городской контакт-центр' },
                { num: '112', title: 'Единая служба спасения РК' },
                { num: '103', title: 'Скорая медицинская помощь' },
                { num: '102', title: 'Полиция' },
                { num: '101', title: 'Пожарная служба и ЧС' },
              ].map((srv) => (
                <a
                  key={srv.num}
                  href={`tel:${srv.num}`}
                  className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-2.5 text-xs hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-800"
                >
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {srv.title}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400">
                    <PhoneCall className="h-3.5 w-3.5" />
                    {srv.num}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
