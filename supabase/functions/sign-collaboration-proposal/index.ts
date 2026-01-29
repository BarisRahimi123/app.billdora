import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user with anon client
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { collaborationId, quoteId } = await req.json();
    if (!collaborationId || !quoteId) {
      return new Response(JSON.stringify({ error: 'Missing collaborationId or quoteId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role for cross-company access
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get collaboration and verify user is the owner
    const { data: collab, error: collabErr } = await serviceClient
      .from('proposal_collaborations')
      .select('*, owner_company:companies!proposal_collaborations_owner_company_id_fkey(id, company_name)')
      .eq('id', collaborationId)
      .eq('response_quote_id', quoteId)
      .single();

    if (collabErr || !collab) {
      return new Response(JSON.stringify({ error: 'Collaboration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is owner of the collaboration (belongs to owner company)
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.company_id !== collab.owner_company_id) {
      return new Response(JSON.stringify({ error: 'Not authorized - you are not the owner of this collaboration' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update collaboration with owner signature
    const { error: updateErr } = await serviceClient
      .from('proposal_collaborations')
      .update({
        status: 'owner-signed',
        owner_signed_at: new Date().toISOString(),
        owner_signed_by: user.id
      })
      .eq('id', collaborationId);

    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to update: ' + updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get quote info for project creation
    const { data: quote } = await serviceClient
      .from('quotes')
      .select('title')
      .eq('id', quoteId)
      .single();

    // Create project for collaborator if they have a user_id
    let projectId = null;
    if (collab.collaborator_user_id) {
      const projectTitle = quote?.title || 'Untitled Project';
      const { data: newProject, error: projectErr } = await serviceClient
        .from('projects')
        .insert({
          title: projectTitle,
          user_id: collab.collaborator_user_id,
          source_quote_id: quoteId,
          status: 'active'
        })
        .select()
        .single();

      if (!projectErr && newProject) {
        projectId = newProject.id;
        
        // Update collaboration with project reference
        await serviceClient
          .from('proposal_collaborations')
          .update({ converted_project_id: newProject.id })
          .eq('id', collaborationId);

        // Send notification to collaborator
        await serviceClient.from('notifications').insert({
          user_id: collab.collaborator_user_id,
          type: 'proposal_signed',
          title: 'Your proposal has been signed!',
          message: `The project owner has signed your proposal for "${projectTitle}". A new project has been created in your account.`,
          metadata: { quote_id: quoteId, project_id: newProject.id }
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Successfully signed the collaboration',
      projectId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
