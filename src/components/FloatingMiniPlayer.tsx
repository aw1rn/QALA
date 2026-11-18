import { Maximize2, Pause, Play, Radio, Tv, X } from 'lucide-react';
import type { MediaMiniPlayerState } from '../types/qala';

interface FloatingMiniPlayerProps {
  media: MediaMiniPlayerState | null;
  isMobileLayout: boolean;
  onTogglePlay: () => void;
  onOpenFull: () => void;
  onClose: () => void;
}

export function FloatingMiniPlayer({
  media,
  isMobileLayout,
  onTogglePlay,
  onOpenFull,
  onClose,
}: FloatingMiniPlayerProps) {
  if (!media) return null;

  return (
    <div
      role="region"
      aria-label="Мини-плеер"
      className={
        isMobileLayout
          ? 'fixed inset-x-3 bottom-[68px] z-35 mx-auto max-w-[406px]'
          : 'fixed inset-x-3 bottom-[68px] z-35 md:inset-x-auto md:right-6 md:bottom-6 md:w-[340px]'
      }
    >
      <div className="liquid-glass flex h-11 items-center justify-between gap-2 rounded-2xl px-2.5 shadow-xl">
        <button
          type="button"
          onClick={onOpenFull}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: media.accentColor || (media.kind === 'tv' ? '#E11D48' : '#4F46E5') }}
          >
            {media.kind === 'tv' ? <Tv className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-xs font-bold text-slate-900 dark:text-slate-100">
              {media.title}
            </div>
            <div className="truncate text-[10px] text-slate-600 dark:text-slate-400">
              {media.kind === 'tv' ? 'Qala TV' : 'Qala Radio'} · {media.subtitle}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            aria-label={media.isPlaying ? 'Пауза' : 'Воспроизвести'}
          >
            {media.isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={onOpenFull}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/75 text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
            aria-label="Открыть плеер"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400"
            aria-label="Закрыть мини-плеер"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
