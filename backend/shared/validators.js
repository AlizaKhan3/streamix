/**
 * Production-grade input validators (regex + length bounds).
 * Used by all microservices — keep rules in one place for viva/report.
 */

/**
 * Stricter than bare RFC: local-part ≥2, each domain label ≥2, TLD ≥2.
 * Rejects toys like a@a.com / a@b.co.
 */
const EMAIL_RE =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** Min 8; upper + lower + digit + special. */
const PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;
const FULL_NAME_RE = /^[\p{L}\p{M}' .\-]{2,100}$/u;

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isStrictEmail(value) {
  if (!EMAIL_RE.test(value)) return false;
  const at = value.lastIndexOf('@');
  if (at < 2) return false; // local part at least 2 chars
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length < 2) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;
  // Every label (including domain name before TLD) must be ≥ 2 chars — blocks a@a.com
  for (const label of labels) {
    if (label.length < 2) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  return true;
}

function validateEmail(email, { required = true } = {}) {
  const value = normalizeEmail(email);
  if (!value) {
    if (required) return { ok: false, error: 'Email is required' };
    return { ok: true, value: null };
  }
  if (value.length > 254) return { ok: false, error: 'Email must be at most 254 characters' };
  if (!isStrictEmail(value)) {
    return { ok: false, error: 'Enter a valid email like name@example.com (not a@a.com)' };
  }
  return { ok: true, value };
}

function validatePassword(password, { required = true } = {}) {
  const value = password == null ? '' : String(password);
  if (!value) {
    if (required) return { ok: false, error: 'Password is required' };
    return { ok: true, value: null };
  }
  if (value.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (value.length > 128) return { ok: false, error: 'Password must be at most 128 characters' };
  if (!/[a-z]/.test(value)) {
    return { ok: false, error: 'Password must include a lowercase letter' };
  }
  if (!/[A-Z]/.test(value)) {
    return { ok: false, error: 'Password must include an uppercase letter' };
  }
  if (!/\d/.test(value)) {
    return { ok: false, error: 'Password must include a number' };
  }
  if (!PASSWORD_SPECIAL_RE.test(value)) {
    return {
      ok: false,
      error: 'Password must include a special character (!@#$%^&* etc.)',
    };
  }
  return { ok: true, value };
}

function validateFullName(fullName, { required = false } = {}) {
  if (fullName == null || String(fullName).trim() === '') {
    if (required) return { ok: false, error: 'Full name is required (at least 2 letters)' };
    return { ok: true, value: null };
  }
  const value = String(fullName).trim();
  if (value.length < 2) {
    return { ok: false, error: 'Full name must be at least 2 characters' };
  }
  if (value.length > 100) return { ok: false, error: 'Full name must be at most 100 characters' };
  const letters = (value.match(/\p{L}/gu) || []).length;
  if (letters < 2) {
    return { ok: false, error: 'Full name must contain at least 2 letters' };
  }
  if (!FULL_NAME_RE.test(value)) {
    return { ok: false, error: 'Full name contains invalid characters' };
  }
  return { ok: true, value };
}

function validateRegisterBody(body = {}) {
  const details = [];
  const fullName = validateFullName(body.fullName, { required: true });
  if (!fullName.ok) details.push({ field: 'fullName', message: fullName.error });
  const email = validateEmail(body.email);
  if (!email.ok) details.push({ field: 'email', message: email.error });
  const password = validatePassword(body.password);
  if (!password.ok) details.push({ field: 'password', message: password.error });
  if (details.length) throw new ValidationError('Validation failed', details);
  return { email: email.value, password: password.value, fullName: fullName.value };
}

function validateLoginBody(body = {}) {
  const details = [];
  const email = validateEmail(body.email);
  if (!email.ok) details.push({ field: 'email', message: email.error });
  if (body.password == null || String(body.password) === '') {
    details.push({ field: 'password', message: 'Password is required' });
  } else if (String(body.password).length > 128) {
    details.push({ field: 'password', message: 'Password must be at most 128 characters' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);
  return { email: email.value, password: String(body.password) };
}

function validateRating(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 5) {
    return { ok: false, error: 'Rating must be an integer between 1 and 5' };
  }
  return { ok: true, value: n };
}

function validatePositiveInt(value, field, { required = true, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === '') {
    if (required) return { ok: false, error: `${field} is required` };
    return { ok: true, value: null };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > max) {
    return { ok: false, error: `${field} must be a positive integer` };
  }
  return { ok: true, value: n };
}

function validateComment(comment) {
  if (comment == null || comment === '') return { ok: true, value: null };
  const value = String(comment).trim();
  if (value.length > 2000) return { ok: false, error: 'Comment must be at most 2000 characters' };
  return { ok: true, value };
}

function validateSearchQuery(query = {}) {
  const details = [];
  let q = query.q == null ? '' : String(query.q).trim();
  if (q.length > 200) details.push({ field: 'q', message: 'Search query must be at most 200 characters' });
  // Strip control chars
  q = q.replace(/[\u0000-\u001F\u007F]/g, '');

  let year = null;
  if (query.year != null && query.year !== '') {
    const y = Number(query.year);
    if (!Number.isInteger(y) || y < 1888 || y > 2100) {
      details.push({ field: 'year', message: 'Year must be between 1888 and 2100' });
    } else year = y;
  }

  let page = 1;
  if (query.page != null && query.page !== '') {
    const p = Number(query.page);
    if (!Number.isInteger(p) || p < 1 || p > 1000) {
      details.push({ field: 'page', message: 'Page must be an integer between 1 and 1000' });
    } else page = p;
  }

  const sort = { popularity: 'popularity', rating: 'rating_avg', year: 'release_year' }[query.sort] || 'popularity';
  let language = null;
  if (query.language) {
    language = String(query.language).trim().slice(0, 10);
    if (!/^[a-zA-Z-]{2,10}$/.test(language)) {
      details.push({ field: 'language', message: 'Invalid language code' });
    }
  }

  let genre = null;
  if (query.genre) {
    genre = String(query.genre).trim().slice(0, 50);
    if (!/^[\p{L}\p{N} \-&']{1,50}$/u.test(genre)) {
      details.push({ field: 'genre', message: 'Invalid genre' });
    }
  }

  if (details.length) throw new ValidationError('Validation failed', details);
  return { q: q || null, genre, year, language, sort, page };
}

function validateReviewBody(body = {}) {
  const details = [];
  const movieId = validatePositiveInt(body.movieId, 'movieId');
  if (!movieId.ok) details.push({ field: 'movieId', message: movieId.error });
  const rating = validateRating(body.rating);
  if (!rating.ok) details.push({ field: 'rating', message: rating.error });
  const comment = validateComment(body.comment);
  if (!comment.ok) details.push({ field: 'comment', message: comment.error });
  if (details.length) throw new ValidationError('Validation failed', details);
  return { movieId: movieId.value, rating: rating.value, comment: comment.value };
}

function validateWatchlistBody(body = {}) {
  const contentId = validatePositiveInt(body.contentId, 'contentId');
  if (!contentId.ok) throw new ValidationError('Validation failed', [{ field: 'contentId', message: contentId.error }]);
  return { contentId: contentId.value };
}

module.exports = {
  EMAIL_RE,
  PASSWORD_SPECIAL_RE,
  ValidationError,
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateFullName,
  validateRegisterBody,
  validateLoginBody,
  validateRating,
  validatePositiveInt,
  validateComment,
  validateSearchQuery,
  validateReviewBody,
  validateWatchlistBody,
};
