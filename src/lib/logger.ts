// Production-safe logger utility
// Only logs in development mode to prevent sensitive data exposure

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  auth: (...args: unknown[]) => {
    if (isDev) console.log('[Auth]', ...args);
  },
  api: (...args: unknown[]) => {
    if (isDev) console.log('[API]', ...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.log('[Debug]', ...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info('[Info]', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn('[Warn]', ...args); // Warnings always show
  },
  error: (...args: unknown[]) => {
    console.error('[Error]', ...args); // Errors always show
  },
};
