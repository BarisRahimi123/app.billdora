// Edge function to process recurring invoices
// Runs daily via cron job to generate invoices based on schedule

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const today = new Date().toISOString().split('T')[0];

    // Fetch recurring invoices due today
    const recurringResponse = await fetch(
      `${supabaseUrl}/rest/v1/recurring_invoices?next_run_date=lte.${today}&is_active=eq.true&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!recurringResponse.ok) {
      throw new Error('Failed to fetch recurring invoices');
    }

    const recurringInvoices = await recurringResponse.json();
    const results: { success: number; failed: number; details: string[] } = {
      success: 0,
      failed: 0,
      details: [],
    };

    for (const recurring of recurringInvoices) {
      try {
        // Get the template invoice to copy
        const templateResponse = await fetch(
          `${supabaseUrl}/rest/v1/invoices?id=eq.${recurring.template_invoice_id}&select=*`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );

        const templates = await templateResponse.json();
        if (!templates || templates.length === 0) {
          results.failed++;
          results.details.push(`Template invoice not found for recurring ${recurring.id}`);
          continue;
        }

        const template = templates[0];

        // Get next invoice number
        const invoiceCountResponse = await fetch(
          `${supabaseUrl}/rest/v1/invoices?company_id=eq.${recurring.company_id}&select=invoice_number&order=created_at.desc&limit=1`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );

        const lastInvoices = await invoiceCountResponse.json();
        let nextNumber = 'INV-0001';
        if (lastInvoices && lastInvoices.length > 0) {
          const lastNum = lastInvoices[0].invoice_number;
          const match = lastNum.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1]) + 1;
            nextNumber = `INV-${num.toString().padStart(4, '0')}`;
          }
        }

        // Calculate new due date based on template's original due days
        const templateCreated = new Date(template.created_at);
        const templateDue = new Date(template.due_date);
        const daysDiff = Math.ceil((templateDue.getTime() - templateCreated.getTime()) / (1000 * 60 * 60 * 24));
        const newDueDate = new Date();
        newDueDate.setDate(newDueDate.getDate() + daysDiff);

        // Create new invoice
        const newInvoice = {
          company_id: recurring.company_id,
          client_id: recurring.client_id,
          project_id: recurring.project_id,
          invoice_number: nextNumber,
          status: 'draft',
          subtotal: template.subtotal,
          tax_amount: template.tax_amount,
          total: template.total,
          currency: template.currency || 'USD',
          due_date: newDueDate.toISOString().split('T')[0],
          calculator_type: template.calculator_type,
          pdf_template_id: template.pdf_template_id,
        };

        const createResponse = await fetch(
          `${supabaseUrl}/rest/v1/invoices`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(newInvoice),
          }
        );

        if (!createResponse.ok) {
          throw new Error(`Failed to create invoice: ${await createResponse.text()}`);
        }

        const createdInvoices = await createResponse.json();
        const createdInvoice = createdInvoices[0];

        // Copy line items
        const lineItemsResponse = await fetch(
          `${supabaseUrl}/rest/v1/invoice_line_items?invoice_id=eq.${recurring.template_invoice_id}&select=*`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );

        const lineItems = await lineItemsResponse.json();
        if (lineItems && lineItems.length > 0) {
          const newLineItems = lineItems.map((item: Record<string, unknown>) => ({
            invoice_id: createdInvoice.id,
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
            unit: item.unit,
          }));

          await fetch(
            `${supabaseUrl}/rest/v1/invoice_line_items`,
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(newLineItems),
            }
          );
        }

        // Calculate next run date
        const nextRunDate = calculateNextRunDate(recurring.frequency, new Date());

        // Update recurring invoice
        await fetch(
          `${supabaseUrl}/rest/v1/recurring_invoices?id=eq.${recurring.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              last_run_date: today,
              next_run_date: nextRunDate.toISOString().split('T')[0],
              updated_at: new Date().toISOString(),
            }),
          }
        );

        results.success++;
        results.details.push(`Created invoice ${nextNumber} from recurring ${recurring.id}`);
      } catch (error) {
        results.failed++;
        results.details.push(`Error processing recurring ${recurring.id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        processed: recurringInvoices.length,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateNextRunDate(frequency: string, fromDate: Date): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'bi-weekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}
