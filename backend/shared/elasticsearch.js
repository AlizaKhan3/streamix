/**
 * Elasticsearch catalog index — full-text search across sharded movies.
 * Falls back gracefully when ES is down (catalog uses Postgres FTS).
 */
const { Client } = require('@elastic/elasticsearch');
const { log } = require('./logger');

const INDEX = process.env.ELASTICSEARCH_INDEX || 'movies';
let client;
let ready = false;

function getClient() {
  if (client) return client;
  const node = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
  client = new Client({
    node,
    requestTimeout: 5000,
    maxRetries: 1,
  });
  return client;
}

async function ensureIndex() {
  if (ready) return true;
  try {
    const es = getClient();
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              movie_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding'],
              },
            },
          },
        },
        mappings: {
          properties: {
            content_id: { type: 'long' },
            tmdb_id: { type: 'long' },
            title: { type: 'text', analyzer: 'movie_analyzer', fields: { keyword: { type: 'keyword' } } },
            media_type: { type: 'keyword' },
            genres: { type: 'keyword' },
            cast_members: { type: 'text', analyzer: 'movie_analyzer' },
            director: { type: 'text', analyzer: 'movie_analyzer' },
            release_year: { type: 'integer' },
            language: { type: 'keyword' },
            overview: { type: 'text', analyzer: 'movie_analyzer' },
            poster_path: { type: 'keyword', index: false },
            backdrop_path: { type: 'keyword', index: false },
            trailer_key: { type: 'keyword', index: false },
            popularity: { type: 'float' },
            rating_avg: { type: 'float' },
            rating_count: { type: 'integer' },
            home_region: { type: 'keyword' },
          },
        },
      });
      log.info('es_index_created', { index: INDEX });
    }
    ready = true;
    return true;
  } catch (err) {
    log.warn('es_ensure_failed', { message: err.message });
    return false;
  }
}

function movieToDoc(row) {
  const castText = Array.isArray(row.cast_members)
    ? row.cast_members.map((c) => (typeof c === 'string' ? c : c?.name || '')).filter(Boolean).join(' ')
    : typeof row.cast_members === 'string'
      ? row.cast_members
      : JSON.stringify(row.cast_members || []);

  return {
    content_id: Number(row.content_id),
    tmdb_id: row.tmdb_id != null ? Number(row.tmdb_id) : undefined,
    title: row.title,
    media_type: row.media_type || 'movie',
    genres: row.genres || [],
    cast_members: castText,
    director: row.director || '',
    release_year: row.release_year != null ? Number(row.release_year) : null,
    language: row.language || null,
    overview: row.overview || '',
    poster_path: row.poster_path || null,
    backdrop_path: row.backdrop_path || null,
    trailer_key: row.trailer_key || null,
    popularity: Number(row.popularity || 0),
    rating_avg: Number(row.rating_avg || 0),
    rating_count: Number(row.rating_count || 0),
    home_region: row.home_region || 'US',
  };
}

async function indexMovie(row) {
  try {
    if (!(await ensureIndex())) return false;
    const doc = movieToDoc(row);
    await getClient().index({
      index: INDEX,
      id: String(doc.content_id),
      document: doc,
      refresh: false,
    });
    return true;
  } catch (err) {
    log.warn('es_index_failed', { contentId: row.content_id, message: err.message });
    return false;
  }
}

async function searchMovies({ q, genre, year, language, sort = 'popularity', page = 1, size = 20 }) {
  if (!(await ensureIndex())) return null;
  const must = [];
  const filter = [];

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['title^3', 'director^2', 'cast_members^2', 'overview', 'genres'],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    });
  } else {
    must.push({ match_all: {} });
  }
  if (genre) filter.push({ term: { genres: genre } });
  if (year) filter.push({ term: { release_year: year } });
  if (language) filter.push({ term: { language } });

  const sortMap = {
    popularity: [{ popularity: 'desc' }, { _score: 'desc' }],
    rating_avg: [{ rating_avg: 'desc' }, { _score: 'desc' }],
    release_year: [{ release_year: 'desc' }, { _score: 'desc' }],
  };

  try {
    const from = (page - 1) * size;
    const result = await getClient().search({
      index: INDEX,
      from,
      size,
      query: { bool: { must, filter } },
      sort: sortMap[sort] || sortMap.popularity,
    });
    const hits = result.hits?.hits || [];
    const total = typeof result.hits?.total === 'object'
      ? result.hits.total.value
      : Number(result.hits?.total || 0);
    return {
      total,
      page,
      results: hits.map((h) => ({ ...h._source, _score: h._score, _store: 'elasticsearch' })),
      engine: 'elasticsearch',
    };
  } catch (err) {
    log.warn('es_search_failed', { message: err.message });
    return null;
  }
}

async function pingElasticsearch() {
  try {
    const es = getClient();
    const ok = await es.ping();
    return { status: ok ? 'ok' : 'down' };
  } catch (err) {
    return { status: 'down', error: err.message };
  }
}

module.exports = {
  INDEX,
  getClient,
  ensureIndex,
  indexMovie,
  searchMovies,
  pingElasticsearch,
  movieToDoc,
};
