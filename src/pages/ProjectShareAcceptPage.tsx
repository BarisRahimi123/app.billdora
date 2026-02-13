import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Check,
  X,
  Loader2,
  Building2,
  Calendar,
  Users,
  AlertCircle,
  Eye,
  DollarSign,
  Clock,
  MessageSquare,
  Edit3,
  UserPlus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProjectCollaborator, projectCollaboratorsApi, Client, api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { sortClientsForDisplay } from '../lib/utils';

export default function ProjectShareAcceptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<ProjectCollaborator | null>(null);
  const [project, setProject] = useState<{
    id: string;
    name: string;
    description?: string;
    status: string;
    start_date?: string;
    end_date?: string;
    client?: { name: string; company_name?: string };
  } | null>(null);
  const [invitedByCompany, setInvitedByCompany] = useState<{ company_name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Client selection state
  const [showClientModal, setShowClientModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');

  useEffect(() => {
    if (id && user) {
      loadInvitation();
    }
  }, [id, user]);

  const loadInvitation = async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch invitation and project separately to avoid PostgREST 400 errors
      // from ambiguous FK joins (two FKs to companies) and cross-company RLS blocks.
      const { data, error: fetchError } = await supabase
        .from('project_collaborators')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Invitation not found');
        return;
      }

      if (data.status !== 'pending') {
        if (data.status === 'accepted') {
          setError('This invitation has already been accepted');
        } else if (data.status === 'declined') {
          setError('This invitation has been declined');
        }
        return;
      }

      setInvitation(data);

      // Fetch project details separately (RLS allows collaborators to see shared projects)
      if (data.project_id) {
        const { data: projData } = await supabase
          .from('projects')
          .select('id, name, description, status, start_date, end_date')
          .eq('id', data.project_id)
          .single();
        if (projData) setProject(projData);
      }

      // Fetch inviter company name separately (may fail due to cross-company RLS — that's ok)
      if (data.invited_by_company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', data.invited_by_company_id)
          .single();
        if (companyData) setInvitedByCompany(companyData);
      }
    } catch (err) {
      console.error('Failed to load invitation:', err);
      setError('Failed to load invitation. It may have expired or been removed.');
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

  const handleAcceptClick = async () => {
    // Show client selection modal
    setSelectedClientId('');
    setShowNewClientForm(false);
    setNewClientName('');
    setNewClientEmail('');
    setShowClientModal(true);
    await loadClients();
  };

  const handleConfirmAccept = async () => {
    if (!invitation || !user || !profile?.company_id) return;

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

      // Accept the invitation
      await projectCollaboratorsApi.accept(invitation.id, user.id, profile.company_id);
      
      // Update the collaborator with their client info
      if (clientId) {
        await projectCollaboratorsApi.setTheirClient(invitation.id, clientId, clientName);
      }

      setShowClientModal(false);
      navigate(`/projects/${invitation.project_id}`, {
        state: { toast: 'Project shared with you successfully!' }
      });
    } catch (err) {
      console.error('Failed to accept invitation:', err);
      setError('Failed to accept invitation. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!invitation) return;

    if (!confirm('Are you sure you want to decline this invitation?')) return;

    setIsDeclining(true);
    try {
      await projectCollaboratorsApi.decline(invitation.id);
      navigate('/projects', {
        state: { toast: 'Invitation declined' }
      });
    } catch (err) {
      console.error('Failed to decline invitation:', err);
      setError('Failed to decline invitation. Please try again.');
    } finally {
      setIsDeclining(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      completed: 'bg-blue-100 text-blue-700',
      on_hold: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-neutral-100 text-neutral-700';
  };

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#476E66] mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Not logged in — show login/signup prompt (must come before error check
  // because unauthenticated users can't load invitation data via RLS)
  if (!user && !authLoading) {
    const returnPath = encodeURIComponent(`/project-share/${id}`);
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#476E66]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-[#476E66]" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">
            Project Invitation
          </h1>
          <p className="text-neutral-500 mb-6">
            Please log in or create an account to accept this project invitation
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => navigate(`/login?return_to=${returnPath}`)}
              className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => navigate(`/login?signup=true&return_to=${returnPath}`)}
              className="px-6 py-2.5 bg-[#476E66] text-white rounded-xl text-sm font-medium hover:bg-[#3a5b54] transition-colors"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state (only shown for logged-in users)
  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">
            {error === 'Invitation not found' ? 'Invitation Not Found' : 'Something went wrong'}
          </h1>
          <p className="text-neutral-500 mb-6">{error}</p>
          <button
            onClick={() => navigate('/projects')}
            className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  // Main content
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#476E66]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-[#476E66]" />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
            Project Invitation
          </h1>
          <p className="text-neutral-500">
            You&apos;ve been invited to collaborate on a project
          </p>
        </div>

        {/* Invitation Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Invited By */}
          <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-100">
            <p className="text-xs text-neutral-500 mb-1">Invited by</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#476E66] flex items-center justify-center text-white text-sm font-semibold">
                {invitedByCompany?.company_name?.slice(0, 2).toUpperCase() || '??'}
              </div>
              <div>
                <p className="font-medium text-neutral-900">
                  {invitedByCompany?.company_name || 'Unknown Company'}
                </p>
                <p className="text-xs text-neutral-500">
                  {invitation?.invited_at
                    ? `Invited on ${formatDate(invitation.invited_at)}`
                    : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-neutral-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                  {project?.name || 'Unnamed Project'}
                </h2>
                {project?.client && (
                  <p className="text-sm text-neutral-500">
                    Client: {project.client.company_name || project.client.name}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${getStatusColor(project?.status || 'active')}`}
                  >
                    {project?.status?.replace('_', ' ') || 'Active'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {project?.description && (
              <div className="mb-6">
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">
                  Description
                </p>
                <p className="text-sm text-neutral-600">{project.description}</p>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">
                  Start Date
                </p>
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <Calendar className="w-4 h-4 text-neutral-400" />
                  {formatDate(project?.start_date)}
                </div>
              </div>
              <div>
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">
                  End Date
                </p>
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <Calendar className="w-4 h-4 text-neutral-400" />
                  {formatDate(project?.end_date)}
                </div>
              </div>
            </div>

            {/* Your Role & Permissions */}
            <div className="mb-6">
              <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">
                Your Role & Permissions
              </p>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3 py-1 bg-purple-50 text-purple-600 text-sm font-medium rounded-full capitalize">
                  {invitation?.role || 'Collaborator'}
                </span>
                {invitation?.relationship && (
                  <span className="px-3 py-1 bg-neutral-100 text-neutral-600 text-sm rounded-full capitalize">
                    {invitation.relationship.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {invitation?.can_comment && (
                  <PermissionBadge icon={<MessageSquare className="w-3 h-3" />} label="Comment" />
                )}
                {invitation?.can_view_financials && (
                  <PermissionBadge icon={<DollarSign className="w-3 h-3" />} label="View Financials" />
                )}
                {invitation?.can_view_time_entries && (
                  <PermissionBadge icon={<Clock className="w-3 h-3" />} label="View Time" />
                )}
                {invitation?.can_edit_tasks && (
                  <PermissionBadge icon={<Edit3 className="w-3 h-3" />} label="Edit Tasks" />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDecline}
                disabled={isDeclining || isAccepting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-neutral-200 text-neutral-700 rounded-xl text-sm font-medium hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                {isDeclining ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                Decline
              </button>
              <button
                onClick={handleAcceptClick}
                disabled={isAccepting || isDeclining}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#476E66] text-white rounded-xl text-sm font-medium hover:bg-[#3d5f58] transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                Accept Invitation
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 mt-6">
          By accepting, you agree to collaborate on this project with the inviting party.
        </p>
      </div>

      {/* Client Selection Modal */}
      {showClientModal && (
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
                  <h2 className="text-lg font-semibold text-neutral-900">Select Your Client</h2>
                  <p className="text-sm text-neutral-500 truncate max-w-[200px]">
                    {project?.name || 'Project'}
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
                        {sortClientsForDisplay(clients).map((client) => (
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

function PermissionBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-neutral-100 text-neutral-600 text-xs rounded-full">
      {icon}
      {label}
    </span>
  );
}
