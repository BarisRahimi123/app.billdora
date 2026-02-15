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
    const { invoiceId, clientEmail, clientName, invoiceNumber, totalAmount, dueDate, portalUrl } = await req.json();

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured');
    }

    if (!clientEmail) {
      throw new Error('Client email is required');
    }

    // Fetch invoice details for PDF generation
    const invoiceResponse = await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoiceId}&select=*,client:clients(name,email,address,city,state,zip),project:projects(name)`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      }
    });
    const invoiceData = await invoiceResponse.json();
    const invoice = invoiceData[0];

    // Build the view invoice URL
    const viewInvoiceUrl = portalUrl || `https://billdora.com/invoice-view/${invoiceId}`;

    // Payment reminder email template
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); width: 60px; height: 60px; border-radius: 16px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 28px;">&#128276;</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #92400E;">Payment Reminder</h1>
              <p style="margin: 8px 0 0; color: #B45309; font-size: 14px;">Invoice ${invoiceNumber}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Dear ${clientName},
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                This is a friendly reminder that we haven't received payment for <strong>Invoice ${invoiceNumber}</strong>. We would appreciate if you could review and process this payment at your earliest convenience.
              </p>
              
              <!-- Invoice Summary Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; margin: 24px 0;">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                      <tr>
                        <td style="color: #92400E; font-size: 14px; padding-bottom: 12px;">Invoice Number</td>
                        <td style="color: #78350F; font-size: 14px; font-weight: 600; text-align: right; padding-bottom: 12px;">${invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td style="color: #92400E; font-size: 14px; padding-bottom: 12px;">Amount Due</td>
                        <td style="color: #78350F; font-size: 20px; font-weight: 700; text-align: right; padding-bottom: 12px;">${totalAmount}</td>
                      </tr>
                      ${dueDate && dueDate !== 'N/A' ? `
                      <tr>
                        <td style="color: #92400E; font-size: 14px;">Original Due Date</td>
                        <td style="color: #DC2626; font-size: 14px; font-weight: 600; text-align: right;">${dueDate}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                If you've already sent payment, please disregard this reminder. If you have any questions or concerns, please don't hesitate to reach out.
              </p>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="${viewInvoiceUrl}" style="display: inline-block; padding: 16px 32px; background-color: #476E66; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px;">
                      View Invoice & Pay Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #F9FAFB; border-top: 1px solid #E5E7EB; border-radius: 0 0 16px 16px;">
              <p style="margin: 0; color: #6B7280; font-size: 13px; text-align: center; line-height: 1.6;">
                This is an automated payment reminder from Billdora.<br>
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send email via SendGrid
    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: clientEmail, name: clientName }],
          subject: `Payment Reminder - Invoice ${invoiceNumber}`,
        }],
        from: {
          email: 'info@billdora.com',
          name: 'Billdora'
        },
        reply_to: {
          email: 'info@billdora.com',
          name: 'Billdora Support'
        },
        content: [
          {
            type: 'text/html',
            value: emailHtml
          }
        ],
        tracking_settings: {
          click_tracking: { enable: true },
          open_tracking: { enable: true }
        }
      }),
    });

    if (!sendGridResponse.ok) {
      const errorText = await sendGridResponse.text();
      console.error('SendGrid error:', errorText);
      throw new Error(`Failed to send email: ${sendGridResponse.status}`);
    }

    // Log the reminder sent
    await fetch(`${SUPABASE_URL}/rest/v1/invoice_reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
        sent_at: new Date().toISOString(),
        status: 'sent',
        recipient_email: clientEmail
      })
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Payment reminder sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error sending payment reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
