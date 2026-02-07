import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Building2,
  Calendar,
  Check,
  X,
  Loader2,
  Users,
  ChevronRight,
  Plus,
  UserPlus
} from 'lucide-react';
import { ProjectCollaborator, projectCollaboratorsApi, Client, api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface PendingProjectInvitationsProps {
  onAccept?: () => void;
}

export function PendingProjectInvitations({ onAccept }: PendingProjectInvitationsProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [invitations, setInvitations] = useState<ProjectCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Client selection modal state
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<ProjectCollaborator | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (user?.email) {
      loadInvitations();
    }
  }, [user?.email]);

  const loadInvitations = async () => {
    if (!user?.email) return;

    try {
      setIsLoading(true);
      console.log('[PendingProjectInvitations] Loading invitations for:', user.email, user.id);
      const data = await projectCollaboratorsApi.getMyInvitations(user.email, user.id);
      console.log('[PendingProjectInvitations] Loaded invitations:', data);
      setInvitations(data);
    } catch (err) {
      console.error('[PendingProjectInvitations] Failed to load invitations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClients = async () => {
    if (!profile?.company_id) return;
    
    setLoadingClients(true);
    try {
      const data = await api.getClients(profile.company_id);
      setClients(data || []);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  const handleAcceptClick = async (invitation: ProjectCollaborator) => {
    // Show client selection modal
    setSelectedInvitation(invitation);
    setSelectedClientId('');
    setShowNewClientForm(false);
    setNewClientName('');
    setNewClientEmail('');
    setShowClientModal(true);
    await loadClients();
  };

  const handleConfirmAccept = async () => {
    if (!user || !profile?.company_id || !selectedInvitation) return;

    setIsAccepting(true);
    try {
      let clientId = selectedClientId;
      let clientName = '';

      // If creating a new client
      if (showNewClientForm && newClientName.trim()) {
        const newClient = await api.createClient({
          company_id: profile.company_id,
          name: newClientName.trim(),
          email: newClientEmail.trim() || undefined
        });
        clientId = newClient.id;
        clientName = newClient.name;
      } else if (selectedClientId) {
        const client = clients.find(c => c.id === selectedClientId);
        clientName = client?.display_name || client?.name || '';
      }

      // Accept the invitation with client info
      await projectCollaboratorsApi.accept(selectedInvitation.id, user.id, profile.company_id);
      
      // Update the collaborator with their client info
      if (clientId) {
        await projectCollaboratorsApi.setTheirClient(selectedInvitation.id, clientId, clientName);
      }

      setInvitations((prev) => prev.filter((i) => i.id !== selectedInvitation.id));
      setShowClientModal(false);
      setSelectedInvitation(null);
      onAccept?.();
      
      // Navigate to the project
      navigate(`/projects/${selectedInvitation.project_id}`);
    } catch (err) {
      console.error('Failed to accept invitation:', err);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async (invitation: ProjectCollaborator) => {
    if (!confirm('Are you sure you want to decline this invitation?')) return;

    setProcessingId(invitation.id);
    try {
      await projectCollaboratorsApi.decline(invitation.id);
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    } catch (err) {
      console.error('Failed to decline invitation:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return null; // Don't show loading state for this component
  }

  if (invitations.length === 0) {
    return null; // Don't render if no invitations
  }

  return (
    <div className="bg-gradient-to-r from-[#476E66]/5 to-[#476E66]/10 rounded-xl p-4 mb-6 border border-[#476E66]/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-[#476E66] flex items-center justify-center">
          <Mail className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">
            Project Invitations
          </h3>
          <p className="text-xs text-neutral-500">
            You have {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="bg-white rounded-lg p-3 border border-neutral-200 hover:border-[#476E66]/30 transition-all"
          >
            <div className="flex items-start gap-3">
              {/* Project Icon */}
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-neutral-400" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {(invitation.project as { name: string })?.name || 'Unnamed Project'}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  From: {(invitation.invited_by_company as { company_name: string })?.company_name || 'Unknown'}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(invitation.invited_at)}</span>
                  <span>•</span>
                  <span className="capitalize">{invitation.role}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {processingId === invitation.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                ) : (
                  <>
                    <button
                      onClick={() => handleDecline(invitation)}
                      className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors"
                      title="Decline"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleAcceptClick(invitation)}
                      className="p-2 rounded-lg bg-[#476E66] text-white hover:bg-[#3d5f58] transition-colors"
                      title="Accept"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {invitations.length > 3 && (
        <button
          onClick={() => navigate('/notifications?tab=project-invitations')}
          className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-[#476E66] hover:text-[#3d5f58] transition-colors"
        >
          View all invitations
          <ChevronRight className="w-3 h-3" />
        </button>
      )}

      {/* Client Selection Modal */}
      {showClientModal && selectedInvitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowClientModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#476E66]/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#476E66]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Accept Project</h2>
                  <p className="text-sm text-neutral-500 truncate max-w-[200px]">
                    {(selectedInvitation.project as { name: string })?.name || 'Project'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowClientModal(false)}
                className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
              >
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-sm text-neutral-600 mb-4">
                Select or create a client for this project. This helps you track the project in your own client list.
              </p>

              {/* Existing Clients */}
              {!showNewClientForm && (
                <>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Select from your clients
                  </label>
                  
                  {loadingClients ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                    </div>
                  ) : (
                    <div className="mb-4">
                      <select
                        value={selectedClientId}
                        onChange={(e) => setSelectedClientId(e.target.value)}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] appearance-none cursor-pointer"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: 'right 0.75rem center',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '1.5em 1.5em',
                          paddingRight: '2.5rem'
                        }}
                      >
                        <option value="">-- Select a client --</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.display_name || client.name}{client.email ? ` (${client.email})` : ''}
                          </option>
                        ))}
                      </select>
                      {clients.length === 0 && (
                        <p className="text-xs text-neutral-400 mt-2">No clients in your list yet</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 h-px bg-neutral-200" />
                    <span className="text-xs text-neutral-400">or</span>
                    <div className="flex-1 h-px bg-neutral-200" />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewClientForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-neutral-300 rounded-xl text-sm text-neutral-600 hover:bg-neutral-50 hover:border-[#476E66] transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    Create New Client
                  </button>
                </>
              )}

              {/* New Client Form */}
              {showNewClientForm && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Client Name *
                    </label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Enter client name"
                      className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                      autoFocus
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Client Email (optional)
                    </label>
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowNewClientForm(false);
                      setNewClientName('');
                      setNewClientEmail('');
                    }}
                    className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                  >
                    ← Back to client list
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-6 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowClientModal(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmAccept}
                  disabled={isAccepting || (showNewClientForm && !newClientName.trim())}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#476E66] text-white text-sm font-medium rounded-lg hover:bg-[#3d5f58] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Accept Project
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
