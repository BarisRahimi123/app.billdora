import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const BROWSERLESS_API_KEY = Deno.env.get('BROWSERLESS_API_KEY');

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
    const requestBody = await req.json();
    console.log('[generate-pdf] Request body keys:', Object.keys(requestBody));
    console.log('[generate-pdf] returnType value:', requestBody.returnType, 'type:', typeof requestBody.returnType);
    
    const { type, data, returnType = 'pdf' } = requestBody;
    
    console.log('[generate-pdf] After destructure - returnType:', returnType, 'type:', typeof returnType);
    
    if (!type || !data) {
      throw new Error('Type and data are required');
    }

    // Generate HTML based on document type
    let html = '';
    
    if (type === 'quote') {
      html = generateQuoteHtml(data);
    } else if (type === 'invoice') {
      html = generateInvoiceHtml(data);
    } else {
      throw new Error('Invalid document type');
    }

    // DIAGNOSTIC: Log what we received
    console.log('[generate-pdf] returnType received:', returnType, 'type:', typeof returnType);
    console.log('[generate-pdf] returnType === "html":', returnType === 'html');
    console.log('[generate-pdf] returnType === "pdf":', returnType === 'pdf');
    
    // TEMPORARY: Force PDF mode for testing
    const forcePdfMode = true;
    
    // If returnType is 'html', return HTML for preview (legacy support)
    if (returnType === 'html' && !forcePdfMode) {
      console.log('[generate-pdf] Returning HTML (legacy mode)');
      return new Response(JSON.stringify({
        data: { html, type }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[generate-pdf] Proceeding to PDF generation with Browserless');
    
    // Generate PDF using Browserless
    if (!BROWSERLESS_API_KEY) {
      console.error('[generate-pdf] BROWSERLESS_API_KEY not found in environment');
      throw new Error('Browserless API key not configured');
    }

    console.log('[generate-pdf] API key present, length:', BROWSERLESS_API_KEY.length);
    console.log('[generate-pdf] HTML length:', html.length);
    console.log('[generate-pdf] Calling Browserless API...');
    
    const browserlessUrl = `https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_API_KEY}`;
    const requestBody = {
      html: html,
      options: {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px'
        }
      }
    };
    
    console.log('[generate-pdf] Request body keys:', Object.keys(requestBody));
    
    let browserlessResponse;
    try {
      browserlessResponse = await fetch(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
    } catch (fetchError) {
      console.error('[generate-pdf] Fetch error:', fetchError);
      throw new Error(`Failed to reach Browserless API: ${fetchError.message}`);
    }

    console.log('[generate-pdf] Browserless response status:', browserlessResponse.status);
    console.log('[generate-pdf] Browserless response headers:', Object.fromEntries(browserlessResponse.headers));
    
    if (!browserlessResponse.ok) {
      const errorText = await browserlessResponse.text();
      console.error('[generate-pdf] Browserless error response:', errorText);
      throw new Error(`Browserless API error: ${browserlessResponse.status} - ${errorText.substring(0, 300)}`);
    }

    const contentType = browserlessResponse.headers.get('content-type') || '';
    console.log('[generate-pdf] Content-Type:', contentType);
    
    if (!contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) {
      const bodyText = await browserlessResponse.text();
      console.error('[generate-pdf] Unexpected content type:', contentType);
      console.error('[generate-pdf] Response body:', bodyText.substring(0, 500));
      throw new Error(`Browserless returned ${contentType} instead of PDF`);
    }

    // Get PDF as ArrayBuffer
    const pdfBuffer = await browserlessResponse.arrayBuffer();
    console.log('[generate-pdf] PDF generated, size:', pdfBuffer.byteLength, 'bytes');
    
    // Verify it's a PDF (starts with %PDF)
    const firstBytes = new Uint8Array(pdfBuffer.slice(0, 4));
    const header = String.fromCharCode(...firstBytes);
    console.log('[generate-pdf] PDF header:', header);
    if (header !== '%PDF') {
      throw new Error('Response does not appear to be a valid PDF');
    }

    // Convert ArrayBuffer to base64 using Deno's standard encoding
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Use standard base64 encoding that works with binary data
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let pdfBase64 = '';
    const len = uint8Array.length;
    
    for (let i = 0; i < len; i += 3) {
      const byte1 = uint8Array[i];
      const byte2 = i + 1 < len ? uint8Array[i + 1] : 0;
      const byte3 = i + 2 < len ? uint8Array[i + 2] : 0;
      
      pdfBase64 += base64Chars[byte1 >> 2];
      pdfBase64 += base64Chars[((byte1 & 3) << 4) | (byte2 >> 4)];
      pdfBase64 += i + 1 < len ? base64Chars[((byte2 & 15) << 2) | (byte3 >> 6)] : '=';
      pdfBase64 += i + 2 < len ? base64Chars[byte3 & 63] : '=';
    }
    
    console.log('[generate-pdf] Base64 length:', pdfBase64.length);
    console.log('[generate-pdf] Base64 preview:', pdfBase64.substring(0, 50));
    
    return new Response(JSON.stringify({
      data: { 
        pdf: pdfBase64, 
        type,
        filename: `${data.title || type}-${new Date().toISOString().split('T')[0]}.pdf`
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('PDF generation error:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({
      error: { 
        code: 'PDF_FAILED', 
        message: error.message || 'Unknown error occurred',
        details: error.stack?.split('\n')[0] || ''
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function generateQuoteHtml(data: any): string {
  const { title, company, client, lineItems, totals, coverBgUrl, volumeNumber, validUntil, terms } = data;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; }
    .cover-page {
      width: 100%; height: 100vh; position: relative;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      ${coverBgUrl ? `background-image: url('${coverBgUrl}'); background-size: cover; background-position: center;` : ''}
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      page-break-after: always;
    }
    .cover-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
    .cover-content { position: relative; z-index: 1; text-align: center; color: white; padding: 40px; }
    .cover-logo { max-height: 80px; margin-bottom: 40px; }
    .cover-title { font-size: 48px; font-weight: 300; margin-bottom: 16px; }
    .cover-subtitle { font-size: 24px; opacity: 0.8; }
    .cover-volume { font-size: 18px; opacity: 0.7; margin-top: 24px; }
    .details-page { padding: 40px; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .company-info h2 { font-size: 24px; margin-bottom: 8px; }
    .company-info p { font-size: 12px; color: #666; }
    .client-box { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .client-box h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
    .client-box p { font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #f5f5f5; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .totals { text-align: right; margin-top: 20px; }
    .totals p { margin: 4px 0; }
    .total-row { font-size: 20px; font-weight: bold; }
    .terms { margin-top: 40px; font-size: 11px; color: #666; }
    .terms h4 { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-overlay"></div>
    <div class="cover-content">
      ${company.logo ? `<img src="${company.logo}" class="cover-logo" alt="Logo">` : ''}
      <h1 class="cover-title">${title || 'Quote'}</h1>
      <p class="cover-subtitle">Prepared for ${client?.name || 'Client'}</p>
      <p class="cover-volume">${volumeNumber || ''}</p>
    </div>
  </div>
  <div class="details-page">
    <div class="header">
      <div class="company-info">
        <h2>${company.name}</h2>
        <p>${company.address || ''}</p>
        <p>${company.city || ''} ${company.state || ''} ${company.zip || ''}</p>
        <p>${company.phone || ''}</p>
      </div>
      <div class="client-box">
        <h3>Prepared For</h3>
        <p><strong>${client?.name || ''}</strong></p>
        <p>${client?.email || ''}</p>
        <p>${client?.phone || ''}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems?.map((item: any) => `
          <tr>
            <td>${item.description}</td>
            <td style="text-align:right">${item.qty}</td>
            <td style="text-align:right">$${item.unitPrice?.toFixed(2)}</td>
            <td style="text-align:right">$${(item.qty * item.unitPrice).toFixed(2)}</td>
          </tr>
        `).join('') || ''}
      </tbody>
    </table>
    <div class="totals">
      <p>Subtotal: $${totals?.subtotal?.toFixed(2) || '0.00'}</p>
      <p>Tax: $${totals?.tax?.toFixed(2) || '0.00'}</p>
      <p class="total-row">Total: $${totals?.total?.toFixed(2) || '0.00'}</p>
    </div>
    ${validUntil ? `<p style="margin-top:20px;color:#666;">Valid until: ${validUntil}</p>` : ''}
    <div class="terms">
      <h4>Terms & Conditions</h4>
      <p>${terms?.replace(/\n/g, '<br>') || ''}</p>
    </div>
  </div>
</body>
</html>`;
}

function generateInvoiceHtml(data: any): string {
  const { invoiceNumber, company, client, lineItems, totals, dueDate, status } = data;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .invoice-title { font-size: 36px; font-weight: 300; color: #1a1a1a; }
    .invoice-number { font-size: 14px; color: #666; margin-top: 8px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; text-transform: uppercase; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-sent { background: #dbeafe; color: #1e40af; }
    .status-draft { background: #f3f4f6; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #f5f5f5; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .totals { text-align: right; }
    .total-row { font-size: 24px; font-weight: bold; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="invoice-title">Invoice</h1>
      <p class="invoice-number">${invoiceNumber}</p>
      <span class="status-badge status-${status || 'draft'}">${status || 'Draft'}</span>
    </div>
    <div style="text-align:right">
      <h2>${company?.name || ''}</h2>
      <p>${company?.address || ''}</p>
      <p>${company?.phone || ''}</p>
    </div>
  </div>
  <div style="background:#f5f5f5;padding:20px;border-radius:8px;margin-bottom:30px;">
    <h3 style="font-size:12px;text-transform:uppercase;color:#666;margin-bottom:8px;">Bill To</h3>
    <p><strong>${client?.name || ''}</strong></p>
    <p>${client?.email || ''}</p>
  </div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${lineItems?.map((item: any) => `
        <tr><td>${item.description}</td><td style="text-align:right">$${item.amount?.toFixed(2)}</td></tr>
      `).join('') || `<tr><td>Services</td><td style="text-align:right">$${totals?.total?.toFixed(2) || '0.00'}</td></tr>`}
    </tbody>
  </table>
  <div class="totals">
    <p>Subtotal: $${totals?.subtotal?.toFixed(2) || totals?.total?.toFixed(2) || '0.00'}</p>
    <p>Tax: $${totals?.tax?.toFixed(2) || '0.00'}</p>
    <p class="total-row">Total Due: $${totals?.total?.toFixed(2) || '0.00'}</p>
    ${dueDate ? `<p style="color:#666;margin-top:8px;">Due: ${dueDate}</p>` : ''}
  </div>
</body>
</html>`;
}
