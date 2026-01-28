import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

// Create Starter products and prices in Stripe
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

    const results: any = { products: [], prices: [] };

    // Create Starter Monthly Product
    const starterMonthlyProductParams = new URLSearchParams();
    starterMonthlyProductParams.append('name', 'Starter Monthly');
    starterMonthlyProductParams.append('description', 'Billdora Starter - Monthly subscription');
    starterMonthlyProductParams.append('type', 'service');

    const starterMonthlyProductRes = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: starterMonthlyProductParams.toString()
    });

    const starterMonthlyProduct = await starterMonthlyProductRes.json();
    results.products.push(starterMonthlyProduct);

    // Create Starter Monthly Price ($20/month = 2000 cents)
    const starterMonthlyPriceParams = new URLSearchParams();
    starterMonthlyPriceParams.append('product', starterMonthlyProduct.id);
    starterMonthlyPriceParams.append('unit_amount', '2000');
    starterMonthlyPriceParams.append('currency', 'usd');
    starterMonthlyPriceParams.append('recurring[interval]', 'month');

    const starterMonthlyPriceRes = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: starterMonthlyPriceParams.toString()
    });

    const starterMonthlyPrice = await starterMonthlyPriceRes.json();
    results.prices.push({ name: 'Starter Monthly', price: starterMonthlyPrice });

    // Create Starter Yearly Product
    const starterYearlyProductParams = new URLSearchParams();
    starterYearlyProductParams.append('name', 'Starter Yearly');
    starterYearlyProductParams.append('description', 'Billdora Starter - Yearly subscription with 2 months free');
    starterYearlyProductParams.append('type', 'service');

    const starterYearlyProductRes = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: starterYearlyProductParams.toString()
    });

    const starterYearlyProduct = await starterYearlyProductRes.json();
    results.products.push(starterYearlyProduct);

    // Create Starter Yearly Price ($200/year = 20000 cents, equivalent to ~$16.67/month)
    const starterYearlyPriceParams = new URLSearchParams();
    starterYearlyPriceParams.append('product', starterYearlyProduct.id);
    starterYearlyPriceParams.append('unit_amount', '20000');
    starterYearlyPriceParams.append('currency', 'usd');
    starterYearlyPriceParams.append('recurring[interval]', 'year');

    const starterYearlyPriceRes = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: starterYearlyPriceParams.toString()
    });

    const starterYearlyPrice = await starterYearlyPriceRes.json();
    results.prices.push({ name: 'Starter Yearly', price: starterYearlyPrice });

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Starter products and prices created',
      results
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
