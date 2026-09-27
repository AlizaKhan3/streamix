import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL as DEFAULT_API_BASE_URL } from '../config';
import { getClientRegion } from './region';

const API_URL_KEY = 'api_base_url_override';

export { DEFAULT_API_BASE_URL as API_BASE_URL };

export const api = axios.create({ baseURL: DEFAULT_API_BASE_URL, timeout: 20000 });

/** Apply a saved override (call once at app start). */
export async function initApiBaseUrl() {
  const override = await AsyncStorage.getItem(API_URL_KEY);
  if (override && override.startsWith('http')) {
    api.defaults.baseURL = override.replace(/\/$/, '');
  }
}

export async function getApiBaseUrl() {
  const override = await AsyncStorage.getItem(API_URL_KEY);
  return (override && override.startsWith('http') ? override : DEFAULT_API_BASE_URL).replace(/\/$/, '');
}

export async function setApiBaseUrl(url: string) {
  const cleaned = url.trim().replace(/\/$/, '');
  if (!cleaned.startsWith('http')) throw new Error('URL must start with http');
  await AsyncStorage.setItem(API_URL_KEY, cleaned);
  api.defaults.baseURL = cleaned;
}

export async function clearApiBaseUrlOverride() {
  await AsyncStorage.removeItem(API_URL_KEY);
  api.defaults.baseURL = DEFAULT_API_BASE_URL;
}

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Client-Region'] = await getClientRegion();
  return config;
});

// ---------- Auth ----------
export const register = (email: string, password: string, fullName: string) =>
  api.post('/auth/register', { email, password, fullName }).then((r) => r.data);

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

// ---------- Catalog ----------
export const fetchTrending = () => api.get('/catalog/trending').then((r) => r.data);

export const fetchNearby = (limit = 20) =>
  api.get('/catalog/nearby', { params: { limit } }).then((r) => r.data);

export const searchCatalog = (params: {
  q?: string; genre?: string; year?: string; language?: string; sort?: string; page?: number;
}) => api.get('/catalog/search', { params }).then((r) => r.data);

export const fetchMovie = (contentId: number | string) =>
  api.get(`/catalog/movie/${contentId}`).then((r) => r.data);

// ---------- Recommendations ----------
export const fetchRecommendations = () =>
  api.get('/recommendations').then((r) => r.data);

// ---------- Watchlist ----------
export const fetchWatchlist = () => api.get('/watchlist').then((r) => r.data);
export const addToWatchlist = (contentId: number) => api.post('/watchlist', { contentId }).then((r) => r.data);
export const removeFromWatchlist = (contentId: number) => api.delete(`/watchlist/${contentId}`);

// ---------- Reviews ----------
export const fetchReviews = (movieId: number | string) =>
  api.get(`/reviews/movie/${movieId}`).then((r) => r.data);
export const submitReview = (movieId: number, rating: number, comment: string) =>
  api.post('/reviews', { movieId, rating, comment }).then((r) => r.data);

// ---------- Admin ----------
export const adminSyncMovie = (tmdbId: number, region: string = 'US') =>
  api.post('/admin/movies/sync', { tmdbId, region }).then((r) => r.data);

export const adminBulkDiscover = (genreId: number, region: string = 'US') =>
  api.post('/admin/movies/bulk-discover', { genreId, region }).then((r) => r.data);
