import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X, Search, Send, Paperclip, ArrowLeft, MessageSquare,
  Filter, Image as ImageIcon, FileText, Check, Reply, Eye, EyeOff,
  ChevronDown, AlertCircle, ListTodo, Download, Bookmark, BookmarkCheck,
  CheckCircle2, Circle, ExternalLink, Calendar, Bell, Flag,
  AlertTriangle, ArrowUp, Minus, ArrowDown, UserCircle, AtSign
} from 'lucide-react';
import { ProjectComment, projectCommentsApi, projectCollaboratorsApi, commentTasksApi, CommentTask, TaskPriority, api, Project, Task, notificationsApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { MentionableUser, extractMentionedUserIds, convertMentionsForStorage as sharedConvertMentions, detectMentionQuery, cleanMentionMarkup } from '../lib/mentions';

// ─── Priority Config ─────────────────────────────────────
const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; icon: typeof Flag }> = {
  urgent: { label: 'Urgent', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: AlertTriangle },
  high: { label: 'High', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', icon: ArrowUp },
  medium: { label: 'Medium', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: Minus },
  low: { label: 'Low', color: 'text-neutral-500', bg: 'bg-neutral-50 border-neutral-200', icon: ArrowDown },
};

// ─── Reminder Presets ────────────────────────────────────
const REMINDER_PRESETS = [
  { label: 'In 1 hour', hours: 1 },
  { label: 'In 3 hours', hours: 3 },
  { label: 'Tomorrow 9am', hours: -1 },
  { label: 'In 2 days', hours: 48 },
  { label: 'In 1 week', hours: 168 },
];

function getReminderDate(hours: number): string {
  if (hours === -1) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() + hours * 3600000).toISOString();
}

function formatDueDate(dateStr: string): { text: string; isOverdue: boolean; isDueToday: boolean; isDueSoon: boolean } {
  const due = new Date(dateStr + 'T23:59:59');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true, isDueToday: false, isDueSoon: false };
  if (diffDays === 0) return { text: 'Due today', isOverdue: false, isDueToday: true, isDueSoon: false };
  if (diffDays === 1) return { text: 'Due tomorrow', isOverdue: false, isDueToday: false, isDueSoon: true };
  if (diffDays <= 3) return { text: `Due in ${diffDays}d`, isOverdue: false, isDueToday: false, isDueSoon: true };
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isOverdue: false, isDueToday: false, isDueSoon: false };
}

function formatReminderTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return 'Reminder due';
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return `in ${Math.ceil(diff / 60000)}m`;
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d`;
}

// ─── Helpers ──────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name?: string, email?: string): string {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email[0].toUpperCase();
  return '?';
}

function isImageType(type: string): boolean {
  return type.startsWith('image/');
}

// Mention rendering (task + user) — subtle inline style, no heavy backgrounds
// currentUserId: if provided, replaces your own mention with "@you"
const ALL_MENTION_REGEX = /@\[(task|user):([^:]+):([^\]]+)\]/g;
function renderContent(content: string, currentUserId?: string) {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(ALL_MENTION_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
    const kind = match[1];
    const mentionId = match[2];
    const name = match[3];
    if (kind === 'task') {
      parts.push(
        <span key={`task-${match.index}`} className="inline-flex items-center gap-0.5 text-[#476E66] font-light text-[inherit]">
          <ListTodo className="w-3 h-3 opacity-60" />@{name}
        </span>
      );
    } else {
      const displayName = currentUserId && mentionId === currentUserId ? 'you' : name;
      parts.push(
        <span key={`user-${match.index}`} className="font-light text-[inherit] opacity-80">
          @{displayName}
        </span>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts.length > 0 ? parts : content;
}

// ─── Interfaces ──────────────────────────────────────────
interface CommsComment extends ProjectComment {
  project_name?: string;
  project_number?: string;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  projectNumber: string;
  comments: CommsComment[];
  lastActivity: string;
  unreadCount: number;
  authors: string[];
}

interface CommunicationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'messages' | 'todos';
}

// ─── Attachment Display ──────────────────────────────────
function AttachmentItem({ att }: { att: { name: string; url: string; type: string; size: number } }) {
  const isImg = isImageType(att.type);
  const sizeStr = att.size < 1024 ? `${att.size}B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)}KB` : `${(att.size / 1048576).toFixed(1)}MB`;

  if (isImg) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-neutral-200 hover:border-[#476E66] transition-colors max-w-[200px]">
        <img src={att.url} alt={att.name} className="w-full h-auto max-h-[150px] object-cover" />
        <div className="px-2 py-1 bg-neutral-50 text-[9px] text-neutral-500 truncate">{att.name}</div>
      </a>
    );
  }

  return (
    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-lg hover:border-[#476E66] hover:bg-neutral-50 transition-colors max-w-[250px]">
      <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-neutral-700 truncate">{att.name}</p>
        <p className="text-[9px] text-neutral-400">{sizeStr}</p>
      </div>
      <Download className="w-3.5 h-3.5 text-neutral-300" />
    </a>
  );
}

// ─── Main Component ──────────────────────────────────────
export function CommunicationsPanel({ isOpen, onClose, initialTab }: CommunicationsPanelProps) {
  const { user, profile } = useAuth();
  const { canViewAllProjects } = usePermissions();
  const companyId = profile?.company_id;

  // Data
  const [allComments, setAllComments] = useState<CommsComment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [commentTasks, setCommentTasks] = useState<CommentTask[]>([]);
  const [loading, setLoading] = useState(true);

  // View state
  const [activeTab, setActiveTab] = useState<'messages' | 'todos'>('messages');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [todoSortBy, setTodoSortBy] = useState<'date' | 'priority' | 'due'>('priority');

  // Task creation / editing popover
  const [pinningComment, setPinningComment] = useState<CommsComment | null>(null);
  const [pinPriority, setPinPriority] = useState<TaskPriority>('medium');
  const [pinDueDate, setPinDueDate] = useState('');
  const [pinReminder, setPinReminder] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Filters
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Compose
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'internal'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Quick Reply
  const [activeQuickReplyId, setActiveQuickReplyId] = useState<string | null>(null); // projectId
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);

  // Project tasks for selected project
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionAnchorPos = useRef<number>(0);
  const [mentionsMap, setMentionsMap] = useState<Record<string, { id: string; kind: 'user' | 'task' }>>({});
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  // Switch to requested tab when panel opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
      setSelectedProjectId(null);
    }
  }, [isOpen, initialTab]);

  // ─── Load Data ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setLoadError(null);
      const [comments, projs, tasks] = await Promise.all([
        projectCommentsApi.getAllByCompany(companyId),
        api.getProjects(companyId),
        commentTasksApi.getAll().catch(() => [] as CommentTask[]),
      ]);

      // For staff users, restrict to only assigned projects
      let filteredComments = comments;
      let filteredProjs = projs;
      if (!canViewAllProjects && user?.id) {
        const [staffProjects, assignedTasks] = await Promise.all([
          api.getStaffProjects(user.id).catch(() => []),
          Promise.resolve(supabase
            .from('tasks')
            .select('project_id')
            .eq('assigned_to', user.id))
            .then(({ data }) => data || [])
            .catch(() => []),
        ]);
        const assignedProjectIds = new Set([
          ...(staffProjects || []).map((sp: any) => sp.project_id),
          ...(assignedTasks || []).map((t: any) => t.project_id).filter(Boolean),
        ]);
        filteredProjs = projs.filter(p => assignedProjectIds.has(p.id));
        filteredComments = comments.filter(c => assignedProjectIds.has(c.project_id));
      }

      // Identify project IDs referenced in comments but missing from own-company projects
      const ownProjectIds = new Set(filteredProjs.map(p => p.id));
      const missingIds = [...new Set(filteredComments.map(c => c.project_id))].filter(id => !ownProjectIds.has(id));

      // Fetch missing project names (e.g. collaborator projects from other companies)
      let allProjs: Project[] = [...filteredProjs];
      if (missingIds.length > 0) {
        // Try batch fetch first
        const extraProjs = await api.getProjectsByIds(missingIds);
        const fetchedIds = new Set(extraProjs.map(p => p.id));
        allProjs = [...filteredProjs, ...extraProjs.map(ep => ({ ...ep, company_id: '' }) as Project)];

        // For any still-missing projects, try fetching individually (different RLS path)
        const stillMissing = missingIds.filter(id => !fetchedIds.has(id));
        if (stillMissing.length > 0) {
          const individualFetches = await Promise.allSettled(
            stillMissing.map(id => api.getProject(id).catch(() => null))
          );
          for (const result of individualFetches) {
            if (result.status === 'fulfilled' && result.value) {
              allProjs.push(result.value);
            }
          }
        }
      }

      setAllComments(filteredComments);
      setProjects(allProjs);
      setCommentTasks(tasks);
    } catch (err: any) {
      console.error('Failed to load communications:', err);
      setLoadError(err?.message || 'Failed to load communications');
    }
    setLoading(false);
  }, [companyId, canViewAllProjects, user?.id]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  // Real-time: reload when any comment for this company changes
  useEffect(() => {
    if (!isOpen || !companyId) return;

    const channel = supabase
      .channel(`comms-panel-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_comments' },
        () => {
          // Simply reload all data when any comment changes
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, companyId, loadData]);

  // Load tasks when project is selected
  useEffect(() => {
    if (!selectedProjectId || !companyId) { setProjectTasks([]); return; }
    api.getTasks(selectedProjectId).then(setProjectTasks).catch(() => setProjectTasks([]));
  }, [selectedProjectId, companyId]);

  // Load mentionable users (team members + project collaborators)
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const [profiles, collabs] = await Promise.all([
          api.getCompanyProfiles(companyId),
          selectedProjectId
            ? projectCollaboratorsApi.getByProject(selectedProjectId)
            : Promise.resolve([]),
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
        console.error('[CommsPanel] Failed to load mentionable users:', err);
      }
    })();
  }, [companyId, selectedProjectId]);

  // ─── Mention helpers ──────────────────────────────────────
  const filteredMentionUsers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionableUsers, mentionQuery]);

  const filteredMentionTasks = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return projectTasks.filter(t => t.name.toLowerCase().includes(q)).slice(0, 5);
  }, [projectTasks, mentionQuery]);

  const totalMentionItems = filteredMentionUsers.length + filteredMentionTasks.length;

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setMentionIndex(0);
  }, []);

  function handleMentionInput(value: string, textarea: HTMLTextAreaElement | null) {
    if (!textarea) return;
    const result = detectMentionQuery(value, textarea.selectionStart);
    if (result) {
      setMentionQuery(result.query);
      setMentionIndex(0);
      mentionAnchorPos.current = result.anchorPos;
    } else {
      closeMention();
    }
  }

  function insertMentionItem(item: { id: string; name: string; kind: 'user' | 'task' }) {
    const friendlyMention = `@${item.name}`;
    const currentValue = newMessage;
    const textarea = composeTextareaRef.current;

    const before = currentValue.slice(0, mentionAnchorPos.current);
    const cursorPos = textarea?.selectionStart || currentValue.length;
    const after = currentValue.slice(cursorPos);
    const newValue = before + friendlyMention + ' ' + after;

    setNewMessage(newValue);
    setMentionsMap(prev => ({ ...prev, [item.name]: { id: item.id, kind: item.kind } }));
    closeMention();

    setTimeout(() => {
      if (textarea) {
        const newCursorPos = before.length + friendlyMention.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      }
    }, 0);
  }

  function handleMentionKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery === null || totalMentionItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(i => Math.min(i + 1, totalMentionItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (totalMentionItems > 0) {
        e.preventDefault();
        if (mentionIndex < filteredMentionUsers.length) {
          const u = filteredMentionUsers[mentionIndex];
          insertMentionItem({ id: u.id, name: u.name, kind: 'user' });
        } else {
          const t = filteredMentionTasks[mentionIndex - filteredMentionUsers.length];
          insertMentionItem({ id: t.id, name: t.name, kind: 'task' });
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMention();
    }
  }

  function convertMentionsForStorage(text: string): string {
    return sharedConvertMentions(text, mentionsMap);
  }

  // ─── Group comments by project ─────────────────────────
  const projectGroups = useMemo((): ProjectGroup[] => {
    const grouped: Record<string, CommsComment[]> = {};
    for (const c of allComments) {
      if (!grouped[c.project_id]) grouped[c.project_id] = [];
      grouped[c.project_id].push(c);
    }

    return Object.entries(grouped).map(([projectId, comments]) => {
      const proj = projects.find(p => p.id === projectId);
      const sorted = [...comments].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
      const uniqueAuthors = [...new Set(comments.map(c => c.author_name || c.author_email || 'Unknown'))];
      return {
        projectId,
        projectName: proj?.name || comments[0]?.project_name || 'Unknown Project',
        projectNumber: (proj as any)?.project_number || comments[0]?.project_number || '',
        comments: sorted,
        lastActivity: sorted[0]?.created_at || '',
        unreadCount: 0,
        authors: uniqueAuthors,
      };
    }).sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  }, [allComments, projects]);

  // ─── Unique authors for filter ─────────────────────────
  const uniqueAuthors = useMemo(() => {
    const authors = new Map<string, string>();
    for (const c of allComments) {
      const key = c.author_id;
      if (!authors.has(key)) authors.set(key, c.author_name || c.author_email || 'Unknown');
    }
    return Array.from(authors.entries()).map(([id, name]) => ({ id, name }));
  }, [allComments]);

  // ─── Filtered + searched groups ────────────────────────
  const filteredGroups = useMemo(() => {
    let groups = projectGroups;

    // Filter by project
    if (filterProject) groups = groups.filter(g => g.projectId === filterProject);

    // Filter by user
    if (filterUser) {
      groups = groups.map(g => ({
        ...g,
        comments: g.comments.filter(c => c.author_id === filterUser),
      })).filter(g => g.comments.length > 0);
    }

    // Filter by date range
    if (filterDateFrom || filterDateTo) {
      const fromTime = filterDateFrom ? new Date(filterDateFrom).getTime() : 0;
      const toTime = filterDateTo ? new Date(filterDateTo + 'T23:59:59').getTime() : Infinity;
      groups = groups.map(g => ({
        ...g,
        comments: g.comments.filter(c => {
          const t = new Date(c.created_at || '').getTime();
          return t >= fromTime && t <= toTime;
        }),
      })).filter(g => g.comments.length > 0);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      groups = groups.map(g => ({
        ...g,
        comments: g.comments.filter(c =>
          c.content.toLowerCase().includes(q) ||
          (c.author_name || '').toLowerCase().includes(q) ||
          (c.project_name || '').toLowerCase().includes(q)
        ),
      })).filter(g => g.comments.length > 0 || g.projectName.toLowerCase().includes(q));
    }

    return groups;
  }, [projectGroups, filterProject, filterUser, filterDateFrom, filterDateTo, searchQuery]);

  // ─── Selected project thread ───────────────────────────
  const selectedThread = useMemo(() => {
    if (!selectedProjectId) return [];
    const group = projectGroups.find(g => g.projectId === selectedProjectId);
    if (!group) return [];
    // Return chronological, threaded
    const topLevel = group.comments.filter(c => !c.parent_id).sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
    const replies = group.comments.filter(c => c.parent_id);
    return topLevel.map(c => ({ ...c, replies: replies.filter(r => r.parent_id === c.id).sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()) }));
  }, [selectedProjectId, projectGroups]);

  const selectedGroup = projectGroups.find(g => g.projectId === selectedProjectId);

  // ─── Scroll to bottom on new messages ──────────────────
  useEffect(() => {
    if (selectedProjectId) threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThread, selectedProjectId]);

  // ─── Send Message ──────────────────────────────────────
  const handleSend = async (parentId?: string) => {
    const rawContent = parentId ? replyContent.trim() : newMessage.trim();
    if (!rawContent && pendingFiles.length === 0) return;
    if (!user?.id || !companyId || !selectedProjectId) return;

    setIsSubmitting(true);
    try {
      // Convert mentions to storage format
      const contentForStorage = convertMentionsForStorage(rawContent);
      const mentionedUserIds = extractMentionedUserIds(contentForStorage);

      // Upload pending files
      let attachments: Array<{ name: string; url: string; type: string; size: number }> = [];
      if (pendingFiles.length > 0 && !parentId) {
        setIsUploading(true);
        attachments = await Promise.all(
          pendingFiles.map(f => projectCommentsApi.uploadAttachment(companyId, selectedProjectId, f))
        );
        setIsUploading(false);
      }

      await projectCommentsApi.createWithAttachments({
        project_id: selectedProjectId,
        company_id: companyId,
        author_id: user.id,
        author_name: profile?.full_name || profile?.email || undefined,
        author_email: profile?.email || undefined,
        content: contentForStorage || (attachments.length > 0 ? `Shared ${attachments.length} file${attachments.length > 1 ? 's' : ''}` : ''),
        visibility,
        parent_id: parentId,
        attachments: attachments.length > 0 ? attachments : undefined,
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      });

      // Send notifications to mentioned users
      const authorName = profile?.full_name || profile?.email || 'Someone';
      const projName = selectedGroup?.projectName || 'a project';
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
            message: `${authorName} mentioned you in ${projName}: "${cleanMsg.slice(0, 80)}${cleanMsg.length > 80 ? '...' : ''}"`,
            reference_id: selectedProjectId,
            reference_type: 'project',
            is_read: false,
          });
        } catch (notifErr) {
          console.error('[CommsPanel] Failed to send mention notification:', notifErr);
        }
      }

      if (parentId) { setReplyContent(''); setReplyingTo(null); }
      else { setNewMessage(''); setPendingFiles([]); setMentionsMap({}); }

      // Reload
      const comments = await projectCommentsApi.getAllByCompany(companyId);
      setAllComments(comments);
    } catch (err) {
      console.error('Failed to send:', err);
    }
    setIsSubmitting(false);
  };

  const handleQuickReply = async (projectId: string) => {
    if (!quickReplyText.trim() || !user?.id || !companyId) return;

    setIsSendingQuickReply(true);
    try {
      await projectCommentsApi.createWithAttachments({
        project_id: projectId,
        company_id: companyId,
        author_id: user.id,
        author_name: profile?.full_name || profile?.email || undefined,
        author_email: profile?.email || undefined,
        content: quickReplyText.trim(),
        visibility: 'all',
      });

      setQuickReplyText('');
      setActiveQuickReplyId(null);

      // Reload
      const comments = await projectCommentsApi.getAllByCompany(companyId);
      setAllComments(comments);
    } catch (err) {
      console.error('Failed to send quick reply:', err);
    }
    setIsSendingQuickReply(false);
  };

  // ─── Comment Tasks (Pin as To-Do) ─────────────────────
  // Map from comment_id -> { is_completed } so we can show different badges
  const pinnedCommentMap = useMemo(() => {
    const map = new Map<string, { is_completed: boolean }>();
    for (const t of commentTasks) map.set(t.comment_id, { is_completed: t.is_completed });
    return map;
  }, [commentTasks]);
  const pinnedCommentIds = useMemo(() => new Set(commentTasks.map(t => t.comment_id)), [commentTasks]);

  // Open the pin popover (sets defaults, user can customize before saving)
  const openPinPopover = (comment: CommsComment) => {
    setPinningComment(comment);
    setPinPriority('medium');
    setPinDueDate('');
    setPinReminder('');
  };

  const closePinPopover = () => {
    setPinningComment(null);
    setEditingTaskId(null);
  };

  // Quick pin (no popover, default priority)
  const handleQuickPin = async (comment: CommsComment) => {
    if (!user?.id || !companyId) return;
    try {
      const task = await commentTasksApi.create({
        comment_id: comment.id,
        project_id: comment.project_id,
        user_id: user.id,
        company_id: companyId,
      });
      setCommentTasks(prev => [task, ...prev]);
    } catch (err) {
      console.error('Failed to pin as task:', err);
    }
  };

  // Save pin with full options
  const handleSavePin = async () => {
    if (!pinningComment || !user?.id || !companyId) return;
    try {
      const task = await commentTasksApi.create({
        comment_id: pinningComment.id,
        project_id: pinningComment.project_id,
        user_id: user.id,
        company_id: companyId,
        priority: pinPriority,
        due_date: pinDueDate || null,
        reminder_at: pinReminder || null,
      });
      setCommentTasks(prev => [task, ...prev]);
      closePinPopover();
    } catch (err) {
      console.error('Failed to pin as task:', err);
    }
  };

  // Update existing task fields
  const handleUpdateTask = async (taskId: string, fields: { priority?: TaskPriority; due_date?: string | null; reminder_at?: string | null }) => {
    try {
      const updated = await commentTasksApi.update(taskId, fields);
      setCommentTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // Open edit popover for existing task
  const openEditTask = (task: CommentTask) => {
    setEditingTaskId(task.id);
    setPinPriority(task.priority);
    setPinDueDate(task.due_date || '');
    setPinReminder(task.reminder_at ? task.reminder_at.slice(0, 16) : '');
  };

  const handleSaveEdit = async () => {
    if (!editingTaskId) return;
    try {
      const updated = await commentTasksApi.update(editingTaskId, {
        priority: pinPriority,
        due_date: pinDueDate || null,
        reminder_at: pinReminder || null,
      });
      setCommentTasks(prev => prev.map(t => t.id === editingTaskId ? updated : t));
      closePinPopover();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleUnpinTask = async (commentId: string) => {
    const task = commentTasks.find(t => t.comment_id === commentId);
    if (!task) return;
    try {
      await commentTasksApi.remove(task.id);
      setCommentTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err) {
      console.error('Failed to unpin task:', err);
    }
  };

  const handleToggleTaskComplete = async (taskId: string) => {
    const task = commentTasks.find(t => t.id === taskId);
    if (!task) return;
    try {
      const updated = await commentTasksApi.toggleComplete(taskId, !task.is_completed);
      setCommentTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    try {
      await commentTasksApi.remove(taskId);
      setCommentTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to remove task:', err);
    }
  };

  // Enriched tasks with comment & project data
  const enrichedTasks = useMemo(() => {
    const commentMap = new Map(allComments.map(c => [c.id, c]));
    return commentTasks.map(task => {
      const comment = commentMap.get(task.comment_id);
      const proj = projects.find(p => p.id === task.project_id);
      return {
        ...task,
        comment,
        projectName: proj?.name || comment?.project_name || 'Unknown Project',
        projectNumber: (proj as any)?.project_number || comment?.project_number || '',
      };
    });
  }, [commentTasks, allComments, projects]);

  // Sort pending tasks based on selected sort
  const pendingTasks = useMemo(() => {
    const tasks = enrichedTasks.filter(t => !t.is_completed);
    const priorityOrder: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    if (todoSortBy === 'priority') {
      return [...tasks].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }
    if (todoSortBy === 'due') {
      return [...tasks].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    }
    return tasks; // date = creation order (default from API)
  }, [enrichedTasks, todoSortBy]);

  const completedTasks = enrichedTasks.filter(t => t.is_completed);

  // ─── File handling ─────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files].slice(0, 5)); // max 5 files
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // ─── Active filters count ─────────────────────────────
  const activeFilterCount = [filterProject, filterUser, filterDateFrom, filterDateTo].filter(Boolean).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 print:hidden" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] lg:w-[680px] bg-white z-50 shadow-2xl flex flex-col print:hidden" style={{ animation: 'slideInRight 0.2s ease-out' }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* ─── HEADER ─── */}
        <div className="border-b border-neutral-200 px-4 py-3 flex items-center gap-3 shrink-0">
          {selectedProjectId ? (
            <>
              <button onClick={() => setSelectedProjectId(null)} className="p-1.5 hover:bg-neutral-100 rounded-lg">
                <ArrowLeft className="w-4 h-4 text-neutral-600" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 truncate">{selectedGroup?.projectName}</p>
                {selectedGroup?.projectNumber && <p className="text-[10px] text-neutral-400">{selectedGroup.projectNumber}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setVisibility(visibility === 'all' ? 'internal' : 'all')} className={`p-1.5 rounded-lg text-xs ${visibility === 'internal' ? 'bg-amber-100 text-amber-700' : 'text-neutral-400 hover:bg-neutral-100'}`} title={visibility === 'internal' ? 'Internal only' : 'Visible to all'}>
                  {visibility === 'internal' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </>
          ) : (
            <>
              <MessageSquare className="w-5 h-5 text-[#476E66] shrink-0" />
              <h2 className="text-sm font-bold text-neutral-900 flex-1">Communications</h2>
              <div className="flex items-center gap-1">
                {activeTab === 'messages' && (
                  <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 rounded-lg relative ${showFilters || activeFilterCount > 0 ? 'bg-[#476E66]/10 text-[#476E66]' : 'text-neutral-400 hover:bg-neutral-100'}`}>
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#476E66] text-white text-[8px] rounded-full flex items-center justify-center font-bold">{activeFilterCount}</span>}
                  </button>
                )}
              </div>
            </>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg shrink-0">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* ─── TAB BAR ─── */}
        {!selectedProjectId && (
          <div className="px-4 py-3 border-b border-neutral-100 shrink-0">
            <div className="flex p-1 bg-neutral-100/80 rounded-xl relative">
              <button
                onClick={() => setActiveTab('messages')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'messages'
                  ? 'bg-white text-[#476E66] shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-600'
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Messages
              </button>
              <button
                onClick={() => setActiveTab('todos')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'todos'
                  ? 'bg-white text-[#476E66] shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-600'
                  }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                To-Do
                {pendingTasks.length > 0 && (
                  <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'todos' ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-neutral-200 text-neutral-500'
                    }`}>
                    {pendingTasks.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─── SEARCH BAR ─── */}
        {!selectedProjectId && activeTab === 'messages' && (
          <div className="px-4 py-2 border-b border-neutral-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages, projects, people..."
                className="w-full pl-10 pr-8 py-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-[#476E66]/30 focus:border-[#476E66] outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── FILTERS ─── */}
        {!selectedProjectId && activeTab === 'messages' && showFilters && (
          <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-neutral-500 uppercase font-medium">Project</label>
                <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none bg-white">
                  <option value="">All projects</option>
                  {projectGroups.map(g => <option key={g.projectId} value={g.projectId}>{g.projectName}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-neutral-500 uppercase font-medium">Person</label>
                <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none bg-white">
                  <option value="">Everyone</option>
                  {uniqueAuthors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-neutral-500 uppercase font-medium">From</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none bg-white" />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-neutral-500 uppercase font-medium">To</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none bg-white" />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilterProject(''); setFilterUser(''); setFilterDateFrom(''); setFilterDateTo(''); }} className="text-[10px] text-red-500 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* ─── CONTENT ─── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="text-center py-16 px-4">
              <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
              <p className="text-sm text-red-600 font-medium">Failed to load communications</p>
              <p className="text-xs text-neutral-400 mt-1">{loadError}</p>
              <button onClick={loadData} className="mt-3 text-xs text-[#476E66] hover:underline font-medium">Try again</button>
            </div>
          ) : selectedProjectId ? (
            /* ─── CONVERSATION THREAD ─── */
            <div className="px-4 py-3 space-y-4">
              {selectedThread.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No messages yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Start the conversation below</p>
                </div>
              ) : (
                selectedThread.map(comment => {
                  const isMine = comment.author_id === user?.id;
                  return (
                    <div key={comment.id}>
                      {/* Main comment */}
                      <div className={`group ${comment.visibility === 'internal' ? 'border-l-2 border-amber-300 pl-3' : ''} ${isMine ? 'flex flex-col items-end' : ''}`}>
                        <div className={`${isMine ? 'flex flex-col items-end' : ''}`} style={{ maxWidth: '88%' }}>
                          <div className="flex-1 min-w-0">
                            {/* Name & time */}
                            <div className={`flex items-center gap-2 mb-1 ${isMine ? 'justify-end' : ''}`}>
                              <span className={`text-[11px] ${isMine ? 'font-normal text-neutral-400' : 'font-semibold text-neutral-800'}`}>
                                {isMine ? 'You' : (comment.author_name || comment.author_email || 'Unknown')}
                              </span>
                              <span className="text-[10px] font-light text-neutral-400">{timeAgo(comment.created_at || '')}</span>
                              {comment.visibility === 'internal' && <span className="text-[8px] font-bold text-amber-600 bg-amber-100 px-1 py-0.5 rounded uppercase">Internal</span>}
                              {comment.is_resolved && <Check className="w-3 h-3 text-emerald-500" />}
                            </div>
                            {/* Message */}
                            <div className={`text-[13px] leading-relaxed whitespace-pre-wrap ${isMine ? 'font-light text-neutral-600' : 'text-neutral-800'}`}>
                              {renderContent(comment.content, user?.id)}
                            </div>

                            {/* Attachments */}
                            {comment.attachments && comment.attachments.length > 0 && (
                              <div className={`flex flex-wrap gap-2 mt-1.5 ${isMine ? 'justify-end' : ''}`}>
                                {comment.attachments.map((att, i) => <AttachmentItem key={i} att={att} />)}
                              </div>
                            )}

                            {/* Actions: Reply + Pin as To-Do */}
                            <div className={`mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${isMine ? 'justify-end' : ''}`}>
                              <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-[10px] font-light text-neutral-400 hover:text-[#476E66] flex items-center gap-1">
                                <Reply className="w-3 h-3" /> Reply
                              </button>
                              {pinnedCommentMap.has(comment.id) ? (
                                pinnedCommentMap.get(comment.id)!.is_completed ? (
                                  <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                                    <CheckCircle2 className="w-3 h-3" /> Done
                                    <button onClick={() => handleUnpinTask(comment.id)} className="ml-1 text-neutral-400 hover:text-red-500" title="Remove from To-Do">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ) : (
                                  <button onClick={() => handleUnpinTask(comment.id)} className="text-[10px] text-[#476E66] flex items-center gap-1 font-medium" title="Remove from To-Do">
                                    <BookmarkCheck className="w-3 h-3" /> Pinned
                                  </button>
                                )
                              ) : (
                                <div className="flex items-center">
                                  <button onClick={() => handleQuickPin(comment)} className="text-[10px] font-light text-neutral-400 hover:text-amber-600 flex items-center gap-1" title="Quick pin as To-Do">
                                    <Bookmark className="w-3 h-3" /> To-Do
                                  </button>
                                  <button onClick={() => openPinPopover(comment)} className="text-[10px] text-neutral-400 hover:text-amber-600 ml-0.5 p-0.5 rounded hover:bg-amber-50" title="Pin with options">
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Replies */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-2 space-y-2 pl-4 border-l border-neutral-100 ml-3">
                          {comment.replies.map(reply => {
                            const isReplyMine = reply.author_id === user?.id;
                            return (
                              <div key={reply.id} className={`${reply.visibility === 'internal' ? 'border-l-2 border-amber-300 pl-2' : ''} ${isReplyMine ? 'flex flex-col items-end' : ''}`}>
                            <div className={`${isReplyMine ? 'flex flex-col items-end' : ''}`} style={{ maxWidth: '82%' }}>
                              <div className="flex-1 min-w-0">
                                <div className={`flex items-center gap-1.5 mb-0.5 ${isReplyMine ? 'justify-end' : ''}`}>
                                  <span className={`text-[10px] ${isReplyMine ? 'font-normal text-neutral-400' : 'font-semibold text-neutral-700'}`}>
                                    {isReplyMine ? 'You' : (reply.author_name || 'Unknown')}
                                  </span>
                                  <span className="text-[9px] font-light text-neutral-400">{timeAgo(reply.created_at || '')}</span>
                                </div>
                                <div className={`text-xs whitespace-pre-wrap leading-relaxed ${isReplyMine ? 'font-light text-neutral-500' : 'text-neutral-700'}`}>
                                  {renderContent(reply.content, user?.id)}
                                </div>
                                    {reply.attachments && reply.attachments.length > 0 && (
                                      <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isReplyMine ? 'justify-end' : ''}`}>
                                        {reply.attachments.map((att, i) => <AttachmentItem key={i} att={att} />)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply input */}
                      {replyingTo === comment.id && (
                        <div className="mt-2 flex gap-2 ml-3 pl-4">
                          <input
                            type="text"
                            value={replyContent}
                            onChange={e => setReplyContent(e.target.value)}
                            placeholder="Write a reply..."
                            className="flex-1 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none focus:ring-1 focus:ring-[#476E66]/30"
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(comment.id); } }}
                            autoFocus
                          />
                          <button onClick={() => handleSend(comment.id)} disabled={!replyContent.trim() || isSubmitting} className="px-2.5 py-1.5 bg-[#476E66] text-white rounded-lg disabled:opacity-40">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>
          ) : activeTab === 'todos' ? (
            /* ─── TO-DO LIST ─── */
            <div className="bg-neutral-50/50 min-h-full">
              {enrichedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] px-8 text-center">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 border border-neutral-100">
                    <Bookmark className="w-8 h-8 text-[#476E66]/40" />
                  </div>
                  <h3 className="text-neutral-900 font-semibold mb-1">Your To-Do List</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed max-w-[260px]">
                    Pin messages here to keep track of important tasks. Hover over any message and click <span className="font-medium text-[#476E66]">To-Do</span>.
                  </p>
                </div>
              ) : (
                <div className="pb-10">
                  {/* Sort bar (Minimal) */}
                  <div className="px-6 py-3 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b border-neutral-100">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                      Your Tasks
                    </p>
                    <div className="flex items-center gap-3">
                      {(['priority', 'due', 'date'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setTodoSortBy(s)}
                          className={`text-[10px] font-medium transition-colors ${todoSortBy === s ? 'text-[#476E66]' : 'text-neutral-400 hover:text-neutral-600'
                            }`}
                        >
                          {s === 'priority' ? 'Priority' : s === 'due' ? 'Due Date' : 'Newest'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="px-4 py-4 space-y-3">
                    {/* Pending tasks */}
                    {pendingTasks.length > 0 && (
                      <div className="space-y-2">
                        {pendingTasks.map(task => {
                          const priCfg = PRIORITY_CONFIG[task.priority];
                          const PriIcon = priCfg.icon;
                          const dueInfo = task.due_date ? formatDueDate(task.due_date) : null;
                          const hasReminder = task.reminder_at && !task.reminder_sent;

                          return (
                            <div
                              key={task.id}
                              className={`group relative bg-white rounded-xl border transition-all hover:shadow-md hover:border-[#476E66]/20 p-3.5 ${dueInfo?.isOverdue ? 'border-red-100' : 'border-neutral-100/50'
                                }`}
                            >
                              <div className="flex items-start gap-3">
                                {/* Custom Checkbox */}
                                <button
                                  onClick={() => handleToggleTaskComplete(task.id)}
                                  className="mt-0.5 shrink-0 w-4 h-4 rounded border-2 border-neutral-300 hover:border-[#476E66] flex items-center justify-center transition-colors group-hover:scale-105"
                                >
                                  {/* Empty for unchecked, but clickable target */}
                                </button>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  {task.comment ? (
                                    <div className="text-sm text-neutral-800 font-medium leading-relaxed line-clamp-2">
                                      {renderContent(task.comment.content, user?.id)}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-neutral-400 italic">Message removed</div>
                                  )}

                                  {/* Metadata row */}
                                  <div className="flex items-center flex-wrap gap-2 mt-2.5">
                                    {/* Priority - Dot style */}
                                    <div className={`flex items-center gap-1 text-[10px] font-medium ${priCfg.color}`}>
                                      <PriIcon className="w-3 h-3" />
                                      {priCfg.label}
                                    </div>

                                    {/* Separator */}
                                    <span className="text-neutral-200">|</span>

                                    {/* Project */}
                                    <span className="text-[10px] text-neutral-500 font-medium truncate max-w-[120px]">
                                      {task.projectName}
                                    </span>

                                    {/* Due Date */}
                                    {dueInfo && (
                                      <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${dueInfo.isOverdue ? 'bg-red-50 text-red-600' :
                                        dueInfo.isDueToday ? 'bg-amber-50 text-amber-700' :
                                          'bg-neutral-50 text-neutral-500'
                                        }`}>
                                        <Calendar className="w-3 h-3" /> {dueInfo.text}
                                      </span>
                                    )}

                                    {/* Reminder */}
                                    {hasReminder && (
                                      <span className="flex items-center gap-1 text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md">
                                        <Bell className="w-3 h-3" /> {formatReminderTime(task.reminder_at!)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Floating Actions (visible on hover) */}
                                <div className="absolute right-2 top-2 flex bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-neutral-100 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                                  <button onClick={() => openEditTask(task)} className="p-1.5 text-neutral-400 hover:text-[#476E66] transition-colors" title="Edit">
                                    <Flag className="w-3.5 h-3.5" />
                                  </button>
                                  {task.comment && (
                                    <button
                                      onClick={() => { setActiveTab('messages'); setSelectedProjectId(task.project_id); }}
                                      className="p-1.5 text-neutral-400 hover:text-[#476E66] transition-colors"
                                      title="Go to conversation"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <div className="w-[1px] bg-neutral-100 my-1" />
                                  <button onClick={() => handleRemoveTask(task.id)} className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors" title="Delete">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Completed tasks */}
                    {completedTasks.length > 0 && (
                      <div className="mt-8 pt-4 border-t border-dashed border-neutral-200">
                        <button
                          onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                          className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hover:text-neutral-600 transition-colors mb-3"
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${showCompletedTasks ? '' : '-rotate-90'}`} />
                          Completed ({completedTasks.length})
                        </button>

                        {showCompletedTasks && (
                          <div className="space-y-2 opacity-60">
                            {completedTasks.map(task => (
                              <div key={task.id} className="flex items-center gap-3 p-3 bg-neutral-50/50 rounded-lg border border-transparent hover:border-neutral-100 transition-all group">
                                <button onClick={() => handleToggleTaskComplete(task.id)} className="shrink-0 text-[#476E66]">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>

                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-neutral-500 line-through decoration-neutral-300">
                                    {renderContent(task.comment?.content || '', user?.id)}
                                  </div>
                                </div>

                                <button onClick={() => handleRemoveTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 text-neutral-300 hover:text-red-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            /* ─── END TO-DO LIST ─── */
          ) : (
            /* ─── PROJECT LIST (Messages Tab) ─── */
            <div>
              {filteredGroups.length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  {searchQuery || activeFilterCount > 0 ? (
                    <>
                      <p className="text-sm text-neutral-500">No results found</p>
                      <p className="text-xs text-neutral-400 mt-1">Try adjusting your search or filters</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-neutral-500">No communications yet</p>
                      <p className="text-xs text-neutral-400 mt-1">Comments on projects will appear here</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {/* Search results count */}
                  {(searchQuery || activeFilterCount > 0) && (
                    <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-100">
                      <p className="text-[10px] text-neutral-500">
                        {filteredGroups.length} project{filteredGroups.length !== 1 ? 's' : ''} &middot; {filteredGroups.reduce((sum, g) => sum + g.comments.length, 0)} messages
                      </p>
                    </div>
                  )}

                  {filteredGroups.map(group => {
                    const lastComment = group.comments[0];
                    const isMe = lastComment?.author_id === user?.id;
                    const isQuickReplying = activeQuickReplyId === group.projectId;

                    if (!lastComment) return null;

                    return (
                      <div key={group.projectId} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors group relative">
                        {/* Main clickable area */}
                        <div
                          className="px-4 py-4 cursor-pointer"
                          onClick={() => { setSelectedProjectId(group.projectId); setSearchQuery(''); }}
                        >
                          {/* Header: Sender & Time (Secondary) */}
                          <div className="flex justify-between items-center mb-1.5">
                            <div className="flex items-center gap-2">
                              {/* Avatar - Smaller */}
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 shadow-sm
                                ${isMe ? 'bg-neutral-100 text-neutral-400' : 'bg-[#476E66] text-white'}`}>
                                {getInitials(lastComment.author_name, lastComment.author_email)}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${isMe ? 'text-neutral-400' : 'text-neutral-700'}`}>
                                  {isMe ? 'You' : (lastComment.author_name || 'Unknown')}
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                  {timeAgo(lastComment.created_at || '')}
                                </span>
                                {pinnedCommentMap.has(lastComment.id) && (
                                  pinnedCommentMap.get(lastComment.id)!.is_completed ? (
                                    <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Done
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-0.5 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                                      <Bookmark className="w-2.5 h-2.5 fill-amber-500" /> To-Do
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Body: Message Content (Primary Focus) */}
                          <div className="pl-7 mb-2">
                            <div className={`text-sm font-medium leading-snug line-clamp-3 ${isMe ? 'text-neutral-500 font-normal' : 'text-neutral-900'}`}>
                              {renderContent(lastComment.content, user?.id)}
                            </div>

                            {/* Attachments preview */}
                            {lastComment.attachments && lastComment.attachments.length > 0 && (
                              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-neutral-500 bg-neutral-100/50 self-start inline-flex px-2 py-0.5 rounded border border-neutral-100">
                                <Paperclip className="w-3 h-3" />
                                <span>{lastComment.attachments.length} file{lastComment.attachments.length > 1 ? 's' : ''}</span>
                              </div>
                            )}
                          </div>

                          {/* Footer: Project */}
                          <div className="pl-7 flex items-center justify-between min-h-[20px]">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-[10px] text-neutral-500 font-medium bg-neutral-100 px-1.5 py-0.5 rounded truncate max-w-[220px] flex items-center gap-1">
                                {group.projectName} {group.projectNumber && ` #${group.projectNumber}`}
                              </span>
                            </div>

                            {/* Actions */}
                            {!isQuickReplying && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {pinnedCommentIds.has(lastComment.id) ? (
                                  pinnedCommentMap.get(lastComment.id)!.is_completed ? (
                                    <span className="text-[10px] text-emerald-600 font-medium px-2 py-1 flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Done
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUnpinTask(lastComment.id); }}
                                      className="text-[10px] text-[#476E66] font-medium px-2 py-1 rounded hover:bg-[#476E66]/5 flex items-center gap-1"
                                      title="Remove from To-Do"
                                    >
                                      <BookmarkCheck className="w-3.5 h-3.5" /> Pinned
                                    </button>
                                  )
                                ) : (
                                  <div className="flex items-center" onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleQuickPin(lastComment)}
                                      className="text-[10px] text-neutral-400 hover:text-amber-600 font-medium px-2 py-1 rounded hover:bg-amber-50 flex items-center gap-1"
                                      title="Quick pin as To-Do"
                                    >
                                      <Bookmark className="w-3.5 h-3.5" /> To-Do
                                    </button>
                                    <button
                                      onClick={() => openPinPopover(lastComment)}
                                      className="text-[10px] text-neutral-400 hover:text-amber-600 p-1 rounded hover:bg-amber-50"
                                      title="Pin with priority, due date & reminder"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveQuickReplyId(group.projectId);
                                    setQuickReplyText('');
                                  }}
                                  className="text-xs text-[#476E66] hover:text-[#3a5b54] font-medium px-2 py-1 rounded hover:bg-[#476E66]/5 flex items-center gap-1"
                                >
                                  <Reply className="w-3 h-3" /> Reply
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline Quick Reply */}
                        {isQuickReplying && (
                          <div className="px-4 pb-4 pl-7 animate-in slide-in-from-top-1 fade-in duration-200">
                            <div className="relative flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={quickReplyText}
                                onChange={(e) => setQuickReplyText(e.target.value)}
                                placeholder={`Reply to ${isMe ? 'yourself' : (lastComment.author_name?.split(' ')[0] || 'thread')}...`}
                                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg shadow-sm outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] pr-10"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleQuickReply(group.projectId);
                                  }
                                  if (e.key === 'Escape') {
                                    setActiveQuickReplyId(null);
                                  }
                                }}
                              />
                              <button
                                onClick={() => handleQuickReply(group.projectId)}
                                disabled={!quickReplyText.trim() || isSendingQuickReply}
                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-[#476E66] hover:bg-neutral-50 rounded"
                              >
                                {isSendingQuickReply ? <div className="w-3 h-3 border-2 border-[#476E66]/30 border-t-[#476E66] rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => setActiveQuickReplyId(null)}
                                className="text-neutral-400 hover:text-neutral-600 p-2 hover:bg-neutral-100 rounded-lg"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-[9px] text-neutral-400 mt-1 ml-1">Press Enter to send &middot; Esc to cancel</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* ─── COMPOSE BAR (inside project thread) ─── */}
        {selectedProjectId && (
          <div className="border-t border-neutral-200 px-4 py-3 bg-white shrink-0">
            {/* Pending files preview */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-neutral-100 rounded-lg px-2 py-1">
                    {f.type.startsWith('image/') ? <ImageIcon className="w-3 h-3 text-neutral-400" /> : <FileText className="w-3 h-3 text-neutral-400" />}
                    <span className="text-[10px] text-neutral-600 max-w-[120px] truncate">{f.name}</span>
                    <button onClick={() => removePendingFile(i)} className="text-neutral-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={composeTextareaRef}
                  value={newMessage}
                  onChange={e => {
                    setNewMessage(e.target.value);
                    handleMentionInput(e.target.value, e.target as HTMLTextAreaElement);
                  }}
                  placeholder="Type a message... (@ to mention someone)"
                  rows={1}
                  className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:ring-1 focus:ring-[#476E66]/30 focus:border-[#476E66] resize-none"
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                  onKeyDown={e => {
                    if (mentionQuery !== null && totalMentionItems > 0) {
                      handleMentionKeyDown(e);
                      if (['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key) || ((e.key === 'Enter' || e.key === 'Tab') && totalMentionItems > 0)) return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  onBlur={() => setTimeout(closeMention, 200)}
                  onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = '40px'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }}
                />

                {/* @mention dropdown */}
                {mentionQuery !== null && totalMentionItems > 0 && (
                  <div
                    ref={mentionDropdownRef}
                    className="absolute left-0 bottom-full mb-1 w-full max-w-sm bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-56 overflow-y-auto"
                  >
                    {filteredMentionUsers.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide flex items-center gap-1">
                          <UserCircle className="w-3 h-3" /> People
                        </div>
                        {filteredMentionUsers.map((u, i) => {
                          const isCollab = u.type === 'collaborator';
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); insertMentionItem({ id: u.id, name: u.name, kind: 'user' }); }}
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
                    {filteredMentionTasks.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide flex items-center gap-1">
                          <AtSign className="w-3 h-3" /> Tasks
                        </div>
                        {filteredMentionTasks.map((task, i) => {
                          const globalIdx = filteredMentionUsers.length + i;
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); insertMentionItem({ id: task.id, name: task.name, kind: 'task' }); }}
                              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${globalIdx === mentionIndex ? 'bg-[#476E66]/10 text-[#476E66]' : 'hover:bg-neutral-50 text-neutral-700'}`}
                            >
                              <ListTodo className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" />
                              <span className="truncate">{task.name}</span>
                              {task.status && (
                                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${task.status === 'completed' ? 'bg-green-100 text-green-600' :
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
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-neutral-400 hover:text-[#476E66] hover:bg-neutral-100 rounded-xl transition-colors" title="Attach file">
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSend()}
                disabled={(!newMessage.trim() && pendingFiles.length === 0) || isSubmitting}
                className="p-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3a5b54] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <button onClick={() => setVisibility(visibility === 'all' ? 'internal' : 'all')} className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-600">
                {visibility === 'internal' ? <><EyeOff className="w-3 h-3 text-amber-500" /> <span className="text-amber-600 font-medium">Internal note</span></> : <><Eye className="w-3 h-3" /> Visible to all</>}
              </button>
              <span className="text-[10px] text-neutral-300">Shift+Enter for new line &middot; @ to mention</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── PIN / EDIT TASK POPOVER ─── */}
      {(pinningComment || editingTaskId) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closePinPopover} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-neutral-100 w-[400px] max-w-[90vw] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">{editingTaskId ? 'Edit Task' : 'New Task'}</h3>
              <button onClick={closePinPopover} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {/* Message preview (Context) */}
            {pinningComment && (
              <div className="px-6 pb-4">
                <div className="relative pl-4 border-l-2 border-[#476E66] bg-neutral-50/50 py-2 rounded-r-lg">
                  <p className="text-sm text-neutral-600 line-clamp-2 italic">"{pinningComment.content}"</p>
                  <p className="text-[10px] text-neutral-400 mt-1 font-medium">— {pinningComment.author_name || 'Unknown'}</p>
                </div>
              </div>
            )}

            <div className="px-6 pb-6 space-y-5">
              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-neutral-700 mb-2 block">Priority Level</label>
                <div className="flex gap-2">
                  {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof PRIORITY_CONFIG[TaskPriority]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const isActive = pinPriority === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setPinPriority(key)}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border transition-all ${isActive
                          ? 'border-[#476E66] bg-[#476E66]/5 text-[#476E66] ring-1 ring-[#476E66]'
                          : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50'
                          }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#476E66]' : 'text-neutral-400'}`} />
                        <span className="text-[10px] font-medium">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Due Date */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" /> Due Date
                  </label>
                  <div className="relative group">
                    <input
                      type="date"
                      value={pinDueDate}
                      onChange={e => setPinDueDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-[#476E66]/10 focus:border-[#476E66] transition-all"
                    />
                    {pinDueDate && (
                      <button
                        onClick={() => setPinDueDate('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-red-50 text-neutral-400 hover:text-red-500 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Reminder */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 mb-2 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-neutral-400" /> Reminder
                  </label>
                  <div className="relative group">
                    <input
                      type="datetime-local"
                      value={pinReminder ? new Date(pinReminder).toISOString().slice(0, 16) : ''}
                      onChange={(e) => setPinReminder(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-[#476E66]/10 focus:border-[#476E66] transition-all"
                    />
                    {pinReminder && (
                      <button
                        onClick={() => setPinReminder('')}
                        className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-200 rounded transition-colors"
                      >
                        <X className="w-3 h-3 text-neutral-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Presets for Reminder */}
              {!pinReminder && (
                <div className="flex flex-wrap gap-2">
                  {REMINDER_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => setPinReminder(getReminderDate(preset.hours))}
                      className="px-3 py-1.5 text-[10px] font-medium bg-neutral-50 text-neutral-500 rounded-lg hover:bg-[#476E66] hover:text-white transition-colors"
                    >
                      +{preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
              <button
                onClick={closePinPopover}
                className="px-4 py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingTaskId ? handleSaveEdit : handleSavePin}
                className="px-6 py-2.5 text-sm font-bold text-white bg-[#476E66] rounded-xl hover:bg-[#3a5b54] shadow-md shadow-[#476E66]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {editingTaskId ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
