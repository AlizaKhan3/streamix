// ============================================================
// REVIEWS MODULE — runs in the movie's ORIGIN region.
//
// Submitting a review touches TWO nodes: it inserts into the Review DB and
// updates the rating aggregate stored in the Movie DB fragment. Two
// coordination protocols are implemented (proposal §5.3):
//
//   '2pc'  : strict consistency — both nodes commit or neither does.
//   'saga' : eventual consistency — local commits step by step, with a
//            compensating action (delete the review) if a later step fails.
//
// `failAt: 'movie'` injects a failure at the movie step so the abort /
// compensation path can be demonstrated live.
// ============================================================
const crypto = require('crypto');
const { fragmentIndexFor, movieGroup, reviewGroup } = require('../config/topology');
const { read, write, transaction } = require('../db/router');
const { runTwoPhaseCommit } = require('./twoPhaseCommit');
const replication = require('./replication');
const { httpError } = require('../utils/httpError');

const AGG_SQL = `SELECT COALESCE(AVG(rating), 0)::numeric(3,2) AS avg, COUNT(*)::int AS count
                 FROM reviews WHERE movie_id = $1 AND moderation_status = 'approved'`;

const UPDATE_MOVIE_SQL = `UPDATE movies SET rating_avg = $2, rating_count = $3, rating_updated_at = now()
                          WHERE content_id = $1 RETURNING *`;

function validate({ rating }) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw httpError(400, 'rating must be an integer from 1 to 5');
  return r;
}

async function insertReview(client, { user, movieId, rating, comment, protocol, status = 'approved' }) {
  try {
    const { rows } = await client.query(
      `INSERT INTO reviews (user_id, user_name, user_home_region, movie_id, rating, comment, protocol, moderation_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [user.sub, user.name || user.email?.split('@')[0] || null, user.home_region, movieId, rating, comment || null, protocol, status]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'You have already reviewed this title');
    throw err;
  }
}

/** Writes the new aggregate + queues its geo-replication (same movie-node transaction). */
async function updateAggregate(movieClient, movieId, agg) {
  const { rows } = await movieClient.query(UPDATE_MOVIE_SQL, [movieId, agg.avg, agg.count]);
  const movie = rows[0];
  await replication.enqueue(movieClient, movie, replication.otherRegions(movie.license_regions, movie.origin_region), 'upsert');
  return movie;
}

// ---------------- 2PC ----------------
async function submitWith2PC({ region, user, movieId, rating, comment, failAt }) {
  let review;
  let aggregate;
  const transactionInfo = await runTwoPhaseCommit({
    region,
    label: `review movie ${movieId}`,
    // movie row is locked first so concurrent reviews of one title serialise
    participants: { movie: movieGroup(region, fragmentIndexFor(movieId)), review: reviewGroup(region) },
    work: async ({ movie, review: rc }, log) => {
      const { rows } = await movie.query('SELECT content_id FROM movies WHERE content_id = $1 FOR UPDATE', [movieId]);
      if (!rows[0]) throw httpError(404, `Movie ${movieId} not found in origin region ${region}`);
      log(`locked movie ${movieId} on movie fragment`);

      review = await insertReview(rc, { user, movieId, rating, comment, protocol: '2pc' });
      log(`INSERT review #${review.id} on review node`);

      const { rows: agg } = await rc.query(AGG_SQL, [movieId]);
      aggregate = agg[0];
      log(`computed new aggregate avg=${aggregate.avg} count=${aggregate.count}`);

      if (failAt === 'movie') throw httpError(500, 'Injected failure: movie node voted NO');
      await updateAggregate(movie, movieId, aggregate);
      log('UPDATE movie rating aggregate (+ outbox for other regions)');
    },
  });
  return { review, aggregate, transaction: transactionInfo };
}

// ---------------- Saga ----------------
async function sagaLog(region, sagaId, step, status, detail) {
  await write(reviewGroup(region), (c) =>
    c.query('INSERT INTO saga_log (saga_id, step, status, detail) VALUES ($1, $2, $3, $4)', [sagaId, step, status, detail || null])
  ).catch(() => {});
}

async function submitWithSaga({ region, user, movieId, rating, comment, failAt }) {
  const sagaId = crypto.randomUUID();
  const started = Date.now();
  const trace = [];
  const log = (step, phase) => trace.push({ ms: Date.now() - started, phase, step });

  const exists = await read(movieGroup(region, fragmentIndexFor(movieId)), (p) =>
    p.query('SELECT 1 FROM movies WHERE content_id = $1', [movieId])
  );
  if (!exists.rowCount) throw httpError(404, `Movie ${movieId} not found in origin region ${region}`);

  // T1 — local transaction on the review node
  const review = await write(reviewGroup(region), (c) => insertReview(c, { user, movieId, rating, comment, protocol: 'saga' }));
  log(`T1 committed: INSERT review #${review.id} on review node`, 'T1');
  await sagaLog(region, sagaId, 'T1 insert review', 'done', `review ${review.id}`);

  // T2 — local transaction on the movie node
  try {
    const aggregate = await transaction(movieGroup(region, fragmentIndexFor(movieId)), async (mc) => {
      await mc.query('SELECT 1 FROM movies WHERE content_id = $1 FOR UPDATE', [movieId]);
      const { rows } = await read(reviewGroup(region), (p) => p.query(AGG_SQL, [movieId]));
      if (failAt === 'movie') throw httpError(500, 'Injected failure while updating the movie aggregate');
      await updateAggregate(mc, movieId, rows[0]);
      return rows[0];
    });
    log(`T2 committed: UPDATE movie aggregate avg=${aggregate.avg} count=${aggregate.count}`, 'T2');
    await sagaLog(region, sagaId, 'T2 update aggregate', 'done');
    return { review, aggregate, transaction: { protocol: 'saga', sagaId, outcome: 'completed', trace } };
  } catch (err) {
    log(`T2 failed — ${err.message}`, 'T2');
    await sagaLog(region, sagaId, 'T2 update aggregate', 'failed', err.message);

    // C1 — compensating transaction undoes T1
    await write(reviewGroup(region), (c) => c.query('DELETE FROM reviews WHERE id = $1', [review.id]));
    log(`C1 compensation: DELETE review #${review.id}`, 'compensation');
    await sagaLog(region, sagaId, 'C1 delete review', 'compensated', `review ${review.id}`);

    throw httpError(err.status && err.status < 500 ? err.status : 503, `Review rolled back by saga compensation: ${err.message}`, {
      transaction: { protocol: 'saga', sagaId, outcome: 'compensated', trace },
    });
  }
}

async function submit({ region, user, movieId, rating, comment, protocol = '2pc', failAt }) {
  const r = validate({ rating });
  const args = { region, user, movieId: Number(movieId), rating: r, comment: comment ? String(comment).slice(0, 2000) : null, failAt };
  return protocol === 'saga' ? submitWithSaga(args) : submitWith2PC(args);
}

// ---------------- reads ----------------
async function listForMovie({ region, movieId }) {
  const { rows } = await read(reviewGroup(region), (p) =>
    p.query(
      `SELECT id, user_id, user_name, user_home_region, movie_id, rating, comment, protocol, created_at
       FROM reviews WHERE movie_id = $1 AND moderation_status = 'approved' ORDER BY created_at DESC LIMIT 100`,
      [movieId]
    )
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), movie_id: Number(r.movie_id) }));
}

async function byUser({ region, userId }) {
  const { rows } = await read(reviewGroup(region), (p) =>
    p.query('SELECT * FROM reviews WHERE user_id = $1 ORDER BY created_at DESC', [userId])
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), movie_id: Number(r.movie_id), stored_in: region }));
}

/** Remote half of the distributed semi-join: aggregates for just the shipped ids. */
async function aggregate({ region, movieIds }) {
  const ids = (movieIds || []).map(Number).filter(Number.isFinite);
  return read(reviewGroup(region), async (p, meta) => {
    const [agg, total] = await Promise.all([
      p.query(
        `SELECT movie_id, AVG(rating)::numeric(3,2) AS avg, COUNT(*)::int AS count
         FROM reviews WHERE movie_id = ANY($1::bigint[]) AND moderation_status = 'approved' GROUP BY movie_id`,
        [ids]
      ),
      p.query('SELECT count(*)::int AS n FROM reviews'),
    ]);
    return {
      node: meta.node,
      rows: agg.rows.map((r) => ({ movie_id: Number(r.movie_id), avg: Number(r.avg), count: r.count })),
      reviewTableRows: total.rows[0].n,
    };
  });
}

// ---------------- moderation (admin, local region) ----------------
async function adminList({ region, status, q }) {
  const { rows } = await read(reviewGroup(region), (p) =>
    p.query(
      `SELECT * FROM reviews
       WHERE ($1::text IS NULL OR moderation_status = $1)
         AND ($2::text IS NULL OR comment ILIKE '%' || $2 || '%' OR user_name ILIKE '%' || $2 || '%')
       ORDER BY created_at DESC LIMIT 200`,
      [status || null, q || null]
    )
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), movie_id: Number(r.movie_id) }));
}

/** Changing a review's status changes the aggregate, so it is also a 2PC across both nodes. */
async function moderate({ region, reviewId, status }) {
  if (!['approved', 'pending', 'removed'].includes(status)) throw httpError(400, 'status must be approved, pending or removed');
  const { rows } = await read(reviewGroup(region), (p) => p.query('SELECT movie_id FROM reviews WHERE id = $1', [reviewId]));
  if (!rows[0]) throw httpError(404, 'Review not found in this region');
  const movieId = Number(rows[0].movie_id);

  let review;
  const transactionInfo = await runTwoPhaseCommit({
    region,
    label: `moderate review ${reviewId}`,
    participants: { movie: movieGroup(region, fragmentIndexFor(movieId)), review: reviewGroup(region) },
    work: async ({ movie, review: rc }, log) => {
      await movie.query('SELECT 1 FROM movies WHERE content_id = $1 FOR UPDATE', [movieId]);
      const updated = await rc.query(
        'UPDATE reviews SET moderation_status = $2, updated_at = now() WHERE id = $1 RETURNING *',
        [reviewId, status]
      );
      review = updated.rows[0];
      log(`review #${reviewId} -> ${status}`);
      const { rows: agg } = await rc.query(AGG_SQL, [movieId]);
      const { rowCount } = await movie.query('SELECT 1 FROM movies WHERE content_id = $1', [movieId]);
      if (rowCount) {
        await updateAggregate(movie, movieId, agg[0]);
        log(`movie aggregate -> avg=${agg[0].avg} count=${agg[0].count}`);
      }
    },
  });
  return { review: { ...review, id: Number(review.id), movie_id: movieId }, transaction: transactionInfo };
}

module.exports = { submit, listForMovie, byUser, aggregate, adminList, moderate, insertReview, updateAggregate, AGG_SQL };
