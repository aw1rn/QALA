import { Check, MapPin, Navigation, Plus, Route, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ASTANA_CENTER, ASTANA_PLACES } from '../data/astanaData';
import type { DeliveryStop, RouteResult } from '../types/qala';
import { AstanaMap } from './AstanaMap';

interface QalaDeliveryModuleProps {
  stops: DeliveryStop[];
  onRefresh: () => Promise<void>;
  onOpenOnFullMap: (coords: Array<[number, number]>, label: string) => void;
  onNotify: (msg: string) => void;
}

export function QalaDeliveryModule({
  stops,
  onRefresh,
  onOpenOnFullMap,
  onNotify,
}: QalaDeliveryModuleProps) {
  const [newStopText, setNewStopText] = useState('');
  const [minutesPerStop, setMinutesPerStop] = useState<2 | 5 | 10>(5);
  const [routeData, setRouteData] = useState<RouteResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const computeRoute = async (currentStops: DeliveryStop[]) => {
    if (currentStops.length < 2) {
      setRouteData(null);
      return;
    }
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: currentStops.map((s) => [s.lat, s.lng]),
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as RouteResult;
        setRouteData(json);
      }
    } catch {
      // Keep previous route if offline
    }
  };

  useEffect(() => {
    computeRoute(stops);
  }, [stops]);

  const handleAddStop = async (name?: string, address?: string, lat?: number, lng?: number) => {
    const label = (name ?? newStopText).trim();
    if (!label) return;

    const matchedPreset = ASTANA_PLACES.find((p) =>
      p.name.toLowerCase().includes(label.toLowerCase())
    );

    await fetch('/api/delivery/stops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: label,
        address: address || matchedPreset?.address || label,
        lat: lat ?? matchedPreset?.lat ?? 51.1282 + (Math.random() - 0.5) * 0.03,
        lng: lng ?? matchedPreset?.lng ?? 71.4304 + (Math.random() - 0.5) * 0.04,
      }),
    });
    if (!name) setNewStopText('');
    await onRefresh();
    onNotify(`Точка «${label}» добавлена`);
  };

  const handleToggleDone = async (stop: DeliveryStop) => {
    await fetch(`/api/delivery/stops/${encodeURIComponent(stop.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !stop.done }),
    });
    await onRefresh();
  };

  const handleRemoveStop = async (id: string) => {
    await fetch(`/api/delivery/stops/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await onRefresh();
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    await fetch('/api/delivery/optimize', { method: 'POST' });
    await onRefresh();
    setIsOptimizing(false);
    onNotify('Маршрут оптимизирован по кратчайшему пути');
  };

  const totalDriveMin = routeData?.durationMin ?? stops.length * 9;
  const totalStopWaitMin = stops.length * minutesPerStop;
  const totalMinutes = totalDriveMin + totalStopWaitMin;
  const distanceKm = routeData?.distanceKm ?? 23.6;

  // Compute simulated arrival times starting from current time
  const timelineStops = useMemo(() => {
    const base = new Date();
    const legMin = stops.length > 1 ? Math.round(totalDriveMin / stops.length) : 8;
    return stops.map((s, idx) => {
      const arrival = new Date(
        base.getTime() + (idx * (legMin + minutesPerStop) + 5) * 60000
      );
      const hh = String(arrival.getHours()).padStart(2, '0');
      const mm = String(arrival.getMinutes()).padStart(2, '0');
      return { ...s, eta: `${hh}:${mm}` };
    });
  }, [minutesPerStop, stops, totalDriveMin]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[460px_1fr]">
      {/* Left Delivery Route Planner */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-slate-900">
            Qala <span className="text-emerald-700">Delivery</span>
          </h2>
          <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
            Адресов · {stops.length}
          </span>
        </div>

        {/* Add Stop Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddStop();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newStopText}
            onChange={(e) => setNewStopText(e.target.value)}
            placeholder="Адрес или место в Астане…"
            className="flex-1 rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-slate-800 hover:bg-white"
            aria-label="Добавить точку"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>

        {/* Quick Preset Chips */}
        <div className="flex flex-wrap gap-1.5">
          {ASTANA_PLACES.slice(0, 5).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAddStop(p.name, p.address, p.lat, p.lng)}
              className="rounded-lg bg-white/60 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-white"
            >
              + {p.name}
            </button>
          ))}
        </div>

        {/* Wait Time Selector */}
        <div className="flex items-center justify-between rounded-2xl bg-white/55 px-3.5 py-2.5">
          <span className="text-xs font-medium text-slate-700">На точку, мин</span>
          <div className="flex items-center gap-1.5">
            {([2, 5, 10] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutesPerStop(m)}
                className={`h-8 w-8 rounded-lg font-mono text-xs font-semibold transition-colors ${
                  minutesPerStop === m
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-white/80 text-slate-700 hover:bg-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Stops List */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {timelineStops.map((stop, idx) => (
            <div
              key={stop.id}
              className="flex items-center justify-between gap-2.5 rounded-2xl bg-white/75 px-3.5 py-2.5 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-white ${
                    stop.done ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div
                    className={`truncate text-xs font-semibold ${
                      stop.done ? 'line-through text-slate-500' : 'text-slate-900'
                    }`}
                  >
                    {stop.name}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs text-slate-600 tabular-nums">
                  ≈ {stop.eta}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleDone(stop)}
                  aria-label="Отметить выполненным"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    stop.done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveStop(stop.id)}
                  aria-label="Удалить точку"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Optimize CTA */}
        <button
          type="button"
          onClick={handleOptimize}
          disabled={isOptimizing || stops.length < 2}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isOptimizing ? 'Оптимизация…' : 'Построить оптимальный маршрут'}
        </button>

        {/* Summary Block */}
        <div className="rounded-2xl bg-white/65 p-3.5 text-xs text-slate-700">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-900 tabular-nums">
            <Route className="h-4 w-4 text-emerald-700" />
            <span>
              {distanceKm} км · {totalMinutes} мин
            </span>
          </div>
          <div className="mt-1 text-slate-600 tabular-nums">
            с учётом {minutesPerStop} мин на точку · время в пути {totalDriveMin} мин
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onOpenOnFullMap(
                routeData?.coordinates || stops.map((s) => [s.lat, s.lng]),
                `Маршрут доставки (${stops.length} точек)`
              )
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/75 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
          >
            <Navigation className="h-3.5 w-3.5" />
            На карте
          </button>
          <button
            type="button"
            onClick={() => handleRemoveStop('all')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/75 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            <MapPin className="h-3.5 w-3.5" />
            Очистить список
          </button>
        </div>
      </div>

      {/* Right Live Map */}
      <div className="relative min-h-[380px] overflow-hidden rounded-3xl border border-white/80 shadow-xl">
        <AstanaMap
          center={stops[0] ? [stops[0].lat, stops[0].lng] : ASTANA_CENTER}
          zoom={12}
          deliveryStops={stops}
          routeCoordinates={routeData?.coordinates || []}
        />
      </div>
    </div>
  );
}
