// ─── Bank Reconciliation Module Public API ────────────────────

// Components
export { ReconciliationDashboard } from './components/ReconciliationDashboard';

// Hooks
export { useReconciliation } from './hooks/useReconciliation';

// Types
export type {
  BankStatement,
  BankTransaction,
  MatchStatus,
  ReconciliationSummary,
  MatchSuggestion,
  MatchCandidate,
  ReconciliationStep,
  ReconciliationState,
} from './types';

// Utils
export { calculateSummary, findMatches, formatMoney, formatDate } from './utils';
