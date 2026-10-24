const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEmail,
  validatePassword,
  validateRegisterBody,
  validateLoginBody,
  validateReviewBody,
  validateSearchQuery,
  ValidationError,
} = require('../shared/validators');

describe('email validation', () => {
  it('accepts normalized emails', () => {
    const r = validateEmail('  User@Example.COM ');
    assert.equal(r.ok, true);
    assert.equal(r.value, 'user@example.com');
  });

  it('rejects missing and malformed', () => {
    assert.equal(validateEmail('').ok, false);
    assert.equal(validateEmail('not-an-email').ok, false);
    assert.equal(validateEmail('a@b').ok, false);
  });
});

describe('password validation', () => {
  it('requires letter + digit and length ≥ 8', () => {
    assert.equal(validatePassword('short1').ok, false);
    assert.equal(validatePassword('onlyletters').ok, false);
    assert.equal(validatePassword('12345678').ok, false);
    assert.equal(validatePassword('ValidPass1').ok, true);
  });
});

describe('register / login bodies', () => {
  it('register succeeds with valid payload', () => {
    const r = validateRegisterBody({
      email: 'Ada@Streamix.io',
      password: 'Secret123',
      fullName: 'Ada Lovelace',
    });
    assert.equal(r.email, 'ada@streamix.io');
    assert.equal(r.fullName, 'Ada Lovelace');
  });

  it('register throws ValidationError with field details', () => {
    assert.throws(
      () => validateRegisterBody({ email: 'bad', password: 'x' }),
      (err) => err instanceof ValidationError && err.details.length >= 2
    );
  });

  it('login requires password presence only (no strength re-check)', () => {
    const r = validateLoginBody({ email: 'a@b.co', password: 'anything' });
    assert.equal(r.email, 'a@b.co');
  });
});

describe('reviews + search', () => {
  it('rating must be 1..5 integer', () => {
    assert.throws(() => validateReviewBody({ movieId: 1, rating: 6 }));
    assert.throws(() => validateReviewBody({ movieId: 1, rating: 3.5 }));
    const ok = validateReviewBody({ movieId: 42, rating: 5, comment: 'great' });
    assert.equal(ok.rating, 5);
  });

  it('search query bounds', () => {
    const r = validateSearchQuery({ q: 'matrix', page: '2', sort: 'rating' });
    assert.equal(r.page, 2);
    assert.equal(r.sort, 'rating_avg');
    assert.throws(() => validateSearchQuery({ year: 1200 }));
  });
});
