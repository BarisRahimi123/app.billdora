// ─── useAiCredits Hook ────────────────────────────────────────
// Fetches and tracks AI credit usage for the current company.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { AiCreditsInfo } from '../ai-types';

const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  starter: 200,
  professional: 500,
  enterprise: 2000,
};

export function useAiCredits() {
  const { profile } = useAuth();
  const [credits, setCredits] = useState<AiCreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!profile?.company_id) return;

    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('ai_usage')
        .select('credits_used')
        .eq('company_id', profile.company_id)
        .gte('created_at', startOfMonth.toISOString());

      if (error) throw error;

      const used = (data || []).reduce((sum, row) => sum + Number(row.credits_used || 0), 0);

      // TODO: Get actual plan from subscription context
      const plan = 'professional';
      const limit = PLAN_LIMITS[plan] || 500;

      setCredits({
        used: Math.round(used * 100) / 100,
        limit,
        remaining: Math.max(0, limit - used),
        plan,
      });
    } catch (err) {
      console.error('Failed to fetch AI credits:', err);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return { credits, isLoading, refresh: fetchCredits };
}
