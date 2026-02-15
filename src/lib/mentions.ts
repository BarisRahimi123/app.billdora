import React from 'react';

// ─── Regex patterns ─────────────────────────────────────
export const TASK_MENTION_REGEX = /@\[task:([^:]+):([^\]]+)\]/g;
export const USER_MENTION_REGEX = /@\[user:([^:]+):([^\]]+)\]/g;
// Combined regex to match both in a single pass
export const ALL_MENTION_REGEX = /@\[(task|user):([^:]+):([^\]]+)\]/g;

// ─── Types ──────────────────────────────────────────────
export interface MentionableUser {
  id: string;
  name: string;
  email: string;
  type: 'team' | 'collaborator';
  companyId?: string; // The user's own company ID (needed for cross-company notifications)
}

export interface MentionItem {
  id: string;
  name: string;
  kind: 'user' | 'task';
  email?: string;
  type?: 'team' | 'collaborator';
}

// ─── Convert friendly @Name to storage format ───────────
// mentionsMap: { displayName -> { id, kind } }
export function convertMentionsForStorage(
  text: string,
  mentionsMap: Record<string, { id: string; kind: 'user' | 'task' }>
): string {
  let result = text;
  // Sort by name length descending to avoid partial matches
  const entries = Object.entries(mentionsMap).sort((a, b) => b[0].length - a[0].length);
  for (const [name, { id, kind }] of entries) {
    const friendlyMention = `@${name}`;
    const storageMention = `@[${kind}:${id}:${name}]`;
    result = result.split(friendlyMention).join(storageMention);
  }
  return result;
}

// ─── Extract mentioned user IDs from stored content ─────
export function extractMentionedUserIds(content: string): string[] {
  const ids: string[] = [];
  const regex = new RegExp(USER_MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    ids.push(match[1]);
  }
  return [...new Set(ids)];
}

// ─── Mention input detection ────────────────────────────
export function detectMentionQuery(
  value: string,
  cursorPos: number
): { query: string; anchorPos: number } | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf('@');

  if (atIndex >= 0) {
    const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
    const query = textBeforeCursor.slice(atIndex + 1);
    // Only trigger if @ is at start or after a space/newline, and query doesn't contain newlines
    if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !query.includes('\n')) {
      return { query, anchorPos: atIndex };
    }
  }
  return null;
}

// ─── Clean mention markup for display ────────────────────
// Converts @[user:ID:Name] and @[task:ID:Name] to just @Name for human-readable display
export function cleanMentionMarkup(text: string): string {
  return text.replace(/@\[(user|task):([^:]+):([^\]]+)\]/g, '@$3');
}

// ─── Filter mentionable items ───────────────────────────
export function filterMentionItems(
  users: MentionableUser[],
  tasks: Array<{ id: string; name: string }>,
  query: string,
  maxPerSection = 5
): { users: MentionableUser[]; tasks: Array<{ id: string; name: string }> } {
  const q = query.toLowerCase();
  return {
    users: users
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, maxPerSection),
    tasks: tasks
      .filter(t => t.name.toLowerCase().includes(q))
      .slice(0, maxPerSection),
  };
}
