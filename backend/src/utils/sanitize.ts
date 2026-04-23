/**
 * Input Sanitization Utilities — Backend
 *
 * Centralised helpers for sanitising and validating all user-supplied
 * data before it is processed or stored.
 */

// ── String helpers ─────────────────────────────────────────

/** Remove leading/trailing whitespace and collapse internal runs of whitespace. */
export function sanitizeString(value: unknown, maxLength = 255): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

/** Strip every character that is not alphanumeric, hyphen, or underscore. */
export function sanitizeAlphanumeric(value: unknown, maxLength = 100): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, maxLength);
}

/** Validate and normalise a Stellar public key (G…, 56 chars). */
export function sanitizeWalletAddress(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^G[A-Z0-9]{55}$/.test(trimmed)) return '';
  return trimmed;
}

/** Validate a hex string of exactly `length` characters. */
export function sanitizeHex(value: unknown, length = 64): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const re = new RegExp(`^[a-fA-F0-9]{${length}}$`);
  if (!re.test(trimmed)) return '';
  return trimmed.toLowerCase();
}

/** Validate a semantic-version string (e.g. "1.2.3"). */
export function sanitizeVersion(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d+\.\d+\.\d+$/.test(trimmed)) return '';
  return trimmed;
}

/** Sanitise a free-text description — strip control characters, cap length. */
export function sanitizeDescription(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  // Remove control characters (except newline/tab)
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

// ── Numeric helpers ────────────────────────────────────────

/**
 * Parse and validate a positive finite number.
 * Returns NaN if the value is not a valid positive number.
 */
export function sanitizePositiveNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n;
}

/**
 * Parse and validate a non-negative integer within [min, max].
 * Returns NaN on failure.
 */
export function sanitizeInteger(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return NaN;
  return n;
}

// ── Currency helpers ───────────────────────────────────────

const SUPPORTED_CURRENCIES = new Set(['XLM', 'BTC', 'ETH', 'USDC', 'USDT']);

/** Validate a currency code against the supported list. */
export function sanitizeCurrency(value: unknown): string {
  if (typeof value !== 'string') return '';
  const upper = value.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(upper) ? upper : '';
}

// ── URL helpers ────────────────────────────────────────────

/** Validate that a value is a safe HTTP/HTTPS URL. */
export function sanitizeUrl(value: unknown, maxLength = 2048): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().slice(0, maxLength);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return trimmed;
  } catch {
    return '';
  }
}

// ── Object helpers ─────────────────────────────────────────

/**
 * Strip keys from an object that are not in the allowlist.
 * Prevents mass-assignment / prototype-pollution attacks.
 */
export function allowKeys<T extends object>(
  obj: unknown,
  allowed: (keyof T)[],
): Partial<T> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  const result: Partial<T> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      (result as any)[key] = (obj as any)[key];
    }
  }
  return result;
}

// ── Validation result ──────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validationError(field: string, message: string): ValidationError {
  return { field, message };
}
