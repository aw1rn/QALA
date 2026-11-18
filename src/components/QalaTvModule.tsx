import Hls from 'hls.js';
import {
  BellRing,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Keyboard,
  ListVideo,
  Maximize,
  Minimize,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Star,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChannelEpg, KAZAKHSTAN_TV_CHANNELS } from '../data/astanaData';
import type { TvChannel, VideoQuality } from '../types/qala';
import { API_BASE } from '../apiBase';

const QUALITY_OPTIONS: Array<{ id: VideoQuality; label: string; shortLabel: string }> = [
  { id: 'auto', label: 'Авто (HD)', shortLabel: 'Авто' },
  { id: '720p', label: '720p HD', shortLabel: '720p' },
  { id: '1080p', label: '1080p Full HD', shortLabel: '1080p' },
];

const SLEEP_OPTIONS = [0, 15, 30, 60] as const;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface QalaTvModuleProps {
  initialChannel?: TvChannel | null;
  isVisible?: boolean;
  onOpenAdmin?: () => void;
  onNotify?: (msg: string) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onMediaChange?: (state: {
    id: string;
    title: string;
    subtitle: string;
    isPlaying: boolean;
    accentColor: string;
  }) => void;
  externalCommand?: { target: 'tv'; action: 'toggle' | 'stop'; seq: number } | null;
}

export function QalaTvModule({
  initialChannel,
  isVisible = true,
  onOpenAdmin,
  onNotify,
  onFullscreenChange,
  onMediaChange,
  externalCommand,
}: QalaTvModuleProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const osdTimerRef = useRef<number | null>(null);
  const fsControlsTimerRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<{ time: number; autoPlay: boolean } | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);
  const isPlayingRef = useRef(false);

  const [channels, setChannels] = useState<TvChannel[]>(KAZAKHSTAN_TV_CHANNELS);
  const [activeChannel, setActiveChannel] = useState<TvChannel | null>(
    initialChannel || KAZAKHSTAN_TV_CHANNELS[0]
  );
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [historyIds, setHistoryIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [quality, setQuality] = useState<VideoQuality>('auto');
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [osdMessage, setOsdMessage] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<'ready' | 'loading' | 'live' | 'error'>('ready');
  const [useProxyStream, setUseProxyStream] = useState<boolean>(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [filterMode, setFilterMode] = useState<
    'all' | 'favorites' | 'recent' | 'national' | 'regional'
  >('all');

  // Web Fullscreen API + CSS Fullscreen fallback
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const isFullscreen = isNativeFullscreen || isCssFullscreen;
  const [showFsControls, setShowFsControls] = useState(true);
  const [showFsChannels, setShowFsChannels] = useState(false);

  // Sleep Timer & EPG
  const [sleepMinutes, setSleepMinutes] = useState<number>(0);
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number>(0);
  const [showEpg, setShowEpg] = useState<boolean>(true);
  const [showFullEpg, setShowFullEpg] = useState<boolean>(false);
  const [remindedEpgKeys, setRemindedEpgKeys] = useState<Record<string, boolean>>({});
  const [isPipActive, setIsPipActive] = useState<boolean>(false);

  const fetchChannelsAndMeta = useCallback(async () => {
    try {
      const [chRes, favRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/api/tv/channels`),
        fetch(`${API_BASE}/api/tv/favorites`),
        fetch(`${API_BASE}/api/tv/history`),
      ]);
      if (chRes.ok) {
        const data = (await chRes.json()) as { channels: TvChannel[] };
        if (Array.isArray(data.channels) && data.channels.length > 0) {
          setChannels(data.channels);
          setActiveChannel((prev) => {
            if (initialChannel) return initialChannel;
            if (!prev) return data.channels[0];
            return data.channels.find((c) => c.id === prev.id) || data.channels[0];
          });
        }
      }
      if (favRes.ok) {
        const fav = (await favRes.json()) as { favoriteIds: string[] };
        setFavoriteIds(fav.favoriteIds || []);
      }
      if (histRes.ok) {
        const hist = (await histRes.json()) as { historyIds: string[] };
        setHistoryIds(hist.historyIds || []);
      }
    } catch {
      // keep fallback
    }
  }, [initialChannel]);

  useEffect(() => {
    fetchChannelsAndMeta();
  }, [fetchChannelsAndMeta]);

  useEffect(() => {
    if (initialChannel) {
      setActiveChannel(initialChannel);
      setIsPlaying(true);
    }
  }, [initialChannel]);

  const showOsd = useCallback((text: string) => {
    setOsdMessage(text);
    if (osdTimerRef.current) {
      window.clearTimeout(osdTimerRef.current);
    }
    osdTimerRef.current = window.setTimeout(() => {
      setOsdMessage(null);
    }, 1350);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLeavePip = () => setIsPipActive(false);
    v.addEventListener('leavepictureinpicture', onLeavePip);
    return () => v.removeEventListener('leavepictureinpicture', onLeavePip);
  }, []);

  useEffect(() => {
    return () => {
      if (osdTimerRef.current) {
        window.clearTimeout(osdTimerRef.current);
      }
    };
  }, []);

  // Emit state changes for FloatingMiniPlayer
  useEffect(() => {
    if (!activeChannel) return;
    if (isPlaying) {
      onMediaChange?.({
        id: activeChannel.id,
        title: activeChannel.name,
        subtitle: activeChannel.currentShow,
        isPlaying: true,
        accentColor: activeChannel.accentColor,
      });
    }
  }, [activeChannel, isPlaying, onMediaChange]);

  const lastCmdSeqRef = useRef<number>(0);

  // Handle commands from FloatingMiniPlayer
  useEffect(() => {
    if (!externalCommand || externalCommand.target !== 'tv') return;
    if (externalCommand.seq === lastCmdSeqRef.current) return;
    lastCmdSeqRef.current = externalCommand.seq;
    const v = videoRef.current;
    if (!v) return;
    if (externalCommand.action === 'stop') {
      v.pause();
      v.currentTime = 0;
      setIsPlaying(false);
    } else if (externalCommand.action === 'toggle') {
      if (v.paused) {
        v.play().catch(() => {});
        setIsPlaying(true);
        if (activeChannel) {
          onMediaChange?.({
            id: activeChannel.id,
            title: activeChannel.name,
            subtitle: activeChannel.currentShow,
            isPlaying: true,
            accentColor: activeChannel.accentColor,
          });
        }
      } else {
        v.pause();
        setIsPlaying(false);
        if (activeChannel) {
          onMediaChange?.({
            id: activeChannel.id,
            title: activeChannel.name,
            subtitle: activeChannel.currentShow,
            isPlaying: false,
            accentColor: activeChannel.accentColor,
          });
        }
      }
    }
  }, [activeChannel, externalCommand, onMediaChange]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSleepSecondsLeft((prev) => {
        if (prev <= 1) {
          videoRef.current?.pause();
          setIsPlaying(false);
          setSleepMinutes(0);
          showOsd('Таймер сна: эфир остановлен');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepSecondsLeft, showOsd]);

  const handleSetSleepTimer = (mins: number) => {
    setSleepMinutes(mins);
    setSleepSecondsLeft(mins * 60);
    showOsd(mins === 0 ? 'Таймер сна выключен' : `Таймер сна: ${mins} мин`);
  };

  const toggleFavorite = async (ch: TvChannel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const exists = favoriteIds.includes(ch.id);
    if (exists) {
      setFavoriteIds((prev) => prev.filter((id) => id !== ch.id));
      await fetch(`${API_BASE}/api/tv/favorites/${encodeURIComponent(ch.id)}`, { method: 'DELETE' });
      showOsd(`${ch.name} убран из избранного`);
    } else {
      setFavoriteIds((prev) => [ch.id, ...prev]);
      await fetch(`${API_BASE}/api/tv/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      });
      showOsd(`${ch.name} добавлен в избранное`);
    }
  };

  const visibleChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = channels;
    if (filterMode === 'favorites') {
      list = channels.filter((ch) => favoriteIds.includes(ch.id));
    } else if (filterMode === 'recent') {
      list = historyIds
        .map((id) => channels.find((c) => c.id === id))
        .filter((c): c is TvChannel => Boolean(c));
    } else if (filterMode === 'national') {
      list = channels.filter((ch) => !ch.isRegional);
    } else if (filterMode === 'regional') {
      list = channels.filter((ch) => Boolean(ch.isRegional));
    }

    if (!q) return list;
    return list.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.category.toLowerCase().includes(q) ||
        ch.currentShow.toLowerCase().includes(q)
    );
  }, [channels, favoriteIds, filterMode, historyIds, searchQuery]);

  const resolvedStreamUrl = activeChannel
    ? activeChannel.qualityStreams?.[quality] || activeChannel.streamUrl
    : '';

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    const syncNativeFs = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const fsEl = document.fullscreenElement || doc.webkitFullscreenElement || null;
      setIsNativeFullscreen(Boolean(fsEl));
      if (fsEl) {
        setShowFsControls(true);
      } else {
        setShowFsChannels(false);
      }
    };
    document.addEventListener('fullscreenchange', syncNativeFs);
    document.addEventListener('webkitfullscreenchange', syncNativeFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncNativeFs);
      document.removeEventListener('webkitfullscreenchange', syncNativeFs);
    };
  }, []);

  const bumpFsControls = useCallback(() => {
    setShowFsControls(true);
    if (fsControlsTimerRef.current) {
      window.clearTimeout(fsControlsTimerRef.current);
    }
    if (isFullscreen) {
      fsControlsTimerRef.current = window.setTimeout(() => {
        if (isPlayingRef.current) {
          setShowFsControls(false);
        }
      }, 3600);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      setShowFsControls(true);
      setShowFsChannels(false);
      if (fsControlsTimerRef.current) window.clearTimeout(fsControlsTimerRef.current);
      return;
    }
    bumpFsControls();
    return () => {
      if (fsControlsTimerRef.current) window.clearTimeout(fsControlsTimerRef.current);
    };
  }, [isFullscreen, bumpFsControls]);

  const tryPlayVideo = useCallback(
    async (v: HTMLVideoElement | null) => {
      if (!v) return;
      try {
        await v.play();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          v.muted = true;
          setIsMuted(true);
          showOsd('Звук приглушён браузером — нажмите на динамик');
          v.play().catch(() => {});
        }
      }
    },
    [showOsd]
  );

  // Attach HLS.js for .m3u8 streams with automatic CORS/network proxy fallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedStreamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls =
      resolvedStreamUrl.toLowerCase().includes('.m3u8') ||
      resolvedStreamUrl.includes(`${API_BASE}/api/tv/proxy`);

    if (!isHls) {
      video.src = resolvedStreamUrl;
      setStreamStatus('live');
      if (isPlayingRef.current) {
        void tryPlayVideo(video);
      }
      return;
    }

    const forceProxy =
      useProxyStream ||
      (window.location.protocol === 'https:' && resolvedStreamUrl.startsWith('http://'));
    const initialUrl =
      forceProxy && !resolvedStreamUrl.startsWith(`${API_BASE}/api/tv/proxy`)
        ? `${API_BASE}/api/tv/proxy?url=${encodeURIComponent(resolvedStreamUrl)}`
        : resolvedStreamUrl;

    if (Hls.isSupported()) {
      setStreamStatus('loading');
      let triedProxy = forceProxy;
      let mediaRecovered = false;
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        fragLoadingTimeOut: 15000,
        manifestLoadingTimeOut: 12000,
      });
      hlsRef.current = hls;

      const applyHlsQuality = (targetQuality: VideoQuality) => {
        if (!hls.levels || hls.levels.length === 0) return;
        if (targetQuality === 'auto') {
          hls.currentLevel = -1;
          return;
        }
        const targetHeight = targetQuality === '720p' ? 720 : 1080;
        let bestIdx = 0;
        let bestDiff = Infinity;
        hls.levels.forEach((lvl, idx) => {
          const diff = Math.abs((lvl.height || 0) - targetHeight);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = idx;
          }
        });
        hls.currentLevel = bestIdx;
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamStatus('live');
        applyHlsQuality(quality);
        if (isPlayingRef.current) {
          void tryPlayVideo(video);
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setStreamStatus('live');
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (!triedProxy && !resolvedStreamUrl.startsWith(`${API_BASE}/api/tv/proxy`)) {
          triedProxy = true;
          hls.loadSource(`${API_BASE}/api/tv/proxy?url=${encodeURIComponent(resolvedStreamUrl)}`);
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
          mediaRecovered = true;
          hls.recoverMediaError();
          return;
        }
        setStreamStatus('error');
      });

      hls.loadSource(initialUrl);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
      };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = initialUrl;
      setStreamStatus('live');
      if (isPlayingRef.current) {
        void tryPlayVideo(video);
      }
    }
  }, [resolvedStreamUrl, useProxyStream, reloadNonce, tryPlayVideo]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || !hls.levels || hls.levels.length === 0) return;
    if (quality === 'auto') {
      hls.currentLevel = -1;
      return;
    }
    const targetHeight = quality === '720p' ? 720 : 1080;
    let bestIdx = 0;
    let bestDiff = Infinity;
    hls.levels.forEach((lvl, idx) => {
      const diff = Math.abs((lvl.height || 0) - targetHeight);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    hls.currentLevel = bestIdx;
  }, [quality]);

  const handleSelectChannel = useCallback(
    (ch: TvChannel) => {
      pendingSeekRef.current = null;
      setActiveChannel(ch);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(true);
      setQualityMenuOpen(false);
      setStreamStatus('loading');
      showOsd(`${ch.name} · ${quality === 'auto' ? 'Авто' : quality}`);

      setHistoryIds((prev) => [ch.id, ...prev.filter((x) => x !== ch.id)].slice(0, 20));
      fetch(`${API_BASE}/api/tv/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      }).catch(() => {});

      onMediaChange?.({
        id: ch.id,
        title: ch.name,
        subtitle: ch.currentShow,
        isPlaying: true,
        accentColor: ch.accentColor,
      });

      window.setTimeout(() => {
        void tryPlayVideo(videoRef.current);
      }, 90);
    },
    [onMediaChange, quality, showOsd, tryPlayVideo]
  );

  const stepChannel = useCallback(
    (delta: number) => {
      if (channels.length === 0) return;
      const curIdx = activeChannel ? channels.findIndex((c) => c.id === activeChannel.id) : 0;
      const nextIdx = (curIdx + delta + channels.length) % channels.length;
      handleSelectChannel(channels[nextIdx]);
    },
    [activeChannel, channels, handleSelectChannel]
  );

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    setIsPlaying(false);
    showOsd('Остановлено');
    if (activeChannel) {
      onMediaChange?.({
        id: activeChannel.id,
        title: activeChannel.name,
        subtitle: activeChannel.currentShow,
        isPlaying: false,
        accentColor: activeChannel.accentColor,
      });
    }
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
      showOsd('Воспроизведение');
      if (activeChannel) {
        onMediaChange?.({
          id: activeChannel.id,
          title: activeChannel.name,
          subtitle: activeChannel.currentShow,
          isPlaying: true,
          accentColor: activeChannel.accentColor,
        });
      }
    } else {
      v.pause();
      setIsPlaying(false);
      showOsd('Пауза');
      if (activeChannel) {
        onMediaChange?.({
          id: activeChannel.id,
          title: activeChannel.name,
          subtitle: activeChannel.currentShow,
          isPlaying: false,
          accentColor: activeChannel.accentColor,
        });
      }
    }
  }, [activeChannel, onMediaChange, showOsd]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      const maxDuration =
        Number.isFinite(v.duration) && v.duration > 0 ? v.duration : v.currentTime + 600;
      const nextTime = Math.max(0, Math.min(maxDuration, v.currentTime + deltaSeconds));
      v.currentTime = nextTime;
      setCurrentTime(nextTime);
      showOsd(deltaSeconds < 0 ? `${deltaSeconds} сек` : `+${deltaSeconds} сек`);
    },
    [showOsd]
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !v.muted;
    v.muted = nextMuted;
    setIsMuted(nextMuted);
    showOsd(nextMuted ? 'Звук выключен' : 'Звук включён');
  }, [showOsd]);

  const toggleFullscreen = useCallback(async () => {
    const el = playerBoxRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (!el) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const nativeFsEl = document.fullscreenElement || doc.webkitFullscreenElement;

    if (nativeFsEl || isCssFullscreen) {
      if (nativeFsEl) {
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (doc.webkitExitFullscreen) {
            await doc.webkitExitFullscreen();
          }
        } catch {
          // ignore
        }
      }
      setIsCssFullscreen(false);
      setIsNativeFullscreen(false);
      setShowFsChannels(false);
      return;
    }

    setShowFsControls(true);
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        setIsNativeFullscreen(true);
        return;
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        setIsNativeFullscreen(true);
        return;
      }
    } catch {
      // Fallback to CSS full-viewport mode when browser/iframe blocks native Fullscreen API
    }
    setIsCssFullscreen(true);
  }, [isCssFullscreen]);

  const togglePictureInPicture = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
        showOsd('Обычный режим');
      } else if ('requestPictureInPicture' in v) {
        await v.requestPictureInPicture();
        setIsPipActive(true);
        showOsd('Картинка в картинке (PiP)');
      } else {
        showOsd('PiP не поддерживается браузером');
      }
    } catch {
      showOsd('Сначала запустите воспроизведение');
    }
  }, [showOsd]);

  const handleSelectQuality = (nextQuality: VideoQuality) => {
    setQualityMenuOpen(false);
    if (nextQuality === quality) return;

    const v = videoRef.current;
    const currentUrl = activeChannel
      ? activeChannel.qualityStreams?.[quality] || activeChannel.streamUrl
      : '';
    const nextUrl = activeChannel
      ? activeChannel.qualityStreams?.[nextQuality] || activeChannel.streamUrl
      : '';

    if (v && nextUrl && nextUrl !== currentUrl) {
      pendingSeekRef.current = {
        time: v.currentTime || 0,
        autoPlay: !v.paused,
      };
    }

    setQuality(nextQuality);
    const label = QUALITY_OPTIONS.find((q) => q.id === nextQuality)?.shortLabel ?? nextQuality;
    showOsd(`Качество: ${label}`);
  };

  // Double-tap left/right video edge on touch devices
  const handleVideoAreaTap = (e: React.MouseEvent<HTMLVideoElement>) => {
    bumpFsControls();
    const rect = e.currentTarget.getBoundingClientRect();
    const side: 'left' | 'right' = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current.time < 280 && lastTapRef.current.side === side) {
      lastTapRef.current = null;
      seekBy(side === 'left' ? -10 : 10);
      return;
    }
    lastTapRef.current = { time: now, side };
    togglePlay();
  };

  // Global keyboard shortcuts only when TV tab is visible
  useEffect(() => {
    if (!isVisible && !isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        ((target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTextInput) return;

      if (e.key === 'Escape' && isCssFullscreen && !document.fullscreenElement) {
        e.preventDefault();
        setIsCssFullscreen(false);
        setShowFsChannels(false);
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(10);
      } else if (e.key === 'ArrowUp' && isFullscreen) {
        e.preventDefault();
        stepChannel(-1);
      } else if (e.key === 'ArrowDown' && isFullscreen) {
        e.preventDefault();
        stepChannel(1);
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
        e.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isCssFullscreen,
    isFullscreen,
    isVisible,
    seekBy,
    stepChannel,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  ]);

  const activeQualityLabel =
    QUALITY_OPTIONS.find((q) => q.id === quality)?.shortLabel ?? quality;
  const epgList = activeChannel ? getChannelEpg(activeChannel) : [];

  return (
    <div className="space-y-6">
      {/* Header & Player Controls */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums">
              <span>Прямой эфир казахстанских каналов</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{channels.length} каналов</span>
              {sleepSecondsLeft > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">
                    Сон {formatTime(sleepSecondsLeft)}
                  </span>
                </>
              )}
            </div>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Qala <span className="text-rose-600">TV</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quality quick switcher */}
            <div
              className="flex items-center gap-1 rounded-xl border border-white/75 bg-white/55 p-1 dark:border-white/15 dark:bg-slate-900/70"
              role="group"
              aria-label="Качество видео"
            >
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectQuality(opt.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    quality === opt.id
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-rose-500'
                      : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              ))}
            </div>

            {/* Sleep Timer quick selector */}
            <div className="flex items-center gap-1 rounded-xl border border-white/75 bg-white/55 p-1 dark:border-white/15 dark:bg-slate-900/70">
              <Moon className="ml-1.5 h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              {SLEEP_OPTIONS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleSetSleepTimer(mins)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    sleepMinutes === mins
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {mins === 0 ? 'Выкл' : `${mins}м`}
                </button>
              ))}
            </div>

            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-xs hover:bg-white whitespace-nowrap dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Админка · M3U
              </button>
            )}

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-xs hover:bg-white whitespace-nowrap dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              title="Развернуть видеоплеер на весь экран (F)"
            >
              <Maximize className="h-3.5 w-3.5 text-rose-600" />
              Во весь экран
            </button>

            {isPlaying ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Стоп
              </button>
            ) : (
              <button
                type="button"
                onClick={() => activeChannel && handleSelectChannel(activeChannel)}
                className="flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-600 whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Смотреть ТВ
              </button>
            )}
          </div>
        </div>

        {/* Video Theater Viewport (True Web Fullscreen API + CSS Fullscreen Fallback) */}
        {activeChannel && (
          <div
            ref={playerBoxRef}
            tabIndex={0}
            onMouseMove={bumpFsControls}
            onTouchStart={bumpFsControls}
            className={
              isFullscreen
                ? 'fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-black focus:outline-none'
                : 'relative mt-5 overflow-hidden rounded-2xl border border-white/60 bg-slate-950 shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-500/60 dark:border-white/15'
            }
          >
            <div
              className={
                isFullscreen
                  ? 'relative flex-1 h-full w-full'
                  : 'relative aspect-video max-h-[460px] w-full'
              }
            >
              <video
                ref={videoRef}
                playsInline
                muted={isMuted}
                onClick={handleVideoAreaTap}
                onDoubleClick={() => void toggleFullscreen()}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setDuration(Number.isFinite(v.duration) ? v.duration : 0);
                  if (pendingSeekRef.current) {
                    const { time, autoPlay } = pendingSeekRef.current;
                    pendingSeekRef.current = null;
                    v.currentTime = time;
                    if (autoPlay) {
                      void tryPlayVideo(v);
                    }
                  }
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onDurationChange={(e) =>
                  setDuration(
                    Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0
                  )
                }
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="h-full w-full cursor-pointer object-contain bg-black"
              />

              {/* Channel OSD Overlay */}
              <div
                className={`absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/45 to-transparent px-4 py-3.5 sm:px-6 sm:py-4 text-white transition-opacity duration-200 ${
                  isFullscreen && !showFsControls ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: activeChannel.accentColor }}
                  >
                    {activeChannel.logoUrl ? (
                      <img
                        src={activeChannel.logoUrl}
                        alt={activeChannel.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full bg-white object-contain p-0.5"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      'TV'
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm sm:text-base font-bold">
                      {activeChannel.name}
                    </div>
                    <div className="truncate text-xs text-slate-300">{activeChannel.currentShow}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-xs text-slate-200 shrink-0">
                  {streamStatus === 'live' && (
                    <span className="rounded-md bg-rose-600/95 px-2 py-0.5 text-[10px] font-bold uppercase">
                      HLS Live
                    </span>
                  )}
                  {streamStatus === 'loading' && (
                    <span className="rounded-md bg-sky-600/90 px-2 py-0.5 text-[10px] font-bold">
                      Загрузка…
                    </span>
                  )}
                  {streamStatus === 'error' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUseProxyStream((p) => !p);
                        setReloadNonce((n) => n + 1);
                      }}
                      className="flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-slate-950 hover:bg-amber-400"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Повторить ({useProxyStream ? 'напрямую' : 'прокси'})
                    </button>
                  )}
                  <span className="rounded-md bg-white/15 px-2 py-0.5 backdrop-blur-md">
                    {activeQualityLabel}
                  </span>
                  {isFullscreen && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowFsChannels((v) => !v)}
                        className="flex h-8 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-xs font-semibold text-white hover:bg-white/25"
                      >
                        <ListVideo className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Каналы</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFullscreen()}
                        className="flex h-8 items-center gap-1 rounded-lg bg-rose-600 px-2.5 text-xs font-semibold text-white hover:bg-rose-700"
                        title="Выйти из полноэкранного режима"
                      >
                        <Minimize className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Выход</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Fullscreen Center Play CTA when stream is paused */}
              {!isPlaying && streamStatus !== 'loading' && (
                <button
                  type="button"
                  onClick={() =>
                    streamStatus === 'ready' && activeChannel
                      ? handleSelectChannel(activeChannel)
                      : togglePlay()
                  }
                  className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-rose-600/90 text-white shadow-2xl backdrop-blur-md transition-transform hover:scale-105"
                  aria-label="Включить эфир"
                >
                  <Play className="h-7 w-7 fill-current ml-0.5" />
                </button>
              )}

              {/* Fullscreen Overlay Channel Drawer */}
              {isFullscreen && showFsChannels && (
                <div
                  className="absolute right-4 top-16 bottom-24 z-30 w-72 overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur-xl flex flex-col gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-300">
                      Каналы Qala TV ({channels.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFsChannels(false)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {channels.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          handleSelectChannel(ch);
                          setShowFsChannels(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                          activeChannel.id === ch.id
                            ? 'bg-rose-600 text-white font-bold'
                            : 'bg-white/5 text-slate-200 hover:bg-white/15'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ch.accentColor }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{ch.name}</div>
                          <div className="truncate text-[10px] opacity-75">{ch.currentShow}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action / Hotkey OSD Notification */}
              {osdMessage && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 bg-slate-900/85 px-4 py-2 font-display text-sm font-bold text-white shadow-xl backdrop-blur-md">
                  {osdMessage}
                </div>
              )}

              {/* Bottom Player Controls */}
              <div
                className={`absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-4 py-3 sm:px-6 sm:py-4 text-white transition-opacity duration-200 ${
                  isFullscreen && !showFsControls ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-slate-200 tabular-nums">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration > 0 ? duration : 100}
                    step={1}
                    value={duration > 0 ? Math.min(currentTime, duration) : 0}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (videoRef.current) {
                        videoRef.current.currentTime = next;
                      }
                      setCurrentTime(next);
                    }}
                    aria-label="Перемотка видео"
                    className="h-1.5 flex-1 cursor-pointer accent-rose-500"
                  />
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    {duration > 0 ? formatTime(duration) : 'LIVE'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => stepChannel(-1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-md hover:bg-white/25"
                      aria-label="Предыдущий канал"
                      title="Предыдущий канал"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-500"
                      aria-label={isPlaying ? 'Пауза (Пробел)' : 'Воспроизвести (Пробел)'}
                      title="Пауза / Воспроизведение (Пробел)"
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => stepChannel(1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-md hover:bg-white/25"
                      aria-label="Следующий канал"
                      title="Следующий канал"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => seekBy(-10)}
                      className="hidden sm:flex h-9 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-[11px] font-semibold backdrop-blur-md hover:bg-white/25"
                      aria-label="Перемотать назад на 10 секунд"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>10</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => seekBy(10)}
                      className="hidden sm:flex h-9 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-[11px] font-semibold backdrop-blur-md hover:bg-white/25"
                      aria-label="Перемотать вперёд на 10 секунд"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>10</span>
                    </button>
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-md hover:bg-white/25"
                      aria-label={isMuted ? 'Включить звук (M)' : 'Выключить звук (M)'}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(activeChannel, e)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg backdrop-blur-md transition-colors ${
                        favoriteIds.includes(activeChannel.id)
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-white/15 text-white hover:bg-white/25'
                      }`}
                      aria-label="Добавить канал в избранное"
                      title="Избранный канал"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          favoriteIds.includes(activeChannel.id) ? 'fill-current' : ''
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 relative">
                    <button
                      type="button"
                      onClick={() => {
                        setUseProxyStream((p) => !p);
                        setReloadNonce((n) => n + 1);
                        showOsd(useProxyStream ? 'Прямой поток' : 'Серверный прокси HLS');
                      }}
                      className={`hidden sm:flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold backdrop-blur-md ${
                        useProxyStream ? 'bg-emerald-600/85 text-white' : 'bg-white/15 hover:bg-white/25'
                      }`}
                      title="Переключить режим доставки HLS (прокси/прямой)"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>{useProxyStream ? 'Прокси' : 'Прямой'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={togglePictureInPicture}
                      className={`flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold backdrop-blur-md ${
                        isPipActive ? 'bg-rose-500 text-white' : 'bg-white/15 hover:bg-white/25'
                      }`}
                      aria-label="Картинка в картинке (PiP)"
                      title="Картинка в картинке (PiP)"
                    >
                      <PictureInPicture2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">PiP</span>
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setQualityMenuOpen((prev) => !prev)}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 text-xs font-semibold backdrop-blur-md hover:bg-white/25"
                        aria-label="Выбор качества видео"
                        aria-expanded={qualityMenuOpen}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        <span>{activeQualityLabel}</span>
                      </button>

                      {qualityMenuOpen && (
                        <div className="absolute bottom-11 right-0 z-20 w-40 rounded-xl border border-white/25 bg-slate-900/95 p-1.5 shadow-xl backdrop-blur-xl">
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Качество видео
                          </div>
                          {QUALITY_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleSelectQuality(opt.id)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                quality === opt.id
                                  ? 'bg-rose-500 text-white'
                                  : 'text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {quality === opt.id && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void toggleFullscreen()}
                      className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold backdrop-blur-md ${
                        isFullscreen ? 'bg-rose-600 text-white' : 'bg-white/15 hover:bg-white/25'
                      }`}
                      aria-label={isFullscreen ? 'Выйти из полного экрана (Esc)' : 'Полный экран (F)'}
                      title="Полный экран (F)"
                    >
                      {isFullscreen ? (
                        <Minimize className="h-4 w-4" />
                      ) : (
                        <Maximize className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Touch Control Strip (One-Handed Mobile Panel + Fullscreen + PiP) */}
        <div className="mt-3 grid grid-cols-5 gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => stepChannel(-1)}
            className="liquid-glass-subtle flex min-h-[44px] items-center justify-center rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
            aria-label="Предыдущий канал"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-rose-500 text-xs font-bold text-white"
            aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => stepChannel(1)}
            className="liquid-glass-subtle flex min-h-[44px] items-center justify-center rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
            aria-label="Следующий канал"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={togglePictureInPicture}
            className="liquid-glass-subtle flex min-h-[44px] items-center justify-center rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
          >
            PiP
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-slate-900 text-xs font-bold text-white dark:bg-rose-500"
            aria-label="На весь экран"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>

        {/* Collapsible EPG Program Guide + Full Schedule + Reminder */}
        {activeChannel && (
          <div className="mt-4 rounded-2xl bg-white/55 p-3.5 dark:bg-slate-900/55">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowEpg((v) => !v)}
                className="flex flex-1 items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100"
              >
                <span className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-rose-500" />
                  Телепрограмма передач · {activeChannel.name}
                </span>
                {showEpg ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showEpg && (
                <button
                  type="button"
                  onClick={() => setShowFullEpg((v) => !v)}
                  className="rounded-lg bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
                >
                  {showFullEpg ? 'Кратко' : 'Весь день'}
                </button>
              )}
            </div>

            {showEpg && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ...epgList,
                  ...(showFullEpg
                    ? [
                        { time: '20:30', title: `Вечерний эфир · ${activeChannel.name}`, genre: activeChannel.category, isNow: false },
                        { time: '21:15', title: 'Итоги дня и аналитика Астаны', genre: 'Новости', isNow: false },
                        { time: '22:00', title: 'Документальный цикл · Казахстан', genre: 'Познавательное', isNow: false },
                        { time: '23:10', title: 'Ночной кинопоказ Qala TV', genre: 'Кино', isNow: false },
                      ]
                    : []),
                ].map((prog, idx) => {
                  const rKey = `${activeChannel.id}:${prog.time}:${prog.title}`;
                  const reminded = Boolean(remindedEpgKeys[rKey]);
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl p-2.5 text-xs flex flex-col justify-between gap-2 ${
                        prog.isNow
                          ? 'bg-rose-500/15 ring-1 ring-rose-500/50'
                          : 'bg-white/75 dark:bg-slate-800/65'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between font-mono text-[11px] font-bold">
                          <span className={prog.isNow ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}>
                            {prog.time}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {prog.isNow ? 'Сейчас в эфире' : prog.genre}
                          </span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                          {prog.title}
                        </div>
                      </div>
                      {!prog.isNow && (
                        <button
                          type="button"
                          disabled={reminded}
                          onClick={async () => {
                            const res = await fetch(`${API_BASE}/api/reminders`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                title: `ТВ ${activeChannel.name}: ${prog.title}`,
                                remindAt: `Сегодня · ${prog.time}`,
                                category: 'Личное',
                              }),
                            });
                            if (res.ok) {
                              setRemindedEpgKeys((prev) => ({ ...prev, [rKey]: true }));
                              showOsd(`Напоминание на ${prog.time}`);
                              onNotify?.(`Напоминание добавлено: ${prog.title} (${prog.time})`);
                            }
                          }}
                          className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                            reminded
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-white/80 text-slate-700 hover:bg-rose-500 hover:text-white dark:bg-slate-900/75 dark:text-slate-200'
                          }`}
                        >
                          <BellRing className="h-3 w-3" />
                          {reminded ? 'Напомнено' : 'Напомнить'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Keyboard Shortcuts Info */}
        <div className="mt-3 hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
            <Keyboard className="h-3.5 w-3.5" />
            Горячие клавиши:
          </span>
          <span>
            <kbd className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-200">
              Пробел
            </kbd>{' '}
            пауза / эфир
          </span>
          <span>
            <kbd className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-200">
              ←
            </kbd>{' '}
            /{' '}
            <kbd className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-200">
              →
            </kbd>{' '}
            перемотка ±10 сек
          </span>
          <span>
            <kbd className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-200">
              M
            </kbd>{' '}
            звук
          </span>
          <span>
            <kbd className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-200">
              F
            </kbd>{' '}
            полный экран
          </span>
        </div>
      </div>

      {/* Channel Grid with Search, Favorites & Recents */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Каналы ({visibleChannels.length})
            </h3>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск канала или передачи…"
              className="w-full rounded-xl border border-white/80 bg-white/75 py-2 pr-3 pl-9 text-xs font-medium text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: `Все (${channels.length})` },
              { id: 'favorites', label: `Избранные (${favoriteIds.length})` },
              { id: 'recent', label: `Недавние (${historyIds.length})` },
              { id: 'national', label: 'Республиканские' },
              { id: 'regional', label: 'Региональные' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filterMode === tab.id
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-rose-500'
                  : 'bg-white/55 text-slate-700 hover:bg-white/80 dark:bg-slate-800/70 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {visibleChannels.length === 0 ? (
          <div className="rounded-2xl bg-white/55 p-6 text-center text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
            В этом разделе пока нет каналов. Отметьте канал звёздочкой ★ или выберите другой фильтр.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleChannels.map((ch) => {
              const selected = activeChannel?.id === ch.id;
              const isFav = favoriteIds.includes(ch.id);
              return (
                <div
                  key={ch.id}
                  onClick={() => handleSelectChannel(ch)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectChannel(ch);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3.5 text-left transition-all ${
                    selected
                      ? 'bg-white/85 ring-2 ring-rose-500 shadow-md dark:bg-slate-800/90'
                      : 'liquid-glass-subtle'
                  }`}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: ch.accentColor }}
                  >
                    {ch.logoUrl ? (
                      <img
                        src={ch.logoUrl}
                        alt={ch.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full bg-white/95 object-contain p-1"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <Radio className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {ch.name}
                    </div>
                    <div className="truncate text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {ch.currentShow}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => toggleFavorite(ch, e)}
                    aria-label={isFav ? 'Убрать из избранного' : 'В избранное'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      isFav
                        ? 'bg-amber-400/25 text-amber-600 dark:text-amber-400'
                        : 'text-slate-400 hover:bg-white/70 hover:text-amber-500 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
