/**
 * Input Sanitization Utilities — Frontend
 *
 * Client-side helpers that mirror the backend sanitisation layer.
 * These provide immediate feedback to users and reduce invalid
 * requests reaching the server.
 */

// ── String helpers ─────────────────────────────────────────

/** Trim and collapse whitespace; enforce a maximum length. */
export function sanitizeString(value: string, maxLength = 255): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

/**
 * Strip every character that is not alphanumeric, hyphen, or underscore.
 * Suitable for meter IDs, user IDs, and similar identifiers.
 */
export function sanitizeAlphanumeric(value: string, maxLength = 100): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, maxLength);
}

/** Validate a Stellar public key (G…, 56 chars). Returns '' on failure. */
export function sanitizeWalletAddress(value: string): string {
  const trimmed = value.trim();
  return /^G[A-Z0-9]{55}$/.test(trimmed) ? trimmed : '';
}

/** Sanitise free-text input — strip control characters, cap length. */
export function sanitizeText(value: string, maxLength = 500): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

// ── Numeric helpers ────────────────────────────────────────

/**
 * Parse a payment amount string.
 * Returns NaN if the value is not a valid positive finite number.
 */
export function sanitizeAmount(value: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  // Limit to 7 decimal places (Stellar precision)
  return Math.round(n * 1e7) / 1e7;
}

/** Parse a non-negative integer within [min, max]. Returns NaN on failure. */
export function sanitizeInteger(value: string, min = 0, max = 2_147_483_647): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return n;
}

// ── Validation helpers ─────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

/** Validate an email address with a simple RFC-5322-ish pattern. */
export function isValidEmail(value: string): boolean {
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(value.trim());
}

/** Validate a meter ID — alphanumeric, hyphens, underscores, 3-50 chars. */
export function isValidMeterId(value: string): boolean {
  const sanitized = sanitizeAlphanumeric(value, 50);
  return sanitized.length >= 3 && sanitized === value.trim();
}

/** Validate a payment amount string. */
export function isValidAmount(value: string): boolean {
  return !Number.isNaN(sanitizeAmount(value));
}

/**
 * Validate a search query — allow printable ASCII / Unicode letters,
 * digits, spaces, and common punctuation; reject control characters.
 */
export function sanitizeSearchQuery(value: string, maxLength = 200): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/** Sanitise a date string — accept only ISO 8601 date format (YYYY-MM-DD). */
export function sanitizeDate(value: string): string {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
