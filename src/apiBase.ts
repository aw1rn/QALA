// Адрес сервера QALA. Пусто — сервер на том же адресе, что и сайт.
// Для GitHub Pages задаётся при сборке через VITE_API_URL (например https://qala.onrender.com).
export const API_BASE: string = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
