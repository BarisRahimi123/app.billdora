// Exchange Plaid public token for access token and store connection
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const PLAID_CLIENT_ID = '69640aa94ce2010021c692f4';
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') || 'fe920cd0eeaa862ba239bbadab07f8';
const PLAID_ENV = 'sandbox';

const PLAID_BASE_URL = PLAID_ENV === 'sandbox' 
  ? 'https://sandbox.plaid.com'
  : 'https://production.plaid.com';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { public_token, company_id, institution } = await req.json();

    if (!public_token || !company_id) {
      return new Response(
        JSON.stringify({ error: 'public_token and company_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange public token for access token
    const exchangeResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token
      })
    });

    const exchangeData = await exchangeResponse.json();

    if (exchangeData.error_code) {
      return new Response(
        JSON.stringify({ error: exchangeData.error_message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, item_id } = exchangeData;

    // Store the Plaid item
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: plaidItem, error: itemError } = await supabase
      .from('plaid_items')
      .insert({
        company_id,
        access_token,
        item_id,
        institution_id: institution?.institution_id,
        institution_name: institution?.name
      })
      .select()
      .single();

    if (itemError) {
      return new Response(
        JSON.stringify({ error: itemError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get accounts
    const accountsResponse = await fetch(`${PLAID_BASE_URL}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token
      })
    });

    const accountsData = await accountsResponse.json();

    if (accountsData.accounts) {
      const accountsToInsert = accountsData.accounts.map((acc: any) => ({
        plaid_item_id: plaidItem.id,
        company_id,
        account_id: acc.account_id,
        name: acc.name,
        official_name: acc.official_name,
        type: acc.type,
        subtype: acc.subtype,
        mask: acc.mask,
        current_balance: acc.balances?.current,
        available_balance: acc.balances?.available,
        iso_currency_code: acc.balances?.iso_currency_code || 'USD'
      }));

      await supabase.from('plaid_accounts').insert(accountsToInsert);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        item_id: plaidItem.id,
        institution_name: institution?.name,
        accounts_count: accountsData.accounts?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
