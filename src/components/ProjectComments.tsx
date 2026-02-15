import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  MoreHorizontal,
  Reply,
  Trash2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Clock,
  CornerDownRight,
  User,
  UserCircle,
  ShieldAlert,
  ListTodo,
  AtSign
} from 'lucide-react';
import { ProjectComment, projectCommentsApi, projectCollaboratorsApi, Task, api, notificationsApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MentionableUser, extractMentionedUserIds, convertMentionsForStorage as sharedConvertMentions, cleanMentionMarkup } from '../lib/mentions';

interface ProjectCommentsProps {
  projectId: string;
  companyId: string;
  tasks?: Task[];
}

// ─── Mention format: @[task:ID:Name] and @[user:ID:Name] ──────────────────
const ALL_MENTION_REGEX = /@\[(task|user):([^:]+):([^\]]+)\]/g;

function renderCommentContent(content: string, currentUserId?: string) {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(ALL_MENTION_REGEX.source, 'g');

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const kind = match[1]; // 'task' or 'user'
    const mentionId = match[2];
    const name = match[3];
    if (kind === 'task') {
      parts.push(
        <span
          key={`task-${match.index}`}
          className="inline-flex items-center gap-0.5 text-[#476E66] font-light text-xs align-baseline cursor-default"
          title={`Task: ${name}`}
        >
          <ListTodo className="w-3 h-3 flex-shrink-0 opacity-60" />
          @{name}
        </span>
      );
    } else {
      const displayName = currentUserId && mentionId === currentUserId ? 'you' : name;
      parts.push(
        <span
          key={`user-${match.index}`}
          className="font-light text-neutral-500 text-xs align-baseline cursor-default"
          title={name}
        >
          @{displayName}
        </span>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

export function ProjectComments({ projectId, companyId, tasks = [] }: ProjectCommentsProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibility, setVisibility] = useState<'all' | 'internal'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTarget, setMentionTarget] = useState<'new' | 'reply'>('new');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const mentionAnchorPos = useRef<number>(0); // cursor position of the @ character
  // Map of friendly display name -> { id, kind } for converting before submit
  const [mentionsMap, setMentionsMap] = useState<Record<string, { id: string; kind: 'user' | 'task' }>>({});

  // Mentionable users (team members + project collaborators)
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);

  // Load mentionable users when component mounts
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const [profiles, collabs] = await Promise.all([
          api.getCompanyProfiles(companyId),
          projectCollaboratorsApi.getByProject(projectId),
        ]);

        // Team members
        const teamUsers: MentionableUser[] = (profiles || []).map((p: { id: string; full_name?: string; email?: string }) => ({
          id: p.id,
          name: p.full_name || p.email || 'Unknown',
          email: p.email || '',
          type: 'team' as const,
        }));

        // Accepted collaborators with a user ID
        const collabUsers: MentionableUser[] = (collabs || [])
          .filter(c => c.status === 'accepted' && c.invited_user_id)
          .map(c => ({
            id: c.invited_user_id!,
            name: c.invited_user_name || c.invited_email || 'Collaborator',
            email: c.invited_email || '',
            type: 'collaborator' as const,
            companyId: c.invited_company_id || undefined,
          }));

        // Deduplicate: team members take priority
        const teamIds = new Set(teamUsers.map(u => u.id));
        const uniqueCollabs = collabUsers.filter(c => !teamIds.has(c.id));
        setMentionableUsers([...teamUsers, ...uniqueCollabs]);
      } catch (err) {
        console.error('[ProjectComments] Failed to load mentionable users:', err);
      }
    })();
  }, [companyId, projectId]);

  const filteredTasks = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return tasks.filter(t => t.name.toLowerCase().includes(q)).slice(0, 5);
  }, [tasks, mentionQuery]);

  const filteredUsers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionableUsers, mentionQuery]);

  // Total dropdown items count for keyboard navigation
  const totalMentionItems = filteredUsers.length + filteredTasks.length;

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setMentionIndex(0);
  }, []);

  // Convert friendly @Name to storage format @[type:id:Name] before saving
  function convertMentionsForStorage(text: string): string {
    return sharedConvertMentions(text, mentionsMap);
  }

  function handleMentionInput(value: string, textarea: HTMLTextAreaElement | null, target: 'new' | 'reply') {
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    // Look backwards from cursor for an unmatched @ sign
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      const query = textBeforeCursor.slice(atIndex + 1);
      // Only trigger if @ is at start or after a space, and query doesn't contain newlines
      // Also don't trigger if this looks like an already-inserted mention
      if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !query.includes('\n')) {
        setMentionQuery(query);
        setMentionTarget(target);
        setMentionIndex(0);
        mentionAnchorPos.current = atIndex;
        return;
      }
    }
    closeMention();
  }

  function insertTaskMention(task: Task, target: 'new' | 'reply') {
    insertMentionItem({ id: task.id, name: task.name, kind: 'task' }, target);
  }

  function insertUserMention(u: MentionableUser, target: 'new' | 'reply') {
    insertMentionItem({ id: u.id, name: u.name, kind: 'user' }, target);
  }

  function insertMentionItem(item: { id: string; name: string; kind: 'user' | 'task' }, target: 'new' | 'reply') {
    const friendlyMention = `@${item.name}`;
    const setter = target === 'new' ? setNewComment : setReplyContent;
    const currentValue = target === 'new' ? newComment : replyContent;
    const textarea = target === 'new' ? textareaRef.current : null;

    const before = currentValue.slice(0, mentionAnchorPos.current);
    const cursorPos = textarea?.selectionStart || currentValue.length;
    const after = currentValue.slice(cursorPos);
    const newValue = before + friendlyMention + ' ' + after;

    setter(newValue);
    setMentionsMap(prev => ({ ...prev, [item.name]: { id: item.id, kind: item.kind } }));
    closeMention();

    // Refocus textarea
    setTimeout(() => {
      if (textarea) {
        const newCursorPos = before.length + friendlyMention.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      }
    }, 0);
  }

  function handleMentionKeyDown(e: React.KeyboardEvent, target: 'new' | 'reply') {
    if (mentionQuery === null || totalMentionItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(i => Math.min(i + 1, totalMentionItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      // Users come first, then tasks
      if (mentionIndex < filteredUsers.length) {
        insertUserMention(filteredUsers[mentionIndex], target);
      } else {
        insertTaskMention(filteredTasks[mentionIndex - filteredUsers.length], target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMention();
    }
  }

  useEffect(() => {
    loadComments();
  }, [projectId]);

  // Real-time subscription: auto-update when comments are added, edited, or deleted
  useEffect(() => {
    const channel = supabase
      .channel(`project-comments-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_comments',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[ProjectComments] Real-time event:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as ProjectComment;
            // Skip if this is a comment we just created locally (already in state)
            setComments(prev => {
              if (prev.some(c => c.id === newComment.id) ||
                  prev.some(c => c.replies?.some(r => r.id === newComment.id))) {
                return prev;
              }
              if (newComment.parent_id) {
                // It's a reply — attach to parent
                return prev.map(c =>
                  c.id === newComment.parent_id
                    ? { ...c, replies: [...(c.replies || []), newComment] }
                    : c
                );
              }
              // Top-level comment — prepend (newest first)
              return [{ ...newComment, replies: [] }, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ProjectComment;
            setComments(prev =>
              prev.map(c => {
                if (c.id === updated.id) return { ...c, ...updated };
                if (c.replies?.some(r => r.id === updated.id)) {
                  return { ...c, replies: c.replies!.map(r => r.id === updated.id ? { ...r, ...updated } : r) };
                }
                return c;
              })
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (!deletedId) return;
            setComments(prev =>
              prev
                .filter(c => c.id !== deletedId)
                .map(c => ({
                  ...c,
                  replies: c.replies?.filter(r => r.id !== deletedId)
                }))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

  const loadComments = async () => {
    try {
      setIsLoading(true);
      const data = await projectCommentsApi.getByProject(projectId);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || isSubmitting) return;

    try {
      setIsSubmitting(true);
      console.log('[ProjectComments] Creating comment:', {
        project_id: projectId,
        company_id: companyId,
        author_id: user.id,
        author_email: user.email
      });
      
      // Convert friendly @Name mentions to storage format before saving
      const contentForStorage = convertMentionsForStorage(newComment.trim());
      const mentionedUserIds = extractMentionedUserIds(contentForStorage);

      const comment = await projectCommentsApi.create({
        project_id: projectId,
        company_id: companyId,
        author_id: user.id,
        author_name: profile?.full_name || user.email,
        author_email: user.email || '',
        content: contentForStorage,
        visibility,
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      });

      // Optimistically update state IMMEDIATELY so the real-time dedup guard works
      console.log('[ProjectComments] Comment created successfully:', comment);
      setComments(prev => [{ ...comment, replies: [] }, ...prev]);
      setNewComment('');
      setMentionsMap({});
      setVisibility('all');

      // Send notifications to mentioned users (async, after state is updated)
      const authorName = profile?.full_name || user.email || 'Someone';
      for (const uid of mentionedUserIds) {
        if (uid === user.id) continue;
        try {
          // Use the mentioned user's own company ID for cross-company notifications
          const mentionedUser = mentionableUsers.find(u => u.id === uid);
          const targetCompanyId = mentionedUser?.companyId || companyId;
          const cleanMsg = cleanMentionMarkup(contentForStorage);
          await notificationsApi.createNotification({
            company_id: targetCompanyId,
            user_id: uid,
            type: 'mention',
            title: 'You were mentioned',
            message: `${authorName} mentioned you in a comment: "${cleanMsg.slice(0, 80)}${cleanMsg.length > 80 ? '...' : ''}"`,
            reference_id: projectId,
            reference_type: 'project',
            is_read: false,
          });
        } catch (notifErr) {
          console.error('[ProjectComments] Failed to send mention notification:', notifErr);
        }
      }
    } catch (err: any) {
      console.error('[ProjectComments] Failed to post comment:', err);
      alert(`Failed to post comment: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || !user || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const replyContentForStorage = convertMentionsForStorage(replyContent.trim());
      const mentionedUserIds = extractMentionedUserIds(replyContentForStorage);

      const reply = await projectCommentsApi.create({
        project_id: projectId,
        company_id: companyId,
        author_id: user.id,
        author_name: profile?.full_name || user.email,
        author_email: user.email,
        content: replyContentForStorage,
        parent_id: parentId,
        visibility: 'all',
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      });

      // Optimistically update state IMMEDIATELY so the real-time dedup guard works
      setComments(prev => prev.map(c =>
        c.id === parentId
          ? { ...c, replies: [...(c.replies || []), reply] }
          : c
      ));
      setReplyingTo(null);
      setReplyContent('');
      setMentionsMap({});

      // Send notifications to mentioned users (async, after state is updated)
      const authorName = profile?.full_name || user.email || 'Someone';
      for (const uid of mentionedUserIds) {
        if (uid === user.id) continue;
        try {
          // Use the mentioned user's own company ID for cross-company notifications
          const mentionedUser = mentionableUsers.find(u => u.id === uid);
          const targetCompanyId = mentionedUser?.companyId || companyId;
          const cleanMsg = cleanMentionMarkup(replyContentForStorage);
          await notificationsApi.createNotification({
            company_id: targetCompanyId,
            user_id: uid,
            type: 'mention',
            title: 'You were mentioned',
            message: `${authorName} mentioned you in a reply: "${cleanMsg.slice(0, 80)}${cleanMsg.length > 80 ? '...' : ''}"`,
            reference_id: projectId,
            reference_type: 'project',
            is_read: false,
          });
        } catch (notifErr) {
          console.error('[ProjectComments] Failed to send mention notification:', notifErr);
        }
      }
    } catch (err) {
      console.error('Failed to post reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (id: string, isReply: boolean, parentId?: string) => {
    if (!editContent.trim()) return;

    try {
      await projectCommentsApi.update(id, { content: editContent.trim() });

      if (isReply && parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? {
              ...c,
              replies: c.replies?.map(r =>
                r.id === id ? { ...r, content: editContent.trim() } : r
              )
            }
            : c
        ));
      } else {
        setComments(prev => prev.map(c =>
          c.id === id ? { ...c, content: editContent.trim() } : c
        ));
      }

      setEditingId(null);
      setEditContent('');
    } catch (err) {
      console.error('Failed to edit comment:', err);
    }
  };

  const handleDelete = async (id: string, isReply: boolean, parentId?: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      await projectCommentsApi.delete(id);

      if (isReply && parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? { ...c, replies: c.replies?.filter(r => r.id !== id) }
            : c
        ));
      } else {
        setComments(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleToggleResolved = async (id: string, currentStatus: boolean) => {
    try {
      await projectCommentsApi.toggleResolved(id, !currentStatus);
      setComments(prev => prev.map(c =>
        c.id === id ? { ...c, is_resolved: !currentStatus } : c
      ));
    } catch (err) {
      console.error('Failed to toggle resolved:', err);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const filteredComments = comments.filter(c => showResolved || !c.is_resolved);
  const resolvedCount = comments.filter(c => c.is_resolved).length;

  const CommentActions = ({
    comment,
    isReply = false,
    parentId
  }: {
    comment: ProjectComment;
    isReply?: boolean;
    parentId?: string;
  }) => {
    const isAuthor = comment.author_id === user?.id;
    const menuId = `${isReply ? 'reply' : 'comment'}-${comment.id}`;

    return (
      <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(openMenuId === menuId ? null : menuId);
          }}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>

        {openMenuId === menuId && (
          <div
            className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 min-w-[140px]"
            onClick={(e) => e.stopPropagation()}
          >
            {!isReply && (
              <button
                onClick={() => {
                  handleToggleResolved(comment.id, comment.is_resolved || false);
                  setOpenMenuId(null);
                }}
                className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 flex items-center gap-2"
              >
                {comment.is_resolved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Unresolve</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Mark Resolved</span>
                  </>
                )}
              </button>
            )}
            {isAuthor && (
              <>
                <button
                  onClick={() => {
                    setEditingId(comment.id);
                    setEditContent(comment.content);
                    setOpenMenuId(null);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 flex items-center gap-2"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => {
                    handleDelete(comment.id, isReply, parentId);
                    setOpenMenuId(null);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 flex items-center gap-2 text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 px-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-neutral-100 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-neutral-100 rounded w-1/4" />
              <div className="h-3 bg-neutral-50 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Input Area - Minimalist */}
      <div className="flex gap-4 items-start">
        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-semibold text-neutral-400 flex-shrink-0">
          <User className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newComment}
                onChange={(e) => {
                  setNewComment(e.target.value);
                  handleMentionInput(e.target.value, e.target as HTMLTextAreaElement, 'new');
                }}
                onKeyDown={(e) => handleMentionKeyDown(e, 'new')}
                placeholder="Add a note or comment... (type @ to mention someone or a task)"
                className="w-full bg-transparent border-0 border-b border-neutral-200 px-0 py-2 text-sm focus:ring-0 focus:border-[#476E66] placeholder:text-neutral-400 resize-none transition-colors"
                rows={1}
                style={{ minHeight: '2.5rem' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                onBlur={() => setTimeout(closeMention, 200)}
              />

              {/* @mention dropdown */}
              {mentionQuery !== null && mentionTarget === 'new' && totalMentionItems > 0 && (
                <div
                  ref={mentionDropdownRef}
                  className="absolute left-0 bottom-full mb-1 w-full max-w-sm bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-56 overflow-y-auto"
                >
                  {filteredUsers.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide flex items-center gap-1">
                        <UserCircle className="w-3 h-3" /> People
                      </div>
                      {filteredUsers.map((u, i) => {
                        const isCollab = u.type === 'collaborator';
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); insertUserMention(u, 'new'); }}
                            className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${i === mentionIndex ? (isCollab ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700') : 'hover:bg-neutral-50 text-neutral-700'}`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isCollab ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                              {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <span className="truncate">{u.name}</span>
                            {isCollab && <span className="text-[8px] px-1 py-0.5 bg-amber-100 text-amber-600 rounded font-medium flex-shrink-0">External</span>}
                            <span className="ml-auto text-[9px] text-neutral-400 truncate max-w-[120px]">{u.email}</span>
                          </button>
                        );
                      })}
                    </>
                  )}
                  {filteredTasks.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide flex items-center gap-1">
                        <AtSign className="w-3 h-3" /> Tasks
                      </div>
                      {filteredTasks.map((task, i) => {
                        const globalIdx = filteredUsers.length + i;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); insertTaskMention(task, 'new'); }}
                            className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${globalIdx === mentionIndex ? 'bg-[#476E66]/10 text-[#476E66]' : 'hover:bg-neutral-50 text-neutral-700'}`}
                          >
                            <ListTodo className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" />
                            <span className="truncate">{task.name}</span>
                            {task.status && (
                              <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                task.status === 'completed' ? 'bg-green-100 text-green-600' :
                                task.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                                'bg-neutral-100 text-neutral-500'
                              }`}>{task.status.replace('_', ' ')}</span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`flex items-center justify-between mt-2 overflow-hidden transition-all duration-200 ${newComment.trim() ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'}`}>
              <button
                type="button"
                onClick={() => setVisibility(visibility === 'all' ? 'internal' : 'all')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${visibility === 'internal'
                    ? 'text-amber-600 bg-amber-50'
                    : 'text-neutral-400 hover:text-neutral-600'
                  }`}
              >
                {visibility === 'internal' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {visibility === 'internal' ? 'Internal Note' : 'Public Comment'}
              </button>

              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#476E66] text-white rounded-full hover:bg-[#3A5B54] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Post
                <Send className="w-3 h-3" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Header / Filter */}
      {comments.length > 0 && (
        <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
          <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Activity Timeline</h3>
          {resolvedCount > 0 && (
            <button
              onClick={() => setShowResolved(!showResolved)}
              className="text-[10px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {showResolved ? 'Hide' : 'Show'} Resolved ({resolvedCount})
            </button>
          )}
        </div>
      )}

      {/* Timeline List */}
      <div className="space-y-6 relative pl-4">
        {/* Vertical Connected Line */}
        {filteredComments.length > 0 && (
          <div className="absolute left-[19px] top-2 bottom-4 w-px bg-neutral-100" />
        )}

        {filteredComments.map(comment => (
          <div key={comment.id} className={`group relative ${comment.is_resolved ? 'opacity-50 grayscale' : ''}`}>
            <div className="flex gap-4">
              {/* Avatar / Icon */}
              <div className="relative z-10">
                <div className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-sm ${comment.visibility === 'internal'
                    ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100'
                    : comment.author_id === user?.id
                      ? 'bg-[#476E66] text-white'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}>
                  {comment.visibility === 'internal' ? <ShieldAlert className="w-3.5 h-3.5" /> : getInitials(comment.author_name)}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pt-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-900">{comment.author_name || 'Unknown'}</span>
                      <span className="text-[10px] text-neutral-400">{formatDate(comment.created_at)}</span>
                      {comment.is_resolved && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded-full font-medium">Resolved</span>
                      )}
                    </div>
                  </div>
                  <CommentActions comment={comment} />
                </div>

                {editingId === comment.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-neutral-50 border-0 rounded-lg p-3 text-sm focus:ring-1 focus:ring-[#476E66] resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => { setEditingId(null); setEditContent(''); }}
                        className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-700 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleEdit(comment.id, false)}
                        className="px-3 py-1 text-[10px] bg-neutral-900 text-white rounded-full hover:bg-neutral-800"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-neutral-600 leading-relaxed break-words whitespace-pre-wrap">
                    {renderCommentContent(comment.content, user?.id)}
                  </div>
                )}

                {/* Reply Button */}
                {!comment.is_resolved && editingId !== comment.id && !replyingTo && (
                  <button
                    onClick={() => {
                      setReplyingTo(comment.id);
                      setReplyContent('');
                    }}
                    className="mt-2 text-[10px] font-bold text-neutral-400 hover:text-[#476E66] flex items-center gap-1 transition-colors uppercase tracking-wide opacity-0 group-hover:opacity-100"
                  >
                    <Reply className="w-3 h-3" />
                    Reply
                  </button>
                )}

                {/* Reply Input */}
                {replyingTo === comment.id && (
                  <div className="mt-3 flex gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="pt-1.5">
                      <CornerDownRight className="w-4 h-4 text-neutral-300" />
                    </div>
                    <div className="flex-1 relative">
                      <textarea
                        value={replyContent}
                        onChange={(e) => {
                          setReplyContent(e.target.value);
                          handleMentionInput(e.target.value, e.target as HTMLTextAreaElement, 'reply');
                        }}
                        onKeyDown={(e) => handleMentionKeyDown(e, 'reply')}
                        onBlur={() => setTimeout(closeMention, 200)}
                        placeholder="Write a reply... (type @ to mention someone or a task)"
                        className="w-full bg-neutral-50 border-0 rounded-lg p-2 text-sm focus:ring-1 focus:ring-[#476E66] resize-none"
                        rows={1}
                        autoFocus
                      />

                      {/* @mention dropdown for replies */}
                      {mentionQuery !== null && mentionTarget === 'reply' && totalMentionItems > 0 && (
                        <div className="absolute left-0 bottom-full mb-1 w-full max-w-sm bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-56 overflow-y-auto">
                          {filteredUsers.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide flex items-center gap-1">
                                <UserCircle className="w-3 h-3" /> People
                              </div>
                              {filteredUsers.map((u, i) => {
                                const isCollab = u.type === 'collaborator';
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); insertUserMention(u, 'reply'); }}
                                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${i === mentionIndex ? (isCollab ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700') : 'hover:bg-neutral-50 text-neutral-700'}`}
                                  >
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isCollab ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                      {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </div>
                                    <span className="truncate">{u.name}</span>
                                    {isCollab && <span className="text-[8px] px-1 py-0.5 bg-amber-100 text-amber-600 rounded font-medium flex-shrink-0">External</span>}
                                    <span className="ml-auto text-[9px] text-neutral-400 truncate max-w-[120px]">{u.email}</span>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {filteredTasks.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide flex items-center gap-1">
                                <AtSign className="w-3 h-3" /> Tasks
                              </div>
                              {filteredTasks.map((task, i) => {
                                const globalIdx = filteredUsers.length + i;
                                return (
                                  <button
                                    key={task.id}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); insertTaskMention(task, 'reply'); }}
                                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${globalIdx === mentionIndex ? 'bg-[#476E66]/10 text-[#476E66]' : 'hover:bg-neutral-50 text-neutral-700'}`}
                                  >
                                    <ListTodo className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" />
                                    <span className="truncate">{task.name}</span>
                                    {task.status && (
                                      <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                        task.status === 'completed' ? 'bg-green-100 text-green-600' :
                                        task.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                                        'bg-neutral-100 text-neutral-500'
                                      }`}>{task.status.replace('_', ' ')}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                          className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-700 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReply(comment.id)}
                          disabled={!replyContent.trim() || isSubmitting}
                          className="px-3 py-1 text-[10px] bg-[#476E66] text-white rounded-full hover:bg-[#3A5B54] disabled:opacity-50"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="mt-4 space-y-4">
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="relative group/reply px-4 py-2 bg-neutral-50/50 rounded-lg -ml-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-5 h-5 rounded-full bg-white border border-neutral-100 flex items-center justify-center text-[9px] font-bold text-neutral-500">
                              {getInitials(reply.author_name)}
                            </div>
                            <span className="text-xs font-bold text-neutral-900">{reply.author_name}</span>
                            <span className="text-[10px] text-neutral-400">{formatDate(reply.created_at)}</span>
                          </div>
                          <CommentActions comment={reply} isReply parentId={comment.id} />
                        </div>

                        {editingId === reply.id ? (
                          <div className="mt-1">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-white border border-neutral-200 rounded p-2 text-xs focus:ring-1 focus:ring-[#476E66] resize-none"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                onClick={() => { setEditingId(null); setEditContent(''); }}
                                className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-700 font-medium"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleEdit(reply.id, true, comment.id)}
                                className="px-3 py-1 text-[10px] bg-neutral-900 text-white rounded-full hover:bg-neutral-800"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-neutral-600 pl-7 whitespace-pre-wrap">
                            {renderCommentContent(reply.content, user?.id)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredComments.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-xs text-neutral-400 italic">No notes or activities yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
