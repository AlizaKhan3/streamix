const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEmail,
  validatePassword,
  validateFullName,
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

  it('rejects missing, malformed, and toy addresses', () => {
    assert.equal(validateEmail('').ok, false);
    assert.equal(validateEmail('not-an-email').ok, false);
    assert.equal(validateEmail('a@b').ok, false);
    assert.equal(validateEmail('a@a.com').ok, false);
    assert.equal(validateEmail('ab@a.com').ok, false);
    assert.equal(validateEmail('a@ab.com').ok, false);
    assert.equal(validateEmail('me@streamix.io').ok, true);
  });
});

describe('password validation', () => {
  it('requires upper, lower, digit, special, length ≥ 8', () => {
    assert.equal(validatePassword('short1!').ok, false);
    assert.equal(validatePassword('onlyletters').ok, false);
    assert.equal(validatePassword('12345678').ok, false);
    assert.equal(validatePassword('ValidPass1').ok, false); // no special
    assert.equal(validatePassword('validpass1!').ok, false); // no upper
    assert.equal(validatePassword('VALIDPASS1!').ok, false); // no lower
    assert.equal(validatePassword('ValidPass!').ok, false); // no digit
    assert.equal(validatePassword('ValidPass1!').ok, true);
  });
});

describe('full name', () => {
  it('requires at least 2 letters when required', () => {
    assert.equal(validateFullName('A', { required: true }).ok, false);
    assert.equal(validateFullName('Al', { required: true }).ok, true);
    assert.equal(validateFullName('', { required: true }).ok, false);
  });
});

describe('register / login bodies', () => {
  it('register succeeds with valid payload', () => {
    const r = validateRegisterBody({
      email: 'Ada@Streamix.io',
      password: 'Secret123!',
      fullName: 'Ada Lovelace',
    });
    assert.equal(r.email, 'ada@streamix.io');
    assert.equal(r.fullName, 'Ada Lovelace');
  });

  it('register throws ValidationError with field details', () => {
    assert.throws(
      () => validateRegisterBody({ email: 'bad', password: 'x', fullName: 'A' }),
      (err) => err instanceof ValidationError && err.details.length >= 2
    );
  });

  it('login requires password presence only (no strength re-check)', () => {
    const r = validateLoginBody({ email: 'user@streamix.io', password: 'anything' });
    assert.equal(r.email, 'user@streamix.io');
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
