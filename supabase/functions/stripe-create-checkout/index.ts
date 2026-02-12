import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // PUBLIC ENDPOINT: No auth required - called from the public invoice view page
  // by unauthenticated clients. The invoice UUID acts as the access token.
  // Security: accept_online_payment flag must be true on the invoice.

  try {
    const { invoice_id } = await req.json();
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    if (!invoice_id) {
      throw new Error('Invoice ID is required');
    }

    // Fetch invoice
    const invoiceRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?id=eq.${invoice_id}&select=*,client:clients(name,email)`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey!
        }
      }
    );

    const invoices = await invoiceRes.json();
    if (!invoices || invoices.length === 0) {
      throw new Error('Invoice not found');
    }

    const invoice = invoices[0];

    // Check if online payment is enabled for this invoice
    if (!invoice.accept_online_payment) {
      throw new Error('Online payment is not enabled for this invoice');
    }

    // Fetch company_settings separately
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/company_settings?company_id=eq.${invoice.company_id}&select=stripe_account_id`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey!
        }
      }
    );
    const settings = await settingsRes.json();
    const stripeAccountId = settings?.[0]?.stripe_account_id;

    if (!stripeAccountId) {
      throw new Error('Company has not connected a Stripe account');
    }

    if (invoice.status === 'paid') {
      throw new Error('Invoice has already been paid');
    }

    // Get the origin for success/cancel URLs
    const reqOrigin = req.headers.get('origin') || 'https://6bktnu61nh6j.space.minimax.io';
    const successUrl = `${reqOrigin}/invoice/${invoice_id}?payment=success`;
    const cancelUrl = `${reqOrigin}/invoice/${invoice_id}?payment=cancelled`;

    // Create Stripe Checkout Session
    const checkoutParams = new URLSearchParams();
    checkoutParams.append('mode', 'payment');
    checkoutParams.append('success_url', successUrl);
    checkoutParams.append('cancel_url', cancelUrl);
    checkoutParams.append('line_items[0][price_data][currency]', 'usd');
    checkoutParams.append('line_items[0][price_data][product_data][name]', `Invoice #${invoice.invoice_number}`);
    checkoutParams.append('line_items[0][price_data][unit_amount]', Math.round(invoice.total * 100).toString());
    checkoutParams.append('line_items[0][quantity]', '1');
    checkoutParams.append('metadata[invoice_id]', invoice_id);
    checkoutParams.append('metadata[company_id]', invoice.company_id);
    
    if (invoice.client?.email) {
      checkoutParams.append('customer_email', invoice.client.email);
    }

    // Create session on connected account
    const checkoutResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': stripeAccountId
      },
      body: checkoutParams.toString()
    });

    if (!checkoutResponse.ok) {
      const errorData = await checkoutResponse.text();
      console.error('Stripe Checkout error:', errorData);
      throw new Error('Failed to create checkout session');
    }

    const session = await checkoutResponse.json();

    return new Response(JSON.stringify({ 
      data: { 
        checkout_url: session.url,
        session_id: session.id
      } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Stripe Checkout error:', error);
    return new Response(JSON.stringify({ 
      error: { message: error.message } 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
