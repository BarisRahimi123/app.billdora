// API utilities with retry logic and error handling
import { supabase, getStoredAuth, clearStorageCache } from './supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('jwt') ||
      message.includes('token') ||
      message.includes('unauthorized') ||
      message.includes('401') ||
      message.includes('session') ||
      message.includes('refresh_token') ||
      message.includes('invalid login') ||
      message.includes('user not found') ||
      message.includes('not authenticated') ||
      message.includes('auth') ||
      message.includes('permission denied') ||
      message.includes('row-level security') ||
      message.includes('rls') ||
      message.includes('no user')
    );
  }
  return false;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) return error.retryable;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check error name for AbortError (more reliable than message)
    const isAbortError = error.name === 'AbortError' || message.includes('abort');
    return (
      isAbortError ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch failed') ||
      message.includes('503') ||
      message.includes('429')
    );
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }
  return false;
}

// Wait for network to be available (critical for iOS resume)
async function waitForNetwork(maxWait = 5000): Promise<boolean> {
  if (navigator.onLine) return true;
  
  console.log('[API] Waiting for network...');
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('online', onOnline);
      resolve(navigator.onLine);
    }, maxWait);
    
    const onOnline = () => {
      clearTimeout(timeout);
      window.removeEventListener('online', onOnline);
      console.log('[API] Network restored');
      resolve(true);
    };
    
    window.addEventListener('online', onOnline);
  });
}

function getDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, config.maxDelay);
}

// Track if we're currently refreshing to prevent multiple simultaneous refreshes
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Track last successful session check
let lastSessionCheck = 0;
const SESSION_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds max

// Track consecutive API failures to detect stale sessions
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3; // After 3 failures, force full session re-validation

// Track if we need to force a full session validation (set after visibility change)
let forceFullValidation = false;

// Track if SDK is in a hung/corrupted state - skip SDK calls entirely
let sdkIsHung = false;
let sdkHungAt = 0;
const SDK_HUNG_RECOVERY_TIME = 60 * 1000; // Try again after 60 seconds

// Timeout for SDK calls to prevent hanging
const SDK_CALL_TIMEOUT = 15000; // 15 seconds (increased for slow networks)

/**
 * Helper to wrap SDK calls with timeout - returns null on timeout instead of throwing
 */
async function withSdkTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = SDK_CALL_TIMEOUT
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn('[API] SDK call timed out after', timeoutMs, 'ms');
      resolve(null);
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    // Check if this is an AbortError - indicates SDK is in corrupted state
    if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
      console.error('[API] SDK AbortError detected - marking SDK as hung');
      sdkIsHung = true;
      sdkHungAt = Date.now();
    }
    throw error;
  }
}

/**
 * Ensures a valid session exists before making API calls.
 * This is critical after screen lock/app resume on iOS.
 * Uses getUser() to validate against server, not just cached session.
 * 
 * FIX: Added timeout handling to prevent SDK hangs from blocking API calls.
 * When SDK is detected as hung, we skip SDK validation and use cached auth.
 */
export async function ensureValidSession(): Promise<boolean> {
  const now = Date.now();
  
  // FIX: Quick check using direct localStorage read (bypasses SDK deadlock)
  const storedAuth = getStoredAuth();
  if (!storedAuth) {
    console.log('[API] No stored auth - user not logged in');
    return false;
  }
  
  // FIX: If SDK is hung, skip SDK calls entirely and use cached auth
  // Try to recover after SDK_HUNG_RECOVERY_TIME
  if (sdkIsHung) {
    const hungDuration = now - sdkHungAt;
    if (hungDuration < SDK_HUNG_RECOVERY_TIME) {
      console.log('[API] SDK is hung, using cached auth (hung for', Math.round(hungDuration/1000), 's)');
      // FIX: Set the session on the Supabase client so API calls work
      try {
        await supabase.auth.setSession({
          access_token: storedAuth.accessToken,
          refresh_token: storedAuth.refreshToken
        });
        console.log('[API] Session restored from cached auth');
      } catch (e) {
        console.warn('[API] Failed to restore session from cache:', e);
      }
      return true;
    } else {
      console.log('[API] SDK recovery attempt after', Math.round(hungDuration/1000), 's');
      sdkIsHung = false; // Reset and try again
    }
  }
  
  // Force full validation if flagged (after visibility change) or after consecutive failures
  const needsFullValidation = forceFullValidation || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
  
  // Skip if we checked recently (avoid hammering auth) - unless forced
  if (!needsFullValidation && now - lastSessionCheck < SESSION_CHECK_INTERVAL) {
    return true;
  }
  
  // Clear the force flag
  if (forceFullValidation) {
    console.log('[API] Forcing full session validation after visibility change');
    forceFullValidation = false;
  }
  
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.log('[API] Forcing full session validation after', consecutiveFailures, 'consecutive failures');
  }
  
  try {
    // FIX: Use timeout wrapper to prevent SDK hangs
    const userResult = await withSdkTimeout(supabase.auth.getUser());
    
    // If timeout occurred, use cached auth
    if (userResult === null) {
      console.warn('[API] getUser timed out - using cached auth');
      sdkIsHung = true;
      sdkHungAt = now;
      return true; // Trust cached auth
    }
    
    const { data: { user }, error: userError } = userResult;
    
    if (userError || !user) {
      console.log('[API] getUser failed, attempting session recovery...', userError?.message);
      
      // Try to refresh the session with timeout
      const refreshed = await refreshSession();
      if (!refreshed) {
        console.warn('[API] Session recovery failed');
        return false;
      }
      
      // Verify refresh worked with timeout
      const refreshedResult = await withSdkTimeout(supabase.auth.getUser());
      if (refreshedResult === null) {
        console.warn('[API] getUser timed out after refresh - using cached auth');
        return true;
      }
      
      const { data: { user: refreshedUser } } = refreshedResult;
      if (!refreshedUser) {
        console.warn('[API] Still no user after refresh');
        return false;
      }
    }
    
    // FIX: Verify user ID matches what we have stored (catch "wrong user" bug)
    if (user && storedAuth.user?.id && user.id !== storedAuth.user.id) {
      console.error('[API] USER MISMATCH! SDK user:', user.email, 'Stored user:', storedAuth.user?.email);
      clearStorageCache();
      // Force a page reload to fix the inconsistent state
      window.location.reload();
      return false;
    }
    
    // FIX: Check session expiry with timeout
    const sessionResult = await withSdkTimeout(supabase.auth.getSession());
    if (sessionResult) {
      const { data: { session } } = sessionResult;
      if (session) {
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const isExpiringSoon = expiresAt > 0 && (expiresAt - now) < 5 * 60 * 1000;
        
        if (isExpiringSoon) {
          console.log('[API] Session expiring soon, refreshing...');
          await refreshSession();
        }
      }
    }
    
    lastSessionCheck = now;
    consecutiveFailures = 0; // Reset failure counter on successful validation
    sdkIsHung = false; // SDK is working, clear hung flag
    return true;
  } catch (error: any) {
    console.error('[API] Session check failed:', error?.message || error);
    
    // FIX: If AbortError, mark SDK as hung and use cached auth
    if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
      sdkIsHung = true;
      sdkHungAt = now;
      console.warn('[API] AbortError - SDK is hung, using cached auth');
      return true; // Trust cached auth
    }
    
    // Don't throw - let the API call proceed and fail naturally
    return false;
  }
}

// Export function to reset SDK hung state (call after successful login/logout)
export function resetSdkState(): void {
  sdkIsHung = false;
  sdkHungAt = 0;
  consecutiveFailures = 0;
  lastSessionCheck = 0;
  console.log('[API] SDK state reset');
}

async function refreshSession(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  
  // FIX: If SDK is hung, don't try to refresh - it will fail
  if (sdkIsHung) {
    console.log('[API] Skipping refresh - SDK is hung');
    return false;
  }
  
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      console.log('[API] Refreshing session...');
      // FIX: Use timeout wrapper
      const result = await withSdkTimeout(supabase.auth.refreshSession(), SDK_CALL_TIMEOUT);
      
      if (result === null) {
        console.warn('[API] Session refresh timed out');
        sdkIsHung = true;
        sdkHungAt = Date.now();
        return false;
      }
      
      const { data, error } = result;
      if (error) {
        console.warn('[API] Session refresh error:', error.message);
        return false;
      }
      if (data.session) {
        console.log('[API] Session refreshed successfully');
        lastSessionCheck = Date.now();
        sdkIsHung = false; // SDK working now
        return true;
      }
      return false;
    } catch (e: any) {
      console.error('[API] Session refresh exception:', e);
      // Check for AbortError
      if (e?.name === 'AbortError' || e?.message?.includes('abort')) {
        sdkIsHung = true;
        sdkHungAt = Date.now();
      }
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

// Reset session check timer (call this when app resumes)
export function resetSessionCheck(): void {
  lastSessionCheck = 0;
  forceFullValidation = true; // Force full validation on next API call
  console.log('[API] Session check reset - will force full validation on next API call');
}

// Track API failure (call this when an API call fails)
export function trackApiFailure(): void {
  consecutiveFailures++;
  console.log('[API] Consecutive failures:', consecutiveFailures);
}

// Reset API failure counter (call this when an API call succeeds)
export function resetApiFailures(): void {
  if (consecutiveFailures > 0) {
    console.log('[API] Resetting consecutive failures counter');
    consecutiveFailures = 0;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...defaultRetryConfig, ...config };
  let lastError: unknown;
  let hasTriedRefresh = false;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const result = await fn();
      // Success! Reset failure counter
      consecutiveFailures = 0;
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Track this failure
      consecutiveFailures++;
      
      // Log detailed error info for debugging
      console.warn(`[API] Attempt ${attempt + 1}/${cfg.maxRetries + 1} failed (total consecutive: ${consecutiveFailures}):`, {
        message: error?.message || 'No message',
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        status: error?.status
      });
      
      // On auth errors, try refreshing the session once
      if (!hasTriedRefresh && isAuthError(error)) {
        console.log('[API] Auth error detected, refreshing session...');
        hasTriedRefresh = true;
        const refreshed = await refreshSession();
        if (refreshed) {
          console.log('[API] Session refreshed, retrying...');
          continue; // Retry with new token
        }
        // If refresh failed, redirect to login
        console.warn('[API] Session refresh failed, redirecting to login');
        window.location.href = '/login';
        throw error;
      }
      
      if (attempt < cfg.maxRetries && isRetryableError(error)) {
        // For AbortError (iOS resume), wait longer for network to stabilize
        if (isAbortError(error)) {
          console.log('[API] AbortError detected - likely iOS resume. Waiting for network...');
          await waitForNetwork(5000);
          // Much longer delay after network is ready for iOS to fully stabilize
          const abortDelay = 2000 + (attempt * 1000); // 2s, 3s, 4s
          console.log(`[API] Waiting ${abortDelay}ms for iOS to stabilize...`);
          await new Promise(resolve => setTimeout(resolve, abortDelay));
        } else {
          const delay = getDelay(attempt, cfg);
          console.log(`[API] Retryable error, waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        continue;
      }
      
      throw error;
    }
  }

  throw lastError;
}

export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    // Clean up Supabase/Postgres errors
    const message = error.message;
    if (message.includes('row-level security')) {
      return 'You do not have permission to perform this action.';
    }
    if (message.includes('duplicate key')) {
      return 'This record already exists.';
    }
    if (message.includes('violates foreign key')) {
      return 'This record is linked to other data and cannot be modified.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error. Please check your connection and try again.';
    }
    return message;
  }
  return 'An unexpected error occurred. Please try again.';
}
