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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  try {
    const body = await req.json();
    const event = body;

    console.log('Webhook received:', event.type);

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};

      // Check if this is a retainer payment
      if (metadata.type === 'retainer' && metadata.quote_id) {
        const quoteId = metadata.quote_id;
        const companyId = metadata.company_id;
        const totalProjectAmount = parseFloat(metadata.total_project_amount || '0');
        const retainerPercentage = parseFloat(metadata.retainer_percentage || '0');
        const amountPaid = session.amount_total / 100; // Convert from cents

        console.log('Processing retainer payment for quote:', quoteId);

        // Get quote details
        const quoteRes = await fetch(
          `${supabaseUrl}/rest/v1/quotes?id=eq.${quoteId}&select=*`,
          {
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!
            }
          }
        );
        const quotes = await quoteRes.json();
        const quote = quotes[0];

        if (!quote) {
          throw new Error('Quote not found');
        }

        // Update quote with payment info
        await fetch(`${supabaseUrl}/rest/v1/quotes?id=eq.${quoteId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey!
          },
          body: JSON.stringify({
            retainer_paid: true,
            retainer_paid_at: new Date().toISOString(),
            retainer_stripe_payment_id: session.payment_intent || session.id
          })
        });

        // Check if project already exists for this quote
        const existingProjectRes = await fetch(
          `${supabaseUrl}/rest/v1/projects?proposal_id=eq.${quoteId}&select=id`,
          {
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!
            }
          }
        );
        const existingProjects = await existingProjectRes.json();

        if (existingProjects && existingProjects.length > 0) {
          // Update existing project with retainer info
          await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${existingProjects[0].id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!
            },
            body: JSON.stringify({
              retainer_amount_paid: amountPaid,
              retainer_paid_at: new Date().toISOString(),
              retainer_stripe_payment_id: session.payment_intent || session.id,
              total_project_amount: totalProjectAmount,
              retainer_percentage: retainerPercentage
            })
          });
          console.log('Updated existing project with retainer payment');
        } else {
          // Auto-create project from quote
          const projectData = {
            company_id: companyId,
            client_id: quote.client_id,
            name: quote.title || `Project from Proposal #${quote.quote_number}`,
            description: quote.description,
            status: 'active',
            budget: totalProjectAmount,
            proposal_id: quoteId,
            retainer_amount_paid: amountPaid,
            retainer_paid_at: new Date().toISOString(),
            retainer_stripe_payment_id: session.payment_intent || session.id,
            total_project_amount: totalProjectAmount,
            retainer_percentage: retainerPercentage
          };

          const createRes = await fetch(`${supabaseUrl}/rest/v1/projects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey!,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(projectData)
          });

          if (!createRes.ok) {
            const err = await createRes.text();
            console.error('Failed to create project:', err);
          } else {
            console.log('Auto-created project from retainer payment');
            
            // Create notification
            await fetch(`${supabaseUrl}/rest/v1/notifications`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey!
              },
              body: JSON.stringify({
                company_id: companyId,
                type: 'retainer_paid',
                title: '💰 Retainer Payment Received!',
                message: `$${amountPaid.toLocaleString()} retainer paid for "${quote.title || 'Proposal #' + quote.quote_number}". Project created automatically.`,
                reference_id: quoteId,
                reference_type: 'quote',
                is_read: false
              })
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
