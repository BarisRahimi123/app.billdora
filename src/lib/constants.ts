/**
 * Application Constants
 * Centralized configuration values used throughout the application
 */

// Time & Billing
export const DEFAULT_HOURLY_RATE = 150;
export const MIN_TIME_ENTRY_HOURS = 0.25;
export const MAX_TIME_ENTRY_HOURS = 24;
export const TIME_ENTRY_INCREMENT = 0.25;
export const MIN_TIMER_SAVE_SECONDS = 60;

// Capacity & Utilization
export const HOURS_PER_WEEK = 40;
export const WEEKS_PER_MONTH = 4;
export const EXPECTED_MONTHLY_HOURS = HOURS_PER_WEEK * WEEKS_PER_MONTH; // 160

// Pagination & Limits
export const DEFAULT_PAGE_SIZE = 50;
export const RECENT_ACTIVITIES_LIMIT = 5;
export const NOTIFICATIONS_LIMIT = 10;
export const TEAM_MEMBERS_BATCH_LIMIT = 10;
export const SEARCH_RESULTS_PER_TYPE = 3;

// UI Timing
export const SEARCH_DEBOUNCE_MS = 300;
export const TOAST_DURATION_MS = 3000;
export const AUTO_SAVE_DEBOUNCE_MS = 1000;

// Date Formats
export const DATE_FORMAT = 'en-US';
export const CURRENCY_FORMAT = 'USD';

// File Upload
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Invoice
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;
export const INVOICE_NUMBER_PREFIX = 'INV-';

// Analytics
export const REVENUE_TREND_MONTHS = 6;
export const AGING_REPORT_RANGES = ['0-30', '31-60', '61-90', '90+'];

// Status Colors
export const STATUS_COLORS = {
  draft: 'bg-neutral-100 text-neutral-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-neutral-100 text-neutral-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
} as const;
