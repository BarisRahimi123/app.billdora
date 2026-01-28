import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'

// Initialize PostHog (only if valid key provided)
try {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
  let posthogHost = import.meta.env.VITE_POSTHOG_HOST?.trim();
  
  // CRITICAL: Validate and fix the host URL - reject garbage/placeholder text
  // Valid hosts: https://us.i.posthog.com or https://eu.i.posthog.com
  if (!posthogHost || !posthogHost.match(/^https:\/\/(us|eu)\.i\.posthog\.com$/)) {
    posthogHost = 'https://us.i.posthog.com';
  }
  
  // Only init if key exists
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      bootstrap: { distinctID: undefined },
      persistence: 'memory',
    });
  }
} catch (e) {
  console.warn('[PostHog] Init failed:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
