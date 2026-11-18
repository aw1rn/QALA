import {
  AlarmClock,
  AlertTriangle,
  Ban,
  Camera,
  Cloud,
  CloudRain,
  CloudSnow,
  Gauge,
  MapPin,
  ParkingSquare,
  Plane,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sun,
  TrafficCone,
  Wind,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ASTANA_BRIDGES,
  ASTANA_CENTER,
  TRANSIT_TERMINALS,
} from '../data/astanaData';
import type {
  AirQualityData,
  AstanaMapLayers,
  SergekCamera,
  TomTomIncident,
  TrafficSegment,
  WeeklyForecastDay,
} from '../types/qala';
import { AstanaMap } from './AstanaMap';

function WeatherIcon({ code }: { code: number }) {
  if (code === 0) return <Sun className="h-6 w-6 text-amber-500" />;
  if (code >= 68 || (code >= 71 && code <= 86)) return <CloudSnow className="h-6 w-6 text-sky-500" />;
  if (code >= 51 && code <= 67) return <CloudRain className="h-6 w-6 text-blue-500" />;
  return <Cloud className="h-6 w-6 text-slate-500 dark:text-slate-300" />;
}

export function QalaTrafficModule() {
  const [cityScore, setCityScore] = useState(5);
  const [segments, setSegments] = useState<TrafficSegment[]>([]);
  const [cameras, setCameras] = useState<SergekCamera[]>([]);
  const [forecast, setForecast] = useState<WeeklyForecastDay[]>([]);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [layers, setLayers] = useState<AstanaMapLayers | null>(null);
  const [incidents, setIncidents] = useState<TomTomIncident[]>([]);
  const [isLiveWeather, setIsLiveWeather] = useState(false);
  const [focusCoord, setFocusCoord] = useState<[number, number]>(ASTANA_CENTER);
  const [loading, setLoading] = useState(true);

  const [showTraffic, setShowTraffic] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showSergek, setShowSergek] = useState(true);
  const [showLights, setShowLights] = useState(true);
  const [showParkings, setShowParkings] = useState(false);
  const [showNoParking, setShowNoParking] = useState(false);
  const [showTomTomLive, setShowTomTomLive] = useState(false);

  // Smart Departure Alarm + Commute Autopilot state
  const [arrivalTime, setArrivalTime] = useState('09:00');
  const [baseCommuteMin, setBaseCommuteMin] = useState(25);
  const [alarmSaved, setAlarmSaved] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [trRes, wRes, layRes, incRes, aqRes] = await Promise.all([
        fetch('/api/traffic'),
        fetch('/api/weather/weekly'),
        fetch('/api/map/layers'),
        fetch('/api/map/tomtom/incidents'),
        fetch('/api/air-quality'),
      ]);
      if (trRes.ok) {
        const tr = (await trRes.json()) as {
          cityScore: number;
          segments: TrafficSegment[];
          cameras: SergekCamera[];
        };
        setCityScore(tr.cityScore);
        setSegments(tr.segments || []);
        setCameras(tr.cameras || []);
      }
      if (wRes.ok) {
        const w = (await wRes.json()) as { days: WeeklyForecastDay[]; isLive: boolean };
        setForecast(w.days || []);
        setIsLiveWeather(Boolean(w.isLive));
      }
      if (layRes.ok) {
        const lData = (await layRes.json()) as AstanaMapLayers;
        setLayers(lData);
        if (lData.tomtomConfigured) {
          setShowTomTomLive(true);
        }
      }
      if (incRes.ok) {
        const incData = (await incRes.json()) as { incidents?: TomTomIncident[] };
        setIncidents(incData.incidents || []);
      }
      if (aqRes.ok) {
        setAirQuality((await aqRes.json()) as AirQualityData);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Astana Official School Cancellation / Storm & Glaze-Ice Advisor
  const stormAdvisory = useMemo(() => {
    const today = forecast[0];
    if (!today) {
      return {
        level: 'normal' as const,
        title: 'Штатные погодные условия в Астане',
        detail: 'Занятия в школах проходят в обычном режиме.',
      };
    }
    const minT = today.tempMin;
    const wind = today.windMax;
    const windChillPenalty = wind >= 5 ? Math.round((wind - 2) * 0.8) : 0;
    const effMin = minT - windChillPenalty;

    if (effMin <= -35 || (minT <= -30 && wind >= 8)) {
      return {
        level: 'severe' as const,
        title: 'Штормовой мороз · Возможна отмена 0–11 классов (дистанционка)',
        detail: `Ночью до ${minT}°C при ветре ${wind} м/с. Рекомендуется автопрогрев каждые 3 часа и проверка объявлений Управления образования Астаны.`,
      };
    }
    if (effMin <= -30 || (minT <= -25 && wind >= 6)) {
      return {
        level: 'warn' as const,
        title: 'Морозный порог · Вероятна отмена 0–9 классов',
        detail: `Минимальная температура ${minT}°C, порывы ветра до ${wind} м/с. Следите за оперативной сводкой iKomek 109 утром в 06:15.`,
      };
    }
    if (effMin <= -25) {
      return {
        level: 'warn' as const,
        title: 'Порог для начальной школы (0–4 классы)',
        detail: `Ощущается ниже −25°C (${minT}°C, ветер ${wind} м/с). Одевайте детей теплее, закладывайте запас времени на такси.`,
      };
    }
    if (today.tempMax >= -2 && today.tempMin <= -5 && (today.precipProb >= 45 || wind >= 10)) {
      return {
        level: 'ice' as const,
        title: 'Гололедица и сильный ветер по Астане',
        detail: `Перепад ${today.tempMin}°…${today.tempMax > 0 ? `+${today.tempMax}` : today.tempMax}°C, ветер ${wind} м/с. Увеличьте дистанцию на пр. Мангилик Ел и Туран.`,
      };
    }
    return {
      level: 'normal' as const,
      title: 'Погода в норме · Занятия в школах в штатном режиме',
      detail: `Сегодня ${today.tempMin}°…${today.tempMax > 0 ? `+${today.tempMax}` : today.tempMax}°C, ветер ${wind} м/с. Дороги проездные.`,
    };
  }, [forecast]);

  // Smart Departure Calculator
  const commuteAdvice = useMemo(() => {
    const today = forecast[0];
    const [hh, mm] = arrivalTime.split(':').map((n) => Number.parseInt(n, 10) || 0);
    const targetMinutes = hh * 60 + mm;
    const trafficBuffer = cityScore >= 7 ? 15 : cityScore >= 5 ? 8 : 3;
    const weatherBuffer = today && (today.precipProb >= 45 || today.tempMin <= -20 || today.windMax >= 10) ? 10 : 0;
    const totalTravelMin = baseCommuteMin + trafficBuffer + weatherBuffer;
    const leaveMinutes = ((targetMinutes - totalTravelMin) % 1440 + 1440) % 1440;
    const leaveStr = `${String(Math.floor(leaveMinutes / 60)).padStart(2, '0')}:${String(leaveMinutes % 60).padStart(2, '0')}`;

    const modeHint =
      today && today.tempMin <= -15
        ? 'Мороз ниже −15°C — оптимально Такси Комфорт или авто с автозапуском'
        : today && today.precipProb >= 50
        ? 'Ожидаются осадки — лучше выехать на 10 мин раньше, возможны пробки на мостах'
        : cityScore >= 7
        ? 'Высокий балл пробок — рассмотрите автобус по выделенной Bus Lane'
        : 'Хорошие условия для поездки на авто, автобусе или веломаршруте';

    return { leaveStr, totalTravelMin, trafficBuffer, weatherBuffer, modeHint };
  }, [arrivalTime, baseCommuteMin, cityScore, forecast]);

  // Dynamic Astana Bridges status
  const liveBridges = useMemo(() => {
    return ASTANA_BRIDGES.map((br) => {
      const score = Math.max(1, Math.min(10, Math.round(br.baseScore + (cityScore - 5) * 0.6)));
      const speedKmh = Math.max(12, Math.round(br.speedKmh - (score - br.baseScore) * 4));
      const status = score >= 7 ? 'Затор' : score >= 5 ? 'Плотно' : 'Свободно';
      return { ...br, score, speedKmh, status };
    });
  }, [cityScore]);

  const scoreTone =
    cityScore >= 7
      ? 'bg-rose-600 text-white'
      : cityScore >= 4
      ? 'bg-amber-500 text-slate-950'
      : 'bg-emerald-600 text-white';

  const sergekTotal = (layers?.sergekCameras.length || 0) + cameras.length;
  const lightsTotal = layers?.trafficLights.length || 0;
  const parkingsTotal = layers?.parkings.length || 0;

  return (
    <div className="space-y-5">
      {/* Header Summary */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl font-mono text-xl font-extrabold shadow-sm ${scoreTone}`}>
              {cityScore}
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                Пробки, экология AQI и погода 7д
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Загруженность магистралей Астаны: {cityScore}/10 · {sergekTotal} камер Сергек · {lightsTotal} светофоров · {incidents.length} событий
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Обновить сводку
          </button>
        </div>

        {/* Storm Advisor + Live Air Quality AQI */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-3.5 text-xs ${
              stormAdvisory.level === 'severe'
                ? 'border-rose-400/50 bg-rose-500/15 text-rose-950 dark:text-rose-100'
                : stormAdvisory.level === 'warn' || stormAdvisory.level === 'ice'
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-950 dark:text-amber-100'
                : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
            }`}
          >
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-display text-sm font-extrabold">{stormAdvisory.title}</div>
              <div className="mt-0.5 opacity-90">{stormAdvisory.detail}</div>
            </div>
          </div>

          {/* Air Quality AQI Card */}
          <div className="rounded-2xl border border-sky-400/30 bg-white/70 p-3.5 text-xs dark:bg-slate-900/65">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl font-mono text-sm font-extrabold text-white ${
                    !airQuality || airQuality.aqi <= 50
                      ? 'bg-emerald-600'
                      : airQuality.aqi <= 100
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-rose-600'
                  }`}
                >
                  {airQuality ? airQuality.aqi : '—'}
                </span>
                <div>
                  <div className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    Воздух Астаны: {airQuality?.level || 'Загрузка…'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {airQuality?.isLive ? 'Open-Meteo Air Quality' : 'Оценка по метео-данным'}
                  </div>
                </div>
              </div>
              {airQuality && (
                <div className="flex gap-2 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  <span>PM2.5: {airQuality.pm25}</span>
                  <span>PM10: {airQuality.pm10}</span>
                  <span>NO₂: {airQuality.no2}</span>
                </div>
              )}
            </div>
            {airQuality && (
              <div className="mt-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                {airQuality.advice}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 7-Day Weather Forecast Strip */}
      <div className="liquid-glass rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
            Прогноз погоды в Астане на 7 дней
          </h3>
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
            {isLiveWeather ? 'Данные Open-Meteo' : 'Региональный кэш'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {forecast.map((day) => (
            <div
              key={day.date}
              className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-3 space-y-2"
            >
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {day.dayLabel}
              </div>
              <div className="flex items-center justify-between">
                <WeatherIcon code={day.weatherCode} />
                <div className="text-right font-mono tabular-nums">
                  <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {day.tempMax > 0 ? `+${day.tempMax}` : day.tempMax}°
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {day.tempMin > 0 ? `+${day.tempMin}` : day.tempMin}°
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 tabular-nums">
                <span className="truncate">{day.description}</span>
                <span className="flex items-center gap-0.5 shrink-0 ml-1">
                  <Wind className="h-3 w-3" />
                  {day.windMax}м/с
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Smart Departure Alarm + Bridges Monitor + Transit Terminals */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Smart Departure Alarm */}
        <div className="liquid-glass rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <AlarmClock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Умный будильник выхода
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Учитывает пробки ({cityScore}/10) и погоду Астаны
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="block">
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                Быть к
              </span>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                Обычный путь
              </span>
              <select
                value={baseCommuteMin}
                onChange={(e) => setBaseCommuteMin(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-2 py-1.5 text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value={15}>15 мин (рядом)</option>
                <option value={25}>25 мин (средне)</option>
                <option value={40}>40 мин (через реку)</option>
              </select>
            </label>
          </div>

          <div className="rounded-2xl bg-slate-900 p-3.5 text-white dark:bg-slate-800">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-slate-300">Оптимальный выход:</span>
              <span className="font-mono text-2xl font-extrabold text-amber-400">
                {commuteAdvice.leaveStr}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-300">
              В пути ~{commuteAdvice.totalTravelMin} мин (+{commuteAdvice.trafficBuffer}м пробки
              {commuteAdvice.weatherBuffer > 0 ? `, +${commuteAdvice.weatherBuffer}м погода` : ''})
            </div>
            <div className="mt-1.5 text-[11px] text-sky-300">{commuteAdvice.modeHint}</div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await fetch('/api/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: `Выход из дома (в пути ~${commuteAdvice.totalTravelMin} мин)`,
                  remindAt: `К ${arrivalTime} · выход в ${commuteAdvice.leaveStr}`,
                  category: 'Город',
                }),
              }).catch(() => undefined);
              setAlarmSaved(true);
              window.setTimeout(() => setAlarmSaved(false), 2500);
            }}
            className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            {alarmSaved ? 'Добавлено в Напоминания!' : `Напомнить выйти в ${commuteAdvice.leaveStr}`}
          </button>
        </div>

        {/* Astana Bridges Monitor */}
        <div className="liquid-glass rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
              Мосты через Есиль
            </h3>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Правый ↔ Левый берег
            </span>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {liveBridges.map((br) => (
              <div
                key={br.id}
                className="liquid-glass-subtle flex items-center justify-between gap-2 rounded-2xl p-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-900 dark:text-slate-100">
                    {br.name}
                  </div>
                  <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {br.district} · ~{br.speedKmh} км/ч
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold ${
                    br.score >= 7
                      ? 'bg-rose-600 text-white'
                      : br.score >= 5
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {br.status} {br.score}/10
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Airport NQZ, Railway Stations & Toll Highways */}
        <div className="liquid-glass rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
              Аэропорт NQZ, вокзалы и трассы
            </h3>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {TRANSIT_TERMINALS.map((term) => (
              <button
                key={term.id}
                type="button"
                onClick={() => setFocusCoord([term.lat, term.lng])}
                className="liquid-glass-subtle w-full rounded-2xl p-2.5 text-left text-xs hover:bg-white/90 dark:hover:bg-slate-800/90"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-slate-900 dark:text-slate-100">
                    {term.name}
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 shrink-0">
                    <MapPin className="h-2.5 w-2.5" />
                    {term.type}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                  {term.info}
                </div>
                <div className="mt-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {term.nextSchedule}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Layer Toggles Strip */}
      <div className="liquid-glass rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 px-1.5">
          Слои карты трафика:
        </span>
        <button
          type="button"
          onClick={() => setShowTraffic((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            showTraffic ? 'bg-rose-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <Gauge className="h-3.5 w-3.5" />
          Пробки ({segments.length})
        </button>
        <button
          type="button"
          onClick={() => setShowIncidents((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            showIncidents ? 'bg-orange-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Инциденты ({incidents.length})
        </button>
        <button
          type="button"
          onClick={() => setShowSergek((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            showSergek ? 'bg-violet-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          Сергек ({sergekTotal})
        </button>
        <button
          type="button"
          onClick={() => setShowLights((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            showLights ? 'bg-emerald-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <TrafficCone className="h-3.5 w-3.5" />
          Светофоры ({lightsTotal})
        </button>
        <button
          type="button"
          onClick={() => setShowParkings((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            showParkings ? 'bg-sky-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <ParkingSquare className="h-3.5 w-3.5" />
          Парковки ({parkingsTotal})
        </button>
        <button
          type="button"
          onClick={() => setShowNoParking((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            showNoParking ? 'bg-red-600 text-white' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <Ban className="h-3.5 w-3.5" />
          Знаки 3.27 ({layers?.noParkingSigns.length || 0})
        </button>
        {layers?.tomtomConfigured && (
          <button
            type="button"
            onClick={() => setShowTomTomLive((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              showTomTomLive ? 'bg-amber-500 text-slate-950' : 'bg-white/65 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            TomTom Live
          </button>
        )}
      </div>

      {/* Map + Corridors, Incidents & Cameras */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_1fr]">
        <div className="liquid-glass rounded-3xl p-5 space-y-4">
          {incidents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-display text-sm font-extrabold text-slate-900 dark:text-slate-100 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Дорожные события ({incidents.length})
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {incidents.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => inc.coords[0] && setFocusCoord(inc.coords[0])}
                    className="liquid-glass-subtle flex w-full items-center justify-between gap-2 rounded-2xl p-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                        {inc.description}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {inc.from && inc.to ? `${inc.from} → ${inc.to}` : 'Астана · проезд затруднён'}
                      </div>
                    </div>
                    {inc.delaySec > 0 && (
                      <span className="rounded-lg bg-orange-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white shrink-0">
                        +{Math.max(1, Math.round(inc.delaySec / 60))}м
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 font-display text-sm font-extrabold text-slate-900 dark:text-slate-100 mb-2.5">
              <Gauge className="h-4 w-4 text-amber-500" />
              Основные магистрали
            </div>
            <div className="space-y-2">
              {segments.map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => seg.coords[0] && setFocusCoord(seg.coords[0])}
                  className="liquid-glass-subtle flex w-full items-center justify-between gap-2 rounded-2xl p-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                      {seg.street}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {seg.district} · скорость ~{seg.speedKmh} км/ч
                    </div>
                  </div>
                  <span
                    className={`rounded-lg px-2 py-1 font-mono text-xs font-bold shrink-0 tabular-nums ${
                      seg.level === 'busy'
                        ? 'bg-rose-600 text-white'
                        : seg.level === 'moderate'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {seg.score}/10
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-900/10 pt-4 dark:border-white/10">
            <div className="flex items-center gap-2 font-display text-sm font-extrabold text-slate-900 dark:text-slate-100 mb-2.5">
              <Camera className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Комплексы «Сергек» ({sergekTotal})
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {cameras.map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => setFocusCoord([cam.lat, cam.lng])}
                  className="liquid-glass-subtle flex w-full items-center justify-between gap-2 rounded-2xl p-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {cam.name}
                    </div>
                    <div className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                      {cam.intersection}
                    </div>
                  </div>
                  <span className="rounded-lg bg-violet-600 px-2 py-1 font-mono text-[11px] font-bold text-white shrink-0">
                    {cam.limitKmh} км/ч
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative min-h-[480px] overflow-hidden rounded-3xl border border-white/80 dark:border-white/15 shadow-xl">
          <AstanaMap
            center={focusCoord}
            zoom={13}
            trafficSegments={showTraffic ? segments : []}
            incidents={showIncidents ? incidents : []}
            sergekCameras={showSergek ? cameras : []}
            sergekPoints={showSergek ? layers?.sergekCameras || [] : []}
            trafficLights={showLights ? layers?.trafficLights || [] : []}
            paidParkings={showParkings ? layers?.parkings || [] : []}
            noParkingSigns={showNoParking ? layers?.noParkingSigns || [] : []}
            tomtomLiveEnabled={showTomTomLive}
          />
        </div>
      </div>
    </div>
  );
}
