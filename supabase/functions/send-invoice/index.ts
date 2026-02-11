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
    const { invoiceId, clientEmail, clientName, invoiceNumber, projectName, companyName, senderName, totalAmount, dueDate, emailContent, portalUrl, ccRecipients } = await req.json();

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured');
    }

    // Generate a public view token
    const publicViewToken = crypto.randomUUID();

    // Update invoice status to 'sent', set sent_at date, and save the token
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_date: new Date().toISOString().split('T')[0],
        public_view_token: publicViewToken
      })
    });

    if (!updateResponse.ok) {
      const err = await updateResponse.text();
      console.error('Failed to update invoice status:', err);
    }

    // Build the view invoice URL
    const viewInvoiceUrl = portalUrl || `https://billdora.com/invoice/${publicViewToken}`;

    // Format email content - convert newlines to <br> tags for HTML
    const formattedContent = emailContent ? emailContent.replace(/\n/g, '<br>') : '';

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
                ${formattedContent}
              </p>
              
              <!-- Invoice Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #71717a; font-size: 14px;">Invoice Number:</span>
                          <span style="color: #18181b; font-size: 14px; font-weight: 600; float: right;">${invoiceNumber}</span>
                        </td>
                      </tr>
                      ${projectName ? `<tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e4e4e7;">
                          <span style="color: #71717a; font-size: 14px;">Project:</span>
                          <span style="color: #18181b; font-size: 14px; float: right;">${projectName}</span>
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e4e4e7;">
                          <span style="color: #71717a; font-size: 14px;">Amount Due:</span>
                          <span style="color: #18181b; font-size: 18px; font-weight: 700; float: right;">${totalAmount}</span>
                        </td>
                      </tr>
                      ${dueDate ? `<tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e4e4e7;">
                          <span style="color: #71717a; font-size: 14px;">Due Date:</span>
                          <span style="color: #18181b; font-size: 14px; font-weight: 600; float: right;">${dueDate}</span>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- View Invoice Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${viewInvoiceUrl}" style="display: inline-block; background-color: #476E66; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Invoice & Download PDF</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; color: #52525b; font-size: 14px; line-height: 1.6;">
                Please let us know if you have any questions regarding this invoice.
              </p>
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

    // Build personalizations with optional CC
    const personalization: Record<string, unknown> = {
      to: [{ email: clientEmail, name: clientName }]
    };

    // Add CC recipients if provided (filter out duplicates of the primary recipient)
    if (ccRecipients && Array.isArray(ccRecipients) && ccRecipients.length > 0) {
      const validCc = ccRecipients
        .filter((r: { email: string; name?: string }) => r.email && r.email.toLowerCase() !== clientEmail.toLowerCase())
        .map((r: { email: string; name?: string }) => ({ email: r.email, ...(r.name ? { name: r.name } : {}) }));
      if (validCc.length > 0) {
        personalization.cc = validCc;
      }
    }

    const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [personalization],
        from: { email: 'info@billdora.com', name: companyName },
        subject: `Invoice ${invoiceNumber} from ${companyName}`,
        content: [
          { type: 'text/plain', value: `Hello ${clientName},\n\n${emailContent}\n\nInvoice: ${invoiceNumber}\nAmount Due: ${totalAmount}\n${dueDate ? `Due Date: ${dueDate}` : ''}\n\nView your invoice: ${viewInvoiceUrl}\n\nBest regards,\n${senderName}\n${companyName}` },
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
      message: 'Invoice sent successfully',
      viewUrl: viewInvoiceUrl
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
