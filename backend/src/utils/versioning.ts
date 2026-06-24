/**
 * API Versioning Utility
 * Handles API version management and backward compatibility
 */

export enum ApiVersion {
  V1 = 'v1',
  V2 = 'v2',
}

export interface VersionConfig {
  default: ApiVersion;
  supported: ApiVersion[];
  deprecated: ApiVersion[];
}

export const VERSION_CONFIG: VersionConfig = {
  default: ApiVersion.V1,
  supported: [ApiVersion.V1, ApiVersion.V2],
  deprecated: [],
};

/**
 * Extract API version from request path or header
 * Priority: path > Accept-Version header > default version
 */
export function extractApiVersion(path: string, acceptVersionHeader?: string): ApiVersion {
  // Check path for version (e.g., /api/v1/... or /api/v2/...)
  const pathMatch = path.match(/\/api\/(v\d+)\//);
  if (pathMatch) {
    const version = pathMatch[1] as ApiVersion;
    if (VERSION_CONFIG.supported.includes(version)) {
      return version;
    }
  }

  // Check Accept-Version header
  if (acceptVersionHeader) {
    const headerVersion = acceptVersionHeader.trim() as ApiVersion;
    if (VERSION_CONFIG.supported.includes(headerVersion)) {
      return headerVersion;
    }
  }

  return VERSION_CONFIG.default;
}

/**
 * Check if a version is deprecated
 */
export function isVersionDeprecated(version: ApiVersion): boolean {
  return VERSION_CONFIG.deprecated.includes(version);
}

/**
 * Get the latest supported version
 */
export function getLatestVersion(): ApiVersion {
  return VERSION_CONFIG.supported[VERSION_CONFIG.supported.length - 1];
}

/**
 * Format versioned path
 */
export function getVersionedPath(version: ApiVersion, endpoint: string): string {
  return `/api/${version}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
}

/**
 * Generate deprecation warning message
 */
export function getDeprecationWarning(currentVersion: ApiVersion, latestVersion: ApiVersion): string {
  return `API version ${currentVersion} is deprecated. Please upgrade to ${latestVersion}.`;
}
