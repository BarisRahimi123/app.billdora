import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

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
    const { quoteId, companyId, clientEmail, clientName, billingContactEmail, billingContactName, projectName, companyName, senderName, validUntil, portalUrl, letterContent } = await req.json();

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured');
    }

    // Generate secure token and access code
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const accessCode = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit code

    // Calculate expiry (30 days from now or validUntil date)
    const expiresAt = validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Store token in database
    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/proposal_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        quote_id: quoteId,
        company_id: companyId,
        access_code: accessCode,
        token: token,
        client_email: clientEmail,
        expires_at: expiresAt.toISOString(),
        sent_at: new Date().toISOString()
      })
    });

    if (!dbResponse.ok) {
      const err = await dbResponse.text();
      throw new Error(`Failed to store token: ${err}`);
    }

    // Build proposal link
    const proposalLink = `${portalUrl}/proposal/${token}`;

    // Send email via SendGrid
    // Format letter content - convert newlines to <br> tags for HTML
    const formattedLetterContent = letterContent ? letterContent.replace(/\n/g, '<br>') : '';
    
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #476E66; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${companyName}</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #18181b; font-size: 18px; font-weight: 600;">
                Hello ${clientName},
              </p>
              
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                ${formattedLetterContent}
              </p>
              
              <!-- Access Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="margin: 0 0 8px; color: #71717a; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Access Code</p>
                    <p style="margin: 0; color: #18181b; font-size: 36px; font-weight: 700; letter-spacing: 8px;">${accessCode}</p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button - Email-client compatible -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#476E66" style="background-color: #476E66; border-radius: 8px;">
                          <a href="${proposalLink}" target="_blank" style="display: block; padding: 16px 48px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <!--[if mso]><i style="letter-spacing: 48px; mso-font-width: -100%; mso-text-raise: 30pt;">&nbsp;</i><![endif]-->
                            <span style="mso-text-raise: 15pt;">View Proposal</span>
                            <!--[if mso]><i style="letter-spacing: 48px; mso-font-width: -100%;">&nbsp;</i><![endif]-->
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Fallback Link -->
              <p style="margin: 0 0 16px; color: #71717a; font-size: 13px; text-align: center;">
                Button not working? <a href="${proposalLink}" style="color: #476E66;">Click here to view your proposal</a>
              </p>
              
              <p style="margin: 0 0 16px; color: #52525b; font-size: 14px; line-height: 1.6;">
                You'll need to enter the access code above to view your proposal. This ensures your proposal remains secure and private.
              </p>
              
              ${validUntil ? `<p style="margin: 0; color: #71717a; font-size: 14px;">This proposal is valid until <strong>${new Date(validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 14px; text-align: center;">
                Sent by ${senderName} from ${companyName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ 
          to: [{ email: clientEmail, name: clientName }],
          ...(billingContactEmail ? { cc: [{ email: billingContactEmail, name: billingContactName || 'Billing' }] } : {})
        }],
        from: { email: 'info@billdora.com', name: companyName },
        subject: `Proposal for ${projectName} - ${companyName}`,
        content: [
          { type: 'text/plain', value: `Hello ${clientName},\n\nYour proposal for ${projectName} is ready.\n\nAccess Code: ${accessCode}\nView Proposal: ${proposalLink}\n\nBest regards,\n${senderName}\n${companyName}` },
          { type: 'text/html', value: emailHtml }
        ]
      })
    });

    if (!sendgridResponse.ok) {
      const err = await sendgridResponse.text();
      console.error('SendGrid error response:', err);
      throw new Error(`SendGrid error (${sendgridResponse.status}): ${err}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Proposal sent successfully',
      accessCode,
      token 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
