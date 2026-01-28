import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Verify authentication
  const authResult = await verifyAuth(req);
  if (!authResult.authenticated) {
    return unauthorizedResponse(corsHeaders, authResult.error);
  }

  try {
    const { amount, currency = 'usd', invoiceId, invoiceNumber, clientEmail, clientName, companyName } = await req.json();

    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured. Please add STRIPE_SECRET_KEY.');
    }

    // Create payment intent with Stripe
    const stripeParams = new URLSearchParams();
    stripeParams.append('amount', Math.round(amount * 100).toString());
    stripeParams.append('currency', currency);
    stripeParams.append('payment_method_types[]', 'card');
    stripeParams.append('metadata[invoice_id]', invoiceId || '');
    stripeParams.append('metadata[invoice_number]', invoiceNumber || '');
    stripeParams.append('metadata[client_email]', clientEmail || '');
    stripeParams.append('metadata[client_name]', clientName || '');
    stripeParams.append('metadata[company_name]', companyName || '');
    stripeParams.append('description', `Invoice ${invoiceNumber} - ${clientName}`);
    
    if (clientEmail) {
      stripeParams.append('receipt_email', clientEmail);
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: stripeParams.toString()
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text();
      console.error('Stripe API error:', errorData);
      throw new Error(`Stripe error: ${errorData}`);
    }

    const paymentIntent = await stripeResponse.json();

    return new Response(JSON.stringify({
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        currency
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Payment intent error:', error);
    return new Response(JSON.stringify({
      error: { code: 'PAYMENT_FAILED', message: error.message }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
