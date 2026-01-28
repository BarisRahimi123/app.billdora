function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || '*' : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const event = JSON.parse(body);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const eventType = event.type;
    const data = event.data.object;

    // Handle subscription events
    if (eventType === 'checkout.session.completed') {
      const userId = data.client_reference_id || data.metadata?.user_id;
      const subscriptionId = data.subscription;
      const customerId = data.customer;

      if (userId && subscriptionId) {
        // Get subscription details from Stripe
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` }
        });
        const subscription = await subResponse.json();

        const priceId = subscription.items?.data[0]?.price?.id;

        // Find plan by price_id
        const planResponse = await fetch(`${supabaseUrl}/rest/v1/primeledger_plans?stripe_price_id=eq.${priceId}&select=id`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          }
        });
        const plans = await planResponse.json();
        const planId = plans[0]?.id;

        // Insert subscription record
        await fetch(`${supabaseUrl}/rest/v1/primeledger_subscriptions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            user_id: userId,
            plan_id: planId,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            status: 'active',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
        });
      }
    }

    if (eventType === 'customer.subscription.updated') {
      const subscriptionId = data.id;
      const status = data.status;
      const cancelAtPeriodEnd = data.cancel_at_period_end;

      await fetch(`${supabaseUrl}/rest/v1/primeledger_subscriptions?stripe_subscription_id=eq.${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: status,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_start: new Date(data.current_period_start * 1000).toISOString(),
          current_period_end: new Date(data.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
      });
    }

    if (eventType === 'customer.subscription.deleted') {
      const subscriptionId = data.id;

      await fetch(`${supabaseUrl}/rest/v1/primeledger_subscriptions?stripe_subscription_id=eq.${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
      });
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
