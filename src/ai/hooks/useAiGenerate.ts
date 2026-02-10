// ─── useAiGenerate Hook ───────────────────────────────────────
// Handles AI content generation (proposals, etc.)

import { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { aiClient } from '../ai-client';

export function useAiGenerate() {
  const { profile } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateProposal = useCallback(
    async (opts: {
      brief?: string;
      clientName?: string;
      projectType?: string;
      companyName?: string;
      existingScope?: string;
    }): Promise<string | null> => {
      if (!profile?.company_id) return null;

      setIsGenerating(true);
      setError(null);

      try {
        const response = await aiClient.generateProposal(profile.company_id, opts);

        if (response.success && response.data) {
          return response.data;
        } else {
          setError(response.error || 'Failed to generate content');
          return null;
        }
      } catch (err: any) {
        setError(err.message || 'Generation failed');
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [profile?.company_id]
  );

  return {
    isGenerating,
    error,
    generateProposal,
    clearError: () => setError(null),
  };
}
