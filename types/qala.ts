export type QalaSection =
  | 'dashboard'
  | 'map'
  | 'taxi'
  | 'bus'
  | 'traffic'
  | 'food'
  | 'info'
  | 'uy'
  | 'market'
  | 'delivery'
  | 'tv'
  | 'admin'
  | 'qino'
  | 'ai'
  | 'sheshim'
  | 'wallet'
  | 'offline'
  | 'id'
  | 'music'
  | 'sport'
  | 'history';

export type ThemeMode = 'light' | 'dark';

export interface QalaProfile {
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  avatarInitial: string;
}

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  updatedAt: string;
  isLive: boolean;
}

export interface WeeklyForecastDay {
  date: string;
  dayLabel: string;
  weatherCode: number;
  description: string;
  tempMax: number;
  tempMin: number;
  precipProb: number;
  windMax: number;
}

export interface AstanaPlace {
  id: string;
  name: string;
  category: 'landmark' | 'mall' | 'station' | 'parking' | 'bus' | 'cinema' | 'sport';
  address: string;
  lat: number;
  lng: number;
  info?: string;
}

export interface ApartmentListing {
  id: string;
  title: string;
  rentType: 'Аренда' | 'Посуточно';
  rooms: number;
  area: number;
  floor: string;
  price: number;
  address: string;
  district: string;
  source: string;
  lat: number;
  lng: number;
  addedAt: string;
  isFavorite: boolean;
  isHidden: boolean;
  isCustom: boolean;
  description?: string;
}

export interface MarketListing {
  id: string;
  title: string;
  price: number;
  isFree: boolean;
  category:
    | 'Электроника'
    | 'Одежда'
    | 'Учебники'
    | 'Для дома'
    | 'Авто'
    | 'Даром'
    | 'Другое';
  address: string;
  distanceMeters: number;
  sellerName: string;
  phone: string;
  description: string;
  createdAt: string;
  isMine: boolean;
  status: 'active' | 'reserved';
}

export interface DeliveryStop {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  done: boolean;
  eta?: string;
}

export interface WalletTransaction {
  id: string;
  title: string;
  category: 'Такси' | 'Маркет' | 'Кино' | 'Еда' | 'Транспорт' | 'Другое';
  amount: number;
  createdAt: string;
}

export interface PlanItem {
  id: string;
  title: string;
  dateLabel: string;
  completed: boolean;
  createdAt: string;
}

export type VideoQuality = 'auto' | '720p' | '1080p';

export interface TvChannel {
  id: string;
  name: string;
  category: string;
  currentShow: string;
  nextShow: string;
  accentColor: string;
  streamUrl: string;
  logoUrl?: string;
  qualityStreams?: Partial<Record<VideoQuality, string>>;
  isRegional?: boolean;
  sourceM3u?: string;
  isActive?: boolean;
}

export interface EpgProgram {
  time: string;
  title: string;
  genre: string;
  isNow?: boolean;
}

export interface M3uSource {
  id: string;
  name: string;
  url: string;
  channelCount: number;
  lastSyncedAt: string;
  createdAt: string;
}

export interface CinemaMovie {
  id: string;
  title: string;
  originalTitle?: string;
  year: number;
  genre: string;
  duration: string;
  rating: string;
  director: string;
  description: string;
  posterUrl: string;
  videoUrl: string;
  source: 'open-cinema' | 'itunes' | 'archive' | 'custom';
  cinemaHall?: string;
  showtimes?: string[];
  ticketPrice?: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  coordinates: Array<[number, number]>;
  isLiveOsrm: boolean;
}

export type FoodCategory =
  | 'Все'
  | 'Национальная'
  | 'Бургеры и донеры'
  | 'Кофе и десерты'
  | 'Азиатская'
  | 'Пицца и паста';

export interface FoodMenuItem {
  id: string;
  restaurantId: string;
  restaurantName: string;
  name: string;
  category: Exclude<FoodCategory, 'Все'>;
  price: number;
  weight: string;
  etaMin: string;
  rating: string;
  description: string;
  accentColor: string;
}

export interface FoodOrder {
  id: string;
  restaurant: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  address: string;
  status: string;
  createdAt: string;
}

export type TaxiTariffId = 'econom' | 'comfort' | 'business' | 'minivan';

export interface TaxiTariff {
  id: TaxiTariffId;
  name: string;
  subtitle: string;
  baseFare: number;
  perKm: number;
  etaMin: string;
  seats: number;
}

export interface TrafficSegment {
  id: string;
  street: string;
  district: string;
  level: 'free' | 'moderate' | 'busy';
  score: number;
  speedKmh: number;
  coords: Array<[number, number]>;
}

export interface SergekCamera {
  id: string;
  name: string;
  intersection: string;
  limitKmh: number;
  lat: number;
  lng: number;
  status: 'active' | 'monitoring';
}

export interface ExchangeRatesData {
  base: 'KZT';
  updatedAt: string;
  isLive: boolean;
  rates: Record<'USD' | 'EUR' | 'RUB' | 'CNY' | 'GBP' | 'TRY', number>;
}

export interface EgovGuide {
  id: string;
  title: string;
  category: string;
  duration: string;
  fee: string;
  steps: string[];
}

export interface ReminderItem {
  id: string;
  title: string;
  remindAt: string;
  category: 'Город' | 'Здоровье' | 'Документы' | 'Финансы' | 'Личное';
  done: boolean;
  createdAt: string;
}

export interface MediaMiniPlayerState {
  kind: 'tv' | 'radio';
  id: string;
  title: string;
  subtitle: string;
  isPlaying: boolean;
  accentColor?: string;
}

export interface AstanaParking {
  id: string;
  num: string;
  addr: string;
  lat: number;
  lng: number;
  price: number;
  spaces: number;
  zone: string;
  desc: string;
  ring: Array<[number, number]>;
}

export interface AstanaOsmParking {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface AstanaNoParkingSign {
  id: string;
  sign: string;
  side: string;
  desc: string;
  line: Array<[number, number]>;
}

export interface AstanaBusStop {
  id: string;
  name: string;
  nameKk: string;
  routes: string;
  lat: number;
  lng: number;
}

export interface AstanaTrafficLight {
  id: string;
  lat: number;
  lng: number;
}

export interface AstanaSergekPoint {
  id: string;
  lat: number;
  lng: number;
  hits: number;
}

export interface AstanaExtraPlace {
  id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  hours: string;
  lat: number;
  lng: number;
}

export interface AstanaMapLayers {
  parkings: AstanaParking[];
  osmParkings: AstanaOsmParking[];
  noParkingSigns: AstanaNoParkingSign[];
  busStops: AstanaBusStop[];
  trafficLights: AstanaTrafficLight[];
  sergekCameras: AstanaSergekPoint[];
  speedCameras: Array<{ id: string; lat: number; lng: number }>;
  crossings: Array<{ id: string; lat: number; lng: number }>;
  placesExtra: AstanaExtraPlace[];
  tomtomConfigured: boolean;
}

export interface MapLayerVisibility {
  parkings: boolean;
  noParking: boolean;
  busStops: boolean;
  cameras: boolean;
  trafficLights: boolean;
  traffic: boolean;
  tomtomLive: boolean;
  places: boolean;
  apartments: boolean;
}

export type MapObjectCategory =
  | 'all'
  | 'parking'
  | 'bus'
  | 'camera'
  | 'trafficLight'
  | 'place';

export type MapSortMode = 'distance' | 'name' | 'priceAsc' | 'priceDesc' | 'activity';

export interface BusRouteInfo {
  number: string;
  route: string;
  interval: string;
  fare: string;
  color: string;
  waypoints: Array<{ name: string; lat: number; lng: number }>;
}

export interface KinoLiveSession {
  id: number;
  time: string;
  cinema: string;
  address: string;
  hall: string;
  format: string;
  lang: string;
  adultPrice: number;
  studentPrice: number;
  childPrice: number;
  vipPrice: number;
  lat: number;
  lng: number;
}

export interface KinoLiveMovie {
  id: string;
  kinoId?: number;
  title: string;
  originalTitle: string;
  genres: string[];
  age: number;
  duration: string;
  posterUrl: string;
  url: string;
  presale?: boolean;
  premiere?: string;
  sessions: KinoLiveSession[];
  videoUrl?: string;
  description?: string;
}

export type BookmarkKind = 'home' | 'work' | 'parking' | 'favorite';

export interface MapBookmark {
  id: string;
  label: string;
  kind: BookmarkKind;
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface LiveBusMarker {
  id: string;
  number: string;
  lat: number;
  lng: number;
  color: string;
  nextStop: string;
  etaMin: number;
}

export interface CurrentGeoState {
  lat: number;
  lng: number;
  accuracyM?: number;
  source: 'gps' | 'ip' | 'manual' | 'default';
  address: string;
  district?: string;
  nearestLandmark?: string;
  updatedAt: string;
  tracking: boolean;
  error?: string | null;
}

export interface TomTomIncident {
  id: string;
  description: string;
  from: string;
  to: string;
  delaySec: number;
  magnitude: number;
  iconCategory: number;
  coords: Array<[number, number]>;
}

export interface RouteHistoryItem {
  id: string;
  fromName: string;
  toName: string;
  viaName?: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  viaLat?: number | null;
  viaLng?: number | null;
  distanceKm: number;
  durationMin: number;
  mode: 'taxi' | 'car' | 'bus';
  createdAt: string;
}

export interface ParkingSession {
  id: string;
  parkingTitle: string;
  zone: string;
  pricePerHour: number;
  durationMin: number;
  totalPrice: number;
  startedAt: string;
  endsAt: string;
  active: boolean;
}

export interface CinemaTicket {
  id: string;
  sessionKey: string;
  movieTitle: string;
  cinemaName: string;
  hallName: string;
  time: string;
  seats: string[];
  ticketType: string;
  totalPrice: number;
  code: string;
  createdAt: string;
}

export interface UtilityReading {
  id: string;
  period: string;
  coldWater: number;
  hotWater: number;
  electricityKwh: number;
  heatingArea: number;
  totalKzt: number;
  createdAt: string;
}

export interface AvtobysTrip {
  id: string;
  busNumber: string;
  routeTitle: string;
  fare: number;
  createdAt: string;
}

export interface AvtobysState {
  balance: number;
  cardNumber: string;
  trips: AvtobysTrip[];
}

export type GlassPreset = 'crystal' | 'winter' | 'baiterek' | 'steppe';
export type UiLang = 'ru' | 'kk' | 'en';

export interface GeoSearchResult {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  source: 'local' | 'nominatim';
}

export interface AirQualityData {
  aqi: number;
  level: 'Отличный' | 'Хороший' | 'Умеренный' | 'Повышенный' | 'Высокий';
  pm25: number;
  pm10: number;
  no2: number;
  advice: string;
  updatedAt: string;
  isLive: boolean;
}

export interface PrayerTimesData {
  date: string;
  city: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  nextPrayer: string;
  isLive: boolean;
}

export interface IkomekReport {
  id: string;
  category: 'Дороги' | 'Освещение' | 'ЖКХ' | 'Уборка снега' | 'Транспорт' | 'Другое';
  title: string;
  address: string;
  lat: number;
  lng: number;
  status: 'Принято' | 'В работе' | 'Решено';
  createdAt: string;
}

export interface GarageVehicle {
  id: string;
  plate: string;
  model: string;
  year: number;
  mileageKm: number;
  techInspectionDate: string;
  insuranceDate: string;
  tireSeason: 'Зима (шипы)' | 'Зима (липучка)' | 'Лето';
  nextOilChangeKm: number;
  createdAt: string;
}

export interface MapNote {
  id: string;
  title: string;
  note: string;
  kind: 'note' | 'parked_car' | 'family_zone';
  rating: number;
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export type QalaKartaThemeId = 'samal' | 'oyu' | 'tun' | 'dala' | 'syzba';

export interface QalaKartaArea {
  id: number;
  kind: 'water' | 'park' | 'wood' | 'sport' | 'industrial' | 'residential' | 'district';
  name: string;
  pts: Array<[number, number]>;
}

export interface QalaKartaWaterway {
  id: number;
  wide: boolean;
  name: string;
  pts: Array<[number, number]>;
}

export interface QalaKartaRoad {
  id: number;
  cls: number;
  oneway: number;
  bridge: boolean;
  name: string;
  pts: Array<[number, number]>;
}

export interface QalaKartaBuilding {
  id: number;
  name: string;
  addr: string;
  height: number;
  levels?: string;
  amenity?: string;
  shop?: string;
  hours?: string;
  phone?: string;
  website?: string;
  pts: Array<[number, number]>;
}

export interface QalaKartaPlaceItem {
  id: string;
  name: string;
  cat: string;
  addr: string;
  phone: string;
  website: string;
  hours: string;
  lat: number;
  lng: number;
}

export interface QalaKartaSignItem {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  hits?: number;
  label?: string;
}

export interface QalaKartaStats {
  totalElements: number;
  buildings: number;
  roads: number;
  places: number;
  signs: number;
  addresses: number;
  isReady: boolean;
}

export interface QalaKartaViewportData {
  areas: QalaKartaArea[];
  waterways: QalaKartaWaterway[];
  roads: QalaKartaRoad[];
  buildings: QalaKartaBuilding[];
  places: QalaKartaPlaceItem[];
  signs: QalaKartaSignItem[];
  stats: QalaKartaStats;
}
