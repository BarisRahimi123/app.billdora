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

export const paginateText = (text: string, maxScore: number = 3200): string[] => {
  if (!text) return [];
  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    let currentScore = 0;
    let splitIndex = remainingText.length;

    // Scan through text to find cut-off point based on score
    for (let i = 0; i < remainingText.length; i++) {
      const char = remainingText[i];
      // Newline = ~80 chars worth of vertical space (approx 4 lines of text height vs 1 char width)
      // This helps catch "long vertical lists" which have low char count but high height
      currentScore += (char === '\n' ? 120 : 1);

      if (currentScore >= maxScore) {
        // We crossed the limit. Now assume we need to backtrack to a safe split point.
        // Look backwards from i for a newline or space
        let safeBreak = -1;

        // First try finding a newline in the last 20% of the scanned block to keep paragraphs together
        const searchBackLimit = Math.max(0, i - 500);
        for (let j = i; j >= searchBackLimit; j--) {
          if (remainingText[j] === '\n') {
            safeBreak = j;
            break;
          }
        }

        // If no newline, try space
        if (safeBreak === -1) {
          for (let j = i; j >= searchBackLimit; j--) {
            if (remainingText[j] === ' ') {
              safeBreak = j;
              break;
            }
          }
        }

        // If still no safe break, just break at i (mid-word potentially, but better than overflow)
        splitIndex = safeBreak !== -1 ? safeBreak : i;
        break;
      }
    }

    // Push chunk and advance
    chunks.push(remainingText.slice(0, splitIndex + 1));
    remainingText = remainingText.slice(splitIndex + 1); // Don't trimStart here to preserve paragraph spacing if intentionally double-spaced
  }
  return chunks;
};
