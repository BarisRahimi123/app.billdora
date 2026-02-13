import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Check,
  X,
  Clock,
  MoreHorizontal,
  Trash2,
  Eye,
  EyeOff,
  DollarSign,
  MessageSquare,
  Edit3,
  Building2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Shield,
  ListTodo
} from 'lucide-react';
import { ProjectCollaborator, projectCollaboratorsApi, Client } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { ShareProjectModal } from './ShareProjectModal';

interface ProjectCollaboratorsProps {
  projectId: string;
  projectName: string;
  companyId: string;
  clients?: Client[];
}

export function ProjectCollaborators({
  projectId,
  projectName,
  companyId,
  clients = []
}: ProjectCollaboratorsProps) {
  const { user, profile } = useAuth();
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadCollaborators();
  }, [projectId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

  const loadCollaborators = async () => {
    try {
      setIsLoading(true);
      const data = await projectCollaboratorsApi.getByProject(projectId);
      setCollaborators(data);
    } catch (err) {
      console.error('Failed to load collaborators:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if current user is a collaborator (not the project owner)
  const currentUserEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();
  const currentUserId = user?.id;
  
  const currentUserCollab = collaborators.find(
    c => c.invited_email?.toLowerCase() === currentUserEmail || c.invited_user_id === currentUserId
  );
  const isCurrentUserCollaborator = !!currentUserCollab;
  
  // Determine if user can share: project owner OR collaborator with can_invite_others permission
  const isProjectOwner = profile?.company_id === companyId;
  const canShare = isProjectOwner || (isCurrentUserCollaborator && currentUserCollab?.can_invite_others);

  // Filter out the current user from the displayed list
  const displayedCollaborators = collaborators.filter(
    c => c.invited_email?.toLowerCase() !== currentUserEmail && c.invited_user_id !== currentUserId
  );

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [togglingPerm, setTogglingPerm] = useState<string | null>(null); // "collabId:key"

  const handleTogglePermission = async (collabId: string, key: keyof ProjectCollaborator, currentValue: boolean) => {
    const toggleKey = `${collabId}:${key}`;
    setTogglingPerm(toggleKey);
    try {
      await projectCollaboratorsApi.update(collabId, { [key]: !currentValue } as any);
      // Update local state immediately
      setCollaborators(prev => prev.map(c =>
        c.id === collabId ? { ...c, [key]: !currentValue } : c
      ));
    } catch (err) {
      console.error('Failed to update permission:', err);
      alert('Failed to update permission. Please try again.');
    } finally {
      setTogglingPerm(null);
    }
  };

  const handleResend = async (id: string) => {
    try {
      setResendingId(id);
      setOpenMenuId(null);
      await projectCollaboratorsApi.resendInvitation(id);
      alert('Invitation resent successfully.');
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      alert('Failed to resend invitation. Please try again.');
    } finally {
      setResendingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Are you sure you want to remove this collaborator?')) return;

    try {
      await projectCollaboratorsApi.remove(id);
      setCollaborators((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to remove collaborator:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-600 rounded-full">
            <Check className="w-3 h-3" />
            Active
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded-full">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-600 rounded-full">
            <X className="w-3 h-3" />
            Declined
          </span>
        );
      default:
        return null;
    }
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, string> = {
      client: 'bg-blue-50 text-blue-600',
      collaborator: 'bg-purple-50 text-purple-600',
      viewer: 'bg-neutral-100 text-neutral-600'
    };
    return (
      <span
        className={`px-2 py-0.5 text-[10px] font-medium rounded-full capitalize ${styles[role] || styles.viewer}`}
      >
        {role}
      </span>
    );
  };

  const getRelationshipLabel = (relationship?: string) => {
    const labels: Record<string, string> = {
      my_client: 'Client',
      subcontractor: 'Subcontractor',
      partner: 'Partner'
    };
    return relationship ? labels[relationship] || relationship : '';
  };

  const getInitials = (text: string) => {
    if (!text) return '??';
    // If it's an email, use the part before @
    if (text.includes('@')) {
      return text.split('@')[0].slice(0, 2).toUpperCase();
    }
    // Otherwise, use first letters of words
    return text.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const getDisplayName = (collab: ProjectCollaborator) => {
    // Priority: Company name > User name > Email
    if (collab.invited_company?.name) {
      return collab.invited_company.name;
    }
    if (collab.invited_user_name) {
      return collab.invited_user_name;
    }
    return collab.invited_email;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Permission definitions for clear display
  const permissionDefs = [
    { key: 'can_comment' as const, icon: MessageSquare, label: 'Comment', desc: 'Can post and reply to comments' },
    { key: 'can_view_financials' as const, icon: DollarSign, label: 'View Financials', desc: 'Can see invoices, quotes, and budgets' },
    { key: 'can_view_time_entries' as const, icon: Clock, label: 'View Time Entries', desc: 'Can see time logs and hours' },
    { key: 'can_edit_tasks' as const, icon: Edit3, label: 'Edit Tasks', desc: 'Can create, edit, and manage tasks' },
    { key: 'can_invite_others' as const, icon: UserPlus, label: 'Invite Others', desc: 'Can invite new collaborators' },
  ];

  const getPermissionCount = (collab: ProjectCollaborator) =>
    permissionDefs.filter(p => collab[p.key]).length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-neutral-400" />
          <h3 className="text-sm font-semibold text-neutral-900">Collaborators</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-neutral-400" />
            <h3 className="text-sm font-semibold text-neutral-900">
              Collaborators
              {displayedCollaborators.length > 0 && (
                <span className="ml-1.5 text-neutral-400 font-normal">
                  ({displayedCollaborators.length})
                </span>
              )}
            </h3>
          </div>

          {canShare && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Share
            </button>
          )}
        </div>

        {/* Collaborators List */}
        {displayedCollaborators.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-5 h-5 text-neutral-300" />
            </div>
            <p className="text-sm text-neutral-400">
              {isCurrentUserCollaborator && !canShare ? 'No other collaborators on this project' : 'No collaborators yet'}
            </p>
            {canShare && (
              <>
                <p className="text-xs text-neutral-300 mt-1">
                  Share this project with clients or partners
                </p>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3d5f58] transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Invite Collaborator
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {displayedCollaborators.map((collab) => {
              const displayName = getDisplayName(collab);
              const showEmailSeparately = displayName !== collab.invited_email;
              const isExpanded = expandedId === collab.id;
              const permCount = getPermissionCount(collab);

              return (
                <div key={collab.id} className="rounded-xl border border-neutral-100 overflow-hidden transition-all">
                  {/* Compact Row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : collab.id)}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                      collab.status === 'accepted'
                        ? 'bg-[#476E66]/10 text-[#476E66]'
                        : collab.status === 'pending'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-neutral-100 text-neutral-400'
                    }`}>
                      {getInitials(displayName)}
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-neutral-900 truncate">
                          {displayName}
                        </span>
                        {getStatusBadge(collab.status)}
                        {getRoleBadge(collab.role)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
                        {showEmailSeparately && (
                          <>
                            <span>{collab.invited_email}</span>
                            <span>·</span>
                          </>
                        )}
                        {collab.relationship && (
                          <>
                            <span>{getRelationshipLabel(collab.relationship)}</span>
                            <span>·</span>
                          </>
                        )}
                        <span className="inline-flex items-center gap-0.5">
                          <Shield className="w-2.5 h-2.5" />
                          {permCount} permission{permCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Actions + expand toggle */}
                    <div className="flex items-center gap-1">
                      {/* Context menu */}
                      {isProjectOwner && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === collab.id ? null : collab.id);
                            }}
                            className="p-1.5 rounded hover:bg-neutral-200 transition-colors"
                          >
                            <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                          </button>

                          {openMenuId === collab.id && (
                            <div
                              className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 min-w-[160px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {collab.status === 'pending' && (
                                <button
                                  onClick={() => handleResend(collab.id)}
                                  disabled={resendingId === collab.id}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 flex items-center gap-2 disabled:opacity-50"
                                >
                                  {resendingId === collab.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Mail className="w-3.5 h-3.5" />
                                  )}
                                  {resendingId === collab.id ? 'Sending...' : 'Resend Invitation'}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  handleRemove(collab.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expand/collapse chevron */}
                      <button className="p-1.5 rounded hover:bg-neutral-200 transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-neutral-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-4">
                      {/* Timeline row */}
                      <div className="flex items-center gap-4 text-[11px] text-neutral-500 mb-4">
                        <span>Invited {formatDate(collab.invited_at)}</span>
                        {collab.accepted_at && (
                          <>
                            <span className="text-neutral-300">→</span>
                            <span className="text-emerald-600 font-medium">Joined {formatDate(collab.accepted_at)}</span>
                          </>
                        )}
                      </div>

                      {/* Client mapping */}
                      {collab.their_client_name && (
                        <div className="flex items-center gap-2 mb-4 text-xs text-neutral-600">
                          <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Mapped to client: <strong>{collab.their_client_name}</strong></span>
                        </div>
                      )}

                      {/* Permissions grid — editable for project owner, read-only for others */}
                      <div className="mb-1">
                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                          Access & Permissions
                          {isProjectOwner && <span className="text-neutral-300 ml-1">· click to toggle</span>}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {permissionDefs.map(({ key, icon: Icon, label, desc }) => {
                            const granted = collab[key];
                            const isToggling = togglingPerm === `${collab.id}:${key}`;

                            return (
                              <button
                                key={key}
                                type="button"
                                disabled={!isProjectOwner || isToggling}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isProjectOwner) handleTogglePermission(collab.id, key, !!granted);
                                }}
                                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left w-full ${
                                  granted
                                    ? 'bg-white border-emerald-100'
                                    : 'bg-neutral-50 border-neutral-100 opacity-60'
                                } ${isProjectOwner ? 'cursor-pointer hover:shadow-sm hover:border-neutral-200' : 'cursor-default'} ${isToggling ? 'animate-pulse' : ''}`}
                              >
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                                    granted ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-400'
                                  }`}>
                                    {isToggling ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : granted ? (
                                      <Icon className="w-3.5 h-3.5" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-medium ${granted ? 'text-neutral-900' : 'text-neutral-400 line-through'}`}>
                                      {label}
                                    </p>
                                    <p className="text-[10px] text-neutral-400 leading-snug">{desc}</p>
                                  </div>
                                </div>
                                {/* Toggle switch visual */}
                                {isProjectOwner && (
                                  <div className={`w-8 h-4.5 rounded-full flex-shrink-0 relative mt-0.5 transition-colors ${
                                    granted ? 'bg-emerald-500' : 'bg-neutral-300'
                                  }`} style={{ minWidth: '2rem', height: '1.125rem' }}>
                                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                      granted ? 'translate-x-[calc(2rem-1.125rem)]' : 'translate-x-0.5'
                                    }`} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Share Modal */}
      <ShareProjectModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        projectId={projectId}
        projectName={projectName}
        clients={clients}
        onSuccess={loadCollaborators}
      />
    </>
  );
}
