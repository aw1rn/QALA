import {
  Activity,
  ArrowLeft,
  Bell,
  Building2,
  Bus,
  Car,
  Check,
  CloudSnow,
  CloudSun,
  Coins,
  Command,
  Compass,
  Film,
  Gauge,
  Globe,
  HardDrive,
  Home,
  LayoutGrid,
  LayoutList,
  LocateFixed,
  MapPin,
  Mic,
  MicOff,
  Monitor,
  Moon,
  Music,
  Navigation,
  Package,
  Palette,
  Phone,
  Radio,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Tv,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppInstallCenter } from './components/AppInstallCenter';
import { AstanaMap } from './components/AstanaMap';
import { FloatingMiniPlayer } from './components/FloatingMiniPlayer';
import { MobileServiceSheet } from './components/MobileServiceSheet';
import { QalaAdminModule } from './components/QalaAdminModule';
import {
  QalaAiModule,
  QalaIdModule,
  QalaOfflineModule,
  QalaSheshimModule,
  QalaWalletModule,
} from './components/QalaAiAndServices';
import { QalaCityInfoModule } from './components/QalaCityInfoModule';
import { QalaDeliveryModule } from './components/QalaDeliveryModule';
import { QalaFoodModule } from './components/QalaFoodModule';
import { QalaMapModule } from './components/QalaMapModule';
import { QalaMarketModule } from './components/QalaMarketModule';
import {
  QalaHistoryModule,
  QalaMusicModule,
  QalaSportModule,
} from './components/QalaMusicAndSport';
import { QalaQinoModule } from './components/QalaQinoModule';
import { QalaTrafficModule } from './components/QalaTrafficModule';
import { QalaTvModule } from './components/QalaTvModule';
import { QalaUyModule } from './components/QalaUyModule';
import {
  ASTANA_CENTER,
  ASTANA_PLACES,
  BUS_ROUTES,
  KAZAKHSTAN_TV_CHANNELS,
} from './data/astanaData';
import { useCurrentLocation } from './hooks/useCurrentLocation';
import { useOnlineStatus } from './hooks/usePWAInstall';
import type {
  ApartmentListing,
  CinemaMovie,
  DeliveryStop,
  GlassPreset,
  MarketListing,
  MediaMiniPlayerState,
  PlanItem,
  QalaProfile,
  QalaSection,
  ThemeMode,
  TvChannel,
  UiLang,
  WalletTransaction,
  WeatherData,
} from './types/qala';
import { API_BASE } from './apiBase';

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const {
    location: currentLocation,
    isDetecting: isGeoDetecting,
    refreshLocation,
    setManualLocation,
    toggleLiveTracking,
  } = useCurrentLocation();
  const [section, setSection] = useState<QalaSection>('dashboard');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return window.localStorage.getItem('qala_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

  const [glassPreset, setGlassPreset] = useState<GlassPreset>(() => {
    try {
      const saved = window.localStorage.getItem('qala_glass_preset');
      if (saved === 'winter' || saved === 'baiterek' || saved === 'steppe' || saved === 'crystal') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'crystal';
  });
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  const [uiLang, setUiLang] = useState<UiLang>(() => {
    try {
      const saved = window.localStorage.getItem('qala_ui_lang');
      if (saved === 'kk' || saved === 'en' || saved === 'ru') return saved;
    } catch {
      // ignore
    }
    return 'ru';
  });

  const [drivingMode, setDrivingMode] = useState(false);
  const [showWidgetCustomizer, setShowWidgetCustomizer] = useState(false);
  const [dashWidgets, setDashWidgets] = useState<{
    map: boolean;
    weather_taxi_food: boolean;
    services: boolean;
    summary: boolean;
    market_delivery_tv: boolean;
  }>(() => {
    const defaults = {
      map: true,
      weather_taxi_food: true,
      services: true,
      summary: true,
      market_delivery_tv: true,
    };
    try {
      const raw = window.localStorage.getItem('qala_dash_widgets_v1');
      if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<typeof defaults>) };
    } catch {
      // ignore
    }
    return defaults;
  });

  const [globalSearch, setGlobalSearch] = useState('');
  const [searchListening, setSearchListening] = useState(false);
  const searchRecRef = useRef<SpeechRecognitionInstance | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  const searchVoiceSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    );

  // Core App State backed by SQLite & Live APIs
  const [profile, setProfile] = useState<QalaProfile>({
    name: 'Амир',
    city: 'Астана',
    address: 'Нұржол желек жолы, 14',
    phone: '+7 (701) 555-01-42',
    email: 'amir@qala.kz',
    avatarInitial: 'А',
  });
  const [weather, setWeather] = useState<WeatherData>({
    temperature: -4,
    apparentTemperature: -11,
    windSpeed: 7,
    weatherCode: 71,
    description: 'Снег',
    updatedAt: '',
    isLive: false,
  });
  const [apartments, setApartments] = useState<ApartmentListing[]>([]);
  const [marketItems, setMarketItems] = useState<MarketListing[]>([]);
  const [deliveryStops, setDeliveryStops] = useState<DeliveryStop[]>([]);
  const [walletTx, setWalletTx] = useState<WalletTransaction[]>([]);
  const [walletTotal, setWalletTotal] = useState(0);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [favoriteMovies, setFavoriteMovies] = useState<CinemaMovie[]>([]);
  const [selectedTvChannel, setSelectedTvChannel] = useState<TvChannel | null>(null);

  // Persistent background playback & FloatingMiniPlayer
  const [tvMounted, setTvMounted] = useState(false);
  const [isTvFullscreen, setIsTvFullscreen] = useState(false);
  const [musicMounted, setMusicMounted] = useState(false);
  const [miniPlayerMedia, setMiniPlayerMedia] = useState<MediaMiniPlayerState | null>(null);
  const [mediaCommand, setMediaCommand] = useState<{
    target: 'tv' | 'radio';
    action: 'toggle' | 'stop';
    seq: number;
  } | null>(null);
  const cmdSeqRef = useRef(0);
  const activeKindRef = useRef<'tv' | 'radio' | null>(null);

  // Map navigation handoff state
  const [mapDestination, setMapDestination] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [mapRouteCoords, setMapRouteCoords] = useState<Array<[number, number]>>([]);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Ctrl+K / Cmd+K Command Palette Shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLocateMe = useCallback(async () => {
    const next = await refreshLocation();
    notify(
      next.source === 'gps'
        ? `GPS обновлён: ${next.address}`
        : `Геолокация: ${next.address}`
    );
  }, [notify, refreshLocation]);

  const launchQuickTaxi = useCallback(
    (target: 'home' | 'work') => {
      if (target === 'home') {
        setMapDestination({
          name: 'Дом',
          address: profile.address || 'Нұржол желек жолы, 14',
          lat: 51.1282,
          lng: 71.4304,
        });
      } else {
        setMapDestination({
          name: 'Работа · Центр Астаны',
          address: 'ул. Достык, 18',
          lat: 51.1264,
          lng: 71.4342,
        });
      }
      setMapRouteCoords([]);
      setSection('taxi');
    },
    [profile.address]
  );

  // Apply & persist Theme, Glass Preset, Language, and Dashboard Widgets
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('qala_theme', theme);
    } catch {
      // ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#070b14' : '#dcebfa');
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('qala_glass_preset', glassPreset);
    } catch {
      // ignore
    }
  }, [glassPreset]);

  useEffect(() => {
    try {
      window.localStorage.setItem('qala_ui_lang', uiLang);
    } catch {
      // ignore
    }
  }, [uiLang]);

  useEffect(() => {
    try {
      window.localStorage.setItem('qala_dash_widgets_v1', JSON.stringify(dashWidgets));
    } catch {
      // ignore
    }
  }, [dashWidgets]);

  const toggleTheme = async () => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      // local fallback already persisted
    }
  };

  // Latch mounted state for TV / Music once opened so FloatingMiniPlayer continues smoothly
  useEffect(() => {
    if (section === 'tv' || selectedTvChannel) {
      setTvMounted(true);
    }
    if (section === 'music') {
      setMusicMounted(true);
    }
  }, [section, selectedTvChannel]);

  const refreshProfile = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/profile`);
    if (r.ok) {
      const d = (await r.json()) as { profile: QalaProfile };
      setProfile(d.profile);
    }
  }, []);

  const refreshApartments = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/apartments`);
    if (r.ok) {
      const d = (await r.json()) as { apartments: ApartmentListing[] };
      setApartments(d.apartments || []);
    }
  }, []);

  const refreshMarket = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/market`);
    if (r.ok) {
      const d = (await r.json()) as { items: MarketListing[] };
      setMarketItems(d.items || []);
    }
  }, []);

  const refreshDelivery = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/delivery/stops`);
    if (r.ok) {
      const d = (await r.json()) as { stops: DeliveryStop[] };
      setDeliveryStops(d.stops || []);
    }
  }, []);

  const refreshWalletAndPlans = useCallback(async () => {
    const [wRes, pRes] = await Promise.all([fetch(`${API_BASE}/api/wallet`), fetch(`${API_BASE}/api/plans`)]);
    if (wRes.ok) {
      const w = (await wRes.json()) as {
        transactions: WalletTransaction[];
        total: number;
      };
      setWalletTx(w.transactions || []);
      setWalletTotal(w.total || 0);
    }
    if (pRes.ok) {
      const p = (await pRes.json()) as { plans: PlanItem[] };
      setPlans(p.plans || []);
    }
  }, []);

  const refreshFavorites = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/favorites`);
    if (r.ok) {
      const d = (await r.json()) as { favorites: CinemaMovie[] };
      setFavoriteMovies(d.favorites || []);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      refreshProfile(),
      refreshApartments(),
      refreshMarket(),
      refreshDelivery(),
      refreshWalletAndPlans(),
      refreshFavorites(),
      fetch(`${API_BASE}/api/weather`)
        .then((r) => (r.ok ? r.json() : null))
        .then((w: WeatherData | null) => {
          if (w) setWeather(w);
        })
        .catch(() => {}),
      fetch(`${API_BASE}/api/settings`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { theme?: ThemeMode } | null) => {
          if (s?.theme === 'dark' || s?.theme === 'light') {
            setTheme(s.theme);
          }
        })
        .catch(() => {}),
    ]);
  }, [
    refreshApartments,
    refreshDelivery,
    refreshFavorites,
    refreshMarket,
    refreshProfile,
    refreshWalletAndPlans,
  ]);

  const greetingLabel = useMemo(() => {
    const h = new Date().getHours();
    if (uiLang === 'kk') {
      if (h >= 5 && h < 12) return 'Қайырлы таң';
      if (h >= 12 && h < 18) return 'Қайырлы күн';
      return 'Қайырлы кеш';
    }
    if (uiLang === 'en') {
      if (h >= 5 && h < 12) return 'Good morning';
      if (h >= 12 && h < 18) return 'Good afternoon';
      return 'Good evening';
    }
    if (h >= 5 && h < 12) return 'Доброе утро';
    if (h >= 12 && h < 18) return 'Добрый день';
    return 'Добрый вечер';
  }, [uiLang]);

  const formattedDate = useMemo(() => {
    const locale = uiLang === 'kk' ? 'kk-KZ' : uiLang === 'en' ? 'en-US' : 'ru-RU';
    return new Date().toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, [uiLang]);

  const t = useMemo(() => {
    if (uiLang === 'kk') {
      return {
        searchPlaceholder: 'Іздеу: тағам, такси, кептеліс, үй, ТВ…',
        servicesTitle: 'Қызметтер',
        askAi: 'Qala AI сұрау',
        homeTaxi: 'Үйге такси',
        workTaxi: 'Жұмысқа',
        driveMode: 'Рөлде',
        widgets: 'Виджеттер',
        myLoc: 'Менің орным',
        openMap: 'Картаны ашу',
        allServices: 'Барлығы 20',
        cityTab: 'Қала',
        mapTab: 'Карта',
        homeLabel: 'Басты',
      };
    }
    if (uiLang === 'en') {
      return {
        searchPlaceholder: 'Search: food, taxi, traffic, home, TV…',
        servicesTitle: 'Services',
        askAi: 'Ask Qala AI',
        homeTaxi: 'Taxi Home',
        workTaxi: 'To Work',
        driveMode: 'Drive HUD',
        widgets: 'Widgets',
        myLoc: 'My location',
        openMap: 'Open Map',
        allServices: 'All 20',
        cityTab: 'City',
        mapTab: 'Map',
        homeLabel: 'Home',
      };
    }
    return {
      searchPlaceholder: 'Поиск: еда, такси, пробки, жильё, ТВ…',
      servicesTitle: 'Сервисы',
      askAi: 'Спросить Qala AI',
      homeTaxi: 'Такси домой',
      workTaxi: 'На работу',
      driveMode: 'За рулём',
      widgets: 'Виджеты',
      myLoc: 'Моё местоположение',
      openMap: 'Открыть карту',
      allServices: 'Все 20',
      cityTab: 'Город',
      mapTab: 'Карта',
      homeLabel: 'Главная',
    };
  }, [uiLang]);

  const addWalletTransaction = async (
    title: string,
    category: WalletTransaction['category'],
    amount: number
  ) => {
    await fetch(`${API_BASE}/api/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, amount }),
    });
    await refreshWalletAndPlans();
  };

  const runGlobalSearch = useCallback(
    (rawQuery: string) => {
      const q = rawQuery.trim().toLowerCase();
      if (!q) {
        setSection('map');
        return;
      }
      if (
        q.includes('еда') ||
        q.includes('food') ||
        q.includes('бургер') ||
        q.includes('плов') ||
        q.includes('пицц') ||
        q.includes('донер') ||
        q.includes('кофе')
      ) {
        setSection('food');
      } else if (q.includes('такс') || q.includes('taxi')) {
        setSection('taxi');
      } else if (q.includes('автобус') || q.includes('bus') || q.includes('останов')) {
        setSection('bus');
      } else if (
        q.includes('парков') ||
        q.includes('светофор') ||
        q.includes('карта') ||
        q.includes('знак')
      ) {
        setSection('map');
      } else if (
        q.includes('пробк') ||
        q.includes('погод') ||
        q.includes('сергек') ||
        q.includes('камер')
      ) {
        setSection('traffic');
      } else if (
        q.includes('валют') ||
        q.includes('курс') ||
        q.includes('доллар') ||
        q.includes('egov') ||
        q.includes('егоу') ||
        q.includes('напомин') ||
        q.includes('инфо')
      ) {
        setSection('info');
      } else if (q.includes('админ') || q.includes('m3u') || q.includes('pin')) {
        setSection('admin');
      } else if (q.includes('квартир') || q.includes('аренд') || q.includes('дом') || q.includes('үй')) {
        setSection('uy');
      } else if (q.includes('тв') || q.includes('канал') || q.includes('tv')) {
        setSection('tv');
      } else if (q.includes('кино') || q.includes('фильм') || q.includes('афиш')) {
        setSection('qino');
      } else if (q.includes('достав') || q.includes('маркет') || q.includes('купи')) {
        setSection('market');
      } else if (
        q.includes('музык') ||
        q.includes('радио') ||
        q.includes('love radio') ||
        q.includes('лав радио')
      ) {
        setSection('music');
      } else if (q.includes('спорт') || q.includes('бег')) {
        setSection('sport');
      } else if (q.includes('ai') || q.includes('ассистент')) {
        setSection('ai');
      } else {
        const matched = ASTANA_PLACES.find((p) => p.name.toLowerCase().includes(q));
        if (matched) {
          setMapDestination({
            name: matched.name,
            address: matched.address,
            lat: matched.lat,
            lng: matched.lng,
          });
        }
        setSection('map');
      }
    },
    []
  );

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runGlobalSearch(globalSearch);
  };

  const toggleSearchVoice = () => {
    if (!searchVoiceSupported) {
      notify('Голосовой поиск поддерживается в Chrome, Edge и Safari');
      return;
    }
    if (searchListening) {
      searchRecRef.current?.stop();
      setSearchListening(false);
      return;
    }
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
      | (new () => SpeechRecognitionInstance)
      | undefined;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const spoken = e.results?.[0]?.[0]?.transcript?.trim();
      if (spoken) {
        setGlobalSearch(spoken);
        runGlobalSearch(spoken);
      }
      setSearchListening(false);
    };
    rec.onerror = () => setSearchListening(false);
    rec.onend = () => setSearchListening(false);
    searchRecRef.current = rec;
    setSearchListening(true);
    rec.start();
  };

  // Media Callbacks for FloatingMiniPlayer
  const handleTvMediaChange = useCallback(
    (st: { id: string; title: string; subtitle: string; isPlaying: boolean; accentColor: string }) => {
      if (st.isPlaying && activeKindRef.current === 'radio') {
        cmdSeqRef.current += 1;
        setMediaCommand({ target: 'radio', action: 'stop', seq: cmdSeqRef.current });
      }
      activeKindRef.current = 'tv';
      setMiniPlayerMedia({ kind: 'tv', ...st });
    },
    []
  );

  const handleRadioMediaChange = useCallback(
    (st: { id: string; title: string; subtitle: string; isPlaying: boolean } | null) => {
      if (!st) return;
      if (st.isPlaying && activeKindRef.current === 'tv') {
        cmdSeqRef.current += 1;
        setMediaCommand({ target: 'tv', action: 'stop', seq: cmdSeqRef.current });
      }
      activeKindRef.current = 'radio';
      setMiniPlayerMedia({ kind: 'radio', accentColor: '#4F46E5', ...st });
    },
    []
  );

  // 12 Service Bento Tiles (expanded with Qala Food, Taxi, Пробки, Инфо)
  const serviceTiles: Array<{
    id: QalaSection;
    label: string;
    icon: typeof Home;
    tint: string;
  }> = [
    { id: 'food', label: 'Food', icon: Utensils, tint: 'text-orange-600' },
    { id: 'taxi', label: 'Taxi', icon: Car, tint: 'text-amber-600' },
    { id: 'traffic', label: 'Пробки', icon: CloudSun, tint: 'text-rose-600' },
    { id: 'info', label: 'eGov · FX', icon: Coins, tint: 'text-emerald-600' },
    { id: 'uy', label: 'Үй', icon: Building2, tint: 'text-emerald-700' },
    { id: 'market', label: 'Market', icon: ShoppingBag, tint: 'text-orange-500' },
    { id: 'delivery', label: 'Delivery', icon: Package, tint: 'text-amber-700' },
    { id: 'qino', label: 'Afisha', icon: Film, tint: 'text-rose-500' },
    { id: 'tv', label: 'Qala TV', icon: Tv, tint: 'text-indigo-600' },
    { id: 'music', label: 'Music', icon: Music, tint: 'text-sky-600' },
    { id: 'sport', label: 'Sport', icon: Activity, tint: 'text-emerald-600' },
    { id: 'sheshim', label: 'Шешім', icon: Scale, tint: 'text-slate-700 dark:text-slate-300' },
  ];

  // Desktop left vertical dock items
  const desktopRailItems: Array<{
    id: QalaSection;
    label: string;
    icon: typeof Home;
  }> = useMemo(
    () => [
      { id: 'dashboard', label: t.homeLabel, icon: LayoutGrid },
      { id: 'map', label: t.mapTab, icon: Compass },
      { id: 'taxi', label: uiLang === 'en' ? 'Taxi' : 'Такси', icon: Car },
      { id: 'bus', label: uiLang === 'en' ? 'Buses' : uiLang === 'kk' ? 'Автобустар' : 'Автобусы', icon: Bus },
      { id: 'traffic', label: uiLang === 'en' ? 'Traffic · 7d' : uiLang === 'kk' ? 'Кептеліс · 7к' : 'Пробки · 7д', icon: CloudSun },
      { id: 'food', label: 'Qala Food', icon: Utensils },
      { id: 'uy', label: 'Qala Үй', icon: Building2 },
      { id: 'market', label: 'Market', icon: ShoppingBag },
      { id: 'delivery', label: 'Delivery', icon: Package },
      { id: 'info', label: uiLang === 'en' ? 'FX · eGov' : 'Валюты · eGov', icon: Coins },
      { id: 'tv', label: 'Qala TV', icon: Tv },
      { id: 'admin', label: uiLang === 'en' ? 'Admin' : 'Админка', icon: ShieldCheck },
      { id: 'qino', label: 'Qino', icon: Film },
      { id: 'ai', label: 'Qala AI', icon: Sparkles },
      { id: 'wallet', label: 'Wallet', icon: Wallet },
      { id: 'offline', label: uiLang === 'en' ? 'Offline' : 'Офлайн', icon: HardDrive },
    ],
    [t.homeLabel, t.mapTab, uiLang]
  );

  const activePlansCount = plans.filter((p) => !p.completed).length;
  const isMobilePreview = viewMode === 'mobile';

  const frostAdvisoryLabel = useMemo(() => {
    const t = weather.temperature;
    if (t <= -35) return 'Актировка: 0–11 кл. онлайн';
    if (t <= -30) return 'Мороз: 0–9 кл. дистанционно';
    if (t <= -25) return 'Мороз: 0–4 кл. на дистант';
    if (weather.windSpeed >= 12) return `Штормовой ветер ${weather.windSpeed} м/с`;
    return `Дорога и школы в штатном режиме`;
  }, [weather.temperature, weather.windSpeed]);

  const commandResults = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    const entries: Array<{
      id: string;
      title: string;
      subtitle: string;
      badge: string;
      run: () => void;
    }> = [
      {
        id: 'cmd-gps',
        title: 'Определить мою геопозицию (GPS)',
        subtitle: currentLocation.address,
        badge: 'GPS',
        run: () => void handleLocateMe(),
      },
      {
        id: 'cmd-taxi-home',
        title: 'Такси домой в 1 клик',
        subtitle: profile.address,
        badge: 'Такси',
        run: () => launchQuickTaxi('home'),
      },
      {
        id: 'cmd-pdd',
        title: 'Калькулятор штрафов ПДД РК (МРП) и ЖКХ',
        subtitle: 'Qala Инфо · КоАП РК 50% и тарифы Астаны',
        badge: 'Инфо',
        run: () => setSection('info'),
      },
      ...desktopRailItems.map((item) => ({
        id: `sec-${item.id}`,
        title: item.label,
        subtitle: 'Раздел QALA',
        badge: 'Сервис',
        run: () => setSection(item.id),
      })),
      ...ASTANA_PLACES.slice(0, 12).map((pl) => ({
        id: `pl-${pl.id}`,
        title: pl.name,
        subtitle: pl.address,
        badge: 'Место',
        run: () => {
          setMapDestination({ name: pl.name, address: pl.address, lat: pl.lat, lng: pl.lng });
          setSection('map');
        },
      })),
      ...KAZAKHSTAN_TV_CHANNELS.map((ch) => ({
        id: `tv-${ch.id}`,
        title: `ТВ: ${ch.name}`,
        subtitle: ch.currentShow,
        badge: 'Qala TV',
        run: () => {
          setSelectedTvChannel(ch);
          setSection('tv');
        },
      })),
      ...BUS_ROUTES.slice(0, 8).map((br) => ({
        id: `bus-${br.number}`,
        title: `Автобус №${br.number}`,
        subtitle: br.route,
        badge: 'Автобус',
        run: () => setSection('bus'),
      })),
    ];

    if (!q) return entries.slice(0, 12);
    return entries
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.subtitle.toLowerCase().includes(q) ||
          e.badge.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [commandQuery, currentLocation.address, desktopRailItems, handleLocateMe, launchQuickTaxi, profile.address]);

  return (
    <div
      className={`qala-liquid-canvas min-h-screen transition-colors duration-300 ${
        glassPreset !== 'crystal' ? `preset-${glassPreset}` : ''
      }`}
    >
      {/* OUTER SHELL: Desktop uses Left Liquid Glass Rail + Full 1520px Canvas */}
      <div
        className={`mx-auto flex gap-4 px-3 py-3 sm:px-5 sm:py-5 ${
          isMobilePreview
            ? miniPlayerMedia
              ? 'max-w-[430px] pb-36'
              : 'max-w-[430px] pb-24'
            : miniPlayerMedia
              ? 'max-w-[1520px] pb-36 md:pb-8'
              : 'max-w-[1520px] pb-24 md:pb-6'
        }`}
      >
        {/* DESKTOP LEFT LIQUID GLASS DOCK RAIL */}
        {!isMobilePreview && (
          <aside className="hidden md:flex sticky top-5 h-[calc(100vh-40px)] w-[82px] xl:w-[198px] shrink-0 flex-col justify-between liquid-glass rounded-3xl p-3">
            <div className="flex min-h-0 flex-1 flex-col">
              <button
                type="button"
                onClick={() => setSection('dashboard')}
                className="mb-2.5 flex w-full shrink-0 items-center justify-center xl:justify-start gap-2.5 rounded-2xl px-2.5 py-2 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 font-display text-lg font-extrabold text-white shadow-sm">
                  Q
                </span>
                <span className="hidden xl:inline font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                  QALA
                </span>
              </button>

              <nav aria-label="Десктопная навигация" className="flex-1 overflow-y-auto space-y-1 pr-0.5">
                {desktopRailItems.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      title={item.label}
                      className={`flex w-full flex-col xl:flex-row items-center justify-center xl:justify-start gap-1 xl:gap-2.5 rounded-2xl px-2 py-2 xl:px-3 text-xs font-semibold transition-all whitespace-nowrap ${
                        active
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'text-slate-700 hover:bg-white/65 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-[10px] xl:text-xs">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <button
              type="button"
              onClick={() => setSection('id')}
              className={`mt-2 flex w-full shrink-0 flex-col xl:flex-row items-center justify-center xl:justify-start gap-1 xl:gap-3 rounded-2xl px-2 py-2.5 xl:px-3 text-xs font-semibold transition-colors ${
                section === 'id'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                  : 'bg-white/50 text-slate-800 hover:bg-white/80 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-[11px] font-bold text-white">
                {profile.avatarInitial}
              </span>
              <span className="hidden xl:inline truncate">{profile.name} · ID</span>
            </button>
          </aside>
        )}

        {/* RIGHT MAIN WORKSPACE */}
        <div className="min-w-0 flex-1 space-y-4 sm:space-y-5">
          {/* TOP LIQUID GLASS BAR */}
          <header className="liquid-glass sticky top-2.5 md:top-5 z-40 rounded-2xl sm:rounded-3xl px-3.5 py-2 sm:px-6 sm:py-3">
            <div className="flex items-center justify-between gap-2.5 sm:gap-4">
              {/* Mobile/Compact Brand + Greeting */}
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSection('dashboard')}
                  className={`flex items-center gap-2 shrink-0 ${
                    !isMobilePreview ? 'md:hidden' : ''
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 font-display text-base font-extrabold text-white">
                    Q
                  </span>
                  <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                    QALA
                  </span>
                </button>

                <div className="hidden sm:block truncate text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {greetingLabel}, {profile.name}
                  </span>
                  <span className="mx-1.5 text-slate-400">·</span>
                  <span className="capitalize">{formattedDate}</span>
                  <span className="mx-1.5 text-slate-400">·</span>
                  <span>{profile.city}</span>
                </div>
              </div>

              {/* Search Box + Voice Input */}
              {!isMobilePreview && (
                <form
                  onSubmit={handleGlobalSearchSubmit}
                  className="hidden sm:flex flex-1 max-w-md items-center relative"
                >
                  <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <input
                    type="search"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full rounded-xl border border-white/80 bg-white/60 py-2 pr-10 pl-10 text-xs font-medium text-slate-900 placeholder-slate-500 transition-colors focus:bg-white/90 focus:outline-none dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={toggleSearchVoice}
                    title={searchListening ? 'Остановить запись' : 'Голосовой поиск'}
                    aria-label="Голосовой поиск"
                    className={`absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      searchListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'text-slate-500 hover:bg-white/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    {searchListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </button>
                </form>
              )}

              {/* Theme Switcher + Command Palette + GPS + Install App + Desktop/Mobile + Notifications + Profile */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
                <button
                  type="button"
                  onClick={handleLocateMe}
                  disabled={isGeoDetecting}
                  title={`Текущая геопозиция (${currentLocation.source.toUpperCase()}): ${currentLocation.address}`}
                  className="hidden lg:flex max-w-[190px] items-center gap-1.5 rounded-xl bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-white transition-colors dark:bg-slate-800/80 dark:text-slate-200"
                >
                  <LocateFixed
                    className={`h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400 ${
                      isGeoDetecting ? 'animate-spin' : ''
                    }`}
                  />
                  <span className="truncate">{currentLocation.address}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  title="Быстрая команда (Ctrl+K)"
                  aria-label="Открыть палитру команд"
                  className="hidden sm:flex h-9 items-center gap-1 rounded-xl bg-white/65 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-white transition-colors dark:bg-slate-800/80 dark:text-slate-200"
                >
                  <Command className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline font-mono">⌘K</span>
                </button>

                <AppInstallCenter />

                {/* Driving Focus Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setDrivingMode((v) => !v)}
                  title="Режим «За рулём» (крупные кнопки HUD)"
                  aria-label="Режим За рулём"
                  className={`flex h-9 items-center gap-1 rounded-xl px-2.5 text-[11px] font-bold transition-colors ${
                    drivingMode
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white/65 text-slate-800 hover:bg-white dark:bg-slate-800/80 dark:text-slate-200'
                  }`}
                >
                  <Gauge className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{t.driveMode}</span>
                </button>

                {/* UI Language Toggle (RU / KK / EN) */}
                <button
                  type="button"
                  onClick={() => {
                    const order: UiLang[] = ['ru', 'kk', 'en'];
                    const next = order[(order.indexOf(uiLang) + 1) % order.length];
                    setUiLang(next);
                  }}
                  title="Язык интерфейса: RU / ҚАЗ / EN"
                  aria-label="Переключить язык интерфейса"
                  className="flex h-9 items-center gap-1 rounded-xl bg-white/65 px-2 text-[11px] font-bold text-slate-800 hover:bg-white transition-colors dark:bg-slate-800/80 dark:text-slate-200"
                >
                  <Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  <span>{uiLang === 'kk' ? 'ҚАЗ' : uiLang.toUpperCase()}</span>
                </button>

                {/* Liquid Glass Surface Preset Picker */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPresetMenu((v) => !v)}
                    title="Пресет Liquid Glass поверхности"
                    aria-label="Выбрать стиль Liquid Glass"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/65 text-slate-800 hover:bg-white transition-colors dark:bg-slate-800/80 dark:text-slate-200"
                  >
                    <Palette className="h-4 w-4" />
                  </button>
                  {showPresetMenu && (
                    <div className="liquid-glass absolute top-11 right-0 z-50 w-52 rounded-2xl p-2.5 shadow-2xl space-y-1 text-xs">
                      <div className="px-2 py-1 font-display font-bold text-slate-900 dark:text-slate-100">
                        Стиль Liquid Glass
                      </div>
                      {(
                        [
                          { id: 'crystal', label: 'Кристалл (Стандарт)', dot: 'bg-sky-400' },
                          { id: 'winter', label: 'Зимняя Астана', dot: 'bg-cyan-300' },
                          { id: 'baiterek', label: 'Ночной Байтерек', dot: 'bg-amber-400' },
                          { id: 'steppe', label: 'Степной рассвет', dot: 'bg-emerald-400' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setGlassPreset(p.id);
                            setShowPresetMenu(false);
                            notify(`Тема стекла: ${p.label}`);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left font-semibold transition-colors ${
                            glassPreset === p.id
                              ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                              : 'text-slate-700 hover:bg-white/80 dark:text-slate-200 dark:hover:bg-white/10'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                            {p.label}
                          </span>
                          {glassPreset === p.id && <Check className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Light Liquid Glass / Dark Glass Switcher */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Включить Светлый Liquid Glass' : 'Включить Тёмный Glass'}
                  aria-label="Переключить тему оформления"
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/65 text-slate-800 hover:bg-white transition-colors dark:bg-slate-800/80 dark:text-amber-300 dark:hover:bg-slate-800"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                {/* Explicit Desktop / Mobile View Switcher */}
                <div className="hidden sm:flex items-center rounded-xl border border-white/75 bg-white/55 p-0.5 dark:border-white/15 dark:bg-slate-900/70">
                  <button
                    type="button"
                    onClick={() => setViewMode('desktop')}
                    title="Десктопная версия"
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      !isMobilePreview
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                        : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Десктоп</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('mobile')}
                    title="Мобильная версия"
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      isMobilePreview
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                        : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Мобильная</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNotifications((v) => !v)}
                  aria-label="Уведомления"
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/65 text-slate-800 hover:bg-white dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Bell className="h-4 w-4" />
                  {(activePlansCount > 0 || walletTx.length > 0) && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSection('id')}
                  aria-label="Профиль Qala ID"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 font-display text-sm font-extrabold text-white shadow-sm"
                >
                  {profile.avatarInitial}
                </button>

                {showNotifications && (
                  <div className="liquid-glass absolute top-12 right-0 z-50 w-72 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xl">
                    <div className="flex items-center justify-between font-display font-bold text-slate-900 dark:text-slate-100">
                      <span>События Qala</span>
                      <button
                        type="button"
                        onClick={() => setShowNotifications(false)}
                        className="text-slate-500 hover:text-slate-900 dark:text-slate-400"
                      >
                        Закрыть
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {plans.slice(0, 3).map((p) => (
                        <div key={p.id} className="rounded-xl bg-white/75 p-2.5 dark:bg-slate-900/75">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{p.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.dateLabel}</div>
                        </div>
                      ))}
                      {walletTx.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className="rounded-xl bg-white/75 p-2.5 flex justify-between dark:bg-slate-900/75"
                        >
                          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {t.title}
                          </span>
                          <span className="font-mono font-bold text-slate-900 shrink-0 ml-2 dark:text-slate-100">
                            -{t.amount.toLocaleString('ru-RU')} ₸
                          </span>
                        </div>
                      ))}
                      {plans.length === 0 && walletTx.length === 0 && (
                        <div className="py-3 text-center text-slate-500 dark:text-slate-400">
                          Пока новых уведомлений нет
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isMobilePreview && (
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <button
                  type="button"
                  onClick={handleLocateMe}
                  className="flex items-center gap-1.5 min-w-0 text-left hover:text-slate-900 dark:hover:text-white"
                >
                  <LocateFixed
                    className={`h-3 w-3 shrink-0 text-sky-600 dark:text-sky-400 ${
                      isGeoDetecting ? 'animate-spin' : ''
                    }`}
                  />
                  <span className="truncate">{currentLocation.address}</span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCommandOpen(true)}
                    className="flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Command className="h-3 w-3" />
                    Поиск
                  </button>
                  <button
                    type="button"
                    onClick={toggleSearchVoice}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                      searchListening
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Mic className="h-3 w-3" />
                    Голос
                  </button>
                </div>
              </div>
            )}
          </header>

          {/* SUB-VIEW BREADCRUMB */}
          {section !== 'dashboard' && (
            <div className="liquid-glass flex items-center justify-between gap-3 overflow-x-auto rounded-2xl px-4 py-2.5">
              <button
                type="button"
                onClick={() => setSection('dashboard')}
                className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-white whitespace-nowrap shrink-0 dark:bg-slate-800 dark:text-slate-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                На главную
              </button>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'map', label: 'Карта' },
                    { id: 'taxi', label: 'Taxi' },
                    { id: 'bus', label: 'Автобусы' },
                    { id: 'traffic', label: 'Пробки · 7д' },
                    { id: 'food', label: 'Qala Food' },
                    { id: 'info', label: 'Валюты · eGov' },
                    { id: 'uy', label: 'Qala Үй' },
                    { id: 'market', label: 'Market' },
                    { id: 'delivery', label: 'Delivery' },
                    { id: 'tv', label: 'Qala TV' },
                    { id: 'admin', label: 'Админка' },
                    { id: 'qino', label: 'Qino' },
                    { id: 'ai', label: 'Qala AI' },
                    { id: 'wallet', label: 'Wallet' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSection(tab.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      section === tab.id
                        ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                        : 'bg-white/50 text-slate-700 hover:bg-white/85 dark:bg-white/10 dark:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MAIN DASHBOARD */}
          {section === 'dashboard' && (
            <div className="space-y-4 sm:space-y-5">
              {/* MOBILE COMPACT DASHBOARD (One-handed thumb-zone friendly) */}
              <div className={isMobilePreview ? 'block space-y-4' : 'block md:hidden space-y-4'}>
                <div className="liquid-glass rounded-3xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h1 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                      {greetingLabel}!
                    </h1>
                    <button
                      type="button"
                      onClick={() => setSection('traffic')}
                      className="rounded-xl bg-white/70 px-2.5 py-1 font-mono text-xs font-bold text-slate-800 tabular-nums dark:bg-slate-800/80 dark:text-slate-100"
                    >
                      {weather.temperature}°C · 7д
                    </button>
                  </div>

                  {/* Mobile Morning Briefing Strip */}
                  <div className="rounded-2xl bg-white/65 p-3 space-y-2 text-xs dark:bg-slate-800/65">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {frostAdvisoryLabel}
                      </span>
                      <button
                        type="button"
                        onClick={handleLocateMe}
                        className="flex items-center gap-1 text-[10px] font-bold text-sky-600 dark:text-sky-400 shrink-0"
                      >
                        <LocateFixed className="h-3 w-3" />
                        GPS
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => launchQuickTaxi('home')}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white dark:bg-orange-500 dark:text-slate-950"
                      >
                        Такси домой
                      </button>
                      <button
                        type="button"
                        onClick={() => launchQuickTaxi('work')}
                        className="rounded-xl bg-white/80 px-3 py-1.5 text-[11px] font-bold text-slate-900 dark:bg-slate-900/75 dark:text-slate-100"
                      >
                        На работу
                      </button>
                    </div>
                  </div>

                  {/* Mobile Quick Voice Search Bar */}
                  <form onSubmit={handleGlobalSearchSubmit} className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" />
                    <input
                      type="search"
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      placeholder="Найти еду, такси, сервис…"
                      className="min-h-[44px] w-full rounded-xl border border-white/80 bg-white/75 pr-11 pl-9 text-xs font-medium text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={toggleSearchVoice}
                      aria-label="Голосовой ввод"
                      className={`absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-lg ${
                        searchListening
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  </form>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSection('taxi')}
                      className="liquid-glass-subtle min-h-[78px] rounded-2xl p-3.5 text-left"
                    >
                      <Car className="h-6 w-6 text-amber-600" />
                      <div className="mt-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        Qala Taxi
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        От 850 ₸ · маршрут
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSection('food')}
                      className="liquid-glass-subtle min-h-[78px] rounded-2xl p-3.5 text-left"
                    >
                      <Utensils className="h-6 w-6 text-orange-600" />
                      <div className="mt-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        Qala Food
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Доставка 25–35 мин
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSection('traffic')}
                      className="liquid-glass-subtle min-h-[78px] rounded-2xl p-3.5 text-left"
                    >
                      <CloudSun className="h-6 w-6 text-rose-600" />
                      <div className="mt-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        Пробки · 7д
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Сергек и погода
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSection('info')}
                      className="liquid-glass-subtle min-h-[78px] rounded-2xl p-3.5 text-left"
                    >
                      <Coins className="h-6 w-6 text-emerald-600" />
                      <div className="mt-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        Валюты · eGov
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Курсы и памятки
                      </div>
                    </button>
                  </div>

                  <div className="flex gap-3 overflow-x-auto py-1">
                    {serviceTiles.map((tile) => {
                      const Icon = tile.icon;
                      return (
                        <button
                          key={tile.label}
                          type="button"
                          onClick={() => setSection(tile.id)}
                          className="flex flex-col items-center gap-1.5 shrink-0 min-w-[60px]"
                        >
                          <span className="liquid-glass-subtle flex h-12 w-12 items-center justify-center rounded-2xl">
                            <Icon className={`h-5 w-5 ${tile.tint}`} />
                          </span>
                          <span className="text-[11px] font-medium text-slate-800 whitespace-nowrap dark:text-slate-200">
                            {tile.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    <button
                      type="button"
                      onClick={() => setSection('ai')}
                      className="col-span-3 flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700"
                    >
                      <Sparkles className="h-4 w-4" />
                      Qala AI (Голос)
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceSheetOpen(true)}
                      className="col-span-2 flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 py-3 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
                    >
                      <LayoutList className="h-4 w-4" />
                      Все 20
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSection('info')}
                      className="liquid-glass-subtle min-h-[54px] rounded-2xl p-3 text-left"
                    >
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Планы и напоминания
                      </div>
                      <div className="mt-0.5 font-display text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
                        {activePlansCount > 0 ? `${activePlansCount} активных` : 'Открыть eGov'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('wallet')}
                      className="liquid-glass-subtle min-h-[54px] rounded-2xl p-3 text-left"
                    >
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Расходы за месяц
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
                        {walletTotal.toLocaleString('ru-RU')} ₸
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* DESKTOP FULL BENTO WORKSPACE */}
              {!isMobilePreview && (
                <div className="hidden md:block space-y-5">
                  {/* DESKTOP MORNING BRIEFING & 1-TAP COMMUTE STRIP */}
                  <div className="liquid-glass relative flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="rounded-xl bg-sky-500/15 px-3 py-1.5 font-bold text-sky-700 dark:text-sky-300">
                        {frostAdvisoryLabel}
                      </span>
                      <button
                        type="button"
                        onClick={handleLocateMe}
                        className="flex items-center gap-1.5 text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                      >
                        <LocateFixed
                          className={`h-3.5 w-3.5 text-sky-600 dark:text-sky-400 ${
                            isGeoDetecting ? 'animate-spin' : ''
                          }`}
                        />
                        <span className="font-semibold">
                          {t.myLoc} ({currentLocation.source.toUpperCase()}):
                        </span>
                        <span className="truncate max-w-[260px]">{currentLocation.address}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => launchQuickTaxi('home')}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
                      >
                        <Home className="h-3.5 w-3.5" />
                        {t.homeTaxi}
                      </button>
                      <button
                        type="button"
                        onClick={() => launchQuickTaxi('work')}
                        className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
                      >
                        <Car className="h-3.5 w-3.5 text-amber-500" />
                        {t.workTaxi}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommandOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Command className="h-3.5 w-3.5" />
                        Ctrl+K
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowWidgetCustomizer((v) => !v)}
                          className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {t.widgets}
                        </button>
                        {showWidgetCustomizer && (
                          <div className="liquid-glass absolute top-11 right-0 z-50 w-64 rounded-2xl p-3.5 shadow-2xl space-y-2 text-xs">
                            <div className="flex items-center justify-between font-display font-bold text-slate-900 dark:text-slate-100">
                              <span>Виджеты рабочего стола</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDashWidgets({
                                    map: true,
                                    weather_taxi_food: true,
                                    services: true,
                                    summary: true,
                                    market_delivery_tv: true,
                                  })
                                }
                                className="text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400"
                              >
                                Все
                              </button>
                            </div>
                            {(
                              [
                                { key: 'map', label: 'Живая карта Астаны' },
                                { key: 'weather_taxi_food', label: 'Погода, Такси и Еда' },
                                { key: 'services', label: 'Сетка 12 сервисов' },
                                { key: 'summary', label: 'Сводка: Валюты, Wallet, Үй' },
                                { key: 'market_delivery_tv', label: 'Market, Delivery, Qala TV' },
                              ] as const
                            ).map((w) => (
                              <label
                                key={w.key}
                                className="flex items-center justify-between rounded-xl bg-white/70 px-2.5 py-2 cursor-pointer dark:bg-slate-800/70"
                              >
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {w.label}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={dashWidgets[w.key]}
                                  onChange={(e) =>
                                    setDashWidgets((prev) => ({
                                      ...prev,
                                      [w.key]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 accent-sky-600"
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ROW 1: Main 3-Column Bento */}
                  {(dashWidgets.map || dashWidgets.weather_taxi_food || dashWidgets.services) && (
                    <div className="grid grid-cols-12 gap-5">
                      {/* Col 1 (5 cols): Qala Карта Live Widget */}
                      {dashWidgets.map && (
                        <div className="liquid-glass col-span-12 lg:col-span-5 flex flex-col justify-between rounded-3xl p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                          <MapPin className="h-5 w-5 text-slate-800 dark:text-sky-400" />
                          <span>Qala Карта</span>
                          <span className="rounded-lg bg-emerald-600/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300">
                            QalaKarta · 3D
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSection('map')}
                          className="rounded-xl bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-slate-900 hover:bg-white shadow-sm dark:bg-slate-800 dark:text-slate-100"
                        >
                          Открыть карту
                        </button>
                      </div>

                      <div className="my-4 h-[260px] overflow-hidden rounded-2xl border border-white/80 shadow-inner dark:border-white/10">
                        <AstanaMap
                          center={ASTANA_CENTER}
                          zoom={12}
                          places={ASTANA_PLACES.slice(0, 6)}
                          interactive={false}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setSection('map')}
                          className="liquid-glass-subtle flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                        >
                          <Navigation className="h-3.5 w-3.5 text-blue-600" />
                          Карта
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection('bus')}
                          className="liquid-glass-subtle flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                        >
                          <Bus className="h-3.5 w-3.5 text-sky-600" />
                          Автобусы
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection('traffic')}
                          className="liquid-glass-subtle flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                        >
                          <CloudSun className="h-3.5 w-3.5 text-rose-600" />
                          Пробки
                        </button>
                      </div>
                    </div>
                      )}

                    {/* Col 2 (3 cols): Weather 7d + Taxi + Food */}
                    {dashWidgets.weather_taxi_food && (
                    <div className="col-span-6 lg:col-span-3 flex flex-col justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => setSection('traffic')}
                        className="liquid-glass flex-1 rounded-3xl p-5 flex flex-col justify-center text-left transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex items-center gap-3.5">
                          <CloudSnow className="h-10 w-10 text-sky-700 dark:text-sky-400 shrink-0" strokeWidth={1.6} />
                          <div>
                            <div className="font-display text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                              {weather.temperature}°
                            </div>
                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              {weather.description} · Прогноз 7д
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                          ощущается {weather.apparentTemperature}° · ветер {weather.windSpeed} м/с
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSection('taxi')}
                        className="liquid-glass flex items-center gap-3.5 rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/25 text-amber-600">
                          <Car className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                            Qala Taxi
                          </div>
                          <div className="text-xs text-slate-700 tabular-nums dark:text-slate-300">
                            От 850 ₸ · Эконом / Комфорт
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSection('food')}
                        className="liquid-glass flex items-center gap-3.5 rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-600">
                          <Utensils className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                            Qala Food
                          </div>
                          <div className="text-xs text-slate-700 dark:text-slate-300">
                            Рестораны Астаны · 25–35 мин
                          </div>
                        </div>
                      </button>
                    </div>
                    )}

                    {/* Col 3 (4 cols): Сервисы 3x4 Grid */}
                    {dashWidgets.services && (
                    <div className="liquid-glass col-span-6 lg:col-span-4 rounded-3xl p-5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                          {t.servicesTitle}
                        </h2>
                        <button
                          type="button"
                          onClick={() => setSection('ai')}
                          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {t.askAi}
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        {serviceTiles.map((tile) => {
                          const Icon = tile.icon;
                          return (
                            <button
                              key={tile.label}
                              type="button"
                              onClick={() => setSection(tile.id)}
                              className="liquid-glass-subtle flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 px-2 transition-transform hover:-translate-y-0.5"
                            >
                              <Icon className={`h-5 w-5 ${tile.tint}`} />
                              <span className="text-xs font-semibold text-slate-800 whitespace-nowrap dark:text-slate-200">
                                {tile.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    )}
                  </div>
                  )}

                  {/* ROW 2: Bottom 3 Summary Tiles */}
                  {dashWidgets.summary && (
                  <div className="grid grid-cols-3 gap-5">
                    <button
                      type="button"
                      onClick={() => setSection('info')}
                      className="liquid-glass flex items-center gap-4 rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-400">
                        <Coins className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                          Валюты, eGov и планы
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Курсы KZT, памятки и {activePlansCount} планов
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSection('wallet')}
                      className="liquid-glass flex items-center gap-4 rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                        <Wallet className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-mono text-xl font-extrabold text-slate-900 tabular-nums dark:text-slate-100">
                          {walletTotal.toLocaleString('ru-RU')} ₸
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Расходы за месяц
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSection('uy')}
                      className="liquid-glass flex items-center gap-4 rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/15 text-emerald-800 dark:text-emerald-400">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-display text-lg font-extrabold text-slate-900 tabular-nums dark:text-slate-100">
                          {apartments.length} квартир на карте
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Qala Үй · Астана
                        </div>
                      </div>
                    </button>
                  </div>
                  )}

                  {/* ROW 3: Live Desktop Dashboard Widgets (Market, Delivery, Qala TV) */}
                  {dashWidgets.market_delivery_tv && (
                  <div className="grid grid-cols-12 gap-5">
                    <div className="liquid-glass col-span-12 lg:col-span-5 rounded-3xl p-5 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                          Qala <span className="text-orange-600">Market</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSection('market')}
                          className="rounded-xl bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                        >
                          Все объявления ({marketItems.length})
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {marketItems.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSection('market')}
                            className="liquid-glass-subtle rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5"
                          >
                            <ShoppingBag className="h-5 w-5 text-orange-600" />
                            <div className="mt-2 truncate font-display text-xs font-bold text-slate-900 dark:text-slate-100">
                              {item.title}
                            </div>
                            <div className="mt-0.5 font-mono text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                              {item.isFree ? 'Даром' : `${item.price.toLocaleString('ru-RU')} ₸`}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {item.category}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="liquid-glass col-span-12 lg:col-span-4 rounded-3xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                          Qala <span className="text-emerald-700 dark:text-emerald-400">Delivery</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSection('delivery')}
                          className="rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                        >
                          Маршрут ({deliveryStops.length})
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {deliveryStops.slice(0, 4).map((stop, idx) => (
                          <div
                            key={stop.id}
                            className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-xs dark:bg-slate-900/65"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white ${
                                  stop.done ? 'bg-emerald-600' : 'bg-rose-600'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span
                                className={`truncate font-medium ${
                                  stop.done
                                    ? 'line-through text-slate-500'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {stop.name}
                              </span>
                            </div>
                            {stop.done && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="liquid-glass col-span-12 lg:col-span-3 rounded-3xl p-5 flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                          Qala <span className="text-rose-600">TV</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSection('tv')}
                          className="rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                        >
                          Эфир
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {KAZAKHSTAN_TV_CHANNELS.slice(0, 6).map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => {
                              setSelectedTvChannel(ch);
                              setSection('tv');
                            }}
                            className="liquid-glass-subtle truncate rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-white dark:text-slate-200"
                          >
                            {ch.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE SUB-MODULES */}
          {(section === 'map' || section === 'taxi' || section === 'bus') && (
            <QalaMapModule
              key={section}
              initialMode={section === 'taxi' ? 'taxi' : section === 'bus' ? 'bus' : 'map'}
              initialDestination={mapDestination}
              initialRouteCoords={mapRouteCoords}
              apartments={apartments}
              currentLocation={currentLocation}
              isDetectingLocation={isGeoDetecting}
              onRefreshLocation={refreshLocation}
              onSetManualLocation={setManualLocation}
              onToggleLiveTracking={toggleLiveTracking}
              onWalletChange={refreshWalletAndPlans}
              onBookTaxi={(title, amount) => addWalletTransaction(title, 'Такси', amount)}
              onNotify={notify}
            />
          )}

          {section === 'traffic' && <QalaTrafficModule />}

          {section === 'food' && (
            <QalaFoodModule
              defaultAddress={profile.address}
              currentLocation={currentLocation}
              onOrderCompleted={refreshWalletAndPlans}
              onOpenOnMap={(name, address, lat, lng) => {
                setMapDestination({ name, address, lat, lng });
                setMapRouteCoords([]);
                setSection('map');
              }}
              onNotify={notify}
            />
          )}

          {section === 'info' && (
            <QalaCityInfoModule
              currentLocation={currentLocation}
              onOpenRoute={(name, address, lat, lng) => {
                setMapDestination({ name, address, lat, lng });
                setMapRouteCoords([]);
                setSection('map');
              }}
              onNotify={notify}
              onLogExpense={async (title, category, amount) => {
                await addWalletTransaction(title, category, amount);
                notify(`Записано в Wallet: ${title} (-${amount.toLocaleString('ru-RU')} ₸)`);
              }}
            />
          )}

          {section === 'uy' && (
            <QalaUyModule
              apartments={apartments}
              onRefresh={refreshApartments}
              onBuildRouteTo={(name, address, lat, lng) => {
                setMapDestination({ name, address, lat, lng });
                setMapRouteCoords([]);
                setSection('map');
              }}
              onNotify={notify}
            />
          )}

          {section === 'market' && (
            <QalaMarketModule
              items={marketItems}
              onRefresh={refreshMarket}
              onBuyOrReserve={async (item) => {
                await fetch(`${API_BASE}/api/market/${encodeURIComponent(item.id)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'reserved' }),
                });
                if (!item.isFree && item.price > 0) {
                  await addWalletTransaction(item.title, 'Маркет', item.price);
                }
                await refreshMarket();
                notify(
                  item.isFree
                    ? `Товар «${item.title}» забронирован`
                    : `Покупка «${item.title}» записана в Кошелёк`
                );
              }}
              onShowOnMap={(addr) => {
                setMapDestination({
                  name: addr,
                  address: addr,
                  lat: 51.1282,
                  lng: 71.4304,
                });
                setSection('map');
              }}
              onNotify={notify}
            />
          )}

          {section === 'delivery' && (
            <QalaDeliveryModule
              stops={deliveryStops}
              onRefresh={refreshDelivery}
              onOpenOnFullMap={(coords) => {
                setMapRouteCoords(coords);
                setSection('map');
              }}
              onNotify={notify}
            />
          )}

          {/* Persistent Mounted TV Module for FloatingMiniPlayer Background Stream */}
          {tvMounted && (
            <div className={section === 'tv' ? 'block' : 'hidden'}>
              <QalaTvModule
                initialChannel={selectedTvChannel}
                isVisible={section === 'tv'}
                onOpenAdmin={() => setSection('admin')}
                onNotify={notify}
                onFullscreenChange={setIsTvFullscreen}
                onMediaChange={handleTvMediaChange}
                externalCommand={
                  mediaCommand && mediaCommand.target === 'tv'
                    ? { target: 'tv' as const, action: mediaCommand.action, seq: mediaCommand.seq }
                    : null
                }
              />
            </div>
          )}

          {section === 'admin' && (
            <QalaAdminModule
              onPlayChannel={(ch) => {
                setSelectedTvChannel(ch);
                setSection('tv');
              }}
              onNotify={notify}
            />
          )}

          {section === 'qino' && (
            <QalaQinoModule
              favoriteMovies={favoriteMovies}
              onOpenOnMap={(name, address, lat, lng) => {
                setMapDestination({ name, address, lat, lng });
                setMapRouteCoords([]);
                setSection('map');
              }}
              onToggleFavorite={async (movie) => {
                const exists = favoriteMovies.some((f) => f.id === movie.id);
                if (exists) {
                  await fetch(`${API_BASE}/api/favorites/${encodeURIComponent(movie.id)}`, {
                    method: 'DELETE',
                  });
                  notify(`«${movie.title}» удалён из избранного`);
                } else {
                  await fetch(`${API_BASE}/api/favorites`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(movie),
                  });
                  notify(`«${movie.title}» сохранён в избранное`);
                }
                await refreshFavorites();
              }}
              onBuyTicket={async (movie, time, details) => {
                const price = details?.totalPrice ?? movie.ticketPrice ?? 2200;
                const seatsSuffix = details?.seatsLabel ? ` · места ${details.seatsLabel}` : '';
                const hallLabel = details?.cinemaHall || movie.cinemaHall || 'Астана';
                await addWalletTransaction(
                  `Билет: ${movie.title} (${time}${seatsSuffix})`,
                  'Кино',
                  price
                );
                await fetch(`${API_BASE}/api/plans`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: `Кино «${movie.title}» · ${hallLabel}${seatsSuffix}`,
                    dateLabel: `Сегодня в ${time}`,
                  }),
                });
                await refreshWalletAndPlans();
                notify(
                  details?.seatsLabel
                    ? `Билеты (${details.seatsLabel}) на ${time} оформлены`
                    : `Билет на ${time} оформлен и добавлен в Планы`
                );
              }}
            />
          )}

          {section === 'ai' && (
            <QalaAiModule
              onNavigateSection={setSection}
              onPlayTvByName={(q) => {
                const ch = KAZAKHSTAN_TV_CHANNELS.find((c) =>
                  c.name.toLowerCase().includes(q.toLowerCase())
                );
                if (ch) setSelectedTvChannel(ch);
                setSection('tv');
              }}
              onBuildRouteToPlace={(q) => {
                const pl = ASTANA_PLACES.find((p) =>
                  p.name.toLowerCase().includes(q.toLowerCase())
                );
                if (pl) {
                  setMapDestination({
                    name: pl.name,
                    address: pl.address,
                    lat: pl.lat,
                    lng: pl.lng,
                  });
                  setMapRouteCoords([]);
                  setSection('taxi');
                } else {
                  setSection('map');
                }
              }}
              onLogExpense={async (title, category, amount) => {
                await addWalletTransaction(title, category, amount);
                notify(`Записано в Wallet: ${title} (-${amount.toLocaleString('ru-RU')} ₸)`);
              }}
            />
          )}

          {section === 'sheshim' && <QalaSheshimModule />}

          {/* Persistent Mounted Radio Module for FloatingMiniPlayer Background Audio */}
          {musicMounted && (
            <div className={section === 'music' ? 'block' : 'hidden'}>
              <QalaMusicModule
                onMediaChange={handleRadioMediaChange}
                externalCommand={
                  mediaCommand && mediaCommand.target === 'radio'
                    ? { target: 'radio' as const, action: mediaCommand.action, seq: mediaCommand.seq }
                    : null
                }
              />
            </div>
          )}

          {section === 'sport' && (
            <QalaSportModule
              onOpenOnMap={(name, address, lat, lng) => {
                setMapDestination({ name, address, lat, lng });
                setSection('map');
              }}
              onLogWorkoutPlan={async (title) => {
                await fetch(`${API_BASE}/api/plans`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, dateLabel: 'Выполнено' }),
                });
                await refreshWalletAndPlans();
                notify('Тренировка записана в историю');
              }}
            />
          )}

          {section === 'history' && <QalaHistoryModule transactions={walletTx} plans={plans} />}

          {section === 'wallet' && (
            <QalaWalletModule
              transactions={walletTx}
              totalSpent={walletTotal}
              plans={plans}
              onAddTransaction={addWalletTransaction}
              onDeleteTransaction={async (id) => {
                await fetch(`${API_BASE}/api/wallet/${encodeURIComponent(id)}`, { method: 'DELETE' });
                await refreshWalletAndPlans();
              }}
              onAddPlan={async (title, dateLabel) => {
                await fetch(`${API_BASE}/api/plans`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, dateLabel }),
                });
                await refreshWalletAndPlans();
              }}
              onTogglePlan={async (id, completed) => {
                await fetch(`${API_BASE}/api/plans/${encodeURIComponent(id)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ completed }),
                });
                await refreshWalletAndPlans();
              }}
              onDeletePlan={async (id) => {
                await fetch(`${API_BASE}/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
                await refreshWalletAndPlans();
              }}
            />
          )}

          {section === 'offline' && <QalaOfflineModule onNotify={notify} />}

          {section === 'id' && (
            <QalaIdModule
              profile={profile}
              onSave={async (updated) => {
                const res = await fetch(`${API_BASE}/api/profile`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updated),
                });
                if (res.ok) {
                  const d = (await res.json()) as { profile: QalaProfile };
                  setProfile(d.profile);
                  notify('Профиль Qala ID обновлён');
                }
              }}
              onNotify={notify}
              onDataRestored={async () => {
                await Promise.all([
                  refreshProfile(),
                  refreshApartments(),
                  refreshMarket(),
                  refreshDelivery(),
                  refreshWalletAndPlans(),
                  refreshFavorites(),
                ]);
              }}
            />
          )}
        </div>
      </div>

      {/* FLOATING MINI-PLAYER (TV & Radio background control) */}
      {!isTvFullscreen && (
        <FloatingMiniPlayer
          media={miniPlayerMedia}
          isMobileLayout={isMobilePreview}
          onTogglePlay={() => {
            if (!miniPlayerMedia) return;
            cmdSeqRef.current += 1;
            setMediaCommand({
              target: miniPlayerMedia.kind,
              action: 'toggle',
              seq: cmdSeqRef.current,
            });
            setMiniPlayerMedia((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : null));
          }}
          onOpenFull={() => {
            if (!miniPlayerMedia) return;
            setSection(miniPlayerMedia.kind === 'tv' ? 'tv' : 'music');
          }}
          onClose={() => {
            if (miniPlayerMedia) {
              cmdSeqRef.current += 1;
              setMediaCommand({
                target: miniPlayerMedia.kind,
                action: 'stop',
                seq: cmdSeqRef.current,
              });
            }
            setMiniPlayerMedia(null);
          }}
        />
      )}

      {/* MOBILE BOTTOM LIQUID GLASS TAB BAR (Compact 56px + >=44px Thumb Targets) */}
      <nav
        aria-label="Мобильная навигация"
        className={`liquid-glass fixed inset-x-3 bottom-2 z-40 grid h-14 grid-cols-5 items-center rounded-2xl px-1 ${
          isTvFullscreen
            ? 'hidden'
            : isMobilePreview
            ? 'mx-auto max-w-[406px]'
            : 'md:hidden'
        }`}
      >
        {(
          [
            { id: 'dashboard', label: t.cityTab, icon: LayoutGrid },
            { id: 'map', label: t.mapTab, icon: Compass },
            { id: 'tv', label: 'Qala TV', icon: Tv },
            { id: 'food', label: 'Food', icon: Utensils },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center rounded-xl transition-colors ${
                active
                  ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="mt-0.5 text-[10px] font-semibold tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setServiceSheetOpen(true)}
          className={`flex min-h-[44px] flex-col items-center justify-center rounded-xl transition-colors ${
            serviceSheetOpen
              ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
              : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          <LayoutList className="h-4 w-4" />
          <span className="mt-0.5 text-[10px] font-semibold tracking-tight whitespace-nowrap">
            {t.allServices}
          </span>
        </button>
      </nav>

      {/* MOBILE ALL SERVICES BOTTOM SHEET */}
      <MobileServiceSheet
        open={serviceSheetOpen}
        activeSection={section}
        onSelect={(next) => setSection(next)}
        onClose={() => setServiceSheetOpen(false)}
      />

      {/* GLOBAL COMMAND PALETTE (Ctrl+K / Cmd+K) */}
      {commandOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 pt-16 sm:pt-24 backdrop-blur-sm"
          onClick={() => setCommandOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-xl overflow-hidden rounded-3xl shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-900/10 px-4 py-3 dark:border-white/10">
              <Command className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <input
                type="search"
                autoFocus
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Быстрый переход: такси домой, ЖКХ, штраф ПДД, ТВ канал, место…"
                className="flex-1 bg-transparent text-sm font-medium text-slate-900 placeholder-slate-500 focus:outline-none dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setCommandOpen(false)}
                className="rounded-lg bg-white/70 p-1.5 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                aria-label="Закрыть палитру команд"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {commandResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Ничего не найдено по запросу «{commandQuery}»
                </div>
              ) : (
                commandResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      item.run();
                      setCommandOpen(false);
                      setCommandQuery('');
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors hover:bg-white/80 dark:hover:bg-slate-800/80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {item.subtitle}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-900/10 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                      {item.badge}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DRIVING FOCUS MODE HUD OVERLAY («За рулём») */}
      {drivingMode && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950/95 p-4 sm:p-8 text-white backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg">
                <Gauge className="h-6 w-6" />
              </div>
              <div>
                <div className="font-display text-xl font-extrabold">Режим «За рулём» · QALA HUD</div>
                <div className="text-xs text-slate-300">
                  {currentLocation.address} · {weather.temperature}°C · {frostAdvisoryLabel}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrivingMode(false)}
              className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-white/15 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/25"
            >
              <X className="h-5 w-5" />
              Выйти
            </button>
          </div>

          <div className="my-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-6">
            <button
              type="button"
              onClick={() => {
                setDrivingMode(false);
                setSection('map');
              }}
              className="flex min-h-[112px] items-center gap-4 rounded-3xl bg-sky-600 p-6 text-left shadow-xl hover:bg-sky-500"
            >
              <Navigation className="h-10 w-10 shrink-0" />
              <div>
                <div className="font-display text-2xl font-extrabold">Карта и GPS</div>
                <div className="text-sm text-sky-100">Маршрут, парковки и «Я припарковался»</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrivingMode(false);
                launchQuickTaxi('home');
              }}
              className="flex min-h-[112px] items-center gap-4 rounded-3xl bg-amber-500 p-6 text-left text-slate-950 shadow-xl hover:bg-amber-400"
            >
              <Home className="h-10 w-10 shrink-0" />
              <div>
                <div className="font-display text-2xl font-extrabold">Домой</div>
                <div className="text-sm font-semibold text-slate-900">
                  {profile.address || 'Нұржол желек жолы, 14'}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrivingMode(false);
                setSection('traffic');
              }}
              className="flex min-h-[112px] items-center gap-4 rounded-3xl bg-rose-600 p-6 text-left shadow-xl hover:bg-rose-500"
            >
              <CloudSun className="h-10 w-10 shrink-0" />
              <div>
                <div className="font-display text-2xl font-extrabold">Пробки и мосты</div>
                <div className="text-sm text-rose-100">Сергек, AQI и загруженность переправ</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrivingMode(false);
                setSection('ai');
              }}
              className="flex min-h-[112px] items-center gap-4 rounded-3xl bg-indigo-600 p-6 text-left shadow-xl hover:bg-indigo-500"
            >
              <Sparkles className="h-10 w-10 shrink-0" />
              <div>
                <div className="font-display text-2xl font-extrabold">Голосовой AI</div>
                <div className="text-sm text-indigo-100">«Маршрут до…», «Включи ТВ», расходы</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrivingMode(false);
                setSection('music');
              }}
              className="flex min-h-[112px] items-center gap-4 rounded-3xl bg-violet-600 p-6 text-left shadow-xl hover:bg-violet-500"
            >
              <Radio className="h-10 w-10 shrink-0" />
              <div>
                <div className="font-display text-2xl font-extrabold">Qala Радио</div>
                <div className="text-sm text-violet-100">Казахстанские FM-станции в пути</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrivingMode(false);
                setSection('info');
              }}
              className="flex min-h-[112px] items-center gap-4 rounded-3xl bg-emerald-700 p-6 text-left shadow-xl hover:bg-emerald-600"
            >
              <Phone className="h-10 w-10 shrink-0" />
              <div>
                <div className="font-display text-2xl font-extrabold">iKomek 109 / ПДД</div>
                <div className="text-sm text-emerald-100">Штрафы МРП, 109 и экстренные службы</div>
              </div>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-xs text-slate-400">
            <span>Экстренные номера Астаны: 109 (iKomek) · 102 (Полиция) · 103 (Скорая) · 112 (ЧС)</span>
            <span className="font-mono text-slate-300">
              {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Offline Status Banner */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-50 rounded-2xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-xl"
        >
          Офлайн-режим — используются кэшированные данные
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 rounded-2xl bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md dark:bg-slate-100 dark:text-slate-950"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
