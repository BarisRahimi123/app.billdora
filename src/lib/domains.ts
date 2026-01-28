// Domain configuration for separating landing page and app
// Landing page: billdora.com
// App: app.billdora.com

export const DOMAINS = {
  LANDING: 'https://billdora.com',
  APP: 'https://app.billdora.com',
} as const;

// Check if we're in development mode
const isDev = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.includes('192.168.') ||
  window.location.hostname.includes('.space.minimax.io') // Test deployments
);

// Check if we're in a Capacitor native app
const isCapacitor = typeof window !== 'undefined' && (
  window.location.origin.includes('capacitor://') ||
  window.location.origin.includes('ionic://')
);

/**
 * Get the URL for the app domain
 * In development, returns relative path
 * In production, returns full app.billdora.com URL
 */
export function getAppUrl(path: string = ''): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // In development or Capacitor, use relative paths
  if (isDev || isCapacitor) {
    return normalizedPath;
  }
  
  return `${DOMAINS.APP}${normalizedPath}`;
}

/**
 * Get the URL for the landing page domain
 * In development, returns relative path
 * In production, returns full billdora.com URL
 */
export function getLandingUrl(path: string = ''): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // In development or Capacitor, use relative paths
  if (isDev || isCapacitor) {
    return normalizedPath;
  }
  
  return `${DOMAINS.LANDING}${normalizedPath}`;
}

/**
 * Check if current domain is the landing page domain
 */
export function isLandingDomain(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDev || isCapacitor) return true; // In dev, treat as unified
  return window.location.hostname === 'billdora.com' || window.location.hostname === 'www.billdora.com';
}

/**
 * Check if current domain is the app domain
 */
export function isAppDomain(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDev || isCapacitor) return true; // In dev, treat as unified
  return window.location.hostname === 'app.billdora.com';
}

/**
 * Routes that belong to the landing page (billdora.com)
 */
export const LANDING_ROUTES = ['/', '/terms', '/privacy'];

/**
 * Check if a route belongs to the landing page
 */
export function isLandingRoute(path: string): boolean {
  return LANDING_ROUTES.includes(path);
}
