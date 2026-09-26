// ============================================================
// TMDb INTEGRATION LAYER — enriches the local catalog instead of the
// app calling TMDb directly, so caching/rate-limiting/schema-shaping
// all happen in one place. If TMDb is down, the platform simply keeps
// serving whatever is already stored locally (failure isolation, per
// section 7 of the architecture doc).
// ============================================================
const axios = require('axios');

const TMDB_BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const IMG_BASE = process.env.TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p/w500';

const tmdb = axios.create({
  baseURL: TMDB_BASE,
  timeout: 8000,
  params: { api_key: process.env.TMDB_API_KEY },
});

async function searchTmdb(query, page = 1) {
  const { data } = await tmdb.get('/search/multi', { params: { query, page, include_adult: false } });
  return data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

async function discoverTmdb({ genreId, year, language, sortBy = 'popularity.desc', page = 1 } = {}) {
  const { data } = await tmdb.get('/discover/movie', {
    params: {
      with_genres: genreId, primary_release_year: year,
      with_original_language: language, sort_by: sortBy, page,
    },
  });
  return data.results;
}

async function getDetails(tmdbId, mediaType = 'movie') {
  const { data } = await tmdb.get(`/${mediaType}/${tmdbId}`, {
    params: { append_to_response: 'credits,videos' },
  });
  return data;
}

/** Shapes a raw TMDb payload into our `movies` table row format. */
function toMovieRow(details, mediaType, region) {
  const director = details.credits?.crew?.find((c) => c.job === 'Director')?.name || null;
  const castMembers = (details.credits?.cast || []).slice(0, 10).map((c) => ({
    name: c.name, character: c.character, profile_path: c.profile_path,
  }));
  const trailer = (details.videos?.results || []).find((v) => v.site === 'YouTube' && v.type === 'Trailer');

  return {
    content_id: details.id,
    tmdb_id: details.id,
    title: details.title || details.name,
    media_type: mediaType,
    genres: (details.genres || []).map((g) => g.name),
    cast_members: JSON.stringify(castMembers),
    director,
    release_year: parseInt((details.release_date || details.first_air_date || '').slice(0, 4)) || null,
    language: details.original_language,
    overview: details.overview,
    poster_path: details.poster_path ? `${IMG_BASE}${details.poster_path}` : null,
    backdrop_path: details.backdrop_path ? `${IMG_BASE}${details.backdrop_path}` : null,
    trailer_key: trailer?.key || null,
    popularity: details.popularity || 0,
    home_region: region,
  };
}

module.exports = { searchTmdb, discoverTmdb, getDetails, toMovieRow };
