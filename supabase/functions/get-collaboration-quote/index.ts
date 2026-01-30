// Get collaboration quote - self-contained edge function
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

// Edge function to fetch collaboration quote data (bypasses RLS for valid owner access)
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
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const user = await userRes.json();
  if (!user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized - no user' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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
    // Or they're the collaborator who submitted this quote
    // Or we have a specific collaboration ID to check
    
    // Check if user is owner OR collaborator
    let verificationQuery = `${SUPABASE_URL}/rest/v1/proposal_collaborations?response_quote_id=eq.${quoteId}&or=(owner_user_id.eq.${user.id},collaborator_user_id.eq.${user.id})&select=id,status,owner_company_id,collaborator_user_id`;
    
    if (collaborationId) {
      verificationQuery = `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}&or=(owner_user_id.eq.${user.id},collaborator_user_id.eq.${user.id})&select=id,status,owner_company_id,collaborator_user_id`;
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

    // If collaboration is signed, fetch owner profile for signature display
    let ownerProfile = null;
    if (collaboration?.owner_signed_by) {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${collaboration.owner_signed_by}&select=full_name,email`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const profileData = await profileRes.json();
      ownerProfile = profileData?.[0] || null;
    }

    // Add owner_profile to collaboration object
    if (collaboration && ownerProfile) {
      collaboration.owner_profile = ownerProfile;
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
