// ─── AI Module Types ──────────────────────────────────────────

export type AiTaskType =
  | 'parse_receipt'
  | 'parse_statement'
  | 'generate_proposal'
  | 'chat'
  | 'categorize'
  | 'extract';

export interface AiRequest {
  task: AiTaskType;
  company_id: string;
  payload: Record<string, any>;
}

export interface AiUsageInfo {
  input_tokens: number;
  output_tokens: number;
  credits_used: number;
}

export interface AiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: AiUsageInfo;
}

// ─── Task-specific payloads ──────────────────────────────────

export interface ParseReceiptPayload {
  image_base64: string;
  mime_type: string;
}

export interface ParseReceiptResult {
  vendor: string;
  date: string;
  total: number;
  subtotal: number;
  tax: number;
  category: string;
  items: { description: string; amount: number }[];
  payment_method: string;
}

export interface ParseStatementPayload {
  file_base64: string;
  mime_type: string;
  statement_id?: string;
}

export interface ParseStatementResult {
  accountName: string;
  accountNumber: string;
  bankName: string;
  periodStart: string;
  periodEnd: string;
  beginningBalance: number;
  endingBalance: number;
  transactions: StatementTransaction[];
}

export interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'check' | 'fee' | 'interest' | 'transfer';
  check_number?: string | null;
}

export interface GenerateProposalPayload {
  brief?: string;
  client_name?: string;
  project_type?: string;
  company_name?: string;
  existing_scope?: string;
}

export interface ChatPayload {
  message: string;
  history?: ChatMessage[];
  context?: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface CategorizePayload {
  transactions: { description: string; amount: number; date: string }[];
}

export interface CategorizeResult {
  index: number;
  category: string;
  subcategory?: string;
  is_business: boolean;
}

// ─── Usage & Credits ─────────────────────────────────────────

export interface AiUsageRecord {
  id: string;
  company_id: string;
  user_id: string;
  task_type: AiTaskType;
  model: string;
  input_tokens: number;
  output_tokens: number;
  credits_used: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface AiCreditsInfo {
  used: number;
  limit: number;
  remaining: number;
  plan: string;
}
