import { useState, useEffect, useRef } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { ProjectComment, projectCommentsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface ProjectCommentsProps {
  projectId: string;
  companyId: string;
}

export function ProjectComments({ projectId, companyId }: ProjectCommentsProps) {
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

  useEffect(() => {
    loadComments();
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
      
      const comment = await projectCommentsApi.create({
        project_id: projectId,
        company_id: companyId,
        author_id: user.id,
        author_name: profile?.full_name || user.email,
        author_email: user.email || '',
        content: newComment.trim(),
        visibility
      });

      console.log('[ProjectComments] Comment created successfully:', comment);
      setComments(prev => [...prev, { ...comment, replies: [] }]);
      setNewComment('');
      setVisibility('all');
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
      const reply = await projectCommentsApi.create({
        project_id: projectId,
        company_id: companyId,
        author_id: user.id,
        author_name: profile?.full_name || user.email,
        author_email: user.email,
        content: replyContent.trim(),
        parent_id: parentId,
        visibility: 'all'
      });

      setComments(prev => prev.map(c =>
        c.id === parentId
          ? { ...c, replies: [...(c.replies || []), reply] }
          : c
      ));
      setReplyingTo(null);
      setReplyContent('');
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
            <textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a note or comment..."
              className="w-full bg-transparent border-0 border-b border-neutral-200 px-0 py-2 text-sm focus:ring-0 focus:border-[#476E66] placeholder:text-neutral-400 resize-none transition-colors"
              rows={1}
              style={{ minHeight: '2.5rem' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
            />

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
                  <div className="mt-1 text-sm text-neutral-600 leading-relaxed break-words">
                    {comment.content}
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
                    <div className="flex-1">
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a reply..."
                        className="w-full bg-neutral-50 border-0 rounded-lg p-2 text-sm focus:ring-1 focus:ring-[#476E66] resize-none"
                        rows={1}
                        autoFocus
                      />
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
                          <div className="text-sm text-neutral-600 pl-7">
                            {reply.content}
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
