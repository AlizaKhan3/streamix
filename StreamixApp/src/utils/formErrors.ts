/** Format axios / API validation errors for alerts and inline field hints. */

export type FieldError = { field?: string; message?: string };

export function formatApiError(
  err: any,
  fallback = 'Something went wrong. Please try again.'
): string {
  const data = err?.response?.data;
  const details: FieldError[] = Array.isArray(data?.details) ? data.details : [];
  if (details.length) {
    return details
      .map((d) => {
        const label = d.field ? `${prettyField(d.field)}: ` : '';
        return `${label}${d.message || 'Invalid value'}`;
      })
      .join('\n');
  }
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof err?.message === 'string' && err.message && !err.message.startsWith('Request failed')) {
    return err.message;
  }
  return fallback;
}

/** Map API field → message for inline Text under inputs. */
export function fieldErrorsFromApi(err: any): Record<string, string> {
  const details: FieldError[] = Array.isArray(err?.response?.data?.details)
    ? err.response.data.details
    : [];
  const out: Record<string, string> = {};
  for (const d of details) {
    if (d.field && d.message) out[d.field] = d.message;
  }
  return out;
}

function prettyField(field: string) {
  switch (field) {
    case 'email':
      return 'Email';
    case 'password':
      return 'Password';
    case 'fullName':
      return 'Full name';
    default:
      return field;
  }
}

/** Client-side rules mirroring backend/shared/validators.js */
const EMAIL_RE =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

function isStrictEmail(value: string) {
  if (!EMAIL_RE.test(value)) return false;
  const at = value.lastIndexOf('@');
  if (at < 2) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length < 2) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;
  for (const label of labels) {
    if (label.length < 2) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  return true;
}

export function validateRegisterLocal(fullName: string, email: string, password: string) {
  const errors: Record<string, string> = {};
  const name = fullName.trim();
  if (!name) errors.fullName = 'Full name is required (at least 2 letters)';
  else if (name.length < 2) errors.fullName = 'Full name must be at least 2 characters';
  else if ((name.match(/\p{L}/gu) || []).length < 2) {
    errors.fullName = 'Full name must contain at least 2 letters';
  } else if (name.length > 100) errors.fullName = 'Full name must be at most 100 characters';

  const em = email.trim().toLowerCase();
  if (!em) errors.email = 'Email is required';
  else if (!isStrictEmail(em)) {
    errors.email = 'Enter a valid email like name@example.com (not a@a.com)';
  }

  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/[a-z]/.test(password)) errors.password = 'Password must include a lowercase letter';
  else if (!/[A-Z]/.test(password)) errors.password = 'Password must include an uppercase letter';
  else if (!/\d/.test(password)) errors.password = 'Password must include a number';
  else if (!PASSWORD_SPECIAL_RE.test(password)) {
    errors.password = 'Password must include a special character (!@#$%^&* etc.)';
  }
  return errors;
}

export function validateLoginLocal(email: string, password: string) {
  const errors: Record<string, string> = {};
  const em = email.trim().toLowerCase();
  if (!em) errors.email = 'Email is required';
  else if (!isStrictEmail(em)) {
    errors.email = 'Enter a valid email like name@example.com';
  }
  if (!password) errors.password = 'Password is required';
  return errors;
}
