export type MovieSource = 'open-cinema' | 'itunes' | 'archive' | 'custom';

export interface Movie {
  id: string;
  title: string;
  originalTitle?: string;
  year: number;
  genre: string;
  duration: string;
  rating: string;
  director: string;
  description: string;
  posterUrl: string;
  backdropUrl?: string;
  videoUrl: string;
  source: MovieSource;
  isFullLength?: boolean;
}

export interface FavoriteMovie extends Movie {
  note: string;
  addedAt: string;
}

export interface WatchHistoryItem extends Movie {
  progressSeconds: number;
  durationSeconds: number;
  lastWatchedAt: string;
}

export interface SearchResponse {
  query: string;
  results: Movie[];
  sourcesUsed: string[];
  total: number;
}
