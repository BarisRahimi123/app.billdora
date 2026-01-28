import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

// List Stripe products and prices
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
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    // List all products
    const productsResponse = await fetch('https://api.stripe.com/v1/products?limit=100', {
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      },
    });

    const products = await productsResponse.json();

    // List all prices
    const pricesResponse = await fetch('https://api.stripe.com/v1/prices?limit=100&expand[]=data.product', {
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      },
    });

    const prices = await pricesResponse.json();

    return new Response(JSON.stringify({ 
      products: products.data,
      prices: prices.data 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: { message: error.message } 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
