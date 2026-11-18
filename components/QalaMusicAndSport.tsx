import {
  Activity,
  Bike,
  CalendarPlus,
  Clock,
  Leaf,
  MapPin,
  Music,
  Pause,
  Play,
  Radio,
  Ticket,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ASTANA_EVENTS_AFISHA } from '../data/astanaData';
import type { PlanItem, WalletTransaction } from '../types/qala';

interface RadioStation {
  id: string;
  name: string;
  genre: string;
  freq: string;
  streamUrl: string;
  isLiveStream?: boolean;
}

const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'love-radio',
    name: 'Love Radio Казахстан',
    genre: 'Поп-хиты и танцевальная музыка · Астана 102.3 FM · Алматы 103.5 FM',
    freq: '102.3 FM',
    streamUrl: `/api/radio/proxy?url=${encodeURIComponent('http://stream.gakku.kz:8000/love128.mp3')}`,
    isLiveStream: true,
  },
  {
    id: 'astana-fm',
    name: 'Astana FM 101.4',
    genre: 'Городское радио · Новости и музыка',
    freq: '101.4 FM',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    id: 'qazaq-radiosy',
    name: 'Қазақ радиосы',
    genre: 'Национальный эфир · Культура',
    freq: '106.8 FM',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    id: 'classic-astana',
    name: 'Classic Silk Way',
    genre: 'Инструментальная музыка и джаз',
    freq: '102.8 FM',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
  {
    id: 'tengri-beats',
    name: 'Steppe Ambient',
    genre: 'Электроника и фокус для работы',
    freq: 'Online',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];

const SPORT_ROUTES = [
  {
    id: 'sport-triathlon',
    name: 'Триатлон Парк Астана',
    type: 'Бег и велодорожка',
    distanceKm: 6.4,
    durationMin: 35,
    calories: 420,
    ecoPoints: 65,
    address: 'пр. Бауыржана Момышулы',
    lat: 51.1404,
    lng: 71.4648,
  },
  {
    id: 'sport-botanical',
    name: 'Ботанический сад · Большой круг',
    type: 'Пробежка и ходьба',
    distanceKm: 4.8,
    durationMin: 28,
    calories: 310,
    ecoPoints: 50,
    address: 'пр. Кабанбай батыра, 41',
    lat: 51.1066,
    lng: 71.4163,
  },
  {
    id: 'sport-yesil',
    name: 'Набережная реки Есиль',
    type: 'Велосипед / Самокат',
    distanceKm: 9.2,
    durationMin: 40,
    calories: 480,
    ecoPoints: 95,
    address: 'Центральный парк',
    lat: 51.1542,
    lng: 71.4228,
  },
];

export function QalaMusicModule({
  onMediaChange,
  externalCommand,
}: {
  onMediaChange?: (state: {
    id: string;
    title: string;
    subtitle: string;
    isPlaying: boolean;
  } | null) => void;
  externalCommand?: { target: 'radio'; action: 'toggle' | 'stop'; seq: number } | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeStation, setActiveStation] = useState<RadioStation>(RADIO_STATIONS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'loading' | 'live' | 'error'>('idle');

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!externalCommand || externalCommand.target !== 'radio') return;
    const v = audioRef.current;
    if (!v) return;
    if (externalCommand.action === 'stop') {
      v.pause();
      if (!activeStation.isLiveStream) {
        try {
          v.currentTime = 0;
        } catch {
          // ignore
        }
      }
      setIsPlaying(false);
      setStreamStatus('idle');
    } else if (externalCommand.action === 'toggle') {
      if (v.paused) {
        setStreamStatus('loading');
        if (activeStation.isLiveStream) {
          v.load();
        }
        v.play().catch(() => {
          setStreamStatus('error');
          setIsPlaying(false);
        });
        setIsPlaying(true);
      } else {
        v.pause();
        setIsPlaying(false);
        setStreamStatus('idle');
      }
    }
  }, [activeStation.isLiveStream, externalCommand]);

  useEffect(() => {
    if (isPlaying) {
      onMediaChange?.({
        id: activeStation.id,
        title: activeStation.name,
        subtitle: activeStation.freq,
        isPlaying: true,
      });
    }
  }, [activeStation, isPlaying, onMediaChange]);

  const toggleStation = (station: RadioStation) => {
    if (activeStation.id === station.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      setStreamStatus('idle');
      onMediaChange?.({
        id: station.id,
        title: station.name,
        subtitle: station.freq,
        isPlaying: false,
      });
    } else {
      const switching = activeStation.id !== station.id;
      setActiveStation(station);
      setIsPlaying(true);
      setStreamStatus('loading');
      onMediaChange?.({
        id: station.id,
        title: station.name,
        subtitle: station.freq,
        isPlaying: true,
      });
      window.setTimeout(() => {
        const el = audioRef.current;
        if (!el) return;
        if (switching || station.isLiveStream) {
          el.load();
        }
        el.play().catch(() => {
          setStreamStatus('error');
          setIsPlaying(false);
        });
      }, 60);
    }
  };

  return (
    <div className="liquid-glass mx-auto max-w-4xl rounded-3xl p-5 sm:p-7 space-y-6">
      <audio
        ref={audioRef}
        src={activeStation.streamUrl}
        preload="none"
        className="hidden"
        onPlaying={() => setStreamStatus('live')}
        onWaiting={() => setStreamStatus('loading')}
        onError={() => {
          if (isPlaying) {
            setStreamStatus('error');
            setIsPlaying(false);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setStreamStatus('idle');
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-900/10 pb-5 dark:border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
            <Music className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Qala Music & Radio
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Радиостанции Астаны, Love Radio Казахстан и фоновые аудиопотоки
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-2 dark:bg-slate-800/80">
          <Volume2 className="h-4 w-4 text-slate-700 dark:text-slate-200" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Громкость радио"
            className="w-24 accent-indigo-600"
          />
        </div>
      </div>

      {/* Active Player Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-900 p-5 text-white shadow-md dark:bg-slate-950/90">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              activeStation.id === 'love-radio' ? 'bg-rose-500/20' : 'bg-white/10'
            }`}
          >
            <Radio
              className={`h-6 w-6 ${
                activeStation.id === 'love-radio' ? 'text-rose-400' : 'text-sky-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-sky-300">
              <span>{activeStation.freq}</span>
              {activeStation.isLiveStream && (
                <span className="rounded-md bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                  LIVE FM
                </span>
              )}
              {isPlaying && streamStatus === 'loading' && (
                <span className="text-[10px] text-amber-300">Подключение…</span>
              )}
              {isPlaying && streamStatus === 'live' && (
                <span className="text-[10px] text-emerald-300">В эфире</span>
              )}
              {streamStatus === 'error' && (
                <span className="text-[10px] text-rose-300">Поток недоступен</span>
              )}
            </div>
            <div className="font-display text-lg font-bold">{activeStation.name}</div>
            <div className="text-xs text-slate-300">{activeStation.genre}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleStation(activeStation)}
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100"
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4 fill-current" />
              Пауза
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              Слушать эфир
            </>
          )}
        </button>
      </div>

      {/* Stations List */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RADIO_STATIONS.map((station) => {
          const active = activeStation.id === station.id && isPlaying;
          const isLove = station.id === 'love-radio';
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => toggleStation(station)}
              className={`flex items-center justify-between gap-3 rounded-2xl p-4 text-left transition-all ${
                active
                  ? isLove
                    ? 'bg-white/95 ring-2 ring-rose-500 shadow-sm dark:bg-slate-800/95'
                    : 'bg-white/90 ring-2 ring-indigo-600 shadow-sm dark:bg-slate-800/95'
                  : 'liquid-glass-subtle'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span>{station.name}</span>
                  {station.isLiveStream && (
                    <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      LIVE
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                  {station.genre}
                </div>
              </div>
              <span
                className={`font-mono text-xs font-semibold shrink-0 ${
                  isLove
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-indigo-700 dark:text-indigo-400'
                }`}
              >
                {station.freq}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QalaSportModule({
  onOpenOnMap,
  onLogWorkoutPlan,
}: {
  onOpenOnMap: (name: string, address: string, lat: number, lng: number) => void;
  onLogWorkoutPlan: (title: string) => Promise<void>;
}) {
  const [completedKm, setCompletedKm] = useState(6.4);
  const [workoutsCount, setWorkoutsCount] = useState(2);
  const [ecoPoints, setEcoPoints] = useState<number>(() => {
    try {
      const saved = Number(window.localStorage.getItem('qala_eco_points') || '120');
      return Number.isFinite(saved) ? saved : 120;
    } catch {
      return 120;
    }
  });

  const addEcoPoints = (pts: number) => {
    setEcoPoints((prev) => {
      const next = prev + pts;
      try {
        window.localStorage.setItem('qala_eco_points', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="space-y-5 mx-auto max-w-4xl">
      <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-900/10 pb-5 dark:border-white/10">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                Qala Sport & Eco
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Беговые, веломаршруты Астаны и эко-баллы за активность
              </p>
            </div>
          </div>

          <div className="flex gap-5 text-right">
            <div>
              <div className="font-mono text-xl font-extrabold text-slate-900 tabular-nums dark:text-slate-100">
                {completedKm.toFixed(1)} км
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">за неделю</div>
            </div>
            <div>
              <div className="font-mono text-xl font-extrabold text-emerald-700 tabular-nums dark:text-emerald-400">
                {workoutsCount}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">тренировки</div>
            </div>
            <div>
              <div className="flex items-center justify-end gap-1 font-mono text-xl font-extrabold text-teal-600 tabular-nums dark:text-teal-300">
                <Leaf className="h-4 w-4" />
                {ecoPoints}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">эко-баллов</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {SPORT_ROUTES.map((route) => (
            <div
              key={route.id}
              className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-4 space-y-4"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  <span>{route.type}</span>
                  <span className="font-mono">+{route.ecoPoints} эко</span>
                </div>
                <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {route.name}
                </h3>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {route.address}
                </div>
                <div className="mt-3 flex items-center gap-3 font-mono text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                  <span className="flex items-center gap-1">
                    <Bike className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                    {route.distanceKm} км
                  </span>
                  <span>{route.durationMin} мин</span>
                  <span>{route.calories} ккал</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompletedKm((k) => Number((k + route.distanceKm).toFixed(1)));
                    setWorkoutsCount((c) => c + 1);
                    addEcoPoints(route.ecoPoints);
                    onLogWorkoutPlan(
                      `Тренировка: ${route.name} (${route.distanceKm} км, +${route.ecoPoints} эко-баллов)`
                    );
                  }}
                  className="w-full rounded-xl bg-emerald-800 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
                >
                  Отметить тренировку (+{route.ecoPoints} эко)
                </button>
                <button
                  type="button"
                  onClick={() => onOpenOnMap(route.name, route.address, route.lat, route.lng)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/80 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Показать на карте
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Astana Events & Concerts Afisha */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
              Афиша событий Астаны (Спорт, Опера, Концерты)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Ближайшие мероприятия на площадках города
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ASTANA_EVENTS_AFISHA.map((ev) => (
            <div
              key={ev.id}
              className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-4 space-y-3"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-rose-600 dark:text-rose-400">{ev.category}</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{ev.date}</span>
                </div>
                <div className="mt-1 font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  {ev.title}
                </div>
                <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  {ev.venue} · <span className="font-mono font-bold">{ev.price}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onLogWorkoutPlan(`Событие: ${ev.title} (${ev.date})`)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-rose-600"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  В планы
                </button>
                <button
                  type="button"
                  onClick={() => onOpenOnMap(ev.title, ev.venue, ev.lat, ev.lng)}
                  className="flex items-center justify-center gap-1 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Карта
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QalaHistoryModule({
  transactions,
  plans,
}: {
  transactions: WalletTransaction[];
  plans: PlanItem[];
}) {
  return (
    <div className="liquid-glass mx-auto max-w-4xl rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-900/10 pb-4 dark:border-white/10">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            История действий
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Журнал поездок, покупок и выполненных планов из SQLite
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="font-display text-sm font-bold text-slate-800 dark:text-slate-200">
            Операции и заказы ({transactions.length})
          </h3>
          {transactions.length === 0 ? (
            <div className="rounded-2xl bg-white/55 p-4 text-xs text-slate-600 dark:bg-slate-800/55 dark:text-slate-400">
              Пока нет записей о расходах и поездках.
            </div>
          ) : (
            transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-2.5 text-xs dark:bg-slate-800/70"
              >
                <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {t.title}
                </span>
                <span className="font-mono font-bold text-slate-800 tabular-nums ml-2 shrink-0 dark:text-slate-200">
                  {t.amount.toLocaleString('ru-RU')} ₸
                </span>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-sm font-bold text-slate-800 dark:text-slate-200">
            Планы и события ({plans.length})
          </h3>
          {plans.length === 0 ? (
            <div className="rounded-2xl bg-white/55 p-4 text-xs text-slate-600 dark:bg-slate-800/55 dark:text-slate-400">
              Планы пока не добавлены.
            </div>
          ) : (
            plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-2.5 text-xs dark:bg-slate-800/70"
              >
                <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {p.title}
                </span>
                <span className="text-[11px] text-slate-500 ml-2 shrink-0 dark:text-slate-400">
                  {p.dateLabel}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
