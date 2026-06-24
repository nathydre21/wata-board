/**
 * API Versioning Tests
 * Tests for API versioning functionality
 */

import { extractApiVersion, isVersionDeprecated, getLatestVersion, getVersionedPath, ApiVersion, VERSION_CONFIG } from '../utils/versioning';

describe('API Versioning Utility', () => {
  describe('extractApiVersion', () => {
    it('should extract version from URL path with v1', () => {
      const version = extractApiVersion('/api/v1/payment');
      expect(version).toBe('v1');
    });

    it('should extract version from URL path with v2', () => {
      const version = extractApiVersion('/api/v2/payment');
      expect(version).toBe('v2');
    });

    it('should use Accept-Version header when path has no version', () => {
      const version = extractApiVersion('/api/payment', 'v2');
      expect(version).toBe('v2');
    });

    it('should prioritize path version over header', () => {
      const version = extractApiVersion('/api/v1/payment', 'v2');
      expect(version).toBe('v1');
    });

    it('should return default version when no version specified', () => {
      const version = extractApiVersion('/api/payment');
      expect(version).toBe(VERSION_CONFIG.default);
    });

    it('should return default for invalid version in header', () => {
      const version = extractApiVersion('/api/payment', 'v99');
      expect(version).toBe(VERSION_CONFIG.default);
    });
  });

  describe('isVersionDeprecated', () => {
    it('should return false for v1 (not deprecated)', () => {
      expect(isVersionDeprecated(ApiVersion.V1)).toBe(false);
    });

    it('should return false for v2 (not deprecated)', () => {
      expect(isVersionDeprecated(ApiVersion.V2)).toBe(false);
    });
  });

  describe('getLatestVersion', () => {
    it('should return the latest supported version', () => {
      const latest = getLatestVersion();
      expect(latest).toBe(ApiVersion.V2);
    });
  });

  describe('getVersionedPath', () => {
    it('should format v1 path correctly', () => {
      const path = getVersionedPath(ApiVersion.V1, '/payment');
      expect(path).toBe('/api/v1/payment');
    });

    it('should format v2 path correctly', () => {
      const path = getVersionedPath(ApiVersion.V2, '/user/kyc');
      expect(path).toBe('/api/v2/user/kyc');
    });

    it('should handle paths without leading slash', () => {
      const path = getVersionedPath(ApiVersion.V1, 'payment');
      expect(path).toBe('/api/v1/payment');
    });
  });

  describe('VERSION_CONFIG', () => {
    it('should have v1 as default version', () => {
      expect(VERSION_CONFIG.default).toBe(ApiVersion.V1);
    });

    it('should support both v1 and v2', () => {
      expect(VERSION_CONFIG.supported).toContain(ApiVersion.V1);
      expect(VERSION_CONFIG.supported).toContain(ApiVersion.V2);
    });

    it('should have no deprecated versions yet', () => {
      expect(VERSION_CONFIG.deprecated.length).toBe(0);
    });
  });
});
