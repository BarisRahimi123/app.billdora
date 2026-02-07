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
  DollarSign,
  MessageSquare,
  Edit3,
  Building2,
  Loader2
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
  
  const isCurrentUserCollaborator = collaborators.some(
    c => c.invited_email?.toLowerCase() === currentUserEmail || c.invited_user_id === currentUserId
  );

  // Filter out the current user from the displayed list
  const displayedCollaborators = collaborators.filter(
    c => c.invited_email?.toLowerCase() !== currentUserEmail && c.invited_user_id !== currentUserId
  );

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

          {/* Only show Share button if current user is the project owner (not a collaborator) */}
          {!isCurrentUserCollaborator && (
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
              {isCurrentUserCollaborator ? 'No other collaborators on this project' : 'No collaborators yet'}
            </p>
            {!isCurrentUserCollaborator && (
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
          <div className="space-y-3">
            {displayedCollaborators.map((collab) => {
              const displayName = getDisplayName(collab);
              const showEmailSeparately = displayName !== collab.invited_email;
              
              return (
              <div
                key={collab.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#476E66]/10 flex items-center justify-center text-xs font-semibold text-[#476E66] flex-shrink-0">
                  {getInitials(displayName)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-neutral-900 truncate">
                      {displayName}
                    </span>
                    {getStatusBadge(collab.status)}
                    {getRoleBadge(collab.role)}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400">
                    {showEmailSeparately && (
                      <>
                        <span>{collab.invited_email}</span>
                        <span>•</span>
                      </>
                    )}
                    {collab.relationship && (
                      <>
                        <span>{getRelationshipLabel(collab.relationship)}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>Invited {formatDate(collab.invited_at)}</span>
                    {collab.accepted_at && (
                      <>
                        <span>•</span>
                        <span>Joined {formatDate(collab.accepted_at)}</span>
                      </>
                    )}
                  </div>
                  {/* Permissions */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {collab.can_comment && (
                      <span
                        className="p-1 bg-white rounded border border-neutral-200"
                        title="Can comment"
                      >
                        <MessageSquare className="w-3 h-3 text-neutral-400" />
                      </span>
                    )}
                    {collab.can_view_financials && (
                      <span
                        className="p-1 bg-white rounded border border-neutral-200"
                        title="Can view financials"
                      >
                        <DollarSign className="w-3 h-3 text-neutral-400" />
                      </span>
                    )}
                    {collab.can_view_time_entries && (
                      <span
                        className="p-1 bg-white rounded border border-neutral-200"
                        title="Can view time entries"
                      >
                        <Clock className="w-3 h-3 text-neutral-400" />
                      </span>
                    )}
                    {collab.can_edit_tasks && (
                      <span
                        className="p-1 bg-white rounded border border-neutral-200"
                        title="Can edit tasks"
                      >
                        <Edit3 className="w-3 h-3 text-neutral-400" />
                      </span>
                    )}
                    {collab.their_client_name && (
                      <span
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-white rounded border border-neutral-200 text-[9px] text-neutral-500"
                        title="Their client for this project"
                      >
                        <Building2 className="w-3 h-3" />
                        {collab.their_client_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Menu */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === collab.id ? null : collab.id);
                    }}
                    className="p-1.5 rounded hover:bg-white transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                  </button>

                  {openMenuId === collab.id && (
                    <div
                      className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 min-w-[140px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {collab.status === 'pending' && (
                        <button
                          onClick={() => {
                            // TODO: Resend invitation
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 flex items-center gap-2"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Resend Invitation
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
              </div>
            )})}
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
