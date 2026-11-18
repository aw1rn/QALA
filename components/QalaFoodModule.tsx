import {
  CheckCircle2,
  Clock,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ASTANA_CENTER, QALA_FOOD_MENU } from '../data/astanaData';
import type {
  AstanaPlace,
  CurrentGeoState,
  FoodCategory,
  FoodMenuItem,
  FoodOrder,
} from '../types/qala';
import { AstanaMap } from './AstanaMap';

const CATEGORIES: FoodCategory[] = [
  'Все',
  'Национальная',
  'Бургеры и донеры',
  'Пицца и паста',
  'Азиатская',
  'Кофе и десерты',
];

const RESTAURANT_LOCATIONS: Record<string, { name: string; address: string; lat: number; lng: number }> = {
  'rest-qazaq': { name: 'Qazaq Kitchen · Нұржол', address: 'бульвар Нұржол, 14', lat: 51.1283, lng: 71.4305 },
  'rest-plov': { name: 'Plov Center · Есиль', address: 'ул. Сыганак, 25', lat: 51.1208, lng: 71.4281 },
  'rest-doner': { name: 'Doner Hub · Байтерек', address: 'ул. Достык, 18', lat: 51.1264, lng: 71.4342 },
  'rest-mamma': { name: 'Mamma Mia · Хан Шатыр', address: 'пр. Туран, 37', lat: 51.1325, lng: 71.4038 },
  'rest-asia': { name: 'Wok & Ramen · Mega Silk Way', address: 'пр. Кабанбай батыра, 62', lat: 51.0894, lng: 71.4079 },
  'rest-coffee': { name: 'Coffee Boom · Достык', address: 'ул. Достык, 9', lat: 51.1243, lng: 71.4258 },
};

interface QalaFoodModuleProps {
  defaultAddress: string;
  currentLocation?: CurrentGeoState;
  onOrderCompleted: () => Promise<void>;
  onOpenOnMap?: (name: string, address: string, lat: number, lng: number) => void;
  onNotify: (msg: string) => void;
}

const COURIER_STAGES = [
  'Заказ принят кухней',
  'Готовится шефом',
  'Курьер забрал заказ и едет',
  'Курьер у подъезда',
] as const;

export function QalaFoodModule({
  defaultAddress,
  currentLocation,
  onOrderCompleted,
  onOpenOnMap,
  onNotify,
}: QalaFoodModuleProps) {
  const [category, setCategory] = useState<FoodCategory>('Все');
  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState(defaultAddress || 'Нұржол желек жолы, 14');
  const [deliveryCoord, setDeliveryCoord] = useState<[number, number]>(() =>
    currentLocation ? [currentLocation.lat, currentLocation.lng] : ASTANA_CENTER
  );
  const [showFoodMap, setShowFoodMap] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [courierTracker, setCourierTracker] = useState<{
    restaurantName: string;
    start: [number, number];
    dest: [number, number];
    destAddress: string;
    progress: number;
  } | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/food/orders');
      if (res.ok) {
        const data = (await res.json()) as { orders: FoodOrder[] };
        setOrders(data.orders || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!courierTracker || courierTracker.progress >= 1) return;
    const timer = window.setInterval(() => {
      setCourierTracker((prev) => {
        if (!prev) return null;
        const nextProgress = Math.min(1, Number((prev.progress + 0.08).toFixed(2)));
        return { ...prev, progress: nextProgress };
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [courierTracker]);

  const applyGpsAddress = useCallback(async () => {
    if (!currentLocation) {
      onNotify('Текущая геолокация пока определяется');
      return;
    }
    setDeliveryCoord([currentLocation.lat, currentLocation.lng]);
    if (currentLocation.address && !currentLocation.address.startsWith('51.')) {
      setAddress(currentLocation.address);
      onNotify(`Адрес доставки: ${currentLocation.address}`);
      return;
    }
    try {
      const res = await fetch(
        `/api/geo/reverse?lat=${currentLocation.lat}&lng=${currentLocation.lng}`
      );
      if (res.ok) {
        const d = (await res.json()) as { address?: string };
        const addr = d.address || `Астана (${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)})`;
        setAddress(addr);
        onNotify(`GPS адрес: ${addr}`);
        return;
      }
    } catch {
      // fallback below
    }
    setAddress(currentLocation.address || defaultAddress);
  }, [currentLocation, defaultAddress, onNotify]);

  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return QALA_FOOD_MENU.filter((item) => {
      if (category !== 'Все' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.restaurantName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [category, searchQuery]);

  const cartEntries = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({
        item: QALA_FOOD_MENU.find((x) => x.id === id)!,
        qty,
      }))
      .filter((e) => Boolean(e.item));
  }, [cart]);

  const subtotal = cartEntries.reduce((s, e) => s + e.item.price * e.qty, 0);
  const deliveryFee = subtotal > 0 ? (subtotal >= 6000 ? 0 : 650) : 0;
  const total = subtotal + deliveryFee;

  const updateQty = (item: FoodMenuItem, delta: number) => {
    setCart((prev) => {
      const nextQty = Math.max(0, (prev[item.id] || 0) + delta);
      if (nextQty === 0) {
        const clone = { ...prev };
        delete clone[item.id];
        return clone;
      }
      return { ...prev, [item.id]: nextQty };
    });
  };

  const submitOrder = async () => {
    if (cartEntries.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const firstRestaurant = cartEntries[0].item.restaurantName.split('·')[0].trim();
      const restaurantLabel =
        cartEntries.every((e) => e.item.restaurantId === cartEntries[0].item.restaurantId)
          ? firstRestaurant
          : 'Qala Food · Сборный заказ';

      const firstRestaurantId = cartEntries[0].item.restaurantId;
      const restaurantStartLoc = RESTAURANT_LOCATIONS[firstRestaurantId] || {
        name: restaurantLabel,
        address: 'Астана',
        lat: ASTANA_CENTER[0],
        lng: ASTANA_CENTER[1],
      };
      const finalAddress = address.trim() || defaultAddress;

      const res = await fetch('/api/food/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant: restaurantLabel,
          items: cartEntries.map((e) => ({
            name: e.item.name,
            qty: e.qty,
            price: e.item.price,
          })),
          total,
          address: finalAddress,
        }),
      });
      if (!res.ok) {
        onNotify('Не удалось оформить заказ');
        return;
      }
      setCart({});
      setCourierTracker({
        restaurantName: restaurantLabel,
        start: [restaurantStartLoc.lat, restaurantStartLoc.lng],
        dest: deliveryCoord,
        destAddress: finalAddress,
        progress: 0.12,
      });
      setShowFoodMap(true);
      await Promise.all([loadOrders(), onOrderCompleted()]);
      onNotify(`Заказ из ${restaurantLabel} оформлен · курьер выехал!`);
    } finally {
      setSubmitting(false);
    }
  };

  const courierLivePosition = useMemo(() => {
    if (!courierTracker) return undefined;
    const { start, dest, progress, restaurantName } = courierTracker;
    const lat = start[0] + (dest[0] - start[0]) * progress;
    const lng = start[1] + (dest[1] - start[1]) * progress;
    return { lat, lng, label: `Курьер Qala Food · ${restaurantName}` };
  }, [courierTracker]);

  const courierStageIndex = courierTracker
    ? courierTracker.progress >= 0.98
      ? 3
      : courierTracker.progress >= 0.45
      ? 2
      : courierTracker.progress >= 0.22
      ? 1
      : 0
    : 0;

  return (
    <div className="space-y-5">
      {/* Header + Search + Category Tabs */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm">
              <Utensils className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                Qala <span className="text-orange-600 dark:text-orange-400">Food</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Доставка блюд по Астане · бесплатная доставка от 6 000 ₸
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowFoodMap((v) => !v)}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                showFoodMap
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'border border-white/75 bg-white/70 text-slate-800 hover:bg-white dark:border-white/15 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Карта ресторанов и доставки
            </button>

            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Найти плов, донер, рамен, кофе…"
                className="w-full rounded-xl border border-white/80 bg-white/75 py-2.5 pr-3.5 pl-10 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                category === cat
                  ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                  : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {courierTracker && (
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                    {COURIER_STAGES[courierStageIndex]} · {courierTracker.restaurantName}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Доставка: {courierTracker.destAddress}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {courierTracker.progress >= 1
                    ? 'Прибыл'
                    : `~${Math.max(1, Math.round((1 - courierTracker.progress) * 22))} мин`}
                </span>
                <button
                  type="button"
                  onClick={() => setCourierTracker(null)}
                  className="rounded-lg bg-white/75 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-300"
                >
                  Скрыть
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {COURIER_STAGES.map((stage, idx) => (
                <div
                  key={stage}
                  className={`h-1.5 rounded-full transition-all ${
                    idx <= courierStageIndex
                      ? 'bg-emerald-500'
                      : 'bg-slate-900/15 dark:bg-white/15'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {showFoodMap && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>Нажмите на карту, чтобы указать точку доставки, или выберите ресторан:</span>
              <span className="font-mono text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                {deliveryCoord[0].toFixed(4)}, {deliveryCoord[1].toFixed(4)}
              </span>
            </div>
            <div className="h-[280px] overflow-hidden rounded-2xl border border-white/80 shadow-inner dark:border-white/15">
              <AstanaMap
                center={deliveryCoord}
                zoom={13}
                places={Object.entries(RESTAURANT_LOCATIONS).map(
                  ([id, loc]): AstanaPlace => ({
                    id,
                    name: loc.name,
                    category: 'mall',
                    address: loc.address,
                    lat: loc.lat,
                    lng: loc.lng,
                  })
                )}
                routeCoordinates={
                  courierTracker ? [courierTracker.start, courierTracker.dest] : undefined
                }
                courierPosition={courierLivePosition}
                taxiEndpoints={{
                  from: courierTracker
                    ? {
                        name: courierTracker.restaurantName,
                        lat: courierTracker.start[0],
                        lng: courierTracker.start[1],
                      }
                    : undefined,
                  to: { name: `Доставка: ${address}`, lat: deliveryCoord[0], lng: deliveryCoord[1] },
                }}
                onMapClick={async (lat, lng) => {
                  setDeliveryCoord([lat, lng]);
                  setAddress(`Астана (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
                  try {
                    const r = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
                    if (r.ok) {
                      const d = (await r.json()) as { address?: string };
                      if (d.address) {
                        setAddress(d.address);
                        onNotify(`Адрес доставки: ${d.address}`);
                        return;
                      }
                    }
                  } catch {
                    // keep fallback coords
                  }
                  onNotify('Точка доставки еды обновлена на карте');
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Menu + Cart */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* Dishes Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredMenu.map((item) => {
            const qty = cart[item.id] || 0;
            const loc = RESTAURANT_LOCATIONS[item.restaurantId];
            return (
              <div
                key={item.id}
                className="liquid-glass flex flex-col justify-between rounded-3xl p-4 sm:p-5 space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <span className="truncate">{item.restaurantName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono tabular-nums">
                        ★ {item.rating} · {item.etaMin}
                      </span>
                      {loc && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeliveryCoord([loc.lat, loc.lng]);
                            setShowFoodMap(true);
                            onOpenOnMap?.(loc.name, loc.address, loc.lat, loc.lng);
                          }}
                          title={`Показать ${loc.name} на карте`}
                          className="rounded-md bg-white/75 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 hover:bg-orange-500 hover:text-white dark:bg-slate-800 dark:text-orange-300"
                        >
                          Карта
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {item.name}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-900/10 dark:border-white/10">
                  <div>
                    <div className="font-mono text-base font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                      {item.price.toLocaleString('ru-RU')} ₸
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.weight}
                    </div>
                  </div>

                  {qty === 0 ? (
                    <button
                      type="button"
                      onClick={() => updateQty(item, 1)}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600"
                    >
                      <Plus className="h-4 w-4" />
                      В корзину
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-slate-900 p-1 text-white dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => updateQty(item, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"
                        aria-label="Уменьшить количество"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[20px] text-center font-mono text-xs font-bold tabular-nums">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"
                        aria-label="Увеличить количество"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cart & Orders Column */}
        <div className="space-y-4">
          <div className="liquid-glass rounded-3xl p-5 space-y-4 sticky top-24">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                <ShoppingBag className="h-5 w-5 text-orange-500" />
                Корзина
              </div>
              {cartEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart({})}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Очистить
                </button>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-orange-500" />
                  Адрес доставки
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyGpsAddress}
                    className="flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:underline dark:text-sky-400"
                  >
                    <LocateFixed className="h-3 w-3" />
                    Мой GPS
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFoodMap(true)}
                    className="text-[11px] font-bold text-orange-600 hover:underline dark:text-orange-400"
                  >
                    На карте
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Улица, дом, подъезд…"
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3 py-2.5 text-xs font-medium text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
              />
            </div>

            {cartEntries.length === 0 ? (
              <div className="rounded-2xl bg-white/55 p-6 text-center text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                Выберите блюда из меню Астаны — сумма автоматически запишется в Qala Wallet.
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {cartEntries.map(({ item, qty }) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2.5 text-xs dark:bg-slate-800/65"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                          {qty} × {item.price.toLocaleString('ru-RU')} ₸
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQty(item, -qty)}
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                        aria-label="Удалить позицию"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 border-t border-slate-900/10 pt-3 text-xs dark:border-white/10">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Блюда</span>
                    <span className="font-mono tabular-nums">{subtotal.toLocaleString('ru-RU')} ₸</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Доставка</span>
                    <span className="font-mono tabular-nums">
                      {deliveryFee === 0 ? 'Бесплатно' : `${deliveryFee} ₸`}
                    </span>
                  </div>
                  <div className="flex justify-between font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                    <span>Итого</span>
                    <span className="font-mono tabular-nums">{total.toLocaleString('ru-RU')} ₸</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={submitOrder}
                  disabled={submitting}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting ? 'Оформляем заказ…' : `Заказать · ${total.toLocaleString('ru-RU')} ₸`}
                </button>
              </>
            )}

            {orders.length > 0 && (
              <div className="space-y-2 border-t border-slate-900/10 pt-3 dark:border-white/10">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Clock className="h-3.5 w-3.5 text-emerald-600" />
                  Последние заказы ({orders.length})
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {orders.slice(0, 4).map((ord) => (
                    <div
                      key={ord.id}
                      className="rounded-xl bg-white/65 px-3 py-2 text-[11px] dark:bg-slate-800/60"
                    >
                      <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                        <span className="truncate">{ord.restaurant}</span>
                        <span className="font-mono tabular-nums ml-2 shrink-0">
                          {ord.total.toLocaleString('ru-RU')} ₸
                        </span>
                      </div>
                      <div className="text-emerald-700 dark:text-emerald-400">{ord.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
