// ─── AI Generate Button ───────────────────────────────────────
// Reusable button to trigger AI content generation inline.

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { useAiGenerate } from '../hooks/useAiGenerate';

interface AiGenerateButtonProps {
  onGenerated: (text: string) => void;
  brief?: string;
  clientName?: string;
  projectType?: string;
  companyName?: string;
  existingScope?: string;
  label?: string;
  variant?: 'primary' | 'ghost';
  className?: string;
}

export function AiGenerateButton({
  onGenerated,
  brief,
  clientName,
  projectType,
  companyName,
  existingScope,
  label,
  variant = 'ghost',
  className = '',
}: AiGenerateButtonProps) {
  const { isGenerating, error, generateProposal, clearError } = useAiGenerate();
  const [showBriefInput, setShowBriefInput] = useState(false);
  const [briefInput, setBriefInput] = useState(brief || '');

  const isImprove = !!existingScope;
  const buttonLabel = label || (isImprove ? 'Improve with AI' : 'Generate with AI');

  async function handleGenerate() {
    // If no brief and no existing scope, show brief input
    if (!isImprove && !briefInput.trim()) {
      setShowBriefInput(true);
      return;
    }

    clearError();
    const result = await generateProposal({
      brief: briefInput || brief,
      clientName,
      projectType,
      companyName,
      existingScope,
    });

    if (result) {
      onGenerated(result);
      setShowBriefInput(false);
      setBriefInput('');
    }
  }

  const baseStyles =
    variant === 'primary'
      ? 'bg-[#476E66] text-white hover:bg-[#3a5c55] shadow-sm'
      : 'bg-[#476E66]/5 text-[#476E66] hover:bg-[#476E66]/10 border border-[#476E66]/20';

  return (
    <div className={`inline-flex flex-col gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${baseStyles}`}
      >
        {isGenerating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isImprove ? (
          <RefreshCw className="w-3.5 h-3.5" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {isGenerating ? 'Generating...' : buttonLabel}
      </button>

      {showBriefInput && !isImprove && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={briefInput}
            onChange={(e) => setBriefInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGenerate();
              if (e.key === 'Escape') setShowBriefInput(false);
            }}
            placeholder="Describe the project briefly..."
            className="flex-1 px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#476E66]/30 focus:border-[#476E66]"
            autoFocus
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!briefInput.trim() || isGenerating}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#476E66] text-white hover:bg-[#3a5c55] disabled:opacity-40"
          >
            Go
          </button>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-500">{error}</p>
      )}
    </div>
  );
}
