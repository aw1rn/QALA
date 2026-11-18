import {
  Bookmark,
  Calendar,
  CheckCircle2,
  Film,
  MapPin,
  Play,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import posterAlpine from '../assets/images/poster_alpine_echo_1794686990618.jpg';
import posterHarbor from '../assets/images/poster_harbor_noir_1794686990011.jpg';
import posterLantern from '../assets/images/poster_lantern_alley_1794686990409.jpg';
import posterOrbital from '../assets/images/poster_orbital_horizon_1794686988683.jpg';
import { ASTANA_CENTER, QINO_FEATURED_MOVIES } from '../data/astanaData';
import type { AstanaPlace, CinemaMovie, CinemaTicket, KinoLiveMovie } from '../types/qala';
import { AstanaMap } from './AstanaMap';

function DeterministicQrSvg({ code }: { code: string }) {
  const cells = useMemo(() => {
    let seed = 2166136261;
    for (let i = 0; i < code.length; i += 1) {
      seed ^= code.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    const grid: boolean[] = [];
    for (let r = 0; r < 11; r += 1) {
      for (let c = 0; c < 11; c += 1) {
        const isTopLeft = r < 3 && c < 3;
        const isTopRight = r < 3 && c >= 8;
        const isBottomLeft = r >= 8 && c < 3;
        if (isTopLeft || isTopRight || isBottomLeft) {
          const lr = r >= 8 ? r - 8 : r;
          const lc = c >= 8 ? c - 8 : c;
          grid.push(!(lr === 1 && lc === 1));
        } else {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          grid.push((seed & 1) === 1);
        }
      }
    }
    return grid;
  }, [code]);

  return (
    <svg
      viewBox="0 0 11 11"
      className="h-24 w-24 rounded-xl bg-white p-2 shadow-xs border border-slate-200"
      aria-label={`QR-код билета ${code}`}
    >
      {cells.map((filled, idx) =>
        filled ? (
          <rect
            key={idx}
            x={idx % 11}
            y={Math.floor(idx / 11)}
            width={1}
            height={1}
            fill="#0f172a"
            rx={0.12}
          />
        ) : null
      )}
    </svg>
  );
}

const LOCAL_POSTERS: Record<string, string> = {
  'qino-tears-of-steel': posterOrbital,
  'qino-sintel': posterAlpine,
  'qino-elephants-dream': posterHarbor,
  'qino-big-buck-bunny': posterLantern,
};

const HALL_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const HALL_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

interface SeatPickerTarget {
  sessionKey: string;
  movie: CinemaMovie;
  time: string;
  cinemaName: string;
  hallName: string;
  format: string;
  adultPrice: number;
  studentPrice: number;
  childPrice: number;
  vipPrice: number;
}

interface QalaQinoModuleProps {
  favoriteMovies: CinemaMovie[];
  onToggleFavorite: (movie: CinemaMovie) => Promise<void>;
  onBuyTicket: (
    movie: CinemaMovie,
    time: string,
    details?: { totalPrice?: number; seatsLabel?: string; cinemaHall?: string }
  ) => Promise<void>;
  onOpenOnMap?: (name: string, address: string, lat: number, lng: number) => void;
}

function getIsoDateOffset(days: number): string {
  const dt = new Date(Date.now() + days * 86400000);
  return dt.toISOString().slice(0, 10);
}

export function QalaQinoModule({
  favoriteMovies,
  onToggleFavorite,
  onBuyTicket,
  onOpenOnMap,
}: QalaQinoModuleProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CinemaMovie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playingMovie, setPlayingMovie] = useState<CinemaMovie | null>(null);
  const [tab, setTab] = useState<'afisha' | 'tickets' | 'search' | 'favorites'>('afisha');
  const [formatFilter, setFormatFilter] = useState<'Все' | 'IMAX' | '4DX' | '3D' | '2D'>('Все');
  const [langFilter, setLangFilter] = useState<'Все' | 'RU' | 'KZ'>('Все');
  const [tickets, setTickets] = useState<CinemaTicket[]>([]);

  const [afishaDate, setAfishaDate] = useState<string>(() => getIsoDateOffset(0));
  const [liveMovies, setLiveMovies] = useState<KinoLiveMovie[]>([]);
  const [isLiveAfisha, setIsLiveAfisha] = useState(false);
  const [loadingAfisha, setLoadingAfisha] = useState(true);
  const [showCinemaMap, setShowCinemaMap] = useState(false);
  const [mapFocus, setMapFocus] = useState<[number, number]>(ASTANA_CENTER);
  const [brokenPosters, setBrokenPosters] = useState<Record<string, boolean>>({});

  // Interactive Cinema Seat Map state
  const [seatPicker, setSeatPicker] = useState<SeatPickerTarget | null>(null);
  const [bookedSeats, setBookedSeats] = useState<string[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [ticketType, setTicketType] = useState<'adult' | 'student' | 'child'>('adult');
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [bookingInFlight, setBookingInFlight] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedPass, setConfirmedPass] = useState<{
    code: string;
    seats: string[];
    total: number;
    ticketTypeLabel: string;
  } | null>(null);

  const favIds = new Set(favoriteMovies.map((m) => m.id));

  const openSeatPicker = useCallback(async (target: SeatPickerTarget) => {
    setSeatPicker(target);
    setSelectedSeats([]);
    setBookedSeats([]);
    setTicketType('adult');
    setBookingError(null);
    setConfirmedPass(null);
    setLoadingSeats(true);
    try {
      const res = await fetch(
        `/api/cinema/seats?sessionKey=${encodeURIComponent(target.sessionKey)}`
      );
      if (res.ok) {
        const d = (await res.json()) as { bookedSeats?: string[] };
        setBookedSeats(d.bookedSeats || []);
      }
    } catch {
      // keep empty fallback
    } finally {
      setLoadingSeats(false);
    }
  }, []);

  const seatUnitPrices = useMemo(() => {
    if (!seatPicker) return { standard: 2400, vip: 3400, label: 'Взрослый' };
    const adult = seatPicker.adultPrice || 2400;
    const student =
      seatPicker.studentPrice > 0
        ? seatPicker.studentPrice
        : Math.round((adult * 0.75) / 100) * 100;
    const child =
      seatPicker.childPrice > 0
        ? seatPicker.childPrice
        : Math.round((adult * 0.6) / 100) * 100;
    const vip =
      seatPicker.vipPrice > 0
        ? seatPicker.vipPrice
        : Math.round((adult * 1.35) / 100) * 100;

    if (ticketType === 'student') return { standard: student, vip, label: 'Студенческий' };
    if (ticketType === 'child') return { standard: child, vip, label: 'Детский' };
    return { standard: adult, vip, label: 'Взрослый' };
  }, [seatPicker, ticketType]);

  const seatTotalAmount = useMemo(() => {
    return selectedSeats.reduce(
      (sum, seat) => sum + (seat.startsWith('G') ? seatUnitPrices.vip : seatUnitPrices.standard),
      0
    );
  }, [seatUnitPrices.standard, seatUnitPrices.vip, selectedSeats]);

  const confirmSeatBooking = async () => {
    if (!seatPicker || selectedSeats.length === 0) return;
    setBookingInFlight(true);
    setBookingError(null);
    try {
      const res = await fetch('/api/cinema/seats/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: seatPicker.sessionKey,
          seats: selectedSeats,
          ticketType: seatUnitPrices.label,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        bookedSeats?: string[];
        reserved?: string[];
      };
      if (!res.ok) {
        setBookingError(json.error || 'Не удалось забронировать выбранные места');
        const refresh = await fetch(
          `/api/cinema/seats?sessionKey=${encodeURIComponent(seatPicker.sessionKey)}`
        );
        if (refresh.ok) {
          const rj = (await refresh.json()) as { bookedSeats?: string[] };
          setBookedSeats(rj.bookedSeats || []);
        }
        return;
      }

      const reserved = json.reserved || selectedSeats;
      setBookedSeats(json.bookedSeats || [...bookedSeats, ...reserved]);
      await onBuyTicket(
        {
          ...seatPicker.movie,
          cinemaHall: `${seatPicker.cinemaName} (${seatPicker.hallName})`,
          ticketPrice: seatTotalAmount,
        },
        seatPicker.time,
        {
          totalPrice: seatTotalAmount,
          seatsLabel: reserved.join(', '),
          cinemaHall: `${seatPicker.cinemaName} · ${seatPicker.hallName}`,
        }
      );

      const passCode = `QINO-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${reserved.length}`;
      try {
        const tRes = await fetch('/api/cinema/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionKey: seatPicker.sessionKey,
            movieTitle: seatPicker.movie.title,
            cinemaName: seatPicker.cinemaName,
            hallName: seatPicker.hallName,
            time: seatPicker.time,
            seats: reserved,
            ticketType: seatUnitPrices.label,
            totalPrice: seatTotalAmount,
            code: passCode,
          }),
        });
        if (tRes.ok) {
          const td = (await tRes.json()) as { ticket?: CinemaTicket };
          if (td.ticket) {
            setTickets((prev) => [td.ticket!, ...prev]);
          }
        }
      } catch {
        // non-blocking ticket log
      }

      setConfirmedPass({
        code: passCode,
        seats: reserved,
        total: seatTotalAmount,
        ticketTypeLabel: seatUnitPrices.label,
      });
      setSelectedSeats([]);
    } catch {
      setBookingError('Ошибка сети при бронировании');
    } finally {
      setBookingInFlight(false);
    }
  };

  const fallbackMovies = useMemo<CinemaMovie[]>(() => {
    return QINO_FEATURED_MOVIES.map((m) => ({
      ...m,
      posterUrl: LOCAL_POSTERS[m.id] || posterOrbital,
    }));
  }, []);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/cinema/tickets');
      if (res.ok) {
        const data = (await res.json()) as { tickets?: CinemaTicket[] };
        setTickets(data.tickets || []);
      }
    } catch {
      // silent
    }
  }, []);

  const loadAfisha = useCallback(async (dateStr: string) => {
    setLoadingAfisha(true);
    try {
      const res = await fetch(`/api/cinema/afisha?date=${encodeURIComponent(dateStr)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          isLive?: boolean;
          movies?: KinoLiveMovie[];
        };
        setLiveMovies(data.movies || []);
        setIsLiveAfisha(Boolean(data.isLive && (data.movies || []).length > 0));
      }
    } catch {
      setLiveMovies([]);
      setIsLiveAfisha(false);
    } finally {
      setLoadingAfisha(false);
    }
  }, []);

  useEffect(() => {
    loadAfisha(afishaDate);
    loadTickets();
  }, [afishaDate, loadAfisha, loadTickets]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setTab('search');
    setIsSearching(true);
    try {
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = (await res.json()) as { results: CinemaMovie[] };
        setSearchResults(data.results || []);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Unique cinemas extracted from live sessions for map visualization
  const cinemaPlaces = useMemo<AstanaPlace[]>(() => {
    const seen = new Map<string, AstanaPlace>();
    for (const mov of liveMovies) {
      for (const s of mov.sessions || []) {
        if (!s.cinema || seen.has(s.cinema)) continue;
        seen.set(s.cinema, {
          id: `cin-${seen.size}`,
          name: s.cinema,
          category: 'cinema',
          address: s.address || 'Астана',
          lat: s.lat || ASTANA_CENTER[0],
          lng: s.lng || ASTANA_CENTER[1],
          info: 'Кинотеатр Астаны',
        });
      }
    }
    if (seen.size === 0) {
      return [
        {
          id: 'cin-chaplin-mega',
          name: 'Chaplin Mega Silk Way',
          category: 'cinema',
          address: 'пр. Кабанбай батыра, 62',
          lat: 51.0894,
          lng: 71.4079,
        },
        {
          id: 'cin-kinopark-saryarka',
          name: 'Kinopark 8 Saryarka',
          category: 'cinema',
          address: 'пр. Туран, 24',
          lat: 51.1325,
          lng: 71.4038,
        },
        {
          id: 'cin-keruen',
          name: 'Kinopark 7 IMAX Keruen',
          category: 'cinema',
          address: 'ул. Достык, 9',
          lat: 51.1243,
          lng: 71.4258,
        },
      ];
    }
    return Array.from(seen.values());
  }, [liveMovies]);

  const filteredLiveMovies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liveMovies
      .map((m) => {
        const filteredSessions = (m.sessions || []).filter((s) => {
          const fmt = (s.format || '2D').toUpperCase();
          const lang = (s.lang || 'RU').toUpperCase();
          if (formatFilter !== 'Все' && !fmt.includes(formatFilter)) return false;
          if (langFilter !== 'Все' && !lang.includes(langFilter)) return false;
          return true;
        });
        return { ...m, sessions: filteredSessions };
      })
      .filter((m) => {
        if ((formatFilter !== 'Все' || langFilter !== 'Все') && m.sessions.length === 0) {
          return false;
        }
        if (!q) return true;
        return (
          m.title.toLowerCase().includes(q) ||
          m.originalTitle?.toLowerCase().includes(q) ||
          m.genres.some((g) => g.toLowerCase().includes(q)) ||
          m.sessions.some((s) => s.cinema.toLowerCase().includes(q))
        );
      });
  }, [formatFilter, langFilter, liveMovies, query]);

  const displayedFallbackOrOnline =
    tab === 'favorites'
      ? favoriteMovies
      : searchResults.length > 0
      ? searchResults
      : fallbackMovies;

  const toCinemaMovie = (m: KinoLiveMovie): CinemaMovie => {
    const firstSess = m.sessions?.[0];
    return {
      id: m.id,
      title: m.title,
      originalTitle: m.originalTitle,
      year: new Date().getFullYear(),
      genre: m.genres.join(', ') || 'Кино',
      duration: m.duration,
      rating: m.age ? `${m.age}+` : '12+',
      director: 'Астана Кинотеатры',
      description:
        m.description ||
        `Сеансы в кинотеатрах Астаны${firstSess ? ` · ${firstSess.cinema}` : ''}`,
      posterUrl: m.posterUrl || posterOrbital,
      videoUrl:
        m.videoUrl ||
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      source: 'custom',
      cinemaHall: firstSess?.cinema || 'Кинотеатры Астаны',
      showtimes: (m.sessions || []).slice(0, 6).map((s) => s.time),
      ticketPrice: firstSess?.adultPrice || 2400,
    };
  };

  return (
    <div className="space-y-5">
      <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>{isLiveAfisha ? 'Живая афиша kino.kz · Астана' : 'Киноафиша Астаны'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{cinemaPlaces.length} кинотеатров</span>
            </div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Qala <span className="text-orange-600 dark:text-orange-400">Qino & Afisha</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCinemaMap((v) => !v)}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                showCinemaMap
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'border border-white/75 bg-white/65 text-slate-800 hover:bg-white dark:border-white/15 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Кинотеатры на карте
            </button>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/70 bg-white/60 p-1 dark:border-white/15 dark:bg-slate-900/70">
              <button
                type="button"
                onClick={() => setTab('afisha')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tab === 'afisha'
                    ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Афиша ({liveMovies.length || fallbackMovies.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('tickets')}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums ${
                  tab === 'tickets'
                    ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <QrCode className="h-3.5 w-3.5" />
                Билеты · {tickets.length}
              </button>
              <button
                type="button"
                onClick={() => setTab('search')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tab === 'search'
                    ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Онлайн-кино
              </button>
              <button
                type="button"
                onClick={() => setTab('favorites')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums ${
                  tab === 'favorites'
                    ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Избранное · {favoriteMovies.length}
              </button>
            </div>
          </div>
        </div>

        {/* Date, Format & Language Filters (when Afisha tab is open) */}
        {tab === 'afisha' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-orange-500" />
                {[
                  { label: 'Сегодня', offset: 0 },
                  { label: 'Завтра', offset: 1 },
                  { label: 'Послезавтра', offset: 2 },
                ].map((d) => {
                  const iso = getIsoDateOffset(d.offset);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setAfishaDate(iso)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                        afishaDate === iso
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                          : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => loadAfisha(afishaDate)}
                disabled={loadingAfisha}
                className="flex items-center gap-1.5 rounded-xl bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingAfisha ? 'animate-spin' : ''}`} />
                Обновить афишу
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Формат:
                </span>
                {(['Все', 'IMAX', '4DX', '3D', '2D'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormatFilter(fmt)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      formatFilter === fmt
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Язык:
                </span>
                {(['Все', 'RU', 'KZ'] as const).map((lg) => (
                  <button
                    key={lg}
                    type="button"
                    onClick={() => setLangFilter(lg)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      langFilter === lg
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300'
                    }`}
                  >
                    {lg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Inline Cinemas Map */}
        {showCinemaMap && (
          <div className="h-[300px] overflow-hidden rounded-2xl border border-white/80 shadow-inner dark:border-white/15">
            <AstanaMap
              center={mapFocus}
              zoom={13}
              places={cinemaPlaces}
              onSelectPlace={(pl) => setMapFocus([pl.lat, pl.lng])}
            />
          </div>
        )}

        {/* Search Bar */}
        <form onSubmit={runSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === 'afisha'
                  ? 'Фильтр по названию фильма, жанру или кинотеатру (Chaplin, Kinopark)…'
                  : 'Найти фильм онлайн (например: Interstellar, Matrix, Dune)…'
              }
              className="w-full rounded-xl border border-white/80 bg-white/70 py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap dark:bg-orange-500 dark:text-slate-950"
          >
            Найти
          </button>
        </form>

        {/* Live Afisha Cards with Real Posters & Real Astana Showtimes */}
        {tab === 'afisha' && (
          <>
            {loadingAfisha && liveMovies.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-600 dark:text-slate-400">
                Загружаем реальную афишу кинотеатров Астаны…
              </div>
            ) : filteredLiveMovies.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredLiveMovies.map((movie, idx) => {
                  const adapted = toCinemaMovie(movie);
                  const isFav = favIds.has(movie.id);
                  const fallbackPoster = Object.values(LOCAL_POSTERS)[idx % 4];
                  const imgSrc =
                    movie.posterUrl && !brokenPosters[movie.id] ? movie.posterUrl : fallbackPoster;

                  // Group sessions by cinema
                  const byCinema = new Map<string, typeof movie.sessions>();
                  for (const s of movie.sessions || []) {
                    const list = byCinema.get(s.cinema) || [];
                    list.push(s);
                    byCinema.set(s.cinema, list);
                  }
                  const cinemaGroups = Array.from(byCinema.entries()).slice(0, 3);

                  return (
                    <div
                      key={movie.id}
                      className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex gap-4">
                        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-900 shadow-md">
                          <img
                            src={imgSrc}
                            alt={`Постер фильма ${movie.title}`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenPosters((prev) => ({ ...prev, [movie.id]: true }))
                            }
                            className="h-full w-full object-cover"
                          />
                          {movie.age > 0 && (
                            <span className="absolute top-1.5 left-1.5 rounded-md bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-xs">
                              {movie.age}+
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-orange-700 dark:text-orange-400">
                            <span>{movie.genres.slice(0, 2).join(' · ') || 'Кино'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{movie.duration}</span>
                            {movie.presale && (
                              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">
                                Предпродажа
                              </span>
                            )}
                          </div>
                          <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100 leading-snug">
                            {movie.title}
                          </h3>
                          {movie.originalTitle && movie.originalTitle !== movie.title && (
                            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {movie.originalTitle}
                            </div>
                          )}
                          <div className="pt-1 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPlayingMovie(adapted)}
                              className="flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
                            >
                              <Play className="h-3 w-3 fill-current" />
                              Трейлер
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleFavorite(adapted)}
                              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                isFav
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white/75 text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <Bookmark className={`h-3 w-3 ${isFav ? 'fill-current' : ''}`} />
                              {isFav ? 'Сохранено' : 'В закладки'}
                            </button>
                            {movie.url && (
                              <a
                                href={movie.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded-lg bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                              >
                                <Film className="h-3 w-3 text-orange-500" />
                                kino.kz
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Real Astana Cinema Sessions */}
                      {cinemaGroups.length > 0 ? (
                        <div className="space-y-2.5 border-t border-slate-900/10 pt-3 dark:border-white/10">
                          {cinemaGroups.map(([cinemaName, sessList]) => {
                            const sample = sessList[0];
                            return (
                              <div key={cinemaName} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-900 dark:text-slate-100">
                                      {cinemaName}
                                    </span>
                                    {sample.address && (
                                      <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        {sample.address}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMapFocus([sample.lat, sample.lng]);
                                      setShowCinemaMap(true);
                                      onOpenOnMap?.(
                                        cinemaName,
                                        sample.address || 'Кинотеатр Астаны',
                                        sample.lat,
                                        sample.lng
                                      );
                                    }}
                                    className="flex items-center gap-1 rounded-lg bg-sky-500/15 px-2 py-1 text-[10px] font-bold text-sky-700 hover:bg-sky-500 hover:text-white shrink-0 dark:text-sky-300"
                                  >
                                    <MapPin className="h-3 w-3" />
                                    На карте
                                  </button>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  {sessList.slice(0, 6).map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() =>
                                        openSeatPicker({
                                          sessionKey: `${afishaDate}:${movie.id}:${s.id}`,
                                          movie: adapted,
                                          time: `${s.time} · ${s.format}`,
                                          cinemaName,
                                          hallName: s.hall || 'Зал 1',
                                          format: s.format || '2D',
                                          adultPrice: s.adultPrice || 2400,
                                          studentPrice: s.studentPrice || 0,
                                          childPrice: s.childPrice || 0,
                                          vipPrice: s.vipPrice || 0,
                                        })
                                      }
                                      className="flex items-center gap-1.5 rounded-xl bg-white/85 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-900 shadow-xs transition-colors hover:bg-orange-500 hover:text-white dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-orange-500"
                                    >
                                      <Ticket className="h-3 w-3 shrink-0" />
                                      <span className="font-mono font-bold">{s.time}</span>
                                      <span className="text-[10px] opacity-75">{s.format}</span>
                                      {s.adultPrice > 0 && (
                                        <span className="font-mono text-[10px] opacity-80">
                                          {s.adultPrice}₸
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="border-t border-slate-900/10 pt-2.5 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                          Расписание уточняется — откройте карточку на kino.kz
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback curated Astana movies with real generated posters */
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {fallbackMovies.map((movie) => {
                  const isFav = favIds.has(movie.id);
                  return (
                    <div
                      key={movie.id}
                      className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-4 sm:p-5"
                    >
                      <div className="flex gap-4">
                        <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-white">
                          <img
                            src={movie.posterUrl}
                            alt={movie.title}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            {movie.year} · {movie.genre} · {movie.duration}
                          </div>
                          <h3 className="mt-1 truncate font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                            {movie.title}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            {movie.description}
                          </p>
                        </div>
                      </div>

                      {movie.showtimes && movie.cinemaHall && (
                        <div className="mt-4 border-t border-slate-900/10 pt-3 dark:border-white/10">
                          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-2">
                            <span>{movie.cinemaHall}</span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                              {movie.ticketPrice?.toLocaleString('ru-RU')} ₸
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {movie.showtimes.map((time) => (
                              <button
                                key={time}
                                type="button"
                                onClick={() =>
                                  openSeatPicker({
                                    sessionKey: `${afishaDate}:${movie.id}:${time}`,
                                    movie,
                                    time,
                                    cinemaName: movie.cinemaHall || 'Кинотеатр Астаны',
                                    hallName: 'Зал 1',
                                    format: '2D',
                                    adultPrice: movie.ticketPrice || 2400,
                                    studentPrice: 0,
                                    childPrice: 0,
                                    vipPrice: 0,
                                  })
                                }
                                className="flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-800 hover:bg-orange-500 hover:text-white transition-colors dark:bg-slate-800 dark:text-slate-100"
                              >
                                <Ticket className="h-3 w-3" />
                                {time}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPlayingMovie(movie)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          Смотреть онлайн
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(movie)}
                          className={`flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                            isFav
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <Bookmark className={`h-3.5 w-3.5 ${isFav ? 'fill-current' : ''}`} />
                          {isFav ? 'В избранном' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Digital QR E-Tickets Tab */}
        {tab === 'tickets' && (
          <div>
            {tickets.length === 0 ? (
              <div className="rounded-2xl bg-white/55 p-10 text-center text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                У вас пока нет купленных билетов. Выберите сеанс в Афише и оформите места в зале!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="liquid-glass-subtle flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-orange-600 dark:text-orange-400">
                        <span>{t.cinemaName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.hallName}</span>
                      </div>
                      <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100 leading-snug">
                        {t.movieTitle}
                      </h3>
                      <div className="text-xs text-slate-700 dark:text-slate-300 font-mono">
                        Сеанс: {t.time} · {t.ticketType}
                      </div>
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Места: {t.seats.join(', ')}
                      </div>
                      <div className="flex items-center gap-3 pt-1 text-xs">
                        <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                          {t.totalPrice.toLocaleString('ru-RU')} ₸
                        </span>
                        <span className="rounded bg-slate-900/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                          {t.code}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <DeterministicQrSvg code={t.code} />
                      <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400">
                        Покажите на входе
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Online Search & Favorites Tabs */}
        {(tab === 'search' || tab === 'favorites') && (
          <>
            {isSearching ? (
              <div className="py-12 text-center text-sm text-slate-600 dark:text-slate-400">
                Поиск фильмов онлайн…
              </div>
            ) : displayedFallbackOrOnline.length === 0 ? (
              <div className="rounded-2xl bg-white/50 p-10 text-center text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                В избранном пока нет фильмов. Сохраните понравившийся фильм из афиши или поиска.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {displayedFallbackOrOnline.map((movie, idx) => {
                  const isFav = favIds.has(movie.id);
                  const fallbackPoster = Object.values(LOCAL_POSTERS)[idx % 4];
                  const posterSrc =
                    movie.posterUrl && !brokenPosters[movie.id]
                      ? movie.posterUrl.startsWith('http')
                        ? `/api/cinema/poster?url=${encodeURIComponent(movie.posterUrl)}`
                        : movie.posterUrl
                      : fallbackPoster;
                  return (
                    <div
                      key={movie.id}
                      className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-4 sm:p-5"
                    >
                      <div className="flex gap-4">
                        <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-white">
                          <img
                            src={posterSrc}
                            alt={movie.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenPosters((prev) => ({ ...prev, [movie.id]: true }))
                            }
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            {movie.year} · {movie.genre} · {movie.duration}
                          </div>
                          <h3 className="mt-1 truncate font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                            {movie.title}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            {movie.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPlayingMovie(movie)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          Смотреть онлайн
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(movie)}
                          className={`flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                            isFav
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <Bookmark className={`h-3.5 w-3.5 ${isFav ? 'fill-current' : ''}`} />
                          {isFav ? 'В избранном' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Interactive Cinema Hall Seat Map Modal */}
      {seatPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5 backdrop-blur-md"
          onClick={() => setSeatPicker(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-orange-600 dark:text-orange-400">
                  <span>{seatPicker.cinemaName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{seatPicker.hallName}</span>
                  <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 font-mono">
                    {seatPicker.time}
                  </span>
                </div>
                <h3 className="mt-0.5 font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  {seatPicker.movie.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSeatPicker(null)}
                aria-label="Закрыть выбор мест"
                className="rounded-xl bg-white/75 p-2 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {confirmedPass ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-5 space-y-3 text-center">
                <div className="flex flex-col items-center gap-2">
                  <DeterministicQrSvg code={confirmedPass.code} />
                  <div className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    Билеты оформлены!
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Сохранено в «Мои билеты», Qala Кошелёк и Планы
                  </div>
                </div>
                <div className="rounded-2xl bg-white/85 p-3.5 text-left text-xs space-y-1.5 dark:bg-slate-900/80">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Код заказа</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {confirmedPass.code}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Места</span>
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                      {confirmedPass.seats.join(', ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Тариф</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {confirmedPass.ticketTypeLabel}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-900/10 pt-1.5 dark:border-white/10">
                    <span className="text-slate-500">Оплачено</span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100">
                      {confirmedPass.total.toLocaleString('ru-RU')} ₸
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSeatPicker(null);
                      setTab('tickets');
                    }}
                    className="w-full rounded-xl bg-orange-500 py-2.5 text-xs font-bold text-white hover:bg-orange-400"
                  >
                    Открыть QR-билеты
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeatPicker(null)}
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-800"
                  >
                    Готово
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Ticket Type Selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      {
                        id: 'adult',
                        label: 'Взрослый',
                        price: seatPicker.adultPrice || 2400,
                      },
                      {
                        id: 'student',
                        label: 'Студент',
                        price:
                          seatPicker.studentPrice > 0
                            ? seatPicker.studentPrice
                            : Math.round(((seatPicker.adultPrice || 2400) * 0.75) / 100) * 100,
                      },
                      {
                        id: 'child',
                        label: 'Детский',
                        price:
                          seatPicker.childPrice > 0
                            ? seatPicker.childPrice
                            : Math.round(((seatPicker.adultPrice || 2400) * 0.6) / 100) * 100,
                      },
                    ] as const
                  ).map((tt) => (
                    <button
                      key={tt.id}
                      type="button"
                      onClick={() => setTicketType(tt.id)}
                      className={`rounded-xl px-2.5 py-2 text-center text-xs transition-all border ${
                        ticketType === tt.id
                          ? 'border-orange-500 bg-orange-500 text-white shadow-xs'
                          : 'border-white/75 bg-white/70 text-slate-800 dark:border-white/10 dark:bg-slate-800/75 dark:text-slate-200'
                      }`}
                    >
                      <div className="font-bold">{tt.label}</div>
                      <div className="font-mono text-[10px] opacity-90">
                        {tt.price.toLocaleString('ru-RU')} ₸
                      </div>
                    </button>
                  ))}
                </div>

                {/* Curved Cinema Screen */}
                <div className="pt-1 text-center">
                  <div className="mx-auto h-2.5 w-4/5 rounded-t-full bg-gradient-to-r from-sky-400 via-indigo-400 to-orange-400 opacity-85 shadow-[0_-4px_16px_rgba(56,189,248,0.45)]" />
                  <div className="mt-1 font-mono text-[10px] font-bold tracking-[0.22em] text-slate-500 dark:text-slate-400 uppercase">
                    ЭКРАН · {seatPicker.format}
                  </div>
                </div>

                {/* Seat Grid (Rows A–G, Columns 1–10 with Center Aisle) */}
                {loadingSeats ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Загружаем схему зала…
                  </div>
                ) : (
                  <div className="space-y-1.5 overflow-x-auto py-1">
                    {HALL_ROWS.map((row) => {
                      const isVipRow = row === 'G';
                      return (
                        <div key={row} className="flex items-center justify-center gap-1.5 min-w-[340px]">
                          <span className="w-4 font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 text-right">
                            {row}
                          </span>
                          <div className="flex items-center gap-1">
                            {HALL_COLS.map((col) => {
                              const seatId = `${row}${col}`;
                              const isBooked = bookedSeats.includes(seatId);
                              const isSelected = selectedSeats.includes(seatId);
                              return (
                                <div key={seatId} className={col === 6 ? 'ml-3' : ''}>
                                  <button
                                    type="button"
                                    disabled={isBooked}
                                    onClick={() => {
                                      setBookingError(null);
                                      setSelectedSeats((prev) =>
                                        prev.includes(seatId)
                                          ? prev.filter((s) => s !== seatId)
                                          : prev.length >= 8
                                          ? prev
                                          : [...prev, seatId]
                                      );
                                    }}
                                    title={
                                      isBooked
                                        ? `${seatId} — занято`
                                        : isVipRow
                                        ? `${seatId} VIP — ${seatUnitPrices.vip} ₸`
                                        : `${seatId} — ${seatUnitPrices.standard} ₸`
                                    }
                                    className={`h-7 w-7 rounded-lg font-mono text-[10px] font-bold transition-all ${
                                      isBooked
                                        ? 'cursor-not-allowed bg-slate-300/70 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-600'
                                        : isSelected
                                        ? 'bg-emerald-500 text-white scale-105 shadow-md ring-2 ring-emerald-300'
                                        : isVipRow
                                        ? 'border border-amber-400/70 bg-amber-400/20 text-amber-800 hover:bg-amber-400/40 dark:text-amber-300'
                                        : 'bg-white/85 text-slate-800 hover:bg-orange-500 hover:text-white dark:bg-slate-800/85 dark:text-slate-100'
                                    }`}
                                  >
                                    {col}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <span className="w-4 font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {row}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Seat Map Legend */}
                <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded bg-white/85 border border-slate-300 dark:bg-slate-800 dark:border-white/20" />
                    Свободно
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-amber-400 bg-amber-400/30" />
                    VIP (ряд G · {seatUnitPrices.vip.toLocaleString('ru-RU')} ₸)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded bg-emerald-500" />
                    Выбрано
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded bg-slate-300 dark:bg-slate-800" />
                    Занято
                  </span>
                </div>

                {bookingError && (
                  <div className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    {bookingError}
                  </div>
                )}

                {/* Bottom Checkout Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-900/10 pt-3 dark:border-white/10">
                  <div className="text-xs">
                    <div className="text-slate-500 dark:text-slate-400">
                      {selectedSeats.length > 0
                        ? `Места (${selectedSeats.length}): ${selectedSeats.join(', ')}`
                        : 'Выберите от 1 до 8 мест на схеме зала'}
                    </div>
                    <div className="font-mono text-base font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                      Итого: {seatTotalAmount.toLocaleString('ru-RU')} ₸
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={selectedSeats.length === 0 || bookingInFlight}
                    onClick={confirmSeatBooking}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-400 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Sparkles className="h-4 w-4" />
                    {bookingInFlight
                      ? 'Оформляем…'
                      : selectedSeats.length > 0
                      ? `Оплатить · ${seatTotalAmount.toLocaleString('ru-RU')} ₸`
                      : 'Выберите места'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Liquid Glass Video Player Modal */}
      {playingMovie && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
          onClick={() => setPlayingMovie(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-black shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 text-white border-b border-white/10">
              <div>
                <div className="font-display text-sm font-bold">{playingMovie.title}</div>
                <div className="text-xs text-slate-400">
                  {playingMovie.year} · {playingMovie.genre}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlayingMovie(null)}
                className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <video
              src={playingMovie.videoUrl}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
