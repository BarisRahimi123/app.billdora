// Edge function to handle password reset requests using custom email
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email, redirectUrl } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user exists
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists, a reset email has been sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a password reset link using Supabase Admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl || `${supabaseUrl.replace('.supabase.co', '')}/login?reset=true`
      }
    });

    if (linkError) {
      console.error('Failed to generate reset link:', linkError);
      throw new Error('Failed to generate reset link');
    }

    // Get the reset URL from the response
    const resetUrl = linkData.properties?.action_link;
    
    if (!resetUrl) {
      throw new Error('No reset URL generated');
    }

    // Get user's name from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Send the email via the send-email edge function
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        to: email,
        subject: 'Reset Your Billdora Password',
        type: 'password_reset',
        data: {
          userName: profile?.full_name || '',
          resetUrl: resetUrl
        }
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Failed to send email:', errorText);
      throw new Error('Failed to send reset email');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Password reset email sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
