// Auto-match receipts to bank transactions based on date and amount
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch unmatched receipts
    const receiptsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/receipts?company_id=eq.${company_id}&matched_transaction_id=is.null&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const receipts = await receiptsRes.json();

    // Fetch unmatched transactions (expenses)
    const transactionsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bank_transactions?company_id=eq.${company_id}&amount=lt.0&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const transactions = await transactionsRes.json();

    const matches: { receipt_id: string; transaction_id: string; confidence: string }[] = [];
    const matchedReceiptIds = new Set<string>();
    const matchedTransactionIds = new Set<string>();

    // Match logic: date within 3 days and amount within 5%
    for (const receipt of receipts) {
      if (!receipt.amount || !receipt.receipt_date || matchedReceiptIds.has(receipt.id)) continue;

      for (const tx of transactions) {
        if (matchedTransactionIds.has(tx.id)) continue;

        const txAmount = Math.abs(tx.amount);
        const receiptAmount = receipt.amount;
        const amountDiff = Math.abs(txAmount - receiptAmount) / receiptAmount;

        const receiptDate = new Date(receipt.receipt_date);
        const txDate = new Date(tx.date);
        const daysDiff = Math.abs((receiptDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));

        // Exact match (same date, amount within 1%)
        if (daysDiff === 0 && amountDiff <= 0.01) {
          matches.push({ receipt_id: receipt.id, transaction_id: tx.id, confidence: 'high' });
          matchedReceiptIds.add(receipt.id);
          matchedTransactionIds.add(tx.id);
          break;
        }
        // Close match (within 3 days, amount within 5%)
        else if (daysDiff <= 3 && amountDiff <= 0.05) {
          matches.push({ receipt_id: receipt.id, transaction_id: tx.id, confidence: 'medium' });
          matchedReceiptIds.add(receipt.id);
          matchedTransactionIds.add(tx.id);
          break;
        }
      }
    }

    // Update matched receipts in database
    for (const match of matches) {
      await fetch(`${SUPABASE_URL}/rest/v1/receipts?id=eq.${match.receipt_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ matched_transaction_id: match.transaction_id })
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        matched: matches.length,
        matches
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-match error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
