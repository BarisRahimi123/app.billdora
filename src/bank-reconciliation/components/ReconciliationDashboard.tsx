// ─── Reconciliation Dashboard ─────────────────────────────────
// Main reconciliation UI: Upload → Review → Confirm

import { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  HelpCircle,
  Sparkles,
  Ban,
} from 'lucide-react';
import { useReconciliation } from '../hooks/useReconciliation';
import { formatMoney, formatDate } from '../utils';
import type { BankTransaction, MatchCandidate, MatchSuggestion } from '../types';

interface ReconciliationDashboardProps {
  companyId: string | undefined;
}

export function ReconciliationDashboard({ companyId }: ReconciliationDashboardProps) {
  const recon = useReconciliation(companyId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!companyId) {
    return <div className="p-8 text-center text-sm text-neutral-400">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Step Indicator */}
      <StepIndicator currentStep={recon.step} />

      {/* Error */}
      {recon.error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{recon.error}</p>
        </div>
      )}

      {/* Upload Step */}
      {recon.step === 'upload' && (
        <UploadStep
          isProcessing={recon.isProcessing}
          onUpload={recon.uploadAndParse}
          fileInputRef={fileInputRef}
        />
      )}

      {/* Review Step */}
      {recon.step === 'review' && recon.statement && (
        <>
          <SummaryCards summary={recon.summary} statement={recon.statement} />
          <TransactionReview
            transactions={recon.transactions}
            suggestions={recon.suggestions}
            onMatch={recon.matchTransaction}
            onIgnore={recon.ignoreTransaction}
          />
          <div className="flex justify-between items-center px-1">
            <button
              onClick={recon.reset}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-neutral-600 hover:text-neutral-800 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start Over
            </button>
            <button
              onClick={recon.confirmReconciliation}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3a5c55] transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm Reconciliation
            </button>
          </div>
        </>
      )}

      {/* Complete Step */}
      {recon.step === 'complete' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Reconciliation Complete</h3>
          <p className="text-sm text-neutral-500 mb-6">
            {recon.statement?.original_filename} has been reconciled.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={recon.reset}
              className="px-4 py-2 text-sm font-medium text-[#476E66] border border-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors"
            >
              Reconcile Another Statement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: string }) {
  const steps = [
    { id: 'upload', label: 'Upload' },
    { id: 'review', label: 'Review & Match' },
    { id: 'complete', label: 'Complete' },
  ];

  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-2 px-1">
      {steps.map((step, i) => {
        const isActive = i === currentIdx;
        const isComplete = i < currentIdx;

        return (
          <div key={step.id} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-neutral-300" />}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isComplete
                  ? 'bg-green-100 text-green-700'
                  : isActive
                  ? 'bg-[#476E66] text-white'
                  : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {isComplete ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({
  isProcessing,
  onUpload,
  fileInputRef,
}: {
  isProcessing: boolean;
  onUpload: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File) {
    if (!file) return;
    const validTypes = ['application/pdf', 'text/csv', 'image/png', 'image/jpeg'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a PDF, CSV, or image file.');
      return;
    }
    onUpload(file);
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        isDragging
          ? 'border-[#476E66] bg-[#476E66]/5'
          : 'border-neutral-300 hover:border-neutral-400'
      } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      {isProcessing ? (
        <div className="space-y-3">
          <Loader2 className="w-10 h-10 text-[#476E66] mx-auto animate-spin" />
          <div>
            <p className="text-sm font-medium text-neutral-800">Parsing your statement...</p>
            <p className="text-xs text-neutral-500 mt-1">
              AI is extracting transactions. This may take a moment.
            </p>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#476E66]">
            <Sparkles className="w-3.5 h-3.5" />
            Powered by Claude AI
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
            <Upload className="w-5 h-5 text-neutral-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-800">Upload Bank Statement</p>
            <p className="text-xs text-neutral-500 mt-1">
              Drop a PDF or CSV file here, or click to browse
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3a5c55] transition-colors"
          >
            <FileText className="w-4 h-4" />
            Choose File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <p className="text-[10px] text-neutral-400">Supports PDF, CSV, PNG, JPG</p>
        </div>
      )}
    </div>
  );
}

function SummaryCards({
  summary,
  statement,
}: {
  summary: any;
  statement: any;
}) {
  if (!summary) return null;

  const cards = [
    {
      label: 'Matched',
      value: summary.matched,
      total: summary.totalTransactions,
      color: 'text-green-600',
      bg: 'bg-green-50',
      icon: CheckCircle2,
    },
    {
      label: 'Suggested',
      value: summary.suggested,
      total: summary.totalTransactions,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      icon: HelpCircle,
    },
    {
      label: 'Unmatched',
      value: summary.unmatched,
      total: summary.totalTransactions,
      color: 'text-red-600',
      bg: 'bg-red-50',
      icon: XCircle,
    },
    {
      label: 'Ignored',
      value: summary.ignored,
      total: summary.totalTransactions,
      color: 'text-neutral-500',
      bg: 'bg-neutral-50',
      icon: Ban,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Statement info */}
      <div className="bg-white rounded-lg p-3 border border-neutral-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {statement.account_name || 'Bank Account'}
              {statement.account_number ? ` ••••${statement.account_number}` : ''}
            </p>
            <p className="text-xs text-neutral-500">
              {statement.period_start && statement.period_end
                ? `${formatDate(statement.period_start)} — ${formatDate(statement.period_end)}`
                : statement.original_filename}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Ending Balance</p>
            <p className="text-sm font-bold text-neutral-900">
              {formatMoney(statement.ending_balance || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Match status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((card) => (
          <div key={card.label} className={`${card.bg} rounded-lg p-2.5`}>
            <div className="flex items-center gap-1.5 mb-1">
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              <span className="text-[10px] font-medium text-neutral-600">{card.label}</span>
            </div>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            <p className="text-[10px] text-neutral-500">
              of {card.total} transactions
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionReview({
  transactions,
  suggestions,
  onMatch,
  onIgnore,
}: {
  transactions: BankTransaction[];
  suggestions: MatchSuggestion[];
  onMatch: (txId: string, candidate: MatchCandidate) => void;
  onIgnore: (txId: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'suggested' | 'matched' | 'ignored'>('all');
  const [expandedTx, setExpandedTx] = useState<Set<string>>(new Set());

  const filtered = filter === 'all' ? transactions : transactions.filter((t) => t.match_status === filter);

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-neutral-100 overflow-x-auto">
        {(['all', 'suggested', 'unmatched', 'matched', 'ignored'] as const).map((f) => {
          const count =
            f === 'all'
              ? transactions.length
              : transactions.filter((t) => t.match_status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f
                  ? 'bg-[#476E66] text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Transaction list */}
      <div className="max-h-[500px] overflow-y-auto divide-y divide-neutral-50">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-400">No transactions</div>
        ) : (
          filtered.map((tx) => {
            const isExpanded = expandedTx.has(tx.id);
            const suggestion = suggestions.find((s) => s.transaction.id === tx.id);

            return (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                isExpanded={isExpanded}
                suggestion={suggestion}
                onToggle={() => {
                  setExpandedTx((prev) => {
                    const next = new Set(prev);
                    if (next.has(tx.id)) next.delete(tx.id);
                    else next.add(tx.id);
                    return next;
                  });
                }}
                onMatch={(candidate) => onMatch(tx.id, candidate)}
                onIgnore={() => onIgnore(tx.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  isExpanded,
  suggestion,
  onToggle,
  onMatch,
  onIgnore,
}: {
  transaction: BankTransaction;
  isExpanded: boolean;
  suggestion?: MatchSuggestion;
  onToggle: () => void;
  onMatch: (candidate: MatchCandidate) => void;
  onIgnore: () => void;
}) {
  const statusColors: Record<string, string> = {
    matched: 'bg-green-100 text-green-700',
    suggested: 'bg-amber-100 text-amber-700',
    unmatched: 'bg-red-100 text-red-700',
    discrepancy: 'bg-orange-100 text-orange-700',
    ignored: 'bg-neutral-100 text-neutral-500',
  };

  const isDeposit = transaction.amount > 0;
  const hasSuggestions = suggestion && suggestion.suggestions.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-50/50 ${
          isExpanded ? 'bg-neutral-50/50' : ''
        }`}
        onClick={onToggle}
      >
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-800 truncate">
            {transaction.description || 'No description'}
          </p>
          <p className="text-[10px] text-neutral-500">
            {formatDate(transaction.transaction_date)}
            {transaction.check_number ? ` • Check #${transaction.check_number}` : ''}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p
            className={`text-sm font-semibold ${
              isDeposit ? 'text-green-600' : 'text-neutral-900'
            }`}
          >
            {isDeposit ? '+' : ''}
            {formatMoney(transaction.amount)}
          </p>
        </div>

        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
            statusColors[transaction.match_status] || statusColors.unmatched
          }`}
        >
          {transaction.match_status}
        </span>
      </div>

      {/* Expanded: show match suggestions */}
      {isExpanded && (
        <div className="px-3 pb-3 pl-9 space-y-2">
          {transaction.match_status === 'matched' && transaction.matched_type && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              <p className="text-xs text-green-700">Matched to {transaction.matched_type}</p>
            </div>
          )}

          {hasSuggestions && transaction.match_status !== 'matched' && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                Suggested Matches
              </p>
              {suggestion.suggestions.map((candidate, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-800 truncate">{candidate.description}</p>
                    <p className="text-[10px] text-neutral-500">
                      {formatMoney(candidate.amount)} • {formatDate(candidate.date)} •{' '}
                      <span className="text-[#476E66]">{candidate.confidence}% match</span>
                    </p>
                    <p className="text-[9px] text-neutral-400">{candidate.reason}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMatch(candidate);
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-[#476E66] rounded-md hover:bg-[#3a5c55] flex-shrink-0"
                  >
                    Match
                  </button>
                </div>
              ))}
            </div>
          )}

          {transaction.match_status !== 'matched' && transaction.match_status !== 'ignored' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onIgnore();
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-neutral-500 hover:text-neutral-700 border border-neutral-200 rounded-md hover:bg-neutral-50"
            >
              <EyeOff className="w-3 h-3" />
              Ignore this transaction
            </button>
          )}
        </div>
      )}
    </div>
  );
}
