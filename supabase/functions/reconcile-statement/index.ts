// Reconcile Bank Statement with Company Expenses
// Matches bank transactions with expense records
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

interface BankTransaction {
  id: string;
  statement_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: string;
  check_number?: string;
  matched_expense_id?: string;
  match_status: string;
}

interface CompanyExpense {
  id: string;
  company_id: string;
  name: string;
  amount: number;
  start_date?: string;
  vendor?: string;
}

// Check if two dates are within N days of each other
function datesWithinDays(date1: string, date2: string, days: number): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days;
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const { statement_id, company_id } = await req.json();
    
    if (!statement_id || !company_id) {
      return new Response(
        JSON.stringify({ error: { message: 'Missing statement_id or company_id' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fetch unmatched bank transactions for this statement (withdrawals only)
    const txRes = await fetch(
      `${supabaseUrl}/rest/v1/bank_transactions?statement_id=eq.${statement_id}&match_status=eq.unmatched&amount=lt.0&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );
    
    if (!txRes.ok) {
      throw new Error('Failed to fetch transactions');
    }
    
    const transactions: BankTransaction[] = await txRes.json();
    
    // Fetch company expenses
    const expRes = await fetch(
      `${supabaseUrl}/rest/v1/company_expenses?company_id=eq.${company_id}&is_active=eq.true&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );
    
    if (!expRes.ok) {
      throw new Error('Failed to fetch expenses');
    }
    
    const expenses: CompanyExpense[] = await expRes.json();
    
    let matchedCount = 0;
    let discrepancyCount = 0;
    const updates: Array<{ id: string; matched_expense_id: string | null; match_status: string; match_notes: string }> = [];
    
    // Try to match each transaction
    for (const tx of transactions) {
      const txAmount = Math.abs(tx.amount); // Convert to positive for comparison
      
      // Look for exact amount match
      let bestMatch: CompanyExpense | null = null;
      let matchType: 'matched' | 'discrepancy' = 'matched';
      let matchNotes = '';
      
      for (const expense of expenses) {
        // Check if amounts match exactly
        if (Math.abs(expense.amount - txAmount) < 0.01) {
          // Check if expense has a start_date and it's within 1 day
          if (expense.start_date && datesWithinDays(tx.transaction_date, expense.start_date, 1)) {
            bestMatch = expense;
            matchNotes = `Exact match: amount $${txAmount} on ${tx.transaction_date}`;
            break;
          } else if (!bestMatch) {
            // Amount matches but no date match - still consider it
            bestMatch = expense;
            matchNotes = `Amount match: $${txAmount} (expense: ${expense.name})`;
          }
        } else if (expense.start_date && datesWithinDays(tx.transaction_date, expense.start_date, 1)) {
          // Date matches but amount differs - discrepancy
          if (!bestMatch) {
            bestMatch = expense;
            matchType = 'discrepancy';
            matchNotes = `Date match but amount differs: Bank $${txAmount} vs Expense $${expense.amount}`;
          }
        }
      }
      
      if (bestMatch) {
        updates.push({
          id: tx.id,
          matched_expense_id: bestMatch.id,
          match_status: matchType,
          match_notes: matchNotes
        });
        
        if (matchType === 'matched') {
          matchedCount++;
        } else {
          discrepancyCount++;
        }
      }
    }
    
    // Apply updates
    for (const update of updates) {
      await fetch(
        `${supabaseUrl}/rest/v1/bank_transactions?id=eq.${update.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          },
          body: JSON.stringify({
            matched_expense_id: update.matched_expense_id,
            match_status: update.match_status,
            match_notes: update.match_notes
          })
        }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        data: {
          totalTransactions: transactions.length,
          matchedCount,
          discrepancyCount,
          unmatchedCount: transactions.length - matchedCount - discrepancyCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('Reconciliation error:', error);
    return new Response(
      JSON.stringify({ error: { code: 'RECONCILE_ERROR', message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
