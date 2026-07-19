/**
 * API Versioning Middleware
 * Adds version information to response headers and handles version routing
 */

import { Request, Response, NextFunction } from 'express';
import { extractApiVersion, isVersionDeprecated, getLatestVersion, getDeprecationWarning, ApiVersion } from '../utils/versioning';

// Extend Express Request to include API version
declare global {
  namespace Express {
    interface Request {
      apiVersion?: ApiVersion;
    }
  }
}

const VERSIONED_API_PATH_PATTERN = /^\/api\/v\d+\//;

/**
 * Returns true when the path is an unversioned /api/* route (legacy).
 */
function isLegacyApiPath(path: string): boolean {
  return path.startsWith('/api/') && !VERSIONED_API_PATH_PATTERN.test(path);
}

/**
 * Rewrites a legacy /api/* path to a versioned /api/{version}/* path.
 */
function rewriteLegacyApiPath(path: string, version: ApiVersion): string {
  if (!isLegacyApiPath(path)) {
    return path;
  }
  return `/api/${version}${path.slice(4)}`;
}

/**
 * Rewrites req.url for legacy API paths so downstream routers match versioned handlers.
 */
function rewriteRequestUrl(req: Request, version: ApiVersion): boolean {
  const [pathname, ...queryParts] = req.url.split('?');
  const rewritten = rewriteLegacyApiPath(pathname, version);
  if (rewritten === pathname) {
    return false;
  }
  const query = queryParts.length > 0 ? `?${queryParts.join('?')}` : '';
  req.url = `${rewritten}${query}`;
  return true;
}

/**
 * Middleware to extract and attach API version to request.
 * Legacy unversioned /api/* paths are rewritten to their versioned equivalents.
 */
export function versioningMiddleware(req: Request, res: Response, next: NextFunction) {
  const isLegacyRoute = isLegacyApiPath(req.path);
  const version = extractApiVersion(req.path, req.get('Accept-Version'));

  if (isLegacyRoute) {
    rewriteRequestUrl(req, version);
  }

  req.apiVersion = version;

  // Add version header to response
  res.setHeader('API-Version', version);
  res.setHeader('X-API-Version', version);

  // Warn clients using unversioned legacy paths
  if (isLegacyRoute) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Warning', `299 - "Unversioned API paths are deprecated. Use /api/${version}/... instead."`);
  }

  // Add deprecation warning if version is deprecated
  if (isVersionDeprecated(version)) {
    const latestVersion = getLatestVersion();
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString()); // 90 days
    res.setHeader('Warning', `299 - "${getDeprecationWarning(version, latestVersion)}"`);
  }

  // Add support information header
  res.setHeader('X-API-Supported-Versions', 'v1, v2');

  next();
}

/**
 * Middleware to handle version routing for unversioned endpoints.
 * Falls back to v1 behavior for backward compatibility.
 * @deprecated Use versioningMiddleware which includes legacy path rewriting.
 */
export function versionedRouter(req: Request, _res: Response, next: NextFunction) {
  if (!VERSIONED_API_PATH_PATTERN.test(req.path)) {
    req.apiVersion = ApiVersion.V1;
  }
  next();
}
