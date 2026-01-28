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

    const { price_id, user_id, success_url, cancel_url } = await req.json();

    if (!price_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'price_id and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Stripe checkout session with 14-day trial
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', price_id);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', success_url || 'https://billdora.com/dashboard?subscription=success');
    params.append('cancel_url', cancel_url || 'https://billdora.com/pricing?subscription=cancelled');
    params.append('client_reference_id', user_id);
    params.append('subscription_data[metadata][user_id]', user_id);
    params.append('subscription_data[trial_period_days]', '14');

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await response.json();

    if (session.error) {
      return new Response(
        JSON.stringify({ error: session.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
