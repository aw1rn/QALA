import { Bookmark, Check, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FavoriteMovie, Movie } from '../types/movie';
import { MoviePoster } from './MoviePoster';

interface MovieDetailModalProps {
  movie: Movie;
  favoriteEntry?: FavoriteMovie;
  onPlay: (movie: Movie) => void;
  onToggleFavorite: (movie: Movie) => void;
  onSaveNote: (movieId: string, note: string) => Promise<void>;
  onClose: () => void;
}

export function MovieDetailModal({
  movie,
  favoriteEntry,
  onPlay,
  onToggleFavorite,
  onSaveNote,
  onClose,
}: MovieDetailModalProps) {
  const isFavorite = Boolean(favoriteEntry);
  const [note, setNote] = useState(favoriteEntry?.note || '');
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setNote(favoriteEntry?.note || '');
  }, [favoriteEntry]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveNote(movie.id, note);
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-[#11131A] shadow-2xl md:grid-cols-[260px_1fr]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть окно"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#090A0F]/80 text-slate-300 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Left Poster */}
        <div className="aspect-[3/4] w-full bg-[#171A23] md:h-full md:aspect-auto">
          <MoviePoster src={movie.posterUrl} alt={movie.title} title={movie.title} />
        </div>

        {/* Right Content */}
        <div className="flex flex-col justify-between p-6 md:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums pr-10">
              {movie.year > 0 && <span>{movie.year}</span>}
              {movie.year > 0 && <span aria-hidden="true">·</span>}
              <span>{movie.genre}</span>
              {movie.duration && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{movie.duration}</span>
                </>
              )}
              {movie.rating && movie.rating !== '—' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[#E5A93C]">{movie.rating}</span>
                </>
              )}
            </div>

            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
              {movie.title}
            </h2>
            {movie.originalTitle && movie.originalTitle !== movie.title && (
              <p className="mt-0.5 text-sm text-slate-400">{movie.originalTitle}</p>
            )}

            {movie.director && (
              <p className="mt-3 text-sm text-slate-300">
                <span className="text-slate-500">Режиссёр: </span>
                {movie.director}
              </p>
            )}

            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              {movie.description || 'Описание отсутствует.'}
            </p>

            {/* Local SQLite Personal Note when saved */}
            {isFavorite && (
              <form onSubmit={handleNoteSubmit} className="mt-5 border-t border-white/[0.08] pt-4">
                <label
                  htmlFor="movie-local-note"
                  className="block text-xs font-medium text-slate-400"
                >
                  Личная заметка в локальной базе данных
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="movie-local-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Например: пересмотреть на выходных…"
                    className="flex-1 rounded-lg border border-white/10 bg-[#090A0F] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-[#E5A93C] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
                  >
                    {noteSaved ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Сохранено
                      </>
                    ) : (
                      'Сохранить'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                onClose();
                onPlay(movie);
              }}
              className="flex items-center gap-2 rounded-lg bg-[#E5A93C] px-5 py-2.5 text-sm font-semibold text-[#090A0F] transition-colors hover:bg-[#F0B84D] whitespace-nowrap"
            >
              <Play className="h-4 w-4 fill-current" />
              Смотреть сейчас
            </button>

            <button
              type="button"
              onClick={() => onToggleFavorite(movie)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isFavorite
                  ? 'border-[#E5A93C]/50 bg-[#E5A93C]/15 text-[#E5A93C] hover:bg-[#E5A93C]/25'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
              {isFavorite ? 'Удалить из избранного' : 'Сохранить в избранное'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
