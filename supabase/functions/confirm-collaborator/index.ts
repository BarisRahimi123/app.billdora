// Edge function to auto-confirm collaborator accounts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify authentication
  const authResult = await verifyAuth(req);
  if (!authResult.authenticated) {
    return unauthorizedResponse(corsHeaders, authResult.error);
  }

  try {
    const { userId, collaborationId } = await req.json();

    if (!userId || !collaborationId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or collaborationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify the collaboration exists and is in accepted status
    const { data: collab, error: collabError } = await supabase
      .from('proposal_collaborations')
      .select('id, collaborator_email')
      .eq('id', collaborationId)
      .single();

    if (collabError || !collab) {
      return new Response(
        JSON.stringify({ error: 'Invalid collaboration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auto-confirm the user's email using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true
    });

    if (updateError) {
      console.error('Failed to confirm user:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to confirm user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update collaboration with user ID
    await supabase
      .from('proposal_collaborations')
      .update({ 
        collaborator_user_id: userId,
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', collaborationId);

    return new Response(
      JSON.stringify({ success: true, message: 'User confirmed and linked' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
