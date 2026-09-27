// ============================================================
// DISTRIBUTED QUERY PROCESSING — SEMI-JOIN (proposal §5.3)
//
// Query: "show each movie's title together with its average rating".
// title lives in the Movie DB fragments, ratings live in the Review DB
// (possibly in another region). Instead of shipping whole tables:
//
//   1. PROJECT at the movie fragments: only (content_id, title, origin)
//   2. SHIP only the join keys (ids) to the review node(s)
//   3. AGGREGATE there: AVG/COUNT grouped by movie_id for those ids only
//   4. SHIP back only the aggregates, JOIN in the gateway
//
// The response includes the execution plan and how many rows/bytes moved
// compared with naively shipping the full reviews table.
// ============================================================
const movies = require('./movies');
const { callRegion } = require('./rpc');

const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

async function movieRatings(region, { genre, ids, limit = 20 } = {}) {
  const plan = [];
  const started = Date.now();

  // Step 1 — projection at the movie fragments (scatter-gather)
  const clauses = [];
  const params = [];
  if (ids?.length) {
    params.push(ids.map(Number));
    clauses.push(`content_id = ANY($${params.length}::bigint[])`);
  }
  if (genre) {
    params.push(genre);
    clauses.push(`$${params.length} = ANY(genres)`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const projected = await movies.scatter(
    region,
    `SELECT content_id, title, origin_region, poster_path FROM movies ${where} ORDER BY popularity DESC LIMIT 200`,
    params
  );
  const keys = projected.rows.map((r) => ({
    content_id: Number(r.content_id), title: r.title, origin_region: r.origin_region, poster_path: r.poster_path,
  }));
  plan.push({
    step: 1,
    at: projected.fragments.map((f) => f.node || `${f.region}-${f.fragment}`).join(' + '),
    action: 'project (content_id, title) at movie fragments',
    rows: keys.length,
  });

  // Step 2+3 — ship only ids to the review node of each origin region
  const byOrigin = new Map();
  keys.forEach((k) => {
    if (!byOrigin.has(k.origin_region)) byOrigin.set(k.origin_region, []);
    byOrigin.get(k.origin_region).push(k.content_id);
  });

  const aggregates = new Map();
  let naiveRows = 0;
  const unavailable = [];
  for (const [origin, movieIds] of byOrigin) {
    try {
      const res = await callRegion(origin, 'reviews.aggregate', { region: origin, movieIds });
      res.rows.forEach((r) => aggregates.set(r.movie_id, r));
      naiveRows += res.reviewTableRows;
      plan.push({
        step: 2,
        at: `${res.node}${origin === region ? '' : ` (remote region ${origin})`}`,
        action: `ship ${movieIds.length} join keys, GROUP BY movie_id there`,
        shippedKeysBytes: bytes(movieIds),
        rowsReturned: res.rows.length,
        returnedBytes: bytes(res.rows),
      });
    } catch (err) {
      unavailable.push({ region: origin, error: err.message });
      plan.push({ step: 2, at: `review node in ${origin}`, action: 'unreachable — ratings shown as unavailable', error: err.message });
    }
  }

  // Step 4 — join in the gateway
  const results = keys
    .map((k) => {
      const agg = aggregates.get(k.content_id);
      const reachable = !unavailable.some((u) => u.region === k.origin_region);
      return { ...k, avg_rating: agg ? agg.avg : reachable ? 0 : null, review_count: agg ? agg.count : 0 };
    })
    .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0) || b.review_count - a.review_count)
    .slice(0, Number(limit) || 20);
  plan.push({ step: 3, at: `gateway ${region}`, action: 'hash-join keys with aggregates, sort, limit', rows: results.length });

  const shippedRows = keys.length + aggregates.size;
  return {
    results,
    plan,
    stats: {
      elapsedMs: Date.now() - started,
      semiJoin: { rowsShipped: shippedRows },
      naiveJoin: { rowsShipped: keys.length + naiveRows, note: 'shipping every reviews row to the gateway' },
      savedRows: Math.max(0, keys.length + naiveRows - shippedRows),
    },
    unavailable,
  };
}

module.exports = { movieRatings };
