// APNs Push Notification Edge Function
// Uses token-based authentication with .p8 key

import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const APNS_KEY_ID = '86CGXH8X2C';
const APNS_TEAM_ID = '3N77XQVSNZ';
const BUNDLE_ID = 'com.billdora.app';

// SECURITY: Private key MUST be set via environment variable
const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY');
if (!APNS_PRIVATE_KEY) {
  console.error('[SECURITY] APNS_PRIVATE_KEY not set in environment variables');
}

// Use production APNs server
const APNS_HOST = 'api.push.apple.com';

interface PushPayload {
  device_token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Base64URL encode
function base64UrlEncode(data: Uint8Array | string): string {
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Create JWT for APNs authentication
async function createAPNsJWT(): Promise<string> {
  const header = {
    alg: 'ES256',
    kid: APNS_KEY_ID
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: APNS_TEAM_ID,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Import the private key
  const pemContents = APNS_PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  // Convert signature from DER to raw format for JWT
  const signatureArray = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(signatureArray);

  return `${signingInput}.${encodedSignature}`;
}

async function sendPushNotification(payload: PushPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const jwt = await createAPNsJWT();
    
    const apnsPayload = {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body
        },
        sound: 'default',
        badge: 1
      },
      ...payload.data
    };

    const response = await fetch(
      `https://${APNS_HOST}/3/device/${payload.device_token}`,
      {
        method: 'POST',
        headers: {
          'authorization': `bearer ${jwt}`,
          'apns-topic': BUNDLE_ID,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json'
        },
        body: JSON.stringify(apnsPayload)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('APNs error:', response.status, errorText);
      return { success: false, error: `APNs error: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Push notification error:', error);
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated) return unauthorizedResponse(corsHeaders, auth.error);

    const { device_tokens, companyId, userId, title, body, data } = await req.json();

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get device tokens - either from request or by looking up companyId/userId
    let tokens: string[] = device_tokens || [];
    
    if (tokens.length === 0 && (companyId || userId)) {
      // Look up device tokens from database
      let query = `${SUPABASE_URL}/rest/v1/device_tokens?select=device_token&platform=eq.ios`;
      if (companyId) query += `&company_id=eq.${companyId}`;
      if (userId) query += `&user_id=eq.${userId}`;
      
      const tokenRes = await fetch(query, {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      
      if (tokenRes.ok) {
        const tokenRecords = await tokenRes.json();
        tokens = tokenRecords.map((r: { device_token: string }) => r.device_token).filter(Boolean);
        console.log(`Found ${tokens.length} device tokens for company ${companyId || 'N/A'}`);
      }
    }

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No device tokens found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send to all device tokens
    const results = await Promise.all(
      tokens.map(token => 
        sendPushNotification({ device_token: token, title, body, data })
      )
    );

    const successCount = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success);

    console.log(`Push notification sent: ${successCount} success, ${failures.length} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        failed: failures.length,
        failures: failures.map(f => f.error)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Push notification error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
