// ─── useReconciliation Hook ───────────────────────────────────
// Core reconciliation logic: upload → parse → match → review → confirm

import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { aiClient } from '../../ai/ai-client';
import { calculateSummary, findMatches } from '../utils';
import type {
  BankStatement,
  BankTransaction,
  ReconciliationState,
  ReconciliationStep,
  MatchSuggestion,
  MatchCandidate,
  ReconciliationSummary,
} from '../types';

const INITIAL_STATE: ReconciliationState = {
  step: 'upload',
  statement: null,
  transactions: [],
  summary: null,
  isProcessing: false,
  error: null,
};

export function useReconciliation(companyId: string | undefined) {
  const [state, setState] = useState<ReconciliationState>(INITIAL_STATE);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  // ─── Load company expenses and invoices for matching ────────

  const loadMatchData = useCallback(async () => {
    if (!companyId) return;

    const [expRes, invRes] = await Promise.all([
      supabase
        .from('company_expenses')
        .select('id, description, amount, date, category, vendor')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
        .limit(500),
      supabase
        .from('invoices')
        .select('id, invoice_number, total, paid_at, client:clients(name)')
        .eq('company_id', companyId)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(500),
    ]);

    const expData = (expRes.data || []).map((e: any) => ({
      id: e.id,
      description: e.description || '',
      amount: e.amount,
      date: e.date,
      category: e.category,
      vendor: e.vendor,
    }));

    const invData = (invRes.data || []).map((i: any) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      total: i.total,
      paid_at: i.paid_at,
      client_name: i.client?.name,
    }));

    setExpenses(expData);
    setInvoices(invData);

    return { expenses: expData, invoices: invData };
  }, [companyId]);

  // ─── Upload & Parse Statement ──────────────────────────────

  const uploadAndParse = useCallback(
    async (file: File) => {
      if (!companyId) return;

      setState((s) => ({ ...s, isProcessing: true, error: null, step: 'upload' }));

      try {
        // 1. Upload file to storage
        const timestamp = Date.now();
        const fileName = `${companyId}/${timestamp}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('bank-statements')
          .upload(fileName, file);

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        // 2. Create statement record
        const { data: stmt, error: createError } = await supabase
          .from('bank_statements')
          .insert({
            company_id: companyId,
            file_path: fileName,
            file_name: file.name,
            original_filename: file.name,
            status: 'pending',
          })
          .select()
          .single();

        if (createError || !stmt) throw new Error('Failed to create statement record');

        setState((s) => ({ ...s, statement: stmt as BankStatement }));

        // 3. Parse with AI — edge function saves transactions & updates statement server-side
        const parseResult = await aiClient.parseStatement(companyId, file, stmt.id);

        if (!parseResult.success || !parseResult.data) {
          throw new Error(parseResult.error || 'Failed to parse statement');
        }

        const parsed = parseResult.data;

        // 4. Load the saved transactions from DB
        const { data: txRows } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('statement_id', stmt.id)
          .order('transaction_date', { ascending: true });

        const transactions = (txRows || []) as BankTransaction[];
        const matchData = await loadMatchData();

        // 5. Auto-match
        const updatedTx = await autoMatch(transactions, matchData?.expenses || [], matchData?.invoices || []);

        // 6. Reload the statement to get updated fields
        const { data: refreshedStmt } = await supabase
          .from('bank_statements')
          .select('*')
          .eq('id', stmt.id)
          .single();

        const updatedStmt: BankStatement = (refreshedStmt || {
          ...stmt,
          account_name: parsed.accountName,
          account_number: parsed.accountNumber,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          beginning_balance: parsed.beginningBalance,
          ending_balance: parsed.endingBalance,
          status: 'parsed',
        }) as BankStatement;

        const summary = calculateSummary(updatedTx, updatedStmt.ending_balance || 0);

        setState({
          step: 'review',
          statement: updatedStmt,
          transactions: updatedTx,
          summary,
          isProcessing: false,
          error: null,
        });
      } catch (err: any) {
        setState((s) => ({
          ...s,
          isProcessing: false,
          error: err.message || 'Upload failed',
        }));
      }
    },
    [companyId, loadMatchData]
  );

  // ─── Auto-Match Logic ──────────────────────────────────────

  async function autoMatch(
    transactions: BankTransaction[],
    expList: any[],
    invList: any[]
  ): Promise<BankTransaction[]> {
    const updated: BankTransaction[] = [];
    const newSuggestions: MatchSuggestion[] = [];

    for (const tx of transactions) {
      const candidates = findMatches(tx, expList, invList);

      if (candidates.length > 0 && candidates[0].confidence >= 70) {
        // High confidence → auto-match
        const best = candidates[0];
        const updateData: any = {
          match_status: 'matched',
          matched_type: best.type,
        };

        if (best.type === 'expense') {
          updateData.matched_expense_id = best.id;
        } else {
          updateData.matched_invoice_id = best.id;
        }

        await supabase.from('bank_transactions').update(updateData).eq('id', tx.id);

        updated.push({
          ...tx,
          ...updateData,
        });
      } else if (candidates.length > 0) {
        // Low/medium confidence → suggest
        await supabase
          .from('bank_transactions')
          .update({ match_status: 'suggested' })
          .eq('id', tx.id);

        updated.push({ ...tx, match_status: 'suggested' });
        newSuggestions.push({
          transaction: tx,
          suggestions: candidates.slice(0, 3),
          confidence: candidates[0].confidence >= 50 ? 'medium' : 'low',
        });
      } else {
        updated.push(tx);
      }
    }

    setSuggestions(newSuggestions);
    return updated;
  }

  // ─── Manual Match ──────────────────────────────────────────

  const matchTransaction = useCallback(
    async (transactionId: string, candidate: MatchCandidate) => {
      const updateData: any = {
        match_status: 'matched',
        matched_type: candidate.type,
      };

      if (candidate.type === 'expense') {
        updateData.matched_expense_id = candidate.id;
      } else {
        updateData.matched_invoice_id = candidate.id;
      }

      await supabase.from('bank_transactions').update(updateData).eq('id', transactionId);

      setState((s) => {
        const updatedTx = s.transactions.map((tx) =>
          tx.id === transactionId ? { ...tx, ...updateData } : tx
        );
        const summary = s.statement?.ending_balance
          ? calculateSummary(updatedTx, s.statement.ending_balance)
          : s.summary;
        return { ...s, transactions: updatedTx, summary };
      });

      // Remove from suggestions
      setSuggestions((prev) => prev.filter((sg) => sg.transaction.id !== transactionId));
    },
    []
  );

  // ─── Ignore Transaction ────────────────────────────────────

  const ignoreTransaction = useCallback(async (transactionId: string) => {
    await supabase
      .from('bank_transactions')
      .update({ match_status: 'ignored' })
      .eq('id', transactionId);

    setState((s) => {
      const updatedTx = s.transactions.map((tx) =>
        tx.id === transactionId ? { ...tx, match_status: 'ignored' as const } : tx
      );
      const summary = s.statement?.ending_balance
        ? calculateSummary(updatedTx, s.statement.ending_balance)
        : s.summary;
      return { ...s, transactions: updatedTx, summary };
    });

    setSuggestions((prev) => prev.filter((sg) => sg.transaction.id !== transactionId));
  }, []);

  // ─── Confirm Reconciliation ────────────────────────────────

  const confirmReconciliation = useCallback(async () => {
    setState((s) => ({ ...s, step: 'complete' }));
  }, []);

  // ─── Load Existing Statement ───────────────────────────────

  const loadStatement = useCallback(
    async (statementId: string) => {
      if (!companyId) return;

      setState((s) => ({ ...s, isProcessing: true, error: null }));

      try {
        const [stmtRes, txRes] = await Promise.all([
          supabase.from('bank_statements').select('*').eq('id', statementId).single(),
          supabase
            .from('bank_transactions')
            .select('*')
            .eq('statement_id', statementId)
            .order('transaction_date', { ascending: true }),
        ]);

        if (stmtRes.error) throw stmtRes.error;

        const statement = stmtRes.data as BankStatement;
        const transactions = (txRes.data || []) as BankTransaction[];
        const summary = calculateSummary(transactions, statement.ending_balance || 0);

        // Load match data for suggestions
        await loadMatchData();

        setState({
          step: transactions.length > 0 ? 'review' : 'upload',
          statement,
          transactions,
          summary,
          isProcessing: false,
          error: null,
        });
      } catch (err: any) {
        setState((s) => ({ ...s, isProcessing: false, error: err.message }));
      }
    },
    [companyId, loadMatchData]
  );

  // ─── Set Step ──────────────────────────────────────────────

  const setStep = useCallback((step: ReconciliationStep) => {
    setState((s) => ({ ...s, step }));
  }, []);

  // ─── Reset ─────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setSuggestions([]);
  }, []);

  return {
    ...state,
    suggestions,
    uploadAndParse,
    matchTransaction,
    ignoreTransaction,
    confirmReconciliation,
    loadStatement,
    setStep,
    reset,
  };
}
