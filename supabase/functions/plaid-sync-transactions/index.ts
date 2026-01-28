// Sync transactions from Plaid
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID') || '';
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') || '';
if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('[SECURITY] PLAID_CLIENT_ID or PLAID_SECRET not set in environment variables');
}
const PLAID_ENV = 'sandbox';

const PLAID_BASE_URL = PLAID_ENV === 'sandbox' 
  ? 'https://sandbox.plaid.com'
  : 'https://production.plaid.com';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return unauthorizedResponse(corsHeaders, auth.error);
  }

  try {
    const { plaid_item_id } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the Plaid item
    const { data: plaidItem, error: itemError } = await supabase
      .from('plaid_items')
      .select('*, plaid_accounts(*)')
      .eq('id', plaid_item_id)
      .single();

    if (itemError || !plaidItem) {
      return new Response(
        JSON.stringify({ error: 'Plaid item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create account_id to plaid_account_id mapping
    const accountMap = new Map();
    for (const acc of plaidItem.plaid_accounts) {
      accountMap.set(acc.account_id, acc.id);
    }

    // Sync transactions using cursor-based pagination
    let cursor = plaidItem.cursor;
    let hasMore = true;
    let addedCount = 0;
    let modifiedCount = 0;

    while (hasMore) {
      const syncBody: any = {
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: plaidItem.access_token
      };
      
      if (cursor) {
        syncBody.cursor = cursor;
      }

      const syncResponse = await fetch(`${PLAID_BASE_URL}/transactions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody)
      });

      const syncData = await syncResponse.json();

      if (syncData.error_code) {
        return new Response(
          JSON.stringify({ error: syncData.error_message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process added transactions
      if (syncData.added && syncData.added.length > 0) {
        const transactionsToInsert = syncData.added
          .filter((tx: any) => accountMap.has(tx.account_id))
          .map((tx: any) => ({
            plaid_account_id: accountMap.get(tx.account_id),
            company_id: plaidItem.company_id,
            transaction_id: tx.transaction_id,
            amount: tx.amount,
            date: tx.date,
            name: tx.name,
            merchant_name: tx.merchant_name,
            category: tx.category,
            pending: tx.pending,
            iso_currency_code: tx.iso_currency_code || 'USD'
          }));

        if (transactionsToInsert.length > 0) {
          await supabase
            .from('plaid_transactions')
            .upsert(transactionsToInsert, { onConflict: 'transaction_id' });
          addedCount += transactionsToInsert.length;
        }
      }

      // Process modified transactions
      if (syncData.modified && syncData.modified.length > 0) {
        for (const tx of syncData.modified) {
          if (accountMap.has(tx.account_id)) {
            await supabase
              .from('plaid_transactions')
              .update({
                amount: tx.amount,
                date: tx.date,
                name: tx.name,
                merchant_name: tx.merchant_name,
                category: tx.category,
                pending: tx.pending
              })
              .eq('transaction_id', tx.transaction_id);
            modifiedCount++;
          }
        }
      }

      // Process removed transactions
      if (syncData.removed && syncData.removed.length > 0) {
        const removedIds = syncData.removed.map((tx: any) => tx.transaction_id);
        await supabase
          .from('plaid_transactions')
          .delete()
          .in('transaction_id', removedIds);
      }

      cursor = syncData.next_cursor;
      hasMore = syncData.has_more;
    }

    // Update cursor
    await supabase
      .from('plaid_items')
      .update({ cursor, updated_at: new Date().toISOString() })
      .eq('id', plaid_item_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        added: addedCount,
        modified: modifiedCount
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
