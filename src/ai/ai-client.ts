// ─── AI Client ────────────────────────────────────────────────
// Single entry point for all AI operations from the frontend.
// All calls go through the ai-agent edge function.

import { supabase } from '../lib/supabase';
import type {
  AiTaskType,
  AiResponse,
  ParseReceiptResult,
  ParseStatementResult,
  CategorizeResult,
  ChatMessage,
} from './ai-types';

/**
 * Call the ai-agent edge function with JSON payload
 */
async function callAiAgent<T = any>(
  task: AiTaskType,
  companyId: string,
  payload: Record<string, any>
): Promise<AiResponse<T>> {
  const { data, error } = await supabase.functions.invoke('ai-agent', {
    body: { task, company_id: companyId, payload },
  });

  if (error) {
    return { success: false, error: error.message || 'AI request failed' };
  }

  return data as AiResponse<T>;
}

/**
 * Call the ai-agent edge function with FormData (for file uploads)
 */
async function callAiAgentWithFile<T = any>(
  task: AiTaskType,
  companyId: string,
  file: File,
  extraFields: Record<string, string> = {}
): Promise<AiResponse<T>> {
  const formData = new FormData();
  formData.append('task', task);
  formData.append('company_id', companyId);
  formData.append('file', file);

  for (const [key, value] of Object.entries(extraFields)) {
    formData.append(key, value);
  }

  const { data, error } = await supabase.functions.invoke('ai-agent', {
    body: formData,
  });

  if (error) {
    return { success: false, error: error.message || 'AI request failed' };
  }

  return data as AiResponse<T>;
}

// ─── Public API ──────────────────────────────────────────────

export const aiClient = {
  /**
   * Parse a receipt image and extract structured data
   */
  async parseReceipt(companyId: string, file: File): Promise<AiResponse<ParseReceiptResult>> {
    return callAiAgentWithFile<ParseReceiptResult>('parse_receipt', companyId, file);
  },

  /**
   * Parse a bank statement PDF and extract all transactions
   */
  async parseStatement(companyId: string, file: File, statementId?: string): Promise<AiResponse<ParseStatementResult>> {
    return callAiAgentWithFile<ParseStatementResult>('parse_statement', companyId, file, {
      ...(statementId ? { statement_id: statementId } : {}),
    });
  },

  /**
   * Generate or improve a proposal scope of work
   */
  async generateProposal(
    companyId: string,
    opts: {
      brief?: string;
      clientName?: string;
      projectType?: string;
      companyName?: string;
      existingScope?: string;
    }
  ): Promise<AiResponse<string>> {
    return callAiAgent<string>('generate_proposal', companyId, {
      brief: opts.brief,
      client_name: opts.clientName,
      project_type: opts.projectType,
      company_name: opts.companyName,
      existing_scope: opts.existingScope,
    });
  },

  /**
   * Send a chat message and get a response
   */
  async chat(
    companyId: string,
    message: string,
    history?: ChatMessage[],
    context?: Record<string, any>
  ): Promise<AiResponse<string>> {
    return callAiAgent<string>('chat', companyId, { message, history, context });
  },

  /**
   * Auto-categorize bank transactions
   */
  async categorize(
    companyId: string,
    transactions: { description: string; amount: number; date: string }[],
    validCategories?: string[]
  ): Promise<AiResponse<CategorizeResult[]>> {
    return callAiAgent<CategorizeResult[]>('categorize', companyId, { 
      transactions,
      ...(validCategories ? { valid_categories: validCategories } : {}),
    });
  },

  /**
   * Extract data from a document image/PDF
   */
  async extract(
    companyId: string,
    file: File,
    instructions?: string
  ): Promise<AiResponse<any>> {
    return callAiAgentWithFile('extract', companyId, file, {
      ...(instructions ? { instructions } : {}),
    });
  },
};
