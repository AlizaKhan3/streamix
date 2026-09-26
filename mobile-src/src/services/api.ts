import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Point this at your machine's LAN IP when running on a physical device/emulator,
// e.g. http://10.0.2.2:4000 for Android emulator, or http://192.168.x.x:4000 for a real phone.
export const API_BASE_URL = 'http://10.0.2.2:4000';

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---------- Auth ----------
export const register = (email: string, password: string, fullName: string) =>
  api.post('/auth/register', { email, password, fullName }).then((r) => r.data);

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

// ---------- Catalog ----------
export const fetchTrending = () => api.get('/catalog/trending').then((r) => r.data);

export const searchCatalog = (params: {
  q?: string; genre?: string; year?: string; language?: string; sort?: string; page?: number;
}) => api.get('/catalog/search', { params }).then((r) => r.data);

export const fetchMovie = (contentId: number | string) =>
  api.get(`/catalog/movie/${contentId}`).then((r) => r.data);

// ---------- Watchlist ----------
export const fetchWatchlist = () => api.get('/watchlist').then((r) => r.data);
export const addToWatchlist = (contentId: number) => api.post('/watchlist', { contentId }).then((r) => r.data);
export const removeFromWatchlist = (contentId: number) => api.delete(`/watchlist/${contentId}`);

// ---------- Reviews ----------
export const fetchReviews = (movieId: number | string) =>
  api.get(`/reviews/movie/${movieId}`).then((r) => r.data);
export const submitReview = (movieId: number, rating: number, comment: string) =>
  api.post('/reviews', { movieId, rating, comment }).then((r) => r.data);
