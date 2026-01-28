// Edge function to check for overdue invoices and send notifications
// Should be triggered daily via cron job

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];
    
    // Find invoices that are sent (not paid) and past due date
    const { data: overdueInvoices, error } = await supabase
      .from('invoices')
      .select(`
        id, 
        invoice_number, 
        total, 
        due_date, 
        company_id,
        client:clients(id, name, email),
        company:companies(name)
      `)
      .eq('status', 'sent')
      .lt('due_date', today);

    if (error) {
      console.error('Failed to fetch overdue invoices:', error);
      throw error;
    }

    console.log(`Found ${overdueInvoices?.length || 0} overdue invoices`);

    const results = [];

    for (const invoice of overdueInvoices || []) {
      const dueDate = new Date(invoice.due_date);
      const todayDate = new Date(today);
      const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      // Update invoice status to overdue
      await supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('id', invoice.id);

      // Only send notifications for invoices that just became overdue (1 day) or at milestones (7, 14, 30, 60, 90 days)
      const milestones = [1, 7, 14, 30, 60, 90];
      if (!milestones.includes(daysOverdue)) {
        continue;
      }

      // Create in-app notification
      try {
        await supabase.from('notifications').insert({
          company_id: invoice.company_id,
          type: 'invoice_overdue',
          title: '⚠️ Invoice Overdue',
          message: `Invoice #${invoice.invoice_number} for ${(invoice.client as any)?.name || 'client'} is ${daysOverdue} days overdue ($${Number(invoice.total).toFixed(2)})`,
          reference_id: invoice.id,
          reference_type: 'invoice',
          is_read: false,
        });
      } catch (e) {
        console.warn('Failed to create notification:', e);
      }

      // Get company admin emails for notification
      const { data: admins } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('company_id', invoice.company_id)
        .eq('role', 'admin')
        .limit(3);

      // Send email to admins
      for (const admin of admins || []) {
        try {
          const baseUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://billdora.com';
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              to: admin.email,
              subject: `⚠️ Invoice #${invoice.invoice_number} is ${daysOverdue} days overdue`,
              type: 'invoice_overdue',
              data: {
                invoiceNumber: invoice.invoice_number,
                clientName: (invoice.client as any)?.name,
                clientEmail: (invoice.client as any)?.email,
                companyName: (invoice.company as any)?.name,
                total: invoice.total,
                dueDate: new Date(invoice.due_date).toLocaleDateString(),
                daysOverdue,
                viewUrl: `${baseUrl}/invoicing`,
              },
            }),
          });
        } catch (e) {
          console.warn('Failed to send email:', e);
        }
      }

      results.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        days_overdue: daysOverdue,
        notified: true,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: overdueInvoices?.length || 0,
        notified: results.length,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Check overdue invoices error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to check overdue invoices' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
