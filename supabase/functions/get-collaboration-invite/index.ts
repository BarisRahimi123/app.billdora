// Edge function to get collaboration invite details (public access for email links)
// This bypasses RLS to allow unauthenticated users to view their invitation

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
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

  try {
    let invitationId: string | null = null;

    // Try to get invitationId from query params (GET) or body (POST)
    const url = new URL(req.url);
    invitationId = url.searchParams.get('invitationId');

    // If not in query params, try request body
    if (!invitationId && req.method === 'POST') {
      try {
        const body = await req.json();
        invitationId = body?.invitationId;
      } catch (parseError) {
        console.error('Failed to parse request body:', parseError);
      }
    }

    if (!invitationId) {
      return new Response(
        JSON.stringify({ error: 'invitationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing invitation request for ID:', invitationId);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch collaboration details using service role (bypasses RLS)
    const collabRes = await fetch(
      `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${invitationId}&select=id,collaborator_email,collaborator_name,collaborator_company_name,collaborator_user_id,message,status,parent_quote_id,owner_company_id,owner_user_id,invited_at,accepted_at`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    
    const collabData = await collabRes.json();
    
    if (!collabData || collabData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invitation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const collab = collabData[0];

    // Fetch parent quote for project name
    let projectName = 'Untitled Project';
    if (collab.parent_quote_id) {
      const quoteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quotes?id=eq.${collab.parent_quote_id}&select=title`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const quoteData = await quoteRes.json();
      if (quoteData && quoteData.length > 0) {
        projectName = quoteData[0].title || 'Untitled Project';
      }
    }

    // Fetch inviter (owner) profile
    let inviterName = 'Unknown';
    if (collab.owner_user_id) {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${collab.owner_user_id}&select=full_name`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const profileData = await profileRes.json();
      if (profileData && profileData.length > 0) {
        inviterName = profileData[0].full_name || 'Unknown';
      }
    }

    // Fetch inviter company name
    let inviterCompanyName = 'Unknown Company';
    if (collab.owner_company_id) {
      const companyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/companies?id=eq.${collab.owner_company_id}&select=name`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const companyData = await companyRes.json();
      if (companyData && companyData.length > 0) {
        inviterCompanyName = companyData[0].name || 'Unknown Company';
      }
    }

    return new Response(
      JSON.stringify({
        id: collab.id,
        collaborator_email: collab.collaborator_email,
        collaborator_name: collab.collaborator_name,
        collaborator_company_name: collab.collaborator_company_name,
        collaborator_user_id: collab.collaborator_user_id,
        message: collab.message,
        status: collab.status,
        parent_quote_id: collab.parent_quote_id,
        owner_company_id: collab.owner_company_id,
        owner_user_id: collab.owner_user_id,
        project_name: projectName,
        inviter_name: inviterName,
        inviter_company_name: inviterCompanyName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching collaboration invite:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
