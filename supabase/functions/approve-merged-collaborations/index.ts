// Approve multiple merged collaborations at once - self-contained edge function
const ALLOWED_ORIGINS = [
  'https://app.billdora.com',
  'https://app-billdora.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost'
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.vercel.app') || origin.endsWith('.minimax.io')
  ) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Get user from token
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY
    }
  });

  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized - invalid token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const user = await userRes.json();
  if (!user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized - no user' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { parentQuoteId, collaborationIds } = await req.json();

    if (!parentQuoteId || !collaborationIds || !Array.isArray(collaborationIds)) {
      return new Response(JSON.stringify({ error: 'Missing parentQuoteId or collaborationIds array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user's profile to verify company ownership
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=company_id,full_name`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const profileData = await profileRes.json();
    const profile = profileData?.[0];
    const ownerName = profile?.full_name || 'Project Owner';

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get parent quote info
    const quoteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quotes?id=eq.${parentQuoteId}&select=title,company_id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const quoteData = await quoteRes.json();
    const parentQuote = quoteData?.[0];

    if (!parentQuote || parentQuote.company_id !== profile.company_id) {
      return new Response(JSON.stringify({ error: 'Not authorized - you are not the owner of this proposal' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const projectTitle = parentQuote.title || 'Untitled Project';
    const results = [];

    // Process each collaboration
    for (const collaborationId of collaborationIds) {
      try {
        // Get collaboration details
        const collabRes = await fetch(
          `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const collabData = await collabRes.json();
        
        if (!collabData || collabData.length === 0) {
          results.push({ collaborationId, success: false, error: 'Collaboration not found' });
          continue;
        }

        const collab = collabData[0];

        // Verify ownership
        if (collab.owner_company_id !== profile.company_id) {
          results.push({ collaborationId, success: false, error: 'Not authorized' });
          continue;
        }

        // Update collaboration with owner approval
        const updateRes = await fetch(
          `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              status: 'approved',
              owner_signed_at: new Date().toISOString(),
              owner_signed_by: user.id
            })
          }
        );

        if (!updateRes.ok) {
          results.push({ collaborationId, success: false, error: 'Failed to update collaboration' });
          continue;
        }

        // Update collaborator's response quote status if it exists
        if (collab.response_quote_id) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/quotes?id=eq.${collab.response_quote_id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ status: 'approved' })
            }
          );
        }

        // Get collaborator's email and Stripe account for notification and payment routing
        let collaboratorEmail = null;
        let collaboratorStripeAccountId = null;
        if (collab.collaborator_user_id) {
          const collabUserRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${collab.collaborator_user_id}`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          if (collabUserRes.ok) {
            const collabUserData = await collabUserRes.json();
            collaboratorEmail = collabUserData?.email;
          }
        }

        // Get collaborator's Stripe account if they have one
        if (collab.collaborator_company_id) {
          const collabStripeRes = await fetch(
            `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${collab.collaborator_company_id}&select=stripe_account_id`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          const collabStripeData = await collabStripeRes.json();
          collaboratorStripeAccountId = collabStripeData?.[0]?.stripe_account_id;

          // Store collaborator's Stripe account ID in collaboration record for future reference
          if (collaboratorStripeAccountId) {
            await fetch(
              `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}`,
              {
                method: 'PATCH',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ collaborator_stripe_account_id: collaboratorStripeAccountId })
              }
            );
          }
        }

        // Send in-app notification to collaborator
        if (collab.collaborator_user_id && collab.collaborator_company_id) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/notifications`,
            {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                company_id: collab.collaborator_company_id,
                user_id: collab.collaborator_user_id,
                type: 'proposal_signed',
                title: '✅ Your proposal has been approved!',
                message: `The project owner has approved your contribution to "${projectTitle}". A project has been created for you.`,
                reference_id: collab.response_quote_id || parentQuoteId,
                reference_type: 'quote',
                metadata: { quote_id: collab.response_quote_id, collaboration_id: collaborationId, parent_quote_id: parentQuoteId }
              })
            }
          );
        }

        // Send email notification to collaborator
        if (collaboratorEmail) {
          const signedDate = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', month: 'long', day: 'numeric' 
          });
          
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              to: collaboratorEmail,
              subject: `✅ Your contribution to "${projectTitle}" has been approved!`,
              type: 'collaborator_proposal_approved',
              data: {
                projectName: projectTitle,
                ownerName: ownerName,
                signedDate: signedDate,
                viewUrl: `https://app.billdora.com/projects`
              }
            })
          });
        }

        // Create project for the collaborator
        let projectId = null;
        let clientId = null;
        
        if (collab.collaborator_company_id) {
          // Get owner's company settings
          const ownerCompanyRes = await fetch(
            `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${collab.owner_company_id}&select=*`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          const ownerCompanyData = await ownerCompanyRes.json();
          const ownerCompany = ownerCompanyData?.[0];

          // Check if owner company already exists as a client for the collaborator
          if (ownerCompany) {
            const existingClientRes = await fetch(
              `${SUPABASE_URL}/rest/v1/clients?company_id=eq.${collab.collaborator_company_id}&email=eq.${encodeURIComponent(ownerCompany.email || '')}&select=id`,
              {
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                }
              }
            );
            const existingClientData = await existingClientRes.json();
            
            if (existingClientData && existingClientData.length > 0) {
              clientId = existingClientData[0].id;
            } else {
              // Create owner as a new client for the collaborator
              const createClientRes = await fetch(
                `${SUPABASE_URL}/rest/v1/clients`,
                {
                  method: 'POST',
                  headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify({
                    company_id: collab.collaborator_company_id,
                    name: ownerCompany.company_name || 'Unknown Company',
                    display_name: ownerCompany.company_name || 'Unknown Company',
                    email: ownerCompany.email || '',
                    phone: ownerCompany.phone || '',
                    address: ownerCompany.address || '',
                    city: ownerCompany.city || '',
                    state: ownerCompany.state || '',
                    zip: ownerCompany.zip || '',
                    country: ownerCompany.country || 'USA',
                    contact_person: ownerName || '',
                    primary_contact_name: ownerName || '',
                    primary_contact_email: ownerCompany.email || '',
                    lifecycle_stage: 'client',
                    source: 'collaboration',
                    created_by: collab.collaborator_user_id
                  })
                }
              );
              
              if (createClientRes.ok) {
                const newClientData = await createClientRes.json();
                clientId = newClientData?.[0]?.id;
              }
            }
          }

          // Calculate budget from response quote or use estimated amount
          let totalBudget = 0;
          if (collab.response_quote_id) {
            const lineItemsRes = await fetch(
              `${SUPABASE_URL}/rest/v1/quote_line_items?quote_id=eq.${collab.response_quote_id}&select=total`,
              {
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                }
              }
            );
            const lineItems = await lineItemsRes.json();
            totalBudget = Array.isArray(lineItems) 
              ? lineItems.reduce((sum: number, item: any) => sum + (parseFloat(item.total) || 0), 0) 
              : 0;
          }

          // Create project
          const projectRes = await fetch(
            `${SUPABASE_URL}/rest/v1/projects`,
            {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                company_id: collab.collaborator_company_id,
                client_id: clientId,
                name: `${projectTitle} - ${collab.collaborator_company_name || 'Collaboration'}`,
                description: `Project created from approved collaboration proposal`,
                status: 'active',
                budget: totalBudget,
                created_by: collab.collaborator_user_id,
                proposal_id: collab.response_quote_id
              })
            }
          );

          if (projectRes.ok) {
            const projectData = await projectRes.json();
            projectId = projectData?.[0]?.id;

            // Update collaboration with the created project id
            if (projectId) {
              await fetch(
                `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}`,
                {
                  method: 'PATCH',
                  headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                  },
                  body: JSON.stringify({ converted_project_id: projectId })
                }
              );
            }
          }
        }

        results.push({ 
          collaborationId, 
          success: true, 
          projectId,
          collaboratorName: collab.collaborator_name || collab.collaborator_email,
          hasStripeAccount: !!collaboratorStripeAccountId,
          stripeAccountId: collaboratorStripeAccountId
        });

      } catch (error) {
        results.push({ 
          collaborationId, 
          success: false, 
          error: error.message 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({ 
      success: true,
      message: `Approved ${successCount} of ${collaborationIds.length} collaborations`,
      successCount,
      failCount,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
