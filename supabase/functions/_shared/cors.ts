// Shared CORS headers for all Edge Functions
// SECURITY: Restrict to production domain only

export const ALLOWED_ORIGINS = [
  'https://app.billdora.com',
  'https://billdora.com',
  'https://app-billdora.vercel.app',
  'capacitor://localhost',  // iOS app
  'http://localhost:5173',  // Local dev
  'http://localhost:3000',  // Local dev alt
  'http://localhost',       // Capacitor/WebView
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowedVercelPreview = origin ? /^https:\/\/app-billdora-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/.test(origin) : false;
  const allowedOrigin = origin && (ALLOWED_ORIGINS.includes(origin) || isAllowedVercelPreview) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  return null;
}
