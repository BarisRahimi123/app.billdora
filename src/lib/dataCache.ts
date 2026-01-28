/**
 * Data Cache Service
 * 
 * Industry-standard approach for instant page loads:
 * 1. Store last fetched data in persistent storage
 * 2. On page load, immediately render cached data
 * 3. Fetch fresh data in background
 * 4. Update UI when fresh data arrives
 * 
 * This eliminates loading spinners on page navigation after app resume.
 * 
 * IMPORTANT: If @capacitor/preferences returns UNIMPLEMENTED (plugin not linked),
 * we gracefully fallback to localStorage which always works in WebView.
 */

import { Capacitor } from '@capacitor/core';

// In-memory cache for instant access (faster than async storage)
const memoryCache: Map<string, { data: any; timestamp: number }> = new Map();

// Cache TTL - data older than this is considered stale but still usable
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Maximum size for persistent storage (iOS limit is ~4MB total, we use 500KB per key max)
const MAX_CACHE_SIZE_BYTES = 500 * 1024; // 500KB per cache key

// Track if Preferences plugin is working (so we don't keep trying if broken)
let preferencesAvailable: boolean | null = null;

/**
 * Check if Capacitor Preferences plugin is available and working
 */
async function isPreferencesAvailable(): Promise<boolean> {
  if (preferencesAvailable !== null) return preferencesAvailable;
  
  if (!Capacitor.isNativePlatform()) {
    preferencesAvailable = false;
    return false;
  }
  
  try {
    const { Preferences } = await import('@capacitor/preferences');
    // Test if the plugin actually works by doing a simple get
    await Preferences.get({ key: '_test_availability' });
    preferencesAvailable = true;
    return true;
  } catch (e: any) {
    // UNIMPLEMENTED means plugin isn't linked properly
    if (e?.code === 'UNIMPLEMENTED') {
      console.warn('[Cache] Capacitor Preferences plugin not available, using localStorage fallback');
      preferencesAvailable = false;
    }
    return false;
  }
}

/**
 * Get cached data (memory first, then persistent storage)
 * Falls back to localStorage if Capacitor Preferences is unavailable
 */
export async function getCachedData<T>(key: string): Promise<{ data: T | null; isStale: boolean }> {
  // Try memory cache first (instant)
  const memCached = memoryCache.get(key);
  if (memCached) {
    const isStale = Date.now() - memCached.timestamp > CACHE_TTL;
    return { data: memCached.data as T, isStale };
  }

  // Try persistent storage (for after WebView restart)
  try {
    // Check if Capacitor Preferences is available
    const canUsePreferences = await isPreferencesAvailable();
    
    if (canUsePreferences) {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: `cache_${key}` });
        if (value) {
          const parsed = JSON.parse(value);
          const isStale = Date.now() - parsed.timestamp > CACHE_TTL;
          // Restore to memory cache
          memoryCache.set(key, parsed);
          return { data: parsed.data as T, isStale };
        }
      } catch (e: any) {
        // If Preferences fails at runtime, mark it unavailable and try localStorage
        if (e?.code === 'UNIMPLEMENTED') {
          preferencesAvailable = false;
        }
      }
    }
    
    // Always try localStorage as fallback (works in WebView even on iOS)
    const value = localStorage.getItem(`cache_${key}`);
    if (value) {
      const parsed = JSON.parse(value);
      const isStale = Date.now() - parsed.timestamp > CACHE_TTL;
      memoryCache.set(key, parsed);
      return { data: parsed.data as T, isStale };
    }
  } catch (e) {
    // Silent fail - cache miss is not critical
  }

  return { data: null, isStale: true };
}

/**
 * Set cached data (memory + persistent storage)
 * Will skip persistent storage if data is too large to prevent iOS crashes
 * Falls back to localStorage if Capacitor Preferences is unavailable
 */
export async function setCachedData<T>(key: string, data: T): Promise<void> {
  const cacheEntry = { data, timestamp: Date.now() };
  
  // Always update memory cache (instant, no size limit for memory)
  memoryCache.set(key, cacheEntry);

  // Check size before persisting to storage
  try {
    const serialized = JSON.stringify(cacheEntry);
    const sizeBytes = new Blob([serialized]).size;
    
    // Skip persistent storage if data is too large (prevents iOS crash)
    if (sizeBytes > MAX_CACHE_SIZE_BYTES) {
      console.log(`[Cache] Skipping persist for "${key}" - too large (${(sizeBytes / 1024).toFixed(0)}KB > ${MAX_CACHE_SIZE_BYTES / 1024}KB limit)`);
      return;
    }
    
    const canUsePreferences = await isPreferencesAvailable();
    
    if (canUsePreferences) {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({ key: `cache_${key}`, value: serialized });
        return; // Success with Preferences
      } catch (e: any) {
        // If Preferences fails, mark it unavailable and fall through to localStorage
        if (e?.code === 'UNIMPLEMENTED') {
          preferencesAvailable = false;
        }
      }
    }
    
    // Use localStorage as fallback (always works in WebView)
    try {
      localStorage.setItem(`cache_${key}`, serialized);
    } catch (e) {
      // localStorage might fail if quota exceeded, but that's ok
    }
  } catch (e) {
    // Silent fail - caching is not critical
  }
}

/**
 * Clear specific cache key
 */
export async function clearCachedData(key: string): Promise<void> {
  memoryCache.delete(key);
  
  // Try Preferences first, then localStorage
  const canUsePreferences = await isPreferencesAvailable();
  
  if (canUsePreferences) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: `cache_${key}` });
    } catch (e) {
      // Silent fail
    }
  }
  
  // Always try localStorage too (might have data from before Preferences was available)
  try {
    localStorage.removeItem(`cache_${key}`);
  } catch (e) {
    // Silent fail
  }
}

/**
 * Clear ALL cached data (useful for logout or corrupted state recovery)
 */
export async function clearAllCache(): Promise<void> {
  console.log('[Cache] Clearing all cached data...');
  memoryCache.clear();
  
  const keysToRemove = [
    'cache_sales_quotes',
    'cache_sales_leads', 
    'cache_sales_clients',
    'cache_dashboard_stats',
    'cache_dashboard_projects',
    'cache_projects_list',
    'cache_notifications_list',
  ];
  
  // Try Preferences if available
  const canUsePreferences = await isPreferencesAvailable();
  if (canUsePreferences) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      for (const key of Object.values(CACHE_KEYS)) {
        await Preferences.remove({ key: `cache_${key}` }).catch(() => {});
      }
      for (const key of keysToRemove) {
        await Preferences.remove({ key }).catch(() => {});
      }
    } catch (e) {
      // Silent fail
    }
  }
  
  // Always clear localStorage too
  try {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('cache_'));
    allKeys.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    // Silent fail
  }
  
  console.log('[Cache] All cache cleared successfully');
}

/**
 * Cache keys for main pages
 */
export const CACHE_KEYS = {
  DASHBOARD_STATS: 'dashboard_stats',
  DASHBOARD_PROJECTS: 'dashboard_projects',
  SALES_LEADS: 'sales_leads',
  SALES_CLIENTS: 'sales_clients',
  SALES_QUOTES: 'sales_quotes', // Note: This may be skipped if too large
  PROJECTS_LIST: 'projects_list',
  NOTIFICATIONS_LIST: 'notifications_list',
} as const;
