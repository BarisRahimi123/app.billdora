import { useState } from 'react';
import { X, Zap, Check, Loader2, Crown, Sparkles } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  limitType?: 'projects' | 'team_members' | 'clients' | 'invoices';
  currentCount?: number;
}

export default function UpgradeModal({ isOpen, onClose, limitType, currentCount }: UpgradeModalProps) {
  const { plans, currentPlan, isFree } = useSubscription();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const limitLabels: Record<string, string> = {
    projects: 'projects',
    team_members: 'team members',
    clients: 'clients',
    invoices: 'invoices per month'
  };

  const upgradePlans = plans.filter(p => p.amount > (currentPlan?.amount || 0) && p.is_active);

  const handleUpgrade = async (plan: typeof plans[0]) => {
    if (!user?.id || !plan.stripe_price_id) {
      setError('Unable to process upgrade. Please try again.');
      return;
    }

    setLoading(plan.id);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            price_id: plan.stripe_price_id,
            user_id: user.id,
            success_url: `${window.location.origin}/settings?subscription=success`,
            cancel_url: `${window.location.origin}/settings?subscription=canceled`,
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message || 'Failed to start checkout');
      }

      if (result.url) {
        // Redirect to Stripe Checkout (works on mobile browsers, PWA, and desktop)
        window.location.href = result.url;
      }
    } catch (err: any) {
      console.error('Upgrade error:', err);
      setError(err.message || 'Failed to process upgrade');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-neutral-100">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#476E66] to-[#3a5d56] rounded-xl flex items-center justify-center">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Upgrade Your Plan</h2>
              <p className="text-sm text-neutral-500">Unlock more features</p>
            </div>
          </div>
        </div>

        {/* Limit Warning */}
        {limitType && currentCount !== undefined && (
          <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  You've reached your limit
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Your current plan allows {currentPlan?.limits?.[limitType === 'invoices' ? 'invoices_per_month' : limitType] || 0} {limitLabels[limitType]}.
                  Upgrade to add more.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {upgradePlans.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="w-12 h-12 text-[#476E66] mx-auto mb-3" />
              <p className="text-neutral-600">You're on the highest plan!</p>
            </div>
          ) : (
            upgradePlans.map((plan) => (
              <div
                key={plan.id}
                className="border border-neutral-200 rounded-xl p-4 hover:border-[#476E66]/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-neutral-900">{plan.name}</h3>
                    <p className="text-2xl font-bold text-[#476E66]">
                      ${plan.amount}<span className="text-sm font-normal text-neutral-500">/{plan.interval}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleUpgrade(plan)}
                    disabled={loading === plan.id}
                    className="px-4 py-2 bg-[#476E66] text-white text-sm font-medium rounded-lg hover:bg-[#3a5d56] disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {loading === plan.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Upgrade'
                    )}
                  </button>
                </div>

                {/* Plan Limits */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <Check className="w-3.5 h-3.5 text-[#476E66]" />
                    {plan.limits?.projects === -1 ? 'Unlimited' : plan.limits?.projects} projects
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <Check className="w-3.5 h-3.5 text-[#476E66]" />
                    {plan.limits?.team_members === -1 ? 'Unlimited' : plan.limits?.team_members} team members
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <Check className="w-3.5 h-3.5 text-[#476E66]" />
                    {plan.limits?.clients === -1 ? 'Unlimited' : plan.limits?.clients} clients
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <Check className="w-3.5 h-3.5 text-[#476E66]" />
                    {plan.limits?.invoices_per_month === -1 ? 'Unlimited' : plan.limits?.invoices_per_month} invoices/mo
                  </div>
                </div>

                {/* Features */}
                {plan.features && plan.features.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <div className="flex flex-wrap gap-1.5">
                      {plan.features.slice(0, 4).map((feature, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-[#476E66]/10 text-[#476E66] text-xs rounded-full">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <p className="text-xs text-center text-neutral-500">
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
