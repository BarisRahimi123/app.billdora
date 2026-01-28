import { useSubscription } from '../contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';

export type FeatureLimitType = 'projects' | 'team_members' | 'clients' | 'invoices';

interface FeatureGatingResult {
  checkAndProceed: (
    limitType: FeatureLimitType,
    currentCount: number,
    onAllowed: () => void
  ) => void;
  isAllowed: (limitType: FeatureLimitType, currentCount: number) => boolean;
  getLimit: (limitType: FeatureLimitType) => number | null;
  getRemaining: (limitType: FeatureLimitType, currentCount: number) => number | null;
  showUpgradePrompt: () => void;
  isPro: boolean;
  isStarter: boolean;
}

export function useFeatureGating(): FeatureGatingResult {
  const { checkLimit, isPro, isStarter, currentPlan } = useSubscription();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const showUpgradePrompt = () => {
    showToast(
      'You have reached your plan limit. Upgrade to Professional for unlimited access.',
      'info'
    );
    navigate('/settings?tab=subscription');
  };

  const isAllowed = (limitType: FeatureLimitType, currentCount: number): boolean => {
    const result = checkLimit(limitType, currentCount);
    return result.allowed;
  };

  const getLimit = (limitType: FeatureLimitType): number | null => {
    if (!currentPlan?.limits) return null;
    
    const limit = (() => {
      switch (limitType) {
        case 'projects':
          return currentPlan.limits.projects;
        case 'team_members':
          return currentPlan.limits.team_members;
        case 'clients':
          return currentPlan.limits.clients;
        case 'invoices':
          return currentPlan.limits.invoices_per_month;
        default:
          return null;
      }
    })();
    
    // -1 means unlimited
    return limit === -1 ? null : limit;
  };

  const getRemaining = (limitType: FeatureLimitType, currentCount: number): number | null => {
    const result = checkLimit(limitType, currentCount);
    return result.remaining;
  };

  const checkAndProceed = (
    limitType: FeatureLimitType,
    currentCount: number,
    onAllowed: () => void
  ) => {
    const result = checkLimit(limitType, currentCount);
    
    if (result.allowed) {
      onAllowed();
    } else {
      const limitNames: Record<FeatureLimitType, string> = {
        projects: 'projects',
        team_members: 'team members',
        clients: 'clients',
        invoices: 'invoices this month',
      };
      
      showToast(
        `You have reached the maximum of ${result.limit} ${limitNames[limitType]} on the ${currentPlan?.name || 'Starter'} plan. Upgrade to Professional for more.`,
        'warning'
      );
      navigate('/settings?tab=subscription');
    }
  };

  return {
    checkAndProceed,
    isAllowed,
    getLimit,
    getRemaining,
    showUpgradePrompt,
    isPro,
    isStarter,
  };
}
