// Shared authentication helper for Edge Functions
// SECURITY: Verify JWT tokens before processing requests

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  authenticated: boolean;
  user?: { id: string; email?: string };
  error?: string;
}

/**
 * Verify the Authorization header and return user info
 * Use this at the start of every Edge Function that requires authentication
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    return { authenticated: false, error: 'Missing Authorization header' };
  }
  
  const token = authHeader.replace('Bearer ', '');
  if (!token || token === authHeader) {
    return { authenticated: false, error: 'Invalid Authorization format' };
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return { authenticated: false, error: error?.message || 'Invalid token' };
    }
    
    return { authenticated: true, user: { id: user.id, email: user.email } };
  } catch (e) {
    return { authenticated: false, error: 'Token verification failed' };
  }
}

/**
 * Helper to create unauthorized response
 */
export function unauthorizedResponse(corsHeaders: Record<string, string>, message = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED', message } }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
