// ============================================================
// TMDb INTEGRATION LAYER — enriches the local catalog instead of the
// app calling TMDb directly, so caching/rate-limiting/schema-shaping
// all happen in one place. If TMDb is down (or no key is configured),
// the platform simply keeps serving whatever is already stored locally
// (failure isolation).
// ============================================================
require('../config/env');
const axios = require('axios');
const { httpError } = require('../utils/httpError');

const TMDB_BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const IMG_BASE = process.env.TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = IMG_BASE.replace('/w500', '/w780');

// TMDb's movie genre ids, used by bulk discover.
const GENRES = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  'Science Fiction': 878, Thriller: 53, War: 10752, Western: 37,
};

const isConfigured = () => Boolean(process.env.TMDB_API_KEY);

function client() {
  if (!isConfigured()) throw httpError(503, 'TMDB_API_KEY is not set in backend/.env — TMDb features are disabled');
  return axios.create({ baseURL: TMDB_BASE, timeout: 8000, params: { api_key: process.env.TMDB_API_KEY } });
}

async function call(fn) {
  try {
    return await fn(client());
  } catch (err) {
    if (err.status) throw err;
    if (err.response?.status === 401) throw httpError(502, 'TMDb rejected the API key (check TMDB_API_KEY)');
    if (err.response?.status === 404) throw httpError(404, 'Not found on TMDb');
    throw httpError(502, `TMDb request failed: ${err.message}`);
  }
}

async function searchTmdb(query, page = 1) {
  return call(async (tmdb) => {
    const { data } = await tmdb.get('/search/multi', { params: { query, page, include_adult: false } });
    return data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
  });
}

async function discoverTmdb({ genreId, year, language, sortBy = 'popularity.desc', page = 1 } = {}) {
  return call(async (tmdb) => {
    const { data } = await tmdb.get('/discover/movie', {
      params: { with_genres: genreId, primary_release_year: year, with_original_language: language, sort_by: sortBy, page },
    });
    return data.results;
  });
}

async function getDetails(tmdbId, mediaType = 'movie') {
  return call(async (tmdb) => {
    const { data } = await tmdb.get(`/${mediaType}/${tmdbId}`, { params: { append_to_response: 'credits,videos' } });
    return data;
  });
}

/** Shapes a raw TMDb payload into the movie input format used by services/movies.js. */
function toMovieInput(details, mediaType = 'movie') {
  const director = details.credits?.crew?.find((c) => c.job === 'Director')?.name || null;
  const cast = (details.credits?.cast || []).slice(0, 10).map((c) => ({
    name: c.name,
    character: c.character,
    profile_path: c.profile_path ? `${IMG_BASE}${c.profile_path}` : null,
  }));
  const trailer = (details.videos?.results || []).find((v) => v.site === 'YouTube' && v.type === 'Trailer');
  return {
    tmdb_id: details.id,
    title: details.title || details.name,
    media_type: mediaType,
    genres: (details.genres || []).map((g) => g.name),
    cast_members: cast,
    director,
    release_year: parseInt((details.release_date || details.first_air_date || '').slice(0, 4), 10) || null,
    language: details.original_language,
    overview: details.overview,
    poster_path: details.poster_path ? `${IMG_BASE}${details.poster_path}` : null,
    backdrop_path: details.backdrop_path ? `${BACKDROP_BASE}${details.backdrop_path}` : null,
    trailer_key: trailer?.key || null,
    popularity: details.popularity || 0,
  };
}

module.exports = { GENRES, isConfigured, searchTmdb, discoverTmdb, getDetails, toMovieInput };
