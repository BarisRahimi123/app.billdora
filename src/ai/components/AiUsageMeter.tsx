// ─── AI Usage Meter ───────────────────────────────────────────
// Shows AI credits usage for the Settings page.

import { Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useAiCredits } from '../hooks/useAiCredits';

export function AiUsageMeter() {
  const { credits, isLoading } = useAiCredits();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="h-8 bg-neutral-200 rounded w-full" />
        <div className="h-3 bg-neutral-200 rounded w-1/4" />
      </div>
    );
  }

  if (!credits) return null;

  const usagePercent = credits.limit > 0 ? Math.min(100, (credits.used / credits.limit) * 100) : 0;
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = usagePercent >= 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#476E66]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">AI Credits</h3>
            <p className="text-[10px] text-neutral-500 capitalize">{credits.plan} plan</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-neutral-900">{Math.round(credits.remaining)}</p>
          <p className="text-[10px] text-neutral-500">remaining</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
          <span>{Math.round(credits.used)} used</span>
          <span>{credits.limit} total</span>
        </div>
        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isOverLimit
                ? 'bg-red-500'
                : isNearLimit
                ? 'bg-amber-500'
                : 'bg-[#476E66]'
            }`}
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>
      </div>

      {/* Warning */}
      {isNearLimit && !isOverLimit && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <TrendingUp className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            You've used {Math.round(usagePercent)}% of your monthly AI credits.
          </p>
        </div>
      )}

      {isOverLimit && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <Zap className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700">
            AI credit limit reached. Upgrade your plan for more credits.
          </p>
        </div>
      )}

      {/* Credit breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          { label: 'Receipts', cost: '1 credit', icon: '🧾' },
          { label: 'Statements', cost: '2 credits', icon: '🏦' },
          { label: 'Proposals', cost: '3 credits', icon: '📄' },
        ].map((item) => (
          <div key={item.label} className="text-center p-2 bg-neutral-50 rounded-lg">
            <span className="text-base">{item.icon}</span>
            <p className="text-[10px] font-medium text-neutral-700 mt-0.5">{item.label}</p>
            <p className="text-[9px] text-neutral-500">{item.cost}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
