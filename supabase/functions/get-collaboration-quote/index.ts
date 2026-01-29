import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

// Edge function to fetch collaboration quote data (bypasses RLS for valid owner access)
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Verify authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return unauthorizedResponse(corsHeaders, auth.error);
  }

  try {
    const { quoteId, collaborationId } = await req.json();
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!quoteId) {
      return new Response(JSON.stringify({ error: 'quoteId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // First, verify the user has access via collaboration relationship
    // Either they're the owner of a collaboration where this quote is the response
    // Or we have a specific collaboration ID to check
    let verificationQuery = `${SUPABASE_URL}/rest/v1/proposal_collaborations?response_quote_id=eq.${quoteId}&owner_user_id=eq.${auth.user.id}&select=id,status,owner_company_id`;
    
    if (collaborationId) {
      verificationQuery = `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}&owner_user_id=eq.${auth.user.id}&select=id,status,owner_company_id`;
    }

    const verifyRes = await fetch(verificationQuery, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    const verifyData = await verifyRes.json();

    if (!verifyData || verifyData.length === 0) {
      return new Response(JSON.stringify({ error: 'Access denied - not authorized to view this quote' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // User is verified as owner - fetch the quote
    const quoteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const quoteData = await quoteRes.json();

    if (!quoteData || quoteData.length === 0) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch line items
    const lineItemsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quote_line_items?quote_id=eq.${quoteId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const lineItems = await lineItemsRes.json();

    // Fetch collaboration details
    const collabRes = await fetch(
      `${SUPABASE_URL}/rest/v1/proposal_collaborations?response_quote_id=eq.${quoteId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const collabData = await collabRes.json();
    const collaboration = collabData?.[0] || null;

    // Fetch OWNER's company info (they are the "client" receiving the proposal)
    let ownerCompany = null;
    if (collaboration?.owner_company_id) {
      const ownerCompanyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${collaboration.owner_company_id}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const ownerCompanyData = await ownerCompanyRes.json();
      ownerCompany = ownerCompanyData?.[0] || null;
    }

    // Fetch COLLABORATOR's company info (they are the "contractor" sending the proposal)
    let collaboratorCompany = null;
    if (collaboration?.collaborator_company_id) {
      const collabCompanyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${collaboration.collaborator_company_id}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const collabCompanyData = await collabCompanyRes.json();
      collaboratorCompany = collabCompanyData?.[0] || null;
    }

    return new Response(JSON.stringify({
      quote: quoteData[0],
      lineItems: lineItems || [],
      collaboration: collaboration,
      // For owner signing: owner is "client", collaborator is "contractor"
      ownerAsClient: ownerCompany ? {
        name: ownerCompany.company_name,
        address: ownerCompany.address,
        city: ownerCompany.city,
        state: ownerCompany.state,
        zip: ownerCompany.zip,
        phone: ownerCompany.phone,
        email: ownerCompany.email
      } : null,
      collaboratorAsContractor: collaboratorCompany ? {
        name: collaboratorCompany.company_name || collaboration?.collaborator_company_name,
        address: collaboratorCompany.address,
        city: collaboratorCompany.city,
        state: collaboratorCompany.state,
        zip: collaboratorCompany.zip,
        phone: collaboratorCompany.phone,
        email: collaboratorCompany.email,
        logo_url: collaboratorCompany.logo_url
      } : {
        name: collaboration?.collaborator_company_name,
        email: collaboration?.collaborator_email
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
