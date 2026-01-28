// Cron job to process scheduled payment reminders
// Runs daily to check for reminders due today and sends them

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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const today = new Date().toISOString().split('T')[0];

    // Fetch all scheduled reminders due today or earlier that haven't been sent
    const remindersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/invoice_reminders?reminder_date=lte.${today}&status=eq.scheduled&select=*,invoice:invoices(id,invoice_number,total,due_date,status,client:clients(name,email))`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        }
      }
    );

    const reminders = await remindersResponse.json();

    if (!Array.isArray(reminders) || reminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No reminders to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const reminder of reminders) {
      const invoice = reminder.invoice;
      
      // Skip if invoice is already paid or client has no email
      if (!invoice || invoice.status === 'paid' || !invoice.client?.email) {
        // Mark as cancelled if invoice is paid
        if (invoice?.status === 'paid') {
          await fetch(`${SUPABASE_URL}/rest/v1/invoice_reminders?id=eq.${reminder.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ status: 'cancelled' })
          });
        }
        continue;
      }

      try {
        // Call the send-payment-reminder function
        const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-payment-reminder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            invoiceId: invoice.id,
            clientEmail: invoice.client.email,
            clientName: invoice.client.name,
            invoiceNumber: invoice.invoice_number,
            totalAmount: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total || 0),
            dueDate: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A',
            portalUrl: `https://billdora.com/invoice-view/${invoice.id}`
          })
        });

        if (sendResponse.ok) {
          // Update reminder status to sent
          await fetch(`${SUPABASE_URL}/rest/v1/invoice_reminders?id=eq.${reminder.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ 
              status: 'sent',
              sent_at: new Date().toISOString(),
              recipient_email: invoice.client.email
            })
          });
          processed++;
        } else {
          errors++;
          console.error(`Failed to send reminder for invoice ${invoice.invoice_number}`);
        }
      } catch (err) {
        errors++;
        console.error(`Error processing reminder ${reminder.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processed} reminders with ${errors} errors`,
        processed,
        errors,
        total: reminders.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error processing scheduled reminders:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
