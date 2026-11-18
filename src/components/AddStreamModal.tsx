import { Play, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { Movie } from '../types/movie';

interface AddStreamModalProps {
  onPlay: (movie: Movie) => void;
  onSaveAndPlay: (movie: Movie) => Promise<void>;
  onClose: () => void;
}

export function AddStreamModal({ onPlay, onSaveAndPlay, onClose }: AddStreamModalProps) {
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [genre, setGenre] = useState('Фильм');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');

  const buildMovie = (): Movie | null => {
    const cleanUrl = videoUrl.trim();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Укажите название фильма');
      return null;
    }
    if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))) {
      setError('Укажите корректную ссылку http:// или https:// на видеопоток (.mp4, .webm, .m4v)');
      return null;
    }
    setError('');
    return {
      id: `custom-${Date.now()}`,
      title: cleanTitle,
      year: Number.parseInt(year, 10) || new Date().getFullYear(),
      genre: genre.trim() || 'Фильм',
      duration: 'Поток',
      rating: 'URL',
      director: 'Пользовательский поток',
      description: 'Фильм, добавленный вручную по прямой онлайн-ссылке.',
      posterUrl: '',
      videoUrl: cleanUrl,
      source: 'custom',
      isFullLength: true,
    };
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Добавить онлайн-поток"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11131A] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <h2 className="font-display text-lg font-bold text-white">
            Добавить фильм по ссылке
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="stream-title" className="block text-xs font-medium text-slate-400">
              Название фильма
            </label>
            <input
              id="stream-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Космическая одиссея"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090A0F] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#E5A93C] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="stream-url" className="block text-xs font-medium text-slate-400">
              Прямая ссылка на видео (.mp4, .m4v, .webm)
            </label>
            <input
              id="stream-url"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://example.com/movie.mp4"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090A0F] px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-[#E5A93C] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="stream-genre" className="block text-xs font-medium text-slate-400">
                Жанр
              </label>
              <input
                id="stream-genre"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090A0F] px-3.5 py-2 text-sm text-white focus:border-[#E5A93C] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="stream-year" className="block text-xs font-medium text-slate-400">
                Год
              </label>
              <input
                id="stream-year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090A0F] px-3.5 py-2 font-mono text-sm text-white tabular-nums focus:border-[#E5A93C] focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
          <button
            type="button"
            onClick={() => {
              const m = buildMovie();
              if (m) {
                onPlay(m);
                onClose();
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
          >
            <Play className="h-4 w-4" />
            Только смотреть
          </button>
          <button
            type="button"
            onClick={async () => {
              const m = buildMovie();
              if (m) {
                await onSaveAndPlay(m);
                onClose();
              }
            }}
            className="flex items-center gap-2 rounded-lg bg-[#E5A93C] px-4 py-2 text-sm font-semibold text-[#090A0F] hover:bg-[#F0B84D] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Сохранить и смотреть
          </button>
        </div>
      </div>
    </div>
  );
}
