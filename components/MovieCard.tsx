import { Bookmark, Info, Play } from 'lucide-react';
import type { Movie } from '../types/movie';
import { MoviePoster } from './MoviePoster';

interface MovieCardProps {
  movie: Movie;
  isFavorite: boolean;
  progressPercent?: number;
  onPlay: (movie: Movie) => void;
  onToggleFavorite: (movie: Movie) => void;
  onInspect: (movie: Movie) => void;
}

export function MovieCard({
  movie,
  isFavorite,
  progressPercent,
  onPlay,
  onToggleFavorite,
  onInspect,
}: MovieCardProps) {
  const sourceLabel =
    movie.source === 'itunes'
      ? 'Трейлер HD'
      : movie.source === 'archive'
      ? 'Архив'
      : movie.source === 'custom'
      ? 'Свой поток'
      : 'Открытый зал';

  return (
    <article
      className="group relative flex flex-col rounded-xl bg-[#11131A] border border-white/[0.08] transition-transform duration-200 ease-out hover:-translate-y-1 focus-within:ring-2 focus-within:ring-[#E5A93C]"
    >
      {/* 3:4 Poster Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-xl bg-[#171A23]">
        <MoviePoster
          src={movie.posterUrl}
          alt={movie.title}
          title={movie.title}
          className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />

        {/* Measured scrim for action visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F]/95 via-[#090A0F]/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100" />

        {/* Hover / Focus Action Bar */}
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onPlay(movie)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#E5A93C] px-3 py-2 text-xs font-semibold text-[#090A0F] transition-colors hover:bg-[#F0B84D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Смотреть
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(movie);
            }}
            aria-label={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
            title={isFavorite ? 'Удалить из избранного' : 'Сохранить в избранное'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
              isFavorite
                ? 'border-[#E5A93C]/50 bg-[#E5A93C]/20 text-[#E5A93C]'
                : 'border-white/15 bg-[#090A0F]/80 text-slate-200 hover:border-white/30 hover:text-white'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspect(movie);
            }}
            aria-label="Подробнее о фильме"
            title="Подробнее"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#090A0F]/80 text-slate-200 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {/* Watch Progress Bar */}
        {typeof progressPercent === 'number' && progressPercent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
            <div
              className="h-full bg-[#E5A93C]"
              style={{ width: `${Math.min(100, Math.max(4, progressPercent))}%` }}
            />
          </div>
        )}
      </div>

      {/* Card Body — Zero-pill clean typographic metadata */}
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <button
            type="button"
            onClick={() => onInspect(movie)}
            className="text-left focus-visible:outline-none focus-visible:underline"
          >
            <h3 className="line-clamp-1 font-display text-base font-semibold tracking-tight text-slate-100 group-hover:text-[#E5A93C] transition-colors">
              {movie.title}
            </h3>
          </button>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400 tabular-nums truncate">
            <span>{movie.year > 0 ? movie.year : '—'}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{movie.genre}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-xs text-slate-400">
          <span className="truncate">{sourceLabel}</span>
          <span className="font-mono tabular-nums text-slate-300 shrink-0">
            {movie.duration || movie.rating}
          </span>
        </div>
      </div>
    </article>
  );
}
