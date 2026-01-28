import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify authentication
    const auth = await verifyAuth(req);
    if (!auth.authenticated) {
      return unauthorizedResponse(corsHeaders, auth.error);
    }

    const { action, company_id } = await req.json();
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    // Action: get_oauth_link - Create Connect account and onboarding link
    if (action === 'get_oauth_link') {
      const reqOrigin = req.headers.get('origin') || 'https://k6gylq35dbtl.space.minimax.io';
      
      // Check if company already has a Stripe account
      const settingsResp = await fetch(
        `${supabaseUrl}/rest/v1/company_settings?company_id=eq.${company_id}&select=stripe_account_id`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey!,
          }
        }
      );
      const settingsData = await settingsResp.json();
      let stripeAccountId = settingsData?.[0]?.stripe_account_id;

      // Create a new Connect account if none exists
      if (!stripeAccountId) {
        const createAccountResp = await fetch('https://api.stripe.com/v1/accounts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            'type': 'express',
            'capabilities[card_payments][requested]': 'true',
            'capabilities[transfers][requested]': 'true',
          }).toString()
        });

        if (!createAccountResp.ok) {
          const err = await createAccountResp.text();
          console.error('Create account error:', err);
          throw new Error('Failed to create Stripe Connect account: ' + err);
        }

        const accountData = await createAccountResp.json();
        stripeAccountId = accountData.id;

        // Save the account ID to company_settings
        const updateResp = await fetch(
          `${supabaseUrl}/rest/v1/company_settings?company_id=eq.${company_id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ stripe_account_id: stripeAccountId })
          }
        );

        if (!updateResp.ok) {
          // Try insert if no record exists
          await fetch(`${supabaseUrl}/rest/v1/company_settings`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ company_id, stripe_account_id: stripeAccountId })
          });
        }
      }

      // Create Account Link for onboarding
      const accountLinkResp = await fetch('https://api.stripe.com/v1/account_links', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'account': stripeAccountId,
          'refresh_url': `${reqOrigin}/settings?tab=integrations&stripe_refresh=true`,
          'return_url': `${reqOrigin}/settings?tab=integrations&stripe_connected=true`,
          'type': 'account_onboarding',
        }).toString()
      });

      if (!accountLinkResp.ok) {
        const err = await accountLinkResp.text();
        console.error('Account link error:', err);
        throw new Error('Failed to create onboarding link');
      }

      const linkData = await accountLinkResp.json();

      return new Response(JSON.stringify({ data: { url: linkData.url } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Action: disconnect - Remove Stripe account
    if (action === 'disconnect') {
      await fetch(
        `${supabaseUrl}/rest/v1/company_settings?company_id=eq.${company_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ stripe_account_id: null })
        }
      );

      return new Response(JSON.stringify({ data: { success: true } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Stripe Connect error:', error);
    return new Response(JSON.stringify({ 
      error: { message: error.message } 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
