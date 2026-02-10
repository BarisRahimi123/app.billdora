// ─── Bank Reconciliation Types ────────────────────────────────

export interface BankStatement {
  id: string;
  company_id: string;
  file_path: string;
  file_name: string;
  original_filename?: string;
  account_name?: string;
  account_number?: string;
  period_start?: string;
  period_end?: string;
  beginning_balance?: number;
  ending_balance?: number;
  status: 'pending' | 'parsed' | 'reconciled' | 'error';
  created_at?: string;
  updated_at?: string;
}

export interface BankTransaction {
  id: string;
  statement_id: string;
  company_id?: string;
  transaction_date: string;
  description?: string;
  amount: number;
  type?: 'credit' | 'debit';
  check_number?: string;
  matched_expense_id?: string;
  matched_invoice_id?: string;
  matched_type?: string;
  match_status: MatchStatus;
  category?: string;
  category_source?: 'auto' | 'manual' | 'ai' | null;
  subcategory?: string;
  project_id?: string;
  payee_id?: string;
  notes?: string;
  is_cleared?: boolean;
  reconciled_at?: string;
  created_at?: string;
  // Joined data
  matched_expense?: MatchedExpense;
  matched_invoice?: MatchedInvoice;
  payee?: { id: string; full_name: string; employment_type: string | null };
}

export type MatchStatus = 'matched' | 'unmatched' | 'suggested' | 'discrepancy' | 'ignored';

export interface MatchedExpense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
  vendor?: string;
}

export interface MatchedInvoice {
  id: string;
  invoice_number: string;
  total: number;
  paid_at?: string;
  client_name?: string;
}

// ─── Reconciliation Flow ─────────────────────────────────────

export interface ReconciliationSummary {
  totalTransactions: number;
  matched: number;
  suggested: number;
  unmatched: number;
  discrepancy: number;
  ignored: number;
  totalDeposits: number;
  totalWithdrawals: number;
  bankEndingBalance: number;
  bookBalance: number;
  variance: number;
}

export interface MatchSuggestion {
  transaction: BankTransaction;
  suggestions: MatchCandidate[];
  confidence: 'high' | 'medium' | 'low';
}

export interface MatchCandidate {
  type: 'expense' | 'invoice';
  id: string;
  description: string;
  amount: number;
  date: string;
  confidence: number; // 0-100
  reason: string;
}

export type ReconciliationStep = 'upload' | 'review' | 'confirm' | 'complete';

export interface ReconciliationState {
  step: ReconciliationStep;
  statement: BankStatement | null;
  transactions: BankTransaction[];
  summary: ReconciliationSummary | null;
  isProcessing: boolean;
  error: string | null;
}
