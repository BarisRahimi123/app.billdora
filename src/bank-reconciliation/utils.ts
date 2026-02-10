// ─── Bank Reconciliation Utilities ────────────────────────────

import type { BankTransaction, ReconciliationSummary, MatchCandidate } from './types';

/**
 * Calculate reconciliation summary from transactions
 */
export function calculateSummary(
  transactions: BankTransaction[],
  bankEndingBalance: number
): ReconciliationSummary {
  const matched = transactions.filter((t) => t.match_status === 'matched').length;
  const suggested = transactions.filter((t) => t.match_status === 'suggested').length;
  const unmatched = transactions.filter((t) => t.match_status === 'unmatched').length;
  const discrepancy = transactions.filter((t) => t.match_status === 'discrepancy').length;
  const ignored = transactions.filter((t) => t.match_status === 'ignored').length;

  const totalDeposits = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalWithdrawals = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Book balance = sum of matched items from our records
  const matchedExpenseTotal = transactions
    .filter((t) => t.match_status === 'matched' && t.matched_expense)
    .reduce((sum, t) => sum + Math.abs(t.matched_expense?.amount || 0), 0);

  const matchedInvoiceTotal = transactions
    .filter((t) => t.match_status === 'matched' && t.matched_invoice)
    .reduce((sum, t) => sum + (t.matched_invoice?.total || 0), 0);

  const bookBalance = matchedInvoiceTotal - matchedExpenseTotal;
  const variance = bankEndingBalance - bookBalance;

  return {
    totalTransactions: transactions.length,
    matched,
    suggested,
    unmatched,
    discrepancy,
    ignored,
    totalDeposits,
    totalWithdrawals,
    bankEndingBalance,
    bookBalance,
    variance,
  };
}

/**
 * Find potential matches for a bank transaction against expenses and invoices
 */
export function findMatches(
  transaction: BankTransaction,
  expenses: { id: string; description: string; amount: number; date: string; category?: string; vendor?: string }[],
  invoices: { id: string; invoice_number: string; total: number; paid_at?: string; client_name?: string }[]
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  const txAmount = Math.abs(transaction.amount);
  const txDate = new Date(transaction.transaction_date);

  if (transaction.amount < 0) {
    // Withdrawal → match against expenses
    for (const exp of expenses) {
      const expAmount = Math.abs(exp.amount);
      const expDate = new Date(exp.date);
      const dateDiff = Math.abs(txDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24);
      const amountDiff = Math.abs(txAmount - expAmount);
      const amountPct = txAmount > 0 ? (amountDiff / txAmount) * 100 : 100;

      let confidence = 0;
      const reasons: string[] = [];

      // Exact amount match (within $0.50)
      if (amountDiff <= 0.5) {
        confidence += 50;
        reasons.push('Exact amount match');
      } else if (amountPct <= 5) {
        confidence += 30;
        reasons.push('Amount within 5%');
      } else if (amountPct <= 15) {
        confidence += 15;
        reasons.push('Amount within 15%');
      }

      // Date proximity
      if (dateDiff <= 1) {
        confidence += 30;
        reasons.push('Same day/next day');
      } else if (dateDiff <= 3) {
        confidence += 20;
        reasons.push('Within 3 days');
      } else if (dateDiff <= 7) {
        confidence += 10;
        reasons.push('Within 1 week');
      }

      // Description similarity (basic keyword matching)
      const txDesc = (transaction.description || '').toLowerCase();
      const expDesc = (exp.description || '').toLowerCase();
      const expVendor = (exp.vendor || '').toLowerCase();

      if (expVendor && txDesc.includes(expVendor)) {
        confidence += 20;
        reasons.push('Vendor name match');
      } else if (txDesc && expDesc && (txDesc.includes(expDesc.slice(0, 8)) || expDesc.includes(txDesc.slice(0, 8)))) {
        confidence += 10;
        reasons.push('Description similarity');
      }

      if (confidence >= 30) {
        candidates.push({
          type: 'expense',
          id: exp.id,
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          confidence: Math.min(100, confidence),
          reason: reasons.join(', '),
        });
      }
    }
  } else {
    // Deposit → match against paid invoices
    for (const inv of invoices) {
      if (!inv.paid_at) continue;

      const invAmount = inv.total;
      const invDate = new Date(inv.paid_at);
      const dateDiff = Math.abs(txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24);
      const amountDiff = Math.abs(txAmount - invAmount);
      const amountPct = txAmount > 0 ? (amountDiff / txAmount) * 100 : 100;

      let confidence = 0;
      const reasons: string[] = [];

      if (amountDiff <= 0.5) {
        confidence += 50;
        reasons.push('Exact amount match');
      } else if (amountPct <= 5) {
        confidence += 30;
        reasons.push('Amount within 5%');
      } else if (amountPct <= 15) {
        confidence += 15;
        reasons.push('Amount within 15%');
      }

      if (dateDiff <= 1) {
        confidence += 30;
        reasons.push('Same day/next day');
      } else if (dateDiff <= 3) {
        confidence += 20;
        reasons.push('Within 3 days');
      } else if (dateDiff <= 7) {
        confidence += 10;
        reasons.push('Within 1 week');
      }

      // Check if transaction description contains invoice number
      const txDesc = (transaction.description || '').toLowerCase();
      if (inv.invoice_number && txDesc.includes(inv.invoice_number.toLowerCase())) {
        confidence += 20;
        reasons.push('Invoice number in description');
      }

      if (confidence >= 30) {
        candidates.push({
          type: 'invoice',
          id: inv.id,
          description: `Invoice ${inv.invoice_number}${inv.client_name ? ` — ${inv.client_name}` : ''}`,
          amount: inv.total,
          date: inv.paid_at,
          confidence: Math.min(100, confidence),
          reason: reasons.join(', '),
        });
      }
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Format currency
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Format date
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
