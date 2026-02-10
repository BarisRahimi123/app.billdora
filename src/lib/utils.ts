import { clsx, ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export const formatDate = (date: string | undefined): string => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** Sort clients for dropdowns/lists: favorites first, then by priority (1 > 2 > 3), then by name. */
export function sortClientsForDisplay<T extends { id: string; name?: string; is_favorite?: boolean; priority?: number | null }>(clients: T[]): T[] {
  return [...clients].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1;
    if (!a.is_favorite && b.is_favorite) return 1;
    const pA = a.priority ?? 999999;
    const pB = b.priority ?? 999999;
    if (pA !== pB) return pA - pB;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/** Score used for pagination: chars + newlines weighted higher (vertical space). */
function textScore(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s[i] === '\n' ? 120 : 1;
  return n;
}

/**
 * Normalise bullet text: ensure each • / - / * bullet starts on its own line.
 * Handles pasted text where bullets are concatenated inline (e.g. "text•bullet1•bullet2").
 */
export function normalizeBulletText(text: string): string {
  if (!text) return text;
  // 1. Add newline before any • that appears mid-line (not already at line start)
  let result = text.replace(/([^\n])•/g, '$1\n•');
  // 2. Ensure • is followed by a space for consistent formatting
  result = result.replace(/•(?=\S)/g, '• ');
  return result;
}

/** Minimum score for the "remainder" after a break so we don't create a page with 1–2 lines. */
const MIN_REMAINDER_SCORE = 800;
/** If the last chunk is below this score, merge it into the previous page when combined fits. */
const MIN_LAST_CHUNK_SCORE = 1200;

export const paginateText = (text: string, maxScore: number = 3200): string[] => {
  if (!text) return [];
  // Normalize bullet text before pagination so bullets are properly line-separated
  text = normalizeBulletText(text);
  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    let currentScore = 0;
    let splitIndex = remainingText.length;

    // Scan through text to find cut-off point based on score
    for (let i = 0; i < remainingText.length; i++) {
      const char = remainingText[i];
      currentScore += (char === '\n' ? 120 : 1);

      if (currentScore >= maxScore) {
        let safeBreak = -1;
        const searchBackLimit = Math.max(0, i - 500);

        for (let j = i; j >= searchBackLimit; j--) {
          if (remainingText[j] === '\n') {
            safeBreak = j;
            break;
          }
        }

        if (safeBreak === -1) {
          for (let j = i; j >= searchBackLimit; j--) {
            if (remainingText[j] === ' ') {
              safeBreak = j;
              break;
            }
          }
        }

        splitIndex = safeBreak !== -1 ? safeBreak : i;

        // Avoid leaving a tiny remainder (next page with only 1–2 lines): prefer breaking earlier
        const remainder = remainingText.slice(splitIndex + 1);
        if (remainder.length > 0 && textScore(remainder) < MIN_REMAINDER_SCORE) {
          for (let j = splitIndex - 1; j >= searchBackLimit; j--) {
            if (remainingText[j] === '\n') {
              const earlierRemainder = remainingText.slice(j + 1);
              if (textScore(earlierRemainder) >= MIN_REMAINDER_SCORE) {
                splitIndex = j;
                break;
              }
            }
          }
        }
        break;
      }
    }

    chunks.push(remainingText.slice(0, splitIndex + 1));
    remainingText = remainingText.slice(splitIndex + 1);
  }

  // Merge a too-short last chunk into the previous page when combined fits
  while (chunks.length >= 2 && textScore(chunks[chunks.length - 1]) < MIN_LAST_CHUNK_SCORE) {
    const last = chunks.pop()!;
    const prev = chunks[chunks.length - 1];
    const combined = prev + last;
    if (textScore(combined) <= maxScore) {
      chunks[chunks.length - 1] = combined;
    } else {
      chunks.push(last);
      break;
    }
  }

  return chunks;
};
