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
    const { quoteId, includeSignature } = await req.json();
    
    if (!quoteId) {
      throw new Error('Quote ID is required');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch quote data
    const quoteRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&select=*`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const quotes = await quoteRes.json();
    const quote = quotes[0];
    
    if (!quote) {
      throw new Error('Quote not found');
    }

    // Fetch company
    const companyRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${quote.company_id}&select=*`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const companies = await companyRes.json();
    const company = companies[0];

    // Fetch company settings for default_terms
    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${quote.company_id}&select=default_terms`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const settings = await settingsRes.json();
    const defaultTerms = settings[0]?.default_terms || '';

    // Fetch client
    const clientRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${quote.client_id}&select=*`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const clients = await clientRes.json();
    const client = clients[0];

    // Fetch line items
    const lineItemsRes = await fetch(`${SUPABASE_URL}/rest/v1/quote_line_items?quote_id=eq.${quoteId}&select=*`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const lineItems = await lineItemsRes.json();

    // Fetch signature if requested
    let signature = null;
    let signedDate = null;
    let signerName = null;
    if (includeSignature) {
      const responseRes = await fetch(`${SUPABASE_URL}/rest/v1/quote_responses?quote_id=eq.${quoteId}&status=eq.accepted&select=*&limit=1`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY
        }
      });
      const responses = await responseRes.json();
      if (responses[0]) {
        signature = responses[0].signature_data;
        signedDate = responses[0].created_at;
        signerName = responses[0].signer_name || client?.primary_contact_name || client?.name;
      }
    }

    // Calculate totals
    const subtotal = lineItems.reduce((sum: number, item: any) => sum + ((item.quantity || item.qty || 0) * (item.unit_price || 0)), 0);
    const taxRate = quote.tax_rate || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    // Generate HTML
    const html = generateProposalHtml({
      quote,
      company,
      client,
      lineItems,
      totals: { subtotal, tax, total },
      signature,
      signedDate,
      signerName,
      defaultTerms
    });

    return new Response(JSON.stringify({
      success: true,
      html
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(JSON.stringify({
      error: { code: 'PDF_FAILED', message: error.message }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function generateProposalHtml(data: any): string {
  const { quote, company, client, lineItems, totals, signature, signedDate, signerName, defaultTerms } = data;
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const signatureSection = signature ? `
    <div style="margin-top: 60px; padding-top: 40px; border-top: 2px solid #eee;">
      <h3 style="font-size: 18px; margin-bottom: 20px; color: #333;">Accepted & Signed</h3>
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <img src="${signature}" style="max-height: 80px; max-width: 300px;" alt="Signature" />
          <div style="border-top: 1px solid #333; padding-top: 8px; margin-top: 8px;">
            <p style="font-weight: 600;">${signerName || ''}</p>
            <p style="font-size: 12px; color: #666;">Date: ${formatDate(signedDate)}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="background: #d1fae5; color: #065f46; padding: 8px 16px; border-radius: 20px; font-weight: 600; display: inline-block;">
            ✓ ACCEPTED
          </div>
        </div>
      </div>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Proposal - ${quote.title || 'Quote'}</title>
  <style>
    @page { size: A4; margin: 0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-break { page-break-inside: avoid; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; line-height: 1.5; }
    
    .cover-page {
      width: 100%; min-height: 100vh; position: relative;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      ${quote.cover_image_url ? `background-image: url('${quote.cover_image_url}'); background-size: cover; background-position: center;` : ''}
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      page-break-after: always;
    }
    .cover-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
    .cover-content { position: relative; z-index: 1; text-align: center; color: white; padding: 40px; }
    .cover-logo { max-height: 80px; margin-bottom: 40px; }
    .cover-title { font-size: 48px; font-weight: 300; margin-bottom: 16px; }
    .cover-subtitle { font-size: 24px; opacity: 0.8; }
    .cover-volume { font-size: 18px; opacity: 0.7; margin-top: 24px; }
    
    .details-page { padding: 40px 60px; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .company-info h2 { font-size: 24px; margin-bottom: 8px; color: #476E66; }
    .company-info p { font-size: 12px; color: #666; line-height: 1.6; }
    .client-box { background: #f8f9fa; padding: 24px; border-radius: 12px; min-width: 250px; }
    .client-box h3 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 12px; letter-spacing: 1px; }
    .client-box p { font-size: 14px; margin: 4px 0; }
    .client-box .name { font-weight: 600; font-size: 16px; }
    
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #f8f9fa; padding: 14px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
    td { padding: 16px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    
    .totals { margin-top: 30px; margin-left: auto; width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
    .totals-row.total { font-size: 20px; font-weight: 700; padding-top: 16px; border-top: 2px solid #1a1a1a; margin-top: 8px; }
    
    .terms { margin-top: 50px; padding: 24px; background: #f8f9fa; border-radius: 12px; }
    .terms h4 { font-size: 14px; margin-bottom: 12px; color: #333; }
    .terms p { font-size: 12px; color: #666; white-space: pre-wrap; }
    
    .valid-until { margin-top: 20px; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-overlay"></div>
    <div class="cover-content">
      ${company?.logo_url ? `<img src="${company.logo_url}" class="cover-logo" alt="Logo">` : ''}
      <h1 class="cover-title">${quote.title || 'Proposal'}</h1>
      <p class="cover-subtitle">Prepared for ${client?.name || 'Valued Client'}</p>
      <p class="cover-volume">${quote.volume_number || ''}</p>
    </div>
  </div>
  
  <div class="details-page">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eee;">
      <h2 style="font-size: 20px; color: #476E66;">Proposal #${quote.quote_number || ''}</h2>
      <p style="font-size: 14px; color: #666;">Date: ${formatDate(quote.created_at)}</p>
    </div>
    <div class="header">
      <div class="company-info">
        ${company?.logo_url ? `<img src="${company.logo_url}" style="max-height: 50px; margin-bottom: 16px;" alt="Logo">` : ''}
        <h2>${company?.company_name || ''}</h2>
        <p>${company?.address || ''}</p>
        <p>${company?.city || ''}${company?.city && company?.state ? ', ' : ''}${company?.state || ''} ${company?.zip || ''}</p>
        <p>${company?.phone || ''}</p>
        <p>${company?.email || ''}</p>
      </div>
      <div class="client-box">
        <h3>Prepared For</h3>
        <p class="name">${client?.name || ''}</p>
        ${client?.primary_contact_name ? `<p>${client.primary_contact_name}</p>` : ''}
        <p>${client?.email || ''}</p>
        <p>${client?.phone || ''}</p>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th style="width: 50%">Description</th>
          <th style="text-align: center; width: 10%">Qty</th>
          <th style="text-align: right; width: 20%">Unit Price</th>
          <th style="text-align: right; width: 20%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems?.map((item: any) => `
          <tr>
            <td>${item.description || ''}</td>
            <td style="text-align: center">${item.quantity || item.qty || 0}</td>
            <td style="text-align: right">$${(item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: right">$${((item.quantity || item.qty || 0) * (item.unit_price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `).join('') || '<tr><td colspan="4" style="text-align: center; color: #999;">No line items</td></tr>'}
      </tbody>
    </table>
    
    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>$${totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      ${quote.tax_rate > 0 ? `
      <div class="totals-row">
        <span>Tax (${quote.tax_rate}%)</span>
        <span>$${totals.tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      ` : ''}
      <div class="totals-row total">
        <span>Total</span>
        <span>$${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
    
    ${quote.valid_until ? `<p class="valid-until">Valid until: ${formatDate(quote.valid_until)}</p>` : ''}
    
    ${defaultTerms ? `
    <div class="terms">
      <h4>Terms & Conditions</h4>
      <p>${defaultTerms}</p>
    </div>
    ` : ''}
    
    ${signatureSection}
  </div>
</body>
</html>`;
}
