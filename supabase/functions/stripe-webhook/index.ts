// Stripe Webhook Handler with Signature Verification

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    const signature = req.headers.get('stripe-signature');
    const body = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      const isValid = await verifyStripeSignature(body, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const event = JSON.parse(body);
    console.log('Webhook event received:', event.type);

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const invoiceId = session.metadata?.invoice_id;
      const userId = session.metadata?.user_id;

      // Handle invoice payment
      if (invoiceId) {
        console.log('Updating invoice status:', invoiceId);
        
        const updateResponse = await fetch(
          `${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              status: 'paid',
              paid_at: new Date().toISOString(),
              payment_method: 'stripe',
              amount_paid: session.amount_total ? session.amount_total / 100 : null
            })
          }
        );

        if (!updateResponse.ok) {
          console.error('Failed to update invoice:', await updateResponse.text());
        } else {
          console.log('Invoice marked as paid:', invoiceId);
        }
      }

      // Handle subscription checkout
      if (session.mode === 'subscription' && userId && session.subscription) {
        console.log('Processing subscription checkout for user:', userId);
        
        // Get subscription details from Stripe
        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
        const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
          headers: { 'Authorization': `Bearer ${stripeSecretKey}` }
        });
        const subscription = await subResponse.json();

        // Find plan by price ID
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const planRes = await fetch(
          `${supabaseUrl}/rest/v1/billdora_plans?stripe_price_id=eq.${priceId}&select=id`,
          {
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!
            }
          }
        );
        const plans = await planRes.json();
        const planId = plans?.[0]?.id;

        // Create or update subscription record
        const subscriptionData = {
          user_id: userId,
          plan_id: planId,
          stripe_subscription_id: session.subscription,
          stripe_customer_id: session.customer,
          status: subscription.status || 'active',
          current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
          current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: subscription.cancel_at_period_end || false,
        };

        // Upsert subscription
        const upsertRes = await fetch(
          `${supabaseUrl}/rest/v1/billdora_subscriptions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(subscriptionData)
          }
        );

        if (!upsertRes.ok) {
          console.error('Failed to create subscription:', await upsertRes.text());
        } else {
          console.log('Subscription created for user:', userId);
        }
      }
    }

    // Handle subscription updates (renewal, cancellation, etc.)
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      console.log('Subscription update event:', event.type, subscription.id);

      const updateData: Record<string, any> = {
        status: subscription.status,
        current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
        current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
      };

      if (event.type === 'customer.subscription.deleted') {
        updateData.status = 'canceled';
      }

      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/billdora_subscriptions?stripe_subscription_id=eq.${subscription.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        }
      );

      if (!updateRes.ok) {
        console.error('Failed to update subscription:', await updateRes.text());
      } else {
        console.log('Subscription updated:', subscription.id);
      }
    }

    // Handle successful invoice payment (for renewals)
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
        console.log('Subscription renewed:', invoice.subscription);
        
        // Update period dates
        const updateRes = await fetch(
          `${supabaseUrl}/rest/v1/billdora_subscriptions?stripe_subscription_id=eq.${invoice.subscription}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'active',
              current_period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
              current_period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
            })
          }
        );

        if (!updateRes.ok) {
          console.error('Failed to update subscription renewal:', await updateRes.text());
        }
      }
    }

    // Handle failed payment
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      if (invoice.subscription) {
        console.log('Subscription payment failed:', invoice.subscription);
        
        await fetch(
          `${supabaseUrl}/rest/v1/billdora_subscriptions?stripe_subscription_id=eq.${invoice.subscription}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'past_due' })
          }
        );
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Verify Stripe webhook signature using Web Crypto API
async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts['t'];
    const expectedSig = parts['v1'];

    if (!timestamp || !expectedSig) {
      return false;
    }

    // Check timestamp is within tolerance (5 minutes)
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300) {
      console.error('Webhook timestamp too old');
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computedSig === expectedSig;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}
