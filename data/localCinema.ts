import heroFeaturedImg from '../assets/images/hero_featured_cinema_1794686988663.jpg';
import posterOrbitalImg from '../assets/images/poster_orbital_horizon_1794686988683.jpg';
import posterHarborNoirImg from '../assets/images/poster_harbor_noir_1794686990011.jpg';
import posterAlpineEchoImg from '../assets/images/poster_alpine_echo_1794686990618.jpg';
import posterLanternAlleyImg from '../assets/images/poster_lantern_alley_1794686990409.jpg';
import type { Movie } from '../types/movie';

export const HERO_FEATURED_MOVIE: Movie = {
  id: 'open-tears-of-steel',
  title: 'Слёзы стали',
  originalTitle: 'Tears of Steel',
  year: 2012,
  genre: 'Фантастика',
  duration: '12 мин',
  rating: '4K HDR',
  director: 'Иэн Хьюберт',
  description:
    'В футуристическом Амстердаме группа учёных и воинов пытается остановить роботов, захвативших город, чтобы исправить ошибку прошлого в обсерватории над океаном.',
  posterUrl: posterOrbitalImg,
  backdropUrl: heroFeaturedImg,
  videoUrl:
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  source: 'open-cinema',
  isFullLength: true,
};

export const CURATED_OPEN_MOVIES: Movie[] = [
  HERO_FEATURED_MOVIE,
  {
    id: 'open-sintel',
    title: 'Синтел',
    originalTitle: 'Sintel',
    year: 2010,
    genre: 'Фэнтези / Драма',
    duration: '15 мин',
    rating: '4K',
    director: 'Колин Леви',
    description:
      'Одинокая странница пересекает заснеженные горные хребты и древние города в поисках дракона, которого она когда-то спасла и назвала своим другом.',
    posterUrl: posterAlpineEchoImg,
    backdropUrl: posterAlpineEchoImg,
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    source: 'open-cinema',
    isFullLength: true,
  },
  {
    id: 'open-elephants-dream',
    title: 'Сон слонов',
    originalTitle: 'Elephants Dream',
    year: 2006,
    genre: 'Артхаус / Нуар',
    duration: '11 мин',
    rating: 'HD',
    director: 'Бассэм Курдали',
    description:
      'Сюрреалистическая притча о двух путешественниках, исследующих бесконечную механическую башню, где границы между реальностью и воображением стираются.',
    posterUrl: posterHarborNoirImg,
    backdropUrl: posterHarborNoirImg,
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    source: 'open-cinema',
    isFullLength: true,
  },
  {
    id: 'open-big-buck-bunny',
    title: 'Большой кролик',
    originalTitle: 'Big Buck Bunny',
    year: 2008,
    genre: 'Анимация / Комедия',
    duration: '10 мин',
    rating: 'HD 60fps',
    director: 'Саша Гоэдегебуре',
    description:
      'Тёплая и ироничная история лесного великана, который решает преподать урок трём шумным проказникам, нарушившим покой тихой долины.',
    posterUrl: posterLanternAlleyImg,
    backdropUrl: posterLanternAlleyImg,
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    source: 'open-cinema',
    isFullLength: true,
  },
];

export const SEARCH_PRESETS = [
  'Interstellar',
  'Inception',
  'Blade Runner',
  'Matrix',
  'Dune',
  'Солярис',
  'Sherlock',
  'Chaplin',
];
