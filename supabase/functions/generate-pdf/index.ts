// Self-contained generate-pdf function with Browserless integration
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BROWSERLESS_API_KEY = Deno.env.get('BROWSERLESS_API_KEY');

// CORS Configuration
const ALLOWED_ORIGINS = [
  'https://app.billdora.com',
  'https://billdora.com',
  'https://dkwnlxnqw399.space.minimax.io',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) || 
    origin.endsWith('.space.minimax.io') ||
    origin.endsWith('.vercel.app')
  );
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

// Auth verification
async function verifyAuth(req: Request): Promise<{ authenticated: boolean; user?: { id: string }; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { authenticated: false, error: 'Missing Authorization header' };
  
  const token = authHeader.replace('Bearer ', '');
  if (!token || token === authHeader) return { authenticated: false, error: 'Invalid Authorization format' };
  
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKey && token === serviceRoleKey) return { authenticated: true };
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { authenticated: false, error: error?.message || 'Invalid token' };
    return { authenticated: true, user: { id: user.id } };
  } catch (e) {
    return { authenticated: false, error: 'Token verification failed' };
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return new Response(
      JSON.stringify({ error: { code: 'UNAUTHORIZED', message: auth.error || 'Unauthorized' } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const requestBody = await req.json();
    console.log('[generate-pdf] Request received, keys:', Object.keys(requestBody));
    
    const { type, data, returnType = 'pdf' } = requestBody;
    
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

    console.log('[generate-pdf] HTML generated, length:', html.length);

    // Check for Browserless API key
    if (!BROWSERLESS_API_KEY) {
      console.error('[generate-pdf] BROWSERLESS_API_KEY not found');
      throw new Error('Browserless API key not configured. Please add BROWSERLESS_API_KEY to Supabase secrets.');
    }

    console.log('[generate-pdf] Calling Browserless API...');
    
    // Use Browserless v2 API
    const browserlessUrl = `https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_API_KEY}`;
    
    let browserlessResponse;
    try {
      browserlessResponse = await fetch(browserlessUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: html,
          options: {
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
          }
        })
      });
    } catch (fetchError: any) {
      console.error('[generate-pdf] Fetch error:', fetchError);
      throw new Error(`Failed to reach Browserless API: ${fetchError.message}`);
    }

    console.log('[generate-pdf] Browserless response status:', browserlessResponse.status);
    
    if (!browserlessResponse.ok) {
      const errorText = await browserlessResponse.text();
      console.error('[generate-pdf] Browserless error:', errorText);
      throw new Error(`Browserless API error: ${browserlessResponse.status} - ${errorText.substring(0, 300)}`);
    }

    const contentType = browserlessResponse.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) {
      const bodyText = await browserlessResponse.text();
      console.error('[generate-pdf] Unexpected content type:', contentType, bodyText.substring(0, 200));
      throw new Error(`Browserless returned ${contentType} instead of PDF`);
    }

    // Get PDF as ArrayBuffer and convert to base64
    const pdfBuffer = await browserlessResponse.arrayBuffer();
    console.log('[generate-pdf] PDF generated, size:', pdfBuffer.byteLength, 'bytes');
    
    // Verify PDF header
    const firstBytes = new Uint8Array(pdfBuffer.slice(0, 4));
    const header = String.fromCharCode(...firstBytes);
    if (header !== '%PDF') {
      throw new Error('Response does not appear to be a valid PDF');
    }

    // Convert to base64
    const uint8Array = new Uint8Array(pdfBuffer);
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
    
    console.log('[generate-pdf] Success! Base64 length:', pdfBase64.length);
    
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
    console.error('[generate-pdf] Error:', error.message);
    return new Response(JSON.stringify({
      error: { 
        code: 'PDF_FAILED', 
        message: error.message || 'Unknown error occurred'
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
      ${company?.logo ? `<img src="${company.logo}" class="cover-logo" alt="Logo">` : ''}
      <h1 class="cover-title">${title || 'Quote'}</h1>
      <p class="cover-subtitle">Prepared for ${client?.name || 'Client'}</p>
      <p class="cover-volume">${volumeNumber || ''}</p>
    </div>
  </div>
  <div class="details-page">
    <div class="header">
      <div class="company-info">
        <h2>${company?.name || ''}</h2>
        <p>${company?.address || ''}</p>
        <p>${company?.city || ''} ${company?.state || ''} ${company?.zip || ''}</p>
        <p>${company?.phone || ''}</p>
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
            <td>${item.description || ''}</td>
            <td style="text-align:right">${item.qty || 0}</td>
            <td style="text-align:right">$${(item.unitPrice || 0).toFixed(2)}</td>
            <td style="text-align:right">$${((item.qty || 0) * (item.unitPrice || 0)).toFixed(2)}</td>
          </tr>
        `).join('') || ''}
      </tbody>
    </table>
    <div class="totals">
      <p>Subtotal: $${(totals?.subtotal || 0).toFixed(2)}</p>
      <p>Tax: $${(totals?.tax || 0).toFixed(2)}</p>
      <p class="total-row">Total: $${(totals?.total || 0).toFixed(2)}</p>
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
      <p class="invoice-number">${invoiceNumber || ''}</p>
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
        <tr><td>${item.description || ''}</td><td style="text-align:right">$${(item.amount || 0).toFixed(2)}</td></tr>
      `).join('') || `<tr><td>Services</td><td style="text-align:right">$${(totals?.total || 0).toFixed(2)}</td></tr>`}
    </tbody>
  </table>
  <div class="totals">
    <p>Subtotal: $${(totals?.subtotal || totals?.total || 0).toFixed(2)}</p>
    <p>Tax: $${(totals?.tax || 0).toFixed(2)}</p>
    <p class="total-row">Total Due: $${(totals?.total || 0).toFixed(2)}</p>
    ${dueDate ? `<p style="color:#666;margin-top:8px;">Due: ${dueDate}</p>` : ''}
  </div>
</body>
</html>`;
}
