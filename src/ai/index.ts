// ─── AI Module Public API ─────────────────────────────────────
// Import everything from here: import { aiClient, AiChatSidebar, ... } from '../ai';

// Client
export { aiClient } from './ai-client';

// Types
export type {
  AiTaskType,
  AiRequest,
  AiResponse,
  AiUsageInfo,
  AiCreditsInfo,
  ChatMessage,
  ParseReceiptResult,
  ParseStatementResult,
  StatementTransaction,
  GenerateProposalPayload,
  CategorizeResult,
} from './ai-types';

// Hooks
export { useAiChat } from './hooks/useAiChat';
export { useAiCredits } from './hooks/useAiCredits';
export { useAiGenerate } from './hooks/useAiGenerate';

// Components
export { AiChatSidebar } from './components/AiChatSidebar';
export { AiGenerateButton } from './components/AiGenerateButton';
export { AiUsageMeter } from './components/AiUsageMeter';
