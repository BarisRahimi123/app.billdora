import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface Plan {
  id: string;
  name: string;
  stripe_price_id: string | null;
  amount: number;
  interval: string;
  limits: {
    projects: number;
    team_members: number;
    clients: number;
    invoices_per_month: number;
  };
  features: string[];
  is_active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  plan?: Plan;
}

interface UpgradeModalState {
  isOpen: boolean;
  limitType?: 'projects' | 'team_members' | 'clients' | 'invoices';
  currentCount?: number;
}

interface SubscriptionContextType {
  subscription: Subscription | null;
  currentPlan: Plan | null;
  plans: Plan[];
  loading: boolean;
  error: string | null;
  refreshSubscription: () => Promise<void>;
  canUseFeature: (feature: string) => boolean;
  checkLimit: (limitType: 'projects' | 'team_members' | 'clients' | 'invoices', currentCount: number) => { allowed: boolean; limit: number | null; remaining: number | null };
  checkLimitAndPrompt: (limitType: 'projects' | 'team_members' | 'clients' | 'invoices', currentCount: number) => boolean;
  showUpgradeModal: (limitType?: 'projects' | 'team_members' | 'clients' | 'invoices', currentCount?: number) => void;
  hideUpgradeModal: () => void;
  upgradeModalState: UpgradeModalState;
  isPro: boolean;
  isStarter: boolean;
  isFree: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeModalState, setUpgradeModalState] = useState<UpgradeModalState>({ isOpen: false });

  const loadPlans = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('billdora_plans')
        .select('*')
        .eq('is_active', true)
        .order('amount', { ascending: true });

      if (err) throw err;
      setPlans(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Failed to load plans:', err);
      setError(err.message);
      return [];
    }
  }, []);

  const loadSubscription = useCallback(async () => {
    if (!user?.id) {
      setSubscription(null);
      setCurrentPlan(null);
      setLoading(false);
      return;
    }

    try {
      const { data: subData, error: subErr } = await supabase
        .from('billdora_subscriptions')
        .select('*, plan:billdora_plans(*)')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr) throw subErr;

      if (subData) {
        setSubscription(subData);
        setCurrentPlan(subData.plan);
      } else {
        // No active subscription - user is on Free plan
        const allPlans = plans.length > 0 ? plans : await loadPlans();
        const freePlan = allPlans.find((p: Plan) => p.name === 'Free' || p.amount === 0);
        setSubscription(null);
        setCurrentPlan(freePlan || null);
      }
    } catch (err: any) {
      console.error('Failed to load subscription:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, plans, loadPlans]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (plans.length > 0 || user?.id) {
      loadSubscription();
    }
  }, [user?.id, plans.length, loadSubscription]);

  const refreshSubscription = useCallback(async () => {
    setLoading(true);
    await loadSubscription();
  }, [loadSubscription]);

  const canUseFeature = useCallback((feature: string): boolean => {
    if (!currentPlan) return false;
    
    // Check if feature is in the plan's features array
    const planFeatures = currentPlan.features || [];
    return planFeatures.some((f: string) => 
      f.toLowerCase().includes(feature.toLowerCase())
    );
  }, [currentPlan]);

  const checkLimit = useCallback((
    limitType: 'projects' | 'team_members' | 'clients' | 'invoices',
    currentCount: number
  ): { allowed: boolean; limit: number | null; remaining: number | null } => {
    if (!currentPlan?.limits) {
      return { allowed: false, limit: null, remaining: null };
    }

    let limit: number | null = null;
    switch (limitType) {
      case 'projects':
        limit = currentPlan.limits.projects;
        break;
      case 'team_members':
        limit = currentPlan.limits.team_members;
        break;
      case 'clients':
        limit = currentPlan.limits.clients;
        break;
      case 'invoices':
        limit = currentPlan.limits.invoices_per_month;
        break;
    }

    // -1 or null limit means unlimited
    if (limit === null || limit === -1) {
      return { allowed: true, limit: null, remaining: null };
    }

    const remaining = limit - currentCount;
    return {
      allowed: currentCount < limit,
      limit,
      remaining: remaining > 0 ? remaining : 0
    };
  }, [currentPlan]);

  const isPro = currentPlan?.name?.toLowerCase().includes('professional') || false;
  const isStarter = currentPlan?.name?.toLowerCase().includes('starter') || false;
  const isFree = !isPro && !isStarter && (currentPlan?.name === 'Free' || currentPlan?.amount === 0 || !subscription);

  const showUpgradeModal = useCallback((
    limitType?: 'projects' | 'team_members' | 'clients' | 'invoices',
    currentCount?: number
  ) => {
    setUpgradeModalState({ isOpen: true, limitType, currentCount });
  }, []);

  const hideUpgradeModal = useCallback(() => {
    setUpgradeModalState({ isOpen: false });
  }, []);

  // Check limit and automatically show upgrade modal if limit reached
  const checkLimitAndPrompt = useCallback((
    limitType: 'projects' | 'team_members' | 'clients' | 'invoices',
    currentCount: number
  ): boolean => {
    const result = checkLimit(limitType, currentCount);
    if (!result.allowed) {
      setUpgradeModalState({ isOpen: true, limitType, currentCount });
      return false;
    }
    return true;
  }, [checkLimit]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        currentPlan,
        plans,
        loading,
        error,
        refreshSubscription,
        canUseFeature,
        checkLimit,
        checkLimitAndPrompt,
        showUpgradeModal,
        hideUpgradeModal,
        upgradeModalState,
        isPro,
        isStarter,
        isFree,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
