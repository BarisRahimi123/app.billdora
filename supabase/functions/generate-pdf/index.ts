// Self-contained generate-pdf function with Browserless integration
// Version 3.1 - Binary PDF response (force fresh deployment)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

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

// Generate PDF using Browserless
async function generatePdfWithBrowserless(htmlContent: string): Promise<Uint8Array> {
  if (!BROWSERLESS_API_KEY) {
    throw new Error('Browserless API key not configured');
  }

  console.log('[generate-pdf] Generating PDF with Browserless, HTML length:', htmlContent.length);

  const response = await fetch(`https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: htmlContent,
      options: {
        format: 'Letter',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        preferCSSPageSize: true,
        scale: 1.0
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Browserless API error: ${response.status} - ${errorText}`);
  }

  const buffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Verify PDF validity (avoid spread operator)
  const headerBytes = uint8Array.slice(0, 4);
  const header = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
  if (header !== '%PDF') {
    throw new Error('Response is not a valid PDF');
  }

  console.log(`[generate-pdf] PDF generated successfully, size: ${uint8Array.length / 1024}KB`);
  return uint8Array;
}

// Process raw HTML from frontend (captured DOM with inline styles)
async function processRawHtml(data: any): Promise<string> {
  const { html: pagesHtml, css: cssStyles, title } = data;

  console.log('[generate-pdf] HTML length:', pagesHtml?.length || 0);
  console.log('[generate-pdf] CSS length:', cssStyles?.length || 0);
  console.log('[generate-pdf] Using inline computed styles from frontend');

  // NO NEED for Tailwind CDN - all styles are inlined from frontend
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title || 'Document'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* PDF print settings - minimal wrapper for inline styles */
    @page { 
      size: letter; 
      margin: 0; 
    }
    
    * { 
      -webkit-print-color-adjust: exact !important; 
      print-color-adjust: exact !important;
    }
    
    body {
      margin: 0;
      padding: 0;
    }
    
    /* Page break settings */
    .export-page {
      page-break-after: always !important;
    }
    .export-page:last-child {
      page-break-after: auto !important;
    }
    
    /* Additional CSS from frontend (should be minimal since styles are inline) */
    ${cssStyles || ''}
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
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
    const { type, data, returnType = 'pdf' } = requestBody;

    if (!type || !data) {
      throw new Error('Type and data are required');
    }

    console.log(`[generate-pdf] Received request type: ${type}`);


    let html = '';

    if (type === 'raw-html') {
      console.log('[generate-pdf] Processing raw HTML from frontend preview');
      html = await processRawHtml(data);
    } else {
      throw new Error('Only raw-html type is supported for now');
    }

    if (returnType === 'pdf') {
      console.log('[generate-pdf] Step 1: Starting PDF generation with Browserless...');
      const pdfBytes = await generatePdfWithBrowserless(html);
      
      console.log('[generate-pdf] Step 2: PDF generated, size:', pdfBytes.length, 'bytes');
      console.log('[generate-pdf] Step 3: Returning PDF as binary response...');

      // Return PDF directly as binary data (no base64 encoding needed!)
      return new Response(
        pdfBytes,
        {
          status: 200,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="proposal.pdf"',
            'Content-Length': pdfBytes.length.toString()
          }
        }
      );
    } else {
      return new Response(
        JSON.stringify({ success: true, html }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('[generate-pdf] Error:', error?.message || error);
    // Safely serialize error without circular references
    const errorMessage = typeof error === 'string' ? error : (error?.message || 'Internal server error');
    const errorStack = typeof error?.stack === 'string' ? error.stack.substring(0, 500) : undefined;
    
    return new Response(
      JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          details: errorStack
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});