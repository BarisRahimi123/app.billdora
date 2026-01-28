// Create Plaid Link token for bank connection
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID') || '';
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') || '';
if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('[SECURITY] PLAID_CLIENT_ID or PLAID_SECRET not set in environment variables');
}
const PLAID_ENV = 'sandbox'; // Change to 'production' for live

const PLAID_BASE_URL = PLAID_ENV === 'sandbox' 
  ? 'https://sandbox.plaid.com'
  : 'https://production.plaid.com';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return unauthorizedResponse(corsHeaders, auth.error);
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Link token
    const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        user: { client_user_id: user_id },
        client_name: 'Billdora',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en'
      })
    });

    const data = await response.json();

    if (data.error_code) {
      return new Response(
        JSON.stringify({ error: data.error_message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ link_token: data.link_token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
