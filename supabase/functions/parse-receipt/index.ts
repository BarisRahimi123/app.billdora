// Parse receipt image using Google Gemini Vision API for OCR
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

interface ReceiptData {
  vendor: string | null;
  amount: number | null;
  date: string | null;
  category: string | null;
  items: { description: string; amount: number }[];
  raw_text: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Verify authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return unauthorizedResponse(corsHeaders, auth.error);
  }

  try {
    const { image_url, image_base64, company_id, user_id } = await req.json();

    if ((!image_url && !image_base64) || !company_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'image (url or base64), company_id, and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let receiptData: ReceiptData = {
      vendor: null,
      amount: null,
      date: null,
      category: null,
      items: [],
      raw_text: ''
    };

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Prepare image for Gemini
    let imageData: string;
    if (image_base64) {
      imageData = image_base64;
    } else {
      // Fetch image and convert to base64
      const imageResponse = await fetch(image_url);
      const imageBuffer = await imageResponse.arrayBuffer();
      imageData = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    }

    // Call Gemini Vision API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageData
                }
              },
              {
                text: `Analyze this receipt image and extract the following information in JSON format:
{
  "vendor": "store/business name",
  "amount": total amount as number (e.g., 45.99),
  "date": "YYYY-MM-DD format if visible",
  "category": one of: "office_supplies", "meals", "travel", "equipment", "materials", "utilities", "services", "other",
  "items": [{"description": "item name", "amount": price}],
  "raw_text": "full text from receipt"
}
Only return valid JSON, no markdown or additional text.`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024
          }
        })
      }
    );

    const geminiResult = await geminiResponse.json();
    
    if (geminiResult.candidates?.[0]?.content?.parts?.[0]?.text) {
      try {
        const content = geminiResult.candidates[0].content.parts[0].text;
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          receiptData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
      }
    }

    // Save receipt to database
    const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/receipts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        company_id,
        user_id,
        image_url,
        vendor: receiptData.vendor,
        amount: receiptData.amount,
        receipt_date: receiptData.date,
        category: receiptData.category,
        ocr_raw: receiptData
      })
    });

    const savedReceipt = await insertResponse.json();

    if (!insertResponse.ok) {
      throw new Error(savedReceipt.message || 'Failed to save receipt');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        receipt: savedReceipt[0],
        extracted: receiptData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Parse receipt error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
