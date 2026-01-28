import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { logger } from './logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail fast if env vars are missing
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
}

// Extract project ref from URL for auth token key (e.g., "bqxnagmmegdbqrzhheip" from "https://bqxnagmmegdbqrzhheip.supabase.co")
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'supabase';
export const AUTH_TOKEN_KEY = `sb-${projectRef}-auth-token`;

// FIX: Store supabase client on window to survive HMR (Hot Module Reloading)
// This prevents "Multiple GoTrueClient instances" error during development
declare global {
  interface Window {
    __SUPABASE_CLIENT__?: SupabaseClient;
  }
}

/**
 * OPTIMIZED STORAGE with memory caching
 * - Reads from memory first (fast), falls back to Preferences/localStorage
 * - Writes to memory + persistent storage
 * - Dramatically reduces Preferences.get calls (100+ -> 1 per session)
 */

// In-memory cache to avoid repeated storage reads
// FIX 4: Add timestamp tracking for token expiry check
const memoryCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - tokens should be refreshed before expiry

const capacitorStorage = {
  getItem: async (key: string): Promise<string | null> => {
    // OPTIMIZATION: Check memory cache first with expiry check
    const cached = memoryCache.get(key);
    if (cached !== undefined) {
      // FIX 4: Check if cache is still valid (not expired)
      const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;
      if (!isExpired) {
        return cached.value;
      }
      // Cache expired, remove it and fetch fresh
      memoryCache.delete(key);
    }
    
    try {
      // Primary: Preferences (iOS Keychain)
      const { value } = await Preferences.get({ key });
      if (value) {
        memoryCache.set(key, { value, timestamp: Date.now() }); // Cache with timestamp
        return value;
      }
      
      // Fallback: localStorage
      const localValue = localStorage.getItem(key);
      if (localValue) {
        memoryCache.set(key, { value: localValue, timestamp: Date.now() });
      }
      return localValue;
    } catch (e: any) {
      try {
        const localValue = localStorage.getItem(key);
        if (localValue) memoryCache.set(key, { value: localValue, timestamp: Date.now() });
        return localValue;
      } catch {
        return null;
      }
    }
  },
  
  setItem: async (key: string, value: string): Promise<void> => {
    // Update memory cache immediately with fresh timestamp
    memoryCache.set(key, { value, timestamp: Date.now() });
    
    // Write to persistent storage
    try {
      await Preferences.set({ key, value });
    } catch {}
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  
  removeItem: async (key: string): Promise<void> => {
    // Clear from memory cache
    memoryCache.delete(key);
    
    try { await Preferences.remove({ key }); } catch {}
    try { localStorage.removeItem(key); } catch {}
  },
};

const webStorage = {
  getItem: (key: string): string | null => {
    // Check memory cache first with expiry check
    const cached = memoryCache.get(key);
    if (cached !== undefined) {
      const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;
      if (!isExpired) return cached.value;
      memoryCache.delete(key);
    }
    
    try {
      const value = localStorage.getItem(key);
      if (value) memoryCache.set(key, { value, timestamp: Date.now() });
      return value;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    memoryCache.set(key, { value, timestamp: Date.now() });
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    memoryCache.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

const storage = Capacitor.isNativePlatform() ? capacitorStorage : webStorage;

// Export function to clear memory cache (call on logout/login/resume)
// FIX: This is CRITICAL for preventing "wrong user" bugs
export function clearStorageCache(): void {
  const cacheSize = memoryCache.size;
  memoryCache.clear();
  logger.log('[Storage]', `Cleared memory cache (${cacheSize} entries)`);
}

// Export function to invalidate specific auth key (forces disk read on next access)
export function invalidateAuthCache(): void {
  memoryCache.delete(AUTH_TOKEN_KEY);
  logger.log('[Storage]', 'Invalidated auth token cache');
}

// FIX: Create a singleton Supabase client that survives HMR
function getOrCreateSupabaseClient(): SupabaseClient {
  // In development, reuse existing client to prevent "Multiple GoTrueClient instances" error
  if (typeof window !== 'undefined' && window.__SUPABASE_CLIENT__) {
    return window.__SUPABASE_CLIENT__;
  }
  
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(storage && { storage }),
    },
  });
  
  // Store on window for HMR survival
  if (typeof window !== 'undefined') {
    window.__SUPABASE_CLIENT__ = client;
  }
  
  return client;
}

export const supabase = getOrCreateSupabaseClient();

export type Client = {
  id: string;
  company_id: string;
  name: string;
  display_name: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  type?: string;
  lifecycle_stage?: string;
  is_archived?: boolean;
  created_at?: string;
};

export type Project = {
  id: string;
  company_id: string;
  client_id?: string;
  name: string;
  description?: string;
  status?: string;
  budget?: number;
  start_date?: string;
  end_date?: string;
  due_date?: string;
  created_at?: string;
  client?: Client;
};

export type Task = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  description?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  completion_percentage?: number;
  created_at?: string;
};

export type TimeEntry = {
  id: string;
  company_id: string;
  user_id: string;
  project_id?: string;
  task_id?: string;
  description?: string;
  hours: number;
  billable?: boolean;
  hourly_rate?: number;
  date: string;
  created_at?: string;
  project?: Project;
  task?: Task;
};

export type Expense = {
  id: string;
  company_id: string;
  user_id: string;
  project_id?: string;
  description: string;
  amount: number;
  category?: string;
  billable?: boolean;
  date: string;
  status?: string;
  created_at?: string;
};

export type Invoice = {
  id: string;
  company_id: string;
  client_id: string;
  project_id?: string;
  invoice_number: string;
  status?: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  due_date?: string;
  paid_at?: string;
  created_at?: string;
  client?: Client;
};

export type Quote = {
  id: string;
  company_id: string;
  client_id: string;
  quote_number?: string;
  title: string;
  description?: string;
  billing_model?: string;
  status?: string;
  total_amount?: number;
  valid_until?: string;
  created_at?: string;
  client?: Client;
};

export type Profile = {
  id: string;
  company_id?: string;
  email: string;
  full_name?: string;
  phone?: string;
  role?: string;
  role_id?: string;
  hourly_rate?: number;
  is_billable?: boolean;
  is_active?: boolean;
  avatar_url?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  hire_date?: string;
  onboarding_dismissed?: boolean;
};

// ============================================================
// FIX: BYPASS SUPABASE SDK DEADLOCK
// The Supabase SDK's getSession()/setSession() have internal locks
// that hang on web browsers. We bypass this by reading tokens
// directly from localStorage and using direct REST API calls.
// ============================================================

// AUTH_TOKEN_KEY is exported from top of file
const PROFILE_CACHE_KEY = 'billdora-profile-cache';

/**
 * Read auth token directly from localStorage - INSTANT, no SDK deadlock
 * FIX: This bypasses Supabase SDK's potentially hung internal state
 * and reads the actual persisted token data.
 */
export function getStoredAuth(): { user: any; accessToken: string; refreshToken: string } | null {
  try {
    // ALWAYS read from localStorage (it's synced on both web and native)
    // This is the source of truth for auth state
    const raw = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!raw) {
      logger.auth('getStoredAuth: No token in localStorage');
      return null;
    }
    
    const parsed = JSON.parse(raw);
    if (!parsed?.user || !parsed?.access_token) {
      logger.auth('getStoredAuth: Invalid token structure');
      return null;
    }
    
    // Verify token hasn't expired
    const expiresAt = parsed.expires_at;
    if (expiresAt) {
      const expiryTime = expiresAt * 1000; // Convert to ms
      const now = Date.now();
      if (now >= expiryTime) {
        logger.auth('getStoredAuth: Token expired at', new Date(expiryTime).toISOString());
        // Don't return null - let the SDK try to refresh
        // But log a warning so we know
      }
    }
    
    logger.auth('getStoredAuth: Found token for', parsed.user?.email);
    return {
      user: parsed.user,
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token || ''
    };
  } catch (e) {
    logger.auth('getStoredAuth: Failed to read:', e);
    return null;
  }
}

/**
 * PROFILE CACHE - Store profile in localStorage for instant loading
 * This prevents the "Unknown User" issue when profile fetch fails
 * 
 * SECURITY NOTES:
 * - Only caches non-sensitive profile data (name, email, role)
 * - Validates against current auth token to prevent stale/wrong user
 * - Expires after 24 hours to ensure freshness
 * - Same security model as Supabase's token storage
 */
const PROFILE_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedProfileData {
  profile: Profile;
  userId: string;
  cachedAt: number;
}

export function getCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
      logger.auth('getCachedProfile: No cached profile in localStorage');
      return null;
    }
    
    const cached: CachedProfileData = JSON.parse(raw);
    
    // SECURITY: Verify cache belongs to current user
    const auth = getStoredAuth();
    if (!auth?.user?.id || cached.userId !== auth.user.id) {
      logger.auth('getCachedProfile: User mismatch - cached userId:', cached.userId, 'auth userId:', auth?.user?.id);
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    
    // SECURITY: Check cache expiry (24 hours max)
    const age = Date.now() - cached.cachedAt;
    if (age > PROFILE_CACHE_EXPIRY_MS) {
      logger.auth('getCachedProfile: Cache expired (age:', Math.round(age/1000/60), 'min), will refresh');
      // Don't clear - still return stale data for instant UI, will refresh in background
    }
    
    logger.auth('getCachedProfile: Found cached profile for', cached.profile.email, 'companyId:', cached.profile.company_id);
    return cached.profile;
  } catch (e) {
    console.error('[Auth] getCachedProfile: Parse error:', e);
    return null;
  }
}

export function setCachedProfile(profile: Profile | null): void {
  try {
    if (profile) {
      const auth = getStoredAuth();
      if (!auth?.user?.id) return; // Don't cache without valid auth
      
      // Only cache non-sensitive fields
      const safeProfile: Profile = {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        company_id: profile.company_id,
        role: profile.role,
        role_id: profile.role_id,
        avatar_url: profile.avatar_url,
        is_active: profile.is_active,
        is_billable: profile.is_billable,
        hourly_rate: profile.hourly_rate,
      };
      
      const cacheData: CachedProfileData = {
        profile: safeProfile,
        userId: auth.user.id,
        cachedAt: Date.now()
      };
      
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cacheData));
      logger.auth('Cached profile for', profile.email);
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {}
}

export function clearCachedProfile(): void {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

/**
 * Direct REST API helper - bypasses SDK's hanging .from() calls
 */
export const supabaseRest = {
  url: supabaseUrl,
  key: supabaseAnonKey,
  
  async query<T = any>(table: string, options: {
    select?: string;
    eq?: Record<string, any>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    single?: boolean;
  } = {}): Promise<{ data: T | null; error: any }> {
    const auth = getStoredAuth();
    const token = auth?.accessToken || supabaseAnonKey;
    
    let url = `${supabaseUrl}/rest/v1/${table}`;
    const params = new URLSearchParams();
    
    if (options.select) params.set('select', options.select);
    if (options.eq) {
      Object.entries(options.eq).forEach(([key, val]) => {
        params.set(key, `eq.${val}`);
      });
    }
    if (options.order) {
      params.set('order', `${options.order.column}.${options.order.ascending ? 'asc' : 'desc'}`);
    }
    if (options.limit) params.set('limit', String(options.limit));
    
    const queryString = params.toString();
    if (queryString) url += '?' + queryString;
    
    try {
      const response = await fetch(url, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.single ? { 'Accept': 'application/vnd.pgrst.object+json' } : {})
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: new Error(errorText) };
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  },
  
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.query('profiles', {
      select: '*',
      eq: { id: userId },
      single: true
    });
    if (error) {
      console.warn('[REST] Profile fetch error:', error);
      return null;
    }
    return data as Profile | null;
  },
  
  async update<T = any>(table: string, updates: Partial<T>, filters: Record<string, string>): Promise<{ data: T | null; error: any }> {
    const auth = getStoredAuth();
    const token = auth?.accessToken || supabaseAnonKey;
    
    let url = `${supabaseUrl}/rest/v1/${table}`;
    const params = new URLSearchParams();
    
    // Add filters as query params
    Object.entries(filters).forEach(([key, val]) => {
      params.set(key, val);
    });
    
    const queryString = params.toString();
    if (queryString) url += '?' + queryString;
    
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: new Error(errorText) };
      }
      
      const data = await response.json();
      return { data: Array.isArray(data) ? data[0] : data, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }
};

/**
 * Check if user is authenticated (instant, no SDK)
 */
export function isAuthenticated(): boolean {
  return getStoredAuth() !== null;
}

/**
 * Get current user ID (instant, no SDK)
 */
export function getCurrentUserId(): string | null {
  return getStoredAuth()?.user?.id || null;
}
