import { sanitizeMeterId, sanitizeAlphanumeric, sanitizePositiveNumber, sanitizeCurrency } from '../utils/sanitize';

describe('sanitizeMeterId', () => {
  it('should return a valid meter ID unchanged', () => {
    expect(sanitizeMeterId('METER-001')).toBe('METER-001');
    expect(sanitizeMeterId('meter_001')).toBe('meter_001');
    expect(sanitizeMeterId('UTILITY-ABC-123')).toBe('UTILITY-ABC-123');
    expect(sanitizeMeterId('MTR-123')).toBe('MTR-123');
  });

  it('should accept minimum and maximum length meter IDs', () => {
    expect(sanitizeMeterId('abc')).toBe('abc');
    expect(sanitizeMeterId('a'.repeat(50))).toBe('a'.repeat(50));
  });

  it('should strip SQL injection payloads', () => {
    expect(sanitizeMeterId("'; DROP TABLE payments; --")).toBe('');
    expect(sanitizeMeterId("METER-001'; DELETE FROM users; --")).toBe('METERR-001DELETE-FROM-users');
    expect(sanitizeMeterId("' OR '1'='1")).toBe('');
    expect(sanitizeMeterId("'; EXEC xp_cmdshell('dir'); --")).toBe('');
  });

  it('should strip script injection payloads', () => {
    expect(sanitizeMeterId('<script>alert("XSS")</script>')).toBe('scriptalertXSSscript');
    expect(sanitizeMeterId('javascript:alert(document.cookie)')).toBe('javascriptalertdocumentcookie');
    expect(sanitizeMeterId('"><script>fetch("/api/keys")</script>')).toBe('scriptfetchapikeysscript');
  });

  it('should strip special characters', () => {
    expect(sanitizeMeterId('METER-001; DROP TABLE users;')).toBe('METERR-001-DROP-TABLE-users');
    expect(sanitizeMeterId('..\\..\\..\\etc\\passwd')).toBe('etcpasswd');
    expect(sanitizeMeterId('METER-001|cat /etc/hosts')).toBe('METERR-001cat-etchosts');
    expect(sanitizeMeterId('METER-001`whoami`')).toBe('METERR-001whoami');
    expect(sanitizeMeterId('METER-001$(cat /etc/passwd)')).toBe('METERR-001cat-etcpasswd');
    expect(sanitizeMeterId('METER-001&echo injected')).toBe('METERR-001echo-injected');
    expect(sanitizeMeterId('!@#$%^&*()')).toBe('');
  });

  it('should reject strings that are too short or too long even after sanitization', () => {
    expect(sanitizeMeterId('ab')).toBe('');
    expect(sanitizeMeterId('a')).toBe('');
    expect(sanitizeMeterId('')).toBe('');
    expect(sanitizeMeterId('a'.repeat(51))).toBe('');
    expect(sanitizeMeterId('   ')).toBe('');
  });

  it('should strip whitespace-only inputs', () => {
    expect(sanitizeMeterId('   ')).toBe('');
    expect(sanitizeMeterId('\t\n')).toBe('');
  });

  it('should trim but not reject valid meter IDs with surrounding whitespace', () => {
    const result = sanitizeMeterId('  METER-001  ');
    expect(result).toBe('METERR-001');
  });

  it('should accept hyphens and underscores as only special characters', () => {
    expect(sanitizeMeterId('METER_001-ABC')).toBe('METER_001-ABC');
    expect(sanitizeMeterId('___')).toBe('___');
    expect(sanitizeMeterId('---')).toBe('---');
  });
});

describe('sanitizeAlphanumeric', () => {
  it('should strip special characters', () => {
    expect(sanitizeAlphanumeric("'; DROP TABLE users; --")).toBe('DROP-TABLE-users');
  });

  it('should respect max length', () => {
    expect(sanitizeAlphanumeric('abcdefghij', 5)).toBe('abcde');
  });

  it('should keep hyphens and underscores', () => {
    expect(sanitizeAlphanumeric('METER-001_ABC')).toBe('METER-001_ABC');
  });
});

describe('sanitizePositiveNumber', () => {
  it('should return NaN for non-numeric values', () => {
    expect(Number.isNaN(sanitizePositiveNumber('abc'))).toBe(true);
  });

  it('should return the number for valid positive numbers', () => {
    expect(sanitizePositiveNumber(100)).toBe(100);
    expect(sanitizePositiveNumber('50')).toBe(50);
  });

  it('should return NaN for negative values', () => {
    expect(Number.isNaN(sanitizePositiveNumber(-10))).toBe(true);
  });
});

describe('sanitizeCurrency', () => {
  it('should return valid currency codes', () => {
    expect(sanitizeCurrency('USD')).toBe('USD');
    expect(sanitizeCurrency('EUR')).toBe('EUR');
  });

  it('should return empty string for invalid codes', () => {
    expect(sanitizeCurrency('xyz')).toBe('');
    expect(sanitizeCurrency('')).toBe('');
  });
});
