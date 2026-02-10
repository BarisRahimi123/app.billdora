// ─── useAiChat Hook ───────────────────────────────────────────
// Manages AI chat conversation state and messaging.

import { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { aiClient } from '../ai-client';
import type { ChatMessage } from '../ai-types';

export function useAiChat() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (message: string, context?: Record<string, any>) => {
      if (!profile?.company_id || !message.trim()) return;

      setError(null);
      setIsLoading(true);

      const userMessage: ChatMessage = {
        role: 'user',
        content: message.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await aiClient.chat(
          profile.company_id,
          message.trim(),
          messages,
          context
        );

        if (response.success && response.data) {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: response.data,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          setError(response.error || 'Failed to get AI response');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to send message');
      } finally {
        setIsLoading(false);
      }
    },
    [profile?.company_id, messages]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
  };
}
