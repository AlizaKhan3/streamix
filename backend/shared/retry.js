/**
 * Bounded retries with exponential backoff for transient shard / network failures.
 */
async function withRetry(fn, { retries = 2, baseMs = 50, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  const e = lastErr || new Error(`${label} failed`);
  e.retryExhausted = true;
  throw e;
}

module.exports = { withRetry };
