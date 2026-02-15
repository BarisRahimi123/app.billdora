// Edge function to handle password reset requests using custom email
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
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
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user exists
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists, a reset email has been sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a password reset link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl || 'https://app.billdora.com/login?reset=true'
      }
    });

    if (linkError) {
      console.error('Failed to generate reset link:', linkError);
      throw new Error('Failed to generate reset link');
    }

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

    const userName = profile?.full_name || '';

    // Send email directly via SendGrid
    if (!sendgridApiKey) {
      throw new Error('SendGrid API key not configured');
    }

    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 40px;">
          <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
          <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
        </div>
        <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">Reset Your Password</h2>
        <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
          Hi${userName ? ' ' + userName : ''},
        </p>
        <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
          We received a request to reset your password. Click the button below to create a new password:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background: #476E66; color: white; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
            Reset Password
          </a>
        </div>
        <p style="color: #9CA3AF; font-size: 14px; line-height: 1.6;">
          This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
        <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} Billdora. All rights reserved.
        </p>
      </div>
    `;

    const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sendgridApiKey}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'info@billdora.com', name: 'Billdora' },
        subject: 'Reset Your Billdora Password',
        content: [{ type: 'text/html', value: emailHtml }]
      })
    });

    if (!sgResponse.ok) {
      const errorText = await sgResponse.text();
      console.error('SendGrid error:', errorText);
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
