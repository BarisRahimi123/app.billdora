// Sign collaboration proposal - self-contained edge function
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
    const { collaborationId, quoteId } = await req.json();

    if (!collaborationId || !quoteId) {
      return new Response(JSON.stringify({ error: 'Missing collaborationId or quoteId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user is owner of this collaboration
    const verifyRes = await fetch(
      `${SUPABASE_URL}/rest/v1/proposal_collaborations?id=eq.${collaborationId}&response_quote_id=eq.${quoteId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const collabData = await verifyRes.json();

    if (!collabData || collabData.length === 0) {
      return new Response(JSON.stringify({ error: 'Collaboration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const collab = collabData[0];

    // Get user's profile to verify company ownership
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=company_id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const profileData = await profileRes.json();
    const profile = profileData?.[0];

    if (!profile || profile.company_id !== collab.owner_company_id) {
      return new Response(JSON.stringify({ error: 'Not authorized - you are not the owner of this collaboration' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update collaboration with owner signature
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
          status: 'owner-signed',
          owner_signed_at: new Date().toISOString(),
          owner_signed_by: user.id
        })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return new Response(JSON.stringify({ error: 'Failed to update: ' + errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get quote info for project creation
    const quoteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&select=title`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const quoteData = await quoteRes.json();
    const quote = quoteData?.[0];

    // Create project for collaborator if they have a user_id
    let projectId = null;
    if (collab.collaborator_user_id) {
      const projectTitle = quote?.title || 'Untitled Project';
      
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
            title: projectTitle,
            user_id: collab.collaborator_user_id,
            source_quote_id: quoteId,
            status: 'active'
          })
        }
      );

      if (projectRes.ok) {
        const newProject = await projectRes.json();
        projectId = newProject?.[0]?.id;

        if (projectId) {
          // Update collaboration with project reference
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

          // Send notification to collaborator
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
                user_id: collab.collaborator_user_id,
                type: 'proposal_signed',
                title: 'Your proposal has been signed!',
                message: `The project owner has signed your proposal for "${projectTitle}". A new project has been created in your account.`,
                metadata: { quote_id: quoteId, project_id: projectId }
              })
            }
          );
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Successfully signed the collaboration',
      projectId 
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
