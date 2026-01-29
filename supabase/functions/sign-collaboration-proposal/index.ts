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
          status: 'approved',
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

    // Get quote info
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
    const projectTitle = quote?.title || 'Untitled Project';

    // Get owner's profile for signer name
    const ownerProfileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=full_name`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const ownerProfileData = await ownerProfileRes.json();
    const ownerName = ownerProfileData?.[0]?.full_name || 'Project Owner';

    // Get collaborator's email
    let collaboratorEmail = null;
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

    // Always send notification to collaborator (requires company_id)
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
            message: `The project owner has signed and approved your proposal for "${projectTitle}". Click to view your signed proposal.`,
            reference_id: quoteId,
            reference_type: 'quote',
            metadata: { quote_id: quoteId, collaboration_id: collaborationId }
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
          subject: `✅ Your proposal for "${projectTitle}" has been approved!`,
          type: 'collaborator_proposal_approved',
          data: {
            projectName: projectTitle,
            ownerName: ownerName,
            signedDate: signedDate,
            viewUrl: `https://app.billdora.com/quotes/${quoteId}/document`
          }
        })
      });
    }

    // Create project for the collaborator
    let projectId = null;
    if (collab.collaborator_company_id) {
      // Get line items total from the response quote for budget
      const lineItemsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quote_line_items?quote_id=eq.${quoteId}&select=total`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const lineItems = await lineItemsRes.json();
      const totalBudget = Array.isArray(lineItems) 
        ? lineItems.reduce((sum: number, item: any) => sum + (parseFloat(item.total) || 0), 0) 
        : 0;

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
            name: projectTitle,
            description: `Project created from approved collaboration proposal`,
            status: 'active',
            budget: totalBudget,
            created_by: collab.collaborator_user_id,
            proposal_id: quoteId
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
