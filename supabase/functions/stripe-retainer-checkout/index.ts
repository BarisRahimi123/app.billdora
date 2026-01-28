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

    const { quote_id, token_id } = await req.json();
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    if (!quote_id) {
      throw new Error('Quote ID is required');
    }

    // Fetch quote
    const quoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey!
        }
      }
    );

    const quotes = await quoteRes.json();
    if (!quotes || quotes.length === 0 || quoteRes.status !== 200) {
      console.error('Quote fetch error:', quotes);
      throw new Error('Quote not found');
    }

    const quote = quotes[0];

    // Fetch client separately
    let clientEmail = null;
    if (quote.client_id) {
      const clientRes = await fetch(
        `${supabaseUrl}/rest/v1/clients?id=eq.${quote.client_id}&select=email,primary_contact_email`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey!
          }
        }
      );
      const clients = await clientRes.json();
      if (clients && clients.length > 0) {
        clientEmail = clients[0].primary_contact_email || clients[0].email;
      }
    }

    // Check retainer is enabled
    if (!quote.retainer_enabled) {
      throw new Error('Retainer is not enabled for this proposal');
    }

    // Get line items for total calculation
    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/quote_line_items?quote_id=eq.${quote_id}&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey!
        }
      }
    );
    const lineItems = await itemsRes.json();
    const totalAmount = lineItems.reduce((sum: number, item: any) => 
      sum + (Number(item.quantity) * Number(item.unit_price)), 0);

    // Calculate retainer amount
    let retainerAmount: number;
    if (quote.retainer_type === 'percentage') {
      retainerAmount = totalAmount * (quote.retainer_percentage || 0) / 100;
    } else {
      retainerAmount = quote.retainer_amount || 0;
    }

    if (retainerAmount <= 0) {
      throw new Error('Invalid retainer amount');
    }

    // Get company stripe account
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/company_settings?company_id=eq.${quote.company_id}&select=stripe_account_id`,
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

    // Get origin for URLs
    const reqOrigin = req.headers.get('origin') || 'https://nczbg3970nza.space.minimax.io';
    
    // Get token for redirect URL
    let tokenParam = '';
    if (token_id) {
      const tokenRes = await fetch(
        `${supabaseUrl}/rest/v1/proposal_tokens?id=eq.${token_id}&select=token`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey!
          }
        }
      );
      const tokens = await tokenRes.json();
      if (tokens?.[0]?.token) {
        tokenParam = tokens[0].token;
      }
    }

    const successUrl = `${reqOrigin}/proposal/${tokenParam}?payment=success`;
    const cancelUrl = `${reqOrigin}/proposal/${tokenParam}?payment=cancelled`;

    // Create Stripe Checkout Session
    const checkoutParams = new URLSearchParams();
    checkoutParams.append('mode', 'payment');
    checkoutParams.append('payment_method_types[0]', 'card');
    checkoutParams.append('success_url', successUrl);
    checkoutParams.append('cancel_url', cancelUrl);
    checkoutParams.append('line_items[0][price_data][currency]', 'usd');
    checkoutParams.append('line_items[0][price_data][product_data][name]', 
      `Retainer - ${quote.title || 'Proposal #' + quote.quote_number}`);
    checkoutParams.append('line_items[0][price_data][product_data][description]',
      `${quote.retainer_type === 'percentage' ? quote.retainer_percentage + '%' : ''} retainer payment for project`);
    checkoutParams.append('line_items[0][price_data][unit_amount]', Math.round(retainerAmount * 100).toString());
    checkoutParams.append('line_items[0][quantity]', '1');
    checkoutParams.append('metadata[quote_id]', quote_id);
    checkoutParams.append('metadata[company_id]', quote.company_id);
    checkoutParams.append('metadata[type]', 'retainer');
    checkoutParams.append('metadata[total_project_amount]', totalAmount.toString());
    checkoutParams.append('metadata[retainer_percentage]', (quote.retainer_percentage || 0).toString());

    if (clientEmail) {
      checkoutParams.append('customer_email', clientEmail);
    }

    // Create session on platform account (direct charges)
    const checkoutResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: checkoutParams.toString()
    });

    if (!checkoutResponse.ok) {
      const errorData = await checkoutResponse.text();
      console.error('Stripe Checkout error:', errorData);
      throw new Error(`Stripe error: ${errorData}`);
    }

    const session = await checkoutResponse.json();

    return new Response(JSON.stringify({ 
      data: { 
        checkout_url: session.url,
        session_id: session.id,
        retainer_amount: retainerAmount
      } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Stripe Retainer Checkout error:', error);
    return new Response(JSON.stringify({ 
      error: { message: error.message } 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
