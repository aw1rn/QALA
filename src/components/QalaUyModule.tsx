import {
  ArrowUpRight,
  Calculator,
  EyeOff,
  MapPin,
  Plus,
  RotateCcw,
  Scale,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ASTANA_CENTER } from '../data/astanaData';
import type { ApartmentListing, AstanaMapLayers } from '../types/qala';
import { AstanaMap } from './AstanaMap';
import { API_BASE } from '../apiBase';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface QalaUyModuleProps {
  apartments: ApartmentListing[];
  onRefresh: () => Promise<void>;
  onBuildRouteTo: (name: string, address: string, lat: number, lng: number) => void;
  onNotify: (msg: string) => void;
}

export function QalaUyModule({
  apartments,
  onRefresh,
  onBuildRouteTo,
  onNotify,
}: QalaUyModuleProps) {
  const [rentType, setRentType] = useState<'Все' | 'Аренда' | 'Посуточно'>('Аренда');
  const [roomsFilter, setRoomsFilter] = useState<'Все' | 1 | 2 | 3>('Все');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [streetQuery, setStreetQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'cheap' | 'expensive' | 'area'>('cheap');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(
    apartments[0]?.id ?? null
  );
  const [mobileMode, setMobileMode] = useState<'list' | 'map'>('list');

  // Compare, Mortgage & Add Custom states
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMortgage, setShowMortgage] = useState(false);
  const [layers, setLayers] = useState<AstanaMapLayers | null>(null);

  // Mortgage / Otbasy Bank calculator state
  const [propPrice, setPropPrice] = useState('32000000');
  const [downPct, setDownPct] = useState(20);
  const [annualRate, setAnnualRate] = useState('14.5');
  const [termYears, setTermYears] = useState(15);

  useEffect(() => {
    fetch(`${API_BASE}/api/map/layers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AstanaMapLayers | null) => {
        if (d) setLayers(d);
      })
      .catch(() => undefined);
  }, []);

  // Add Custom form
  const [newAddress, setNewAddress] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newRooms, setNewRooms] = useState(1);
  const [newArea, setNewArea] = useState('38');
  const [newRentType, setNewRentType] = useState<'Аренда' | 'Посуточно'>('Аренда');

  const filteredApartments = useMemo(() => {
    const q = streetQuery.trim().toLowerCase();
    const minP = Number.parseInt(priceMin, 10) || 0;
    const maxP = Number.parseInt(priceMax, 10) || Infinity;
    const minA = Number.parseFloat(areaMin) || 0;

    const list = apartments.filter((apt) => {
      if (rentType !== 'Все' && apt.rentType !== rentType) return false;
      if (roomsFilter === 3 && apt.rooms < 3) return false;
      if ((roomsFilter === 1 || roomsFilter === 2) && apt.rooms !== roomsFilter) return false;
      if (apt.price < minP || apt.price > maxP) return false;
      if (apt.area < minA) return false;
      if (onlyFavorites && !apt.isFavorite) return false;
      if (
        q &&
        !apt.address.toLowerCase().includes(q) &&
        !apt.district.toLowerCase().includes(q) &&
        !apt.title.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortOrder === 'expensive') return b.price - a.price;
      if (sortOrder === 'area') return b.area - a.area;
      return a.price - b.price;
    });
  }, [
    apartments,
    areaMin,
    onlyFavorites,
    priceMax,
    priceMin,
    rentType,
    roomsFilter,
    sortOrder,
    streetQuery,
  ]);

  const selectedApt = useMemo(
    () =>
      filteredApartments.find((a) => a.id === selectedAptId) ||
      apartments.find((a) => a.id === selectedAptId) ||
      null,
    [apartments, filteredApartments, selectedAptId]
  );

  const nearbyInfra = useMemo(() => {
    if (!selectedApt || !layers) return null;
    const within500m = (lat: number, lng: number) =>
      haversineKm(selectedApt.lat, selectedApt.lng, lat, lng) <= 0.55;
    return {
      stops: layers.busStops.filter((s) => within500m(s.lat, s.lng)).length,
      parkings: layers.parkings.filter((p) => within500m(p.lat, p.lng)).length,
      cameras: layers.sergekCameras.filter((c) => within500m(c.lat, c.lng)).length,
    };
  }, [layers, selectedApt]);

  const mortgageStats = useMemo(() => {
    const price = Math.max(1000000, Number.parseFloat(propPrice) || 32000000);
    const downPayment = Math.round((price * downPct) / 100);
    const principal = Math.max(0, price - downPayment);
    const monthlyRate = Math.max(0.001, (Number.parseFloat(annualRate) || 14.5) / 100 / 12);
    const months = Math.max(12, termYears * 12);
    const factor = Math.pow(1 + monthlyRate, months);
    const monthly = principal === 0 ? 0 : Math.round((principal * monthlyRate * factor) / (factor - 1));
    const totalPaid = monthly * months;
    const overpayment = Math.max(0, totalPaid - principal);
    const otbasyMonthlyDeposit = Math.round((price * 0.5) / 36);
    return { price, downPayment, principal, monthly, overpayment, otbasyMonthlyDeposit };
  }, [annualRate, downPct, propPrice, termYears]);

  const medianPrice = useMemo(() => {
    if (filteredApartments.length === 0) return 0;
    const sorted = [...filteredApartments].sort((a, b) => a.price - b.price);
    return sorted[Math.floor(sorted.length / 2)].price;
  }, [filteredApartments]);

  const handleToggleFavorite = async (apt: ApartmentListing) => {
    await fetch(`${API_BASE}/api/apartments/${encodeURIComponent(apt.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !apt.isFavorite }),
    });
    await onRefresh();
    onNotify(apt.isFavorite ? 'Убрано из избранного' : 'Добавлено в избранное Qala Үй');
  };

  const handleHide = async (apt: ApartmentListing) => {
    await fetch(`${API_BASE}/api/apartments/${encodeURIComponent(apt.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHidden: true }),
    });
    setSelectedAptId(null);
    await onRefresh();
    onNotify('Объявление скрыто');
  };

  const handleDelete = async (apt: ApartmentListing) => {
    await fetch(`${API_BASE}/api/apartments/${encodeURIComponent(apt.id)}`, {
      method: 'DELETE',
    });
    setSelectedAptId(null);
    await onRefresh();
    onNotify('Объявление удалено');
  };

  const handleResetFilters = async () => {
    setRentType('Аренда');
    setRoomsFilter('Все');
    setPriceMin('');
    setPriceMax('');
    setAreaMin('');
    setStreetQuery('');
    setOnlyFavorites(false);
    await fetch(`${API_BASE}/api/apartments/reset-hidden`, { method: 'POST' });
    await onRefresh();
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddress.trim() || !newPrice.trim()) return;
    await fetch(`${API_BASE}/api/apartments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: newAddress.trim(),
        price: Number.parseInt(newPrice, 10),
        rooms: newRooms,
        area: Number.parseFloat(newArea) || 38,
        rentType: newRentType,
      }),
    });
    setNewAddress('');
    setNewPrice('');
    setShowAddModal(false);
    await onRefresh();
    onNotify('Квартира добавлена на карту Qala Үй');
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-2), id]
    );
  };

  const mapCenter: [number, number] = selectedApt
    ? [selectedApt.lat, selectedApt.lng]
    : ASTANA_CENTER;

  return (
    <div className="space-y-4">
      {/* Mobile View Switcher */}
      <div className="flex items-center justify-between lg:hidden">
        <div className="flex rounded-xl bg-white/60 p-1 border border-white/70 dark:bg-slate-900/70 dark:border-white/15">
          <button
            type="button"
            onClick={() => setMobileMode('list')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold ${
              mobileMode === 'list'
                ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            Список ({filteredApartments.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileMode('map')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold ${
              mobileMode === 'map'
                ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            На карте
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowMortgage(true)}
            className="flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <Calculator className="h-3.5 w-3.5" />
            Ипотека
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Своё
          </button>
        </div>
      </div>

      {/* Desktop Split / Mobile Responsive Container */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[410px_1fr] lg:h-[calc(100vh-148px)]">
        {/* Left Filters & Apartments List */}
        <div
          className={`liquid-glass flex flex-col overflow-hidden rounded-3xl p-4 sm:p-5 ${
            mobileMode === 'map' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-900/10 dark:border-white/10">
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Qala Үй
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                Найдено: {filteredApartments.length} · медиана{' '}
                {medianPrice.toLocaleString('ru-RU')} ₸/мес
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowMortgage(true)}
                title="Калькулятор ипотеки и Отбасы банка"
                className="hidden sm:flex items-center gap-1 rounded-xl bg-sky-600/15 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-600 hover:text-white dark:text-sky-300"
              >
                <Calculator className="h-3.5 w-3.5" />
                Ипотека
              </button>
              <button
                type="button"
                onClick={() => setOnlyFavorites((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  onlyFavorites
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/60 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
                Избранное
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(['Аренда', 'Посуточно', 'Все'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRentType(t)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    rentType === t
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/75 dark:text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'Все', label: 'Все' },
                  { id: 1, label: '1 комн.' },
                  { id: 2, label: '2 комн.' },
                  { id: 3, label: '3+ комн.' },
                ] as const
              ).map((r) => (
                <button
                  key={String(r.id)}
                  type="button"
                  onClick={() => setRoomsFilter(r.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    roomsFilter === r.id
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/75 dark:text-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="Цена от, ₸"
                className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              />
              <input
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="Цена до, ₸"
                className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
                placeholder="Площадь от, м²"
                className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              />
              <input
                type="search"
                value={streetQuery}
                onChange={(e) => setStreetQuery(e.target.value)}
                placeholder="Улица или район…"
                className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'cheap' | 'expensive' | 'area')}
                aria-label="Сортировка"
                className="flex-1 rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              >
                <option value="cheap">Сначала дешёвые</option>
                <option value="expensive">Сначала дорогие</option>
                <option value="area">По площади</option>
              </select>
            </div>
          </div>

          {/* Scrollable Listings */}
          <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {filteredApartments.length === 0 ? (
              <div className="rounded-2xl bg-white/50 p-6 text-center text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                По выбранным фильтрам квартиры не найдены.
              </div>
            ) : (
              filteredApartments.map((apt) => {
                const isSelected = selectedApt?.id === apt.id;
                const isCompared = compareIds.includes(apt.id);
                return (
                  <div
                    key={apt.id}
                    onClick={() => {
                      setSelectedAptId(apt.id);
                      if (window.innerWidth < 1024) setMobileMode('map');
                    }}
                    className={`cursor-pointer rounded-2xl p-3.5 transition-all ${
                      isSelected
                        ? 'bg-white/90 ring-2 ring-emerald-700 shadow-md dark:bg-slate-800/95'
                        : 'liquid-glass-subtle'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {apt.price.toLocaleString('ru-RU')} ₸
                        <span className="font-normal text-slate-600 dark:text-slate-400">
                          {apt.rentType === 'Посуточно' ? '/сут' : '/мес'}
                        </span>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {apt.rentType}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompare(apt.id);
                        }}
                        title="Добавить к сравнению"
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                          isCompared
                            ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                            : 'bg-white/70 text-slate-600 hover:bg-white dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {isCompared ? 'В сравн.' : 'Сравн.'}
                      </button>
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                      {apt.title}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span className="truncate">
                        {apt.address} · {apt.source}
                      </span>
                      <span className="font-mono text-[11px] shrink-0 ml-2">
                        {Math.round(apt.price / Math.max(1, apt.area)).toLocaleString('ru-RU')} ₸/м²
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Actions */}
          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-slate-900/10 dark:border-white/10">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Сбросить
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Своё
            </button>
            <button
              type="button"
              onClick={() => setShowCompare(true)}
              disabled={compareIds.length < 2}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-orange-500 dark:text-slate-950"
            >
              <Scale className="h-3.5 w-3.5" />
              Сравнить ({compareIds.length})
            </button>
          </div>
        </div>

        {/* Right Interactive Map + Floating Liquid Glass Detail Card */}
        <div
          className={`relative overflow-hidden rounded-3xl border border-white/80 dark:border-white/15 shadow-xl min-h-[460px] lg:min-h-0 ${
            mobileMode === 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          <AstanaMap
            center={mapCenter}
            zoom={selectedApt ? 14 : 12}
            apartments={filteredApartments}
            selectedApartmentId={selectedApt?.id}
            onSelectApartment={(apt) => setSelectedAptId(apt.id)}
          />

          {selectedApt && (
            <div className="liquid-glass absolute top-4 right-4 left-4 sm:left-auto z-[450] sm:w-[350px] rounded-2xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {selectedApt.title}
                  </h3>
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {selectedApt.district} · {selectedApt.rentType}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAptId(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                  aria-label="Закрыть карточку"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1.5 border-y border-slate-900/10 py-3 text-xs dark:border-white/10">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Адрес</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedApt.address}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Цена</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {selectedApt.price.toLocaleString('ru-RU')} ₸
                    {selectedApt.rentType === 'Посуточно' ? '/сут' : '/мес'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">За м²</span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {Math.round(selectedApt.price / Math.max(1, selectedApt.area)).toLocaleString(
                      'ru-RU'
                    )}{' '}
                    ₸/м² · {selectedApt.area} м²
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Источник</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {selectedApt.source}
                  </span>
                </div>
              </div>

              {nearbyInfra && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-lg bg-sky-500/15 px-2 py-1 text-sky-700 dark:text-sky-300">
                    Остановок ≤500м: {nearbyInfra.stops}
                  </span>
                  <span className="rounded-lg bg-indigo-500/15 px-2 py-1 text-indigo-700 dark:text-indigo-300">
                    Парковок: {nearbyInfra.parkings}
                  </span>
                  <span className="rounded-lg bg-rose-500/15 px-2 py-1 text-rose-700 dark:text-rose-300">
                    Сергек рядом: {nearbyInfra.cameras}
                  </span>
                </div>
              )}

              {selectedApt.description && (
                <p className="mt-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {selectedApt.description}
                </p>
              )}

              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onBuildRouteTo(
                      selectedApt.address,
                      selectedApt.address,
                      selectedApt.lat,
                      selectedApt.lng
                    )
                  }
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Сюда маршрут
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(selectedApt)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedApt.isFavorite
                      ? 'bg-orange-500 text-white'
                      : 'bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${selectedApt.isFavorite ? 'fill-current' : ''}`} />
                  {selectedApt.isFavorite ? 'В избранном' : 'В избранное'}
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleHide(selectedApt)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/65 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-300"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Скрыть
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedApt)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/65 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Удалить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Apartment Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCustom}
            className="liquid-glass w-full max-w-md rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Добавить квартиру
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg bg-white/60 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2">
              {(['Аренда', 'Посуточно'] as const).map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setNewRentType(rt)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold ${
                    newRentType === rt
                      ? 'bg-orange-500 text-white'
                      : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {rt}
                </button>
              ))}
            </div>

            <input
              type="text"
              required
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Адрес (например: Кунаева, 14)"
              className="w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />

            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Цена, ₸"
                className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
              <select
                value={newRooms}
                onChange={(e) => setNewRooms(Number(e.target.value))}
                className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value={1}>1 комн.</option>
                <option value={2}>2 комн.</option>
                <option value={3}>3 комн.</option>
              </select>
              <input
                type="number"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                placeholder="м²"
                className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              <ArrowUpRight className="h-4 w-4" />
              Опубликовать на карте
            </button>
          </form>
        </div>
      )}

      {/* Compare Modal */}
      {showCompare && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setShowCompare(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-2xl rounded-3xl p-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-900/10 dark:border-white/10">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Сравнение квартир
              </h3>
              <button
                type="button"
                onClick={() => setShowCompare(false)}
                className="rounded-lg bg-white/60 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {compareIds
                .map((id) => apartments.find((a) => a.id === id))
                .filter((a): a is ApartmentListing => Boolean(a))
                .map((apt) => (
                  <div
                    key={apt.id}
                    className="rounded-2xl bg-white/75 p-4 space-y-2 text-xs text-slate-800 dark:bg-slate-800/75 dark:text-slate-200"
                  >
                    <div className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {apt.address}
                    </div>
                    <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {apt.price.toLocaleString('ru-RU')} ₸
                    </div>
                    <div>Площадь: {apt.area} м²</div>
                    <div>Комнат: {apt.rooms}</div>
                    <div>Этаж: {apt.floor}</div>
                    <div>Цена за м²: {Math.round(apt.price / apt.area).toLocaleString('ru-RU')} ₸</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Mortgage & Otbasy Bank Calculator Modal */}
      {showMortgage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setShowMortgage(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-lg rounded-3xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-900/10 pb-3 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <Calculator className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  Ипотека и Отбасы банк
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMortgage(false)}
                className="rounded-xl bg-white/70 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Стоимость квартиры, ₸
                </label>
                <input
                  type="number"
                  value={propPrice}
                  onChange={(e) => setPropPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/80 bg-white/75 px-3 py-2 font-mono text-sm font-bold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Ставка, % годовых
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={annualRate}
                  onChange={(e) => setAnnualRate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/80 bg-white/75 px-3 py-2 font-mono text-sm font-bold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Первоначальный взнос: {downPct}% ({mortgageStats.downPayment.toLocaleString('ru-RU')} ₸)
                </span>
                <div className="flex gap-1">
                  {[20, 30, 50].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setDownPct(p);
                        if (p === 50) setAnnualRate('7.0');
                      }}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                        downPct === p
                          ? 'bg-sky-600 text-white'
                          : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {p}%{p === 50 ? ' ЖССБ' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={10}
                max={70}
                step={5}
                value={downPct}
                onChange={(e) => setDownPct(Number(e.target.value))}
                className="w-full accent-sky-600"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Срок кредита: {termYears} лет
              </div>
              <input
                type="range"
                min={3}
                max={25}
                step={1}
                value={termYears}
                onChange={(e) => setTermYears(Number(e.target.value))}
                className="w-full accent-sky-600"
              />
            </div>

            <div className="rounded-2xl bg-slate-900 p-4 text-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Ежемесячный платёж</span>
                <span className="font-mono text-2xl font-extrabold text-orange-400 tabular-nums">
                  {mortgageStats.monthly.toLocaleString('ru-RU')} ₸/мес
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Сумма займа</span>
                <span className="font-mono tabular-nums">
                  {mortgageStats.principal.toLocaleString('ru-RU')} ₸
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Переплата по процентам</span>
                <span className="font-mono tabular-nums">
                  {mortgageStats.overpayment.toLocaleString('ru-RU')} ₸
                </span>
              </div>
              <div className="border-t border-white/15 pt-2 text-[11px] text-sky-300">
                Отбасы банк 50/50 (копить 3 года): ~
                {mortgageStats.otbasyMonthlyDeposit.toLocaleString('ru-RU')} ₸/мес на депозит → ставка от 3.5–7%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
