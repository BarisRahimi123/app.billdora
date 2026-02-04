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

        // Handle collaboration payment transfers for "through_owner" mode
        const hasCollaborations = metadata.has_collaborations === 'true';
        if (hasCollaborations) {
          const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
          
          // Get merged collaborations with through_owner payment mode
          const collabsRes = await fetch(
            `${supabaseUrl}/rest/v1/proposal_collaborations?parent_quote_id=eq.${quoteId}&status=eq.merged&payment_mode=eq.through_owner&select=*`,
            {
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey!
              }
            }
          );
          const throughOwnerCollabs = await collabsRes.json();

          // Create transfers to collaborators
          for (const collab of throughOwnerCollabs) {
            if (collab.collaborator_stripe_account_id && collab.response_quote_id) {
              try {
                // Get collaborator's line items total
                const collabItemsRes = await fetch(
                  `${supabaseUrl}/rest/v1/quote_line_items?quote_id=eq.${collab.response_quote_id}&select=*`,
                  {
                    headers: {
                      'Authorization': `Bearer ${serviceRoleKey}`,
                      'apikey': serviceRoleKey!
                    }
                  }
                );
                const collabItems = await collabItemsRes.json();
                const collabTotal = collabItems.reduce((sum: number, item: any) => 
                  sum + (Number(item.quantity) * Number(item.unit_price)), 0);
                
                // Calculate this collaborator's share of the retainer
                const collabRetainerShare = (collabTotal / totalProjectAmount) * amountPaid;
                
                if (collabRetainerShare > 0) {
                  // Create Stripe Transfer
                  const transferParams = new URLSearchParams();
                  transferParams.append('amount', Math.round(collabRetainerShare * 100).toString());
                  transferParams.append('currency', 'usd');
                  transferParams.append('destination', collab.collaborator_stripe_account_id);
                  transferParams.append('description', `Retainer share for ${collab.collaborator_company_name || collab.collaborator_name || 'collaborator'}`);
                  transferParams.append('metadata[quote_id]', quoteId);
                  transferParams.append('metadata[collaboration_id]', collab.id);
                  transferParams.append('metadata[type]', 'retainer_share');

                  const transferRes = await fetch('https://api.stripe.com/v1/transfers', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${stripeSecretKey}`,
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: transferParams.toString()
                  });

                  if (transferRes.ok) {
                    const transfer = await transferRes.json();
                    console.log(`Created transfer of $${collabRetainerShare} to ${collab.collaborator_company_name}`);
                    
                    // Update collaboration with transfer info
                    await fetch(`${supabaseUrl}/rest/v1/proposal_collaborations?id=eq.${collab.id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey!
                      },
                      body: JSON.stringify({
                        retainer_transfer_id: transfer.id,
                        retainer_amount_transferred: collabRetainerShare,
                        retainer_transferred_at: new Date().toISOString()
                      })
                    });

                    // Send notification to collaborator
                    if (collab.collaborator_user_id && collab.collaborator_company_id) {
                      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${serviceRoleKey}`,
                          'apikey': serviceRoleKey!
                        },
                        body: JSON.stringify({
                          company_id: collab.collaborator_company_id,
                          user_id: collab.collaborator_user_id,
                          type: 'payment_received',
                          title: '💰 Retainer Payment Received!',
                          message: `$${collabRetainerShare.toLocaleString()} retainer payment transferred to your account for "${quote.title || 'Project'}"`,
                          reference_id: collab.response_quote_id || quoteId,
                          reference_type: 'quote',
                          is_read: false
                        })
                      });
                    }
                  } else {
                    const error = await transferRes.text();
                    console.error(`Failed to create transfer to ${collab.collaborator_company_name}:`, error);
                  }
                }
              } catch (transferError) {
                console.error(`Error processing transfer for collaboration ${collab.id}:`, transferError);
              }
            }
          }
        }

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
