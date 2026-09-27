import { Platform } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Android emulator → 10.0.2.2; iOS Simulator → localhost.
// Physical device: use your Mac's LAN IP.
export const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

/** Demo client region for region-aware shard routing (US | EU). */
export const CLIENT_REGION = 'US';

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Client-Region'] = CLIENT_REGION;
  return config;
});

export const register = (email: string, password: string, fullName: string) =>
  api.post('/auth/register', { email, password, fullName }).then((r) => r.data);

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const fetchTrending = () => api.get('/catalog/trending').then((r) => r.data);

export const fetchNearby = (limit = 20) =>
  api.get('/catalog/nearby', { params: { limit } }).then((r) => r.data);

export const searchCatalog = (params: {
  q?: string; genre?: string; year?: string; language?: string; sort?: string; page?: number;
}) => api.get('/catalog/search', { params }).then((r) => r.data);

export const fetchMovie = (contentId: number | string) =>
  api.get(`/catalog/movie/${contentId}`).then((r) => r.data);

export const fetchRecommendations = () =>
  api.get('/recommendations').then((r) => r.data);

export const fetchWatchlist = () => api.get('/watchlist').then((r) => r.data);
export const addToWatchlist = (contentId: number) => api.post('/watchlist', { contentId }).then((r) => r.data);
export const removeFromWatchlist = (contentId: number) => api.delete(`/watchlist/${contentId}`);

export const fetchReviews = (movieId: number | string) =>
  api.get(`/reviews/movie/${movieId}`).then((r) => r.data);
export const submitReview = (movieId: number, rating: number, comment: string) =>
  api.post('/reviews', { movieId, rating, comment }).then((r) => r.data);

export const adminSyncMovie = (tmdbId: number, region: string = 'US') =>
  api.post('/admin/movies/sync', { tmdbId, region }).then((r) => r.data);

export const adminBulkDiscover = (genreId: number, region: string = 'US') =>
  api.post('/admin/movies/bulk-discover', { genreId, region }).then((r) => r.data);
