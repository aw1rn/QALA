import {
  Bookmark,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Movie } from '../types/movie';

interface TVPlayerOverlayProps {
  movie: Movie;
  initialTime?: number;
  isFavorite: boolean;
  onToggleFavorite: (movie: Movie) => void;
  onProgressSave: (movie: Movie, progressSeconds: number, durationSeconds: number) => void;
  onClose: () => void;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function TVPlayerOverlay({
  movie,
  initialTime = 0,
  isFavorite,
  onToggleFavorite,
  onProgressSave,
  onClose,
}: TVPlayerOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const resumedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain');
  const [showOsd, setShowOsd] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  const scheduleHideOsd = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    setShowOsd(true);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowOsd(false);
      }
    }, 3200);
  }, []);

  const persistProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime > 1) {
      onProgressSave(movie, video.currentTime, video.duration || 0);
    }
  }, [movie, onProgressSave]);

  const handleClose = useCallback(() => {
    persistProgress();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }, [onClose, persistProgress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
      persistProgress();
    }
    scheduleHideOsd();
  }, [persistProgress, scheduleHideOsd]);

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      video.currentTime = target;
      setCurrentTime(target);
      scheduleHideOsd();
    },
    [scheduleHideOsd]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMuted;
    video.muted = next;
    setIsMuted(next);
    scheduleHideOsd();
  }, [isMuted, scheduleHideOsd]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    scheduleHideOsd();
  }, [scheduleHideOsd]);

  const togglePiP = useCallback(() => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      video.requestPictureInPicture?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && video.currentTime > 2) {
        onProgressSave(movie, video.currentTime, video.duration || 0);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [movie, onProgressSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.min(1, volume + 0.1);
            videoRef.current.volume = nextVol;
            videoRef.current.muted = false;
            setVolume(nextVol);
            setIsMuted(false);
            scheduleHideOsd();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.max(0, volume - 0.1);
            videoRef.current.volume = nextVol;
            setVolume(nextVol);
            scheduleHideOsd();
          }
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, scheduleHideOsd, seekBy, toggleFullscreen, toggleMute, togglePlay, volume]);

  useEffect(() => {
    scheduleHideOsd();
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [scheduleHideOsd]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleHideOsd}
      onClick={scheduleHideOsd}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр: ${movie.title}`}
    >
      {/* Video Canvas */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={movie.videoUrl}
          autoPlay
          playsInline
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (!video) return;
            setDuration(video.duration || 0);
            video.volume = volume;
            video.playbackRate = playbackRate;
            if (!resumedRef.current && initialTime > 5 && initialTime < (video.duration || 0) - 10) {
              video.currentTime = initialTime;
              setCurrentTime(initialTime);
            }
            resumedRef.current = true;
            setIsLoading(false);
          }}
          onCanPlay={() => setIsLoading(false)}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
            scheduleHideOsd();
          }}
          onPause={() => {
            setIsPlaying(false);
            setShowOsd(true);
          }}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (!video) return;
            setCurrentTime(video.currentTime);
            if (video.buffered.length > 0) {
              setBufferedEnd(video.buffered.end(video.buffered.length - 1));
            }
          }}
          onError={() => {
            setIsLoading(false);
            setStreamError(
              'Не удалось загрузить видеопоток. Возможно, удаленный сервер ограничил воспроизведение или ссылка устарела.'
            );
          }}
          className={`h-full w-full ${objectFit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />

        {/* Loading Indicator */}
        {isLoading && !streamError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#E5A93C]" />
              <span className="text-sm font-medium text-slate-200">Загрузка потока…</span>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {streamError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#090A0F]/95 p-6">
            <div className="max-w-md rounded-xl border border-white/10 bg-[#11131A] p-6 text-center">
              <h3 className="font-display text-lg font-semibold text-white">
                Ошибка воспроизведения
              </h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">{streamError}</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStreamError(null);
                    setIsLoading(true);
                    videoRef.current?.load();
                  }}
                  className="rounded-lg bg-[#E5A93C] px-4 py-2 text-sm font-semibold text-[#090A0F] hover:bg-[#F0B84D]"
                >
                  Повторить
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
                >
                  Вернуться
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top OSD Bar */}
        <div
          className={`absolute inset-x-0 top-0 flex items-center justify-between gap-6 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-8 py-6 transition-opacity duration-300 ${
            showOsd ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold tracking-tight text-white">
              {movie.title}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-300 tabular-nums">
              {movie.year > 0 && <span>{movie.year}</span>}
              {movie.year > 0 && <span aria-hidden="true">·</span>}
              <span>{movie.genre}</span>
              {movie.director && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{movie.director}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(movie)}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                isFavorite
                  ? 'border-[#E5A93C]/60 bg-[#E5A93C]/20 text-[#E5A93C]'
                  : 'border-white/20 bg-black/50 text-white hover:bg-white/10'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
              {isFavorite ? 'В избранном' : 'В избранное'}
            </button>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Закрыть плеер"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/50 text-white transition-colors hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Bottom OSD Controls */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-8 pt-12 pb-6 transition-opacity duration-300 ${
            showOsd ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {/* Scrubber Bar */}
          <div className="group/seek relative mb-4 flex h-5 cursor-pointer items-center">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20 transition-all group-hover/seek:h-2">
              <div
                className="absolute inset-y-0 left-0 bg-white/30"
                style={{ width: `${Math.min(100, bufferedPct)}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-[#E5A93C]"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              aria-label="Позиция воспроизведения"
              onChange={(e) => {
                const next = Number(e.target.value);
                if (videoRef.current) {
                  videoRef.current.currentTime = next;
                }
                setCurrentTime(next);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left playback controls */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E5A93C] text-[#090A0F] transition-colors hover:bg-[#F0B84D]"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekBy(-10)}
                aria-label="Назад на 10 секунд"
                title="Назад 10 с"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/15"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => seekBy(10)}
                aria-label="Вперед на 10 секунд"
                title="Вперед 10 с"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/15"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 pl-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-5 w-5 text-slate-400" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  aria-label="Громкость"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setVolume(next);
                    setIsMuted(next === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = next;
                      videoRef.current.muted = next === 0;
                    }
                  }}
                  className="h-1.5 w-24 cursor-pointer accent-[#E5A93C]"
                />
              </div>

              {/* Timecode */}
              <div className="ml-2 font-mono text-xs text-slate-200 tabular-nums whitespace-nowrap">
                <span>{formatTimecode(currentTime)}</span>
                <span className="mx-1.5 text-slate-500">/</span>
                <span className="text-slate-400">{formatTimecode(duration)}</span>
              </div>
            </div>

            {/* Right display & speed controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
                {[1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setPlaybackRate(rate);
                      if (videoRef.current) {
                        videoRef.current.playbackRate = rate;
                      }
                    }}
                    className={`rounded-md px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                      playbackRate === rate
                        ? 'bg-[#E5A93C] font-semibold text-[#090A0F]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setObjectFit((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/15 whitespace-nowrap"
              >
                {objectFit === 'contain' ? 'По экрану' : 'Заполнить'}
              </button>

              {document.pictureInPictureEnabled && (
                <button
                  type="button"
                  onClick={togglePiP}
                  aria-label="Картинка в картинке"
                  title="Картинка в картинке"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/15"
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
                title="Полный экран (F)"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/15"
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
  );
}
