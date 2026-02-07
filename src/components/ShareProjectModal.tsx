import { useState } from 'react';
import {
  X,
  Send,
  Users,
  Edit3,
  DollarSign,
  Clock,
  MessageSquare,
  UserPlus,
  Loader2,
  Check,
  ChevronDown,
  Building2
} from 'lucide-react';
import { projectCollaboratorsApi, Client } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  clients?: Client[];
  onSuccess?: () => void;
}

type Role = 'client' | 'collaborator' | 'viewer';
type Relationship = 'my_client' | 'subcontractor' | 'partner';

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'collaborator', label: 'Collaborator', description: 'Can view project and comment' },
  { value: 'client', label: 'Client', description: 'Your client for this project' },
  { value: 'viewer', label: 'Viewer', description: 'View-only access' }
];

const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'my_client', label: 'My Client' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'partner', label: 'Partner' }
];

export function ShareProjectModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  clients = [],
  onSuccess
}: ShareProjectModalProps) {
  const { user, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [role, setRole] = useState<Role>('collaborator');
  const [relationship, setRelationship] = useState<Relationship>('partner');
  const [permissions, setPermissions] = useState({
    can_view_financials: false,
    can_view_time_entries: false,
    can_comment: true,
    can_invite_others: false,
    can_edit_tasks: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Filter clients that have email addresses
  const clientsWithEmail = clients.filter(c => c.email);

  const handleSelectClient = (client: Client) => {
    setSelectedClientId(client.id);
    setEmail(client.email || '');
    setShowClientDropdown(false);
    // Auto-set relationship to 'my_client' when selecting from client list
    setRelationship('my_client');
    setRole('client');
  };

  const clearClientSelection = () => {
    setSelectedClientId('');
    setEmail('');
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !user || !profile?.company_id) return;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    // Don't allow inviting yourself
    if (email.trim().toLowerCase() === user.email?.toLowerCase()) {
      setError('You cannot invite yourself');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await projectCollaboratorsApi.invite({
        project_id: projectId,
        invited_email: email.trim().toLowerCase(),
        invited_by_user_id: user.id,
        invited_by_company_id: profile.company_id,
        role,
        relationship,
        ...permissions
      });

      setSuccess(true);
      setTimeout(() => {
        setEmail('');
        setSelectedClientId('');
        setRole('collaborator');
        setRelationship('partner');
        setPermissions({
          can_view_financials: false,
          can_view_time_entries: false,
          can_comment: true,
          can_invite_others: false,
          can_edit_tasks: false
        });
        setSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to send invitation:', err);
      if (err instanceof Error && err.message?.includes('duplicate')) {
        setError('This person has already been invited to this project');
      } else {
        setError('Failed to send invitation. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePermission = (key: keyof typeof permissions) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#476E66]/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#476E66]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Share Project</h2>
              <p className="text-sm text-neutral-500 truncate max-w-[200px]">{projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Success State */}
          {success && (
            <div className="mb-6 p-4 bg-emerald-50 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-800">Invitation sent!</p>
                <p className="text-xs text-emerald-600">{email} will receive an email notification</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Email Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Invite by email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSelectedClientId(''); // Clear client selection if typing manually
              }}
              placeholder="colleague@company.com"
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
              required
            />
          </div>

          {/* Client Dropdown */}
          {clientsWithEmail.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Or select from your clients
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowClientDropdown(!showClientDropdown)}
                  className="w-full flex items-center justify-between px-4 py-3 border border-neutral-200 rounded-xl text-sm bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-neutral-400" />
                    {selectedClientId ? (
                      <span className="text-neutral-900">
                        {clients.find(c => c.id === selectedClientId)?.display_name ||
                          clients.find(c => c.id === selectedClientId)?.name}
                      </span>
                    ) : (
                      <span className="text-neutral-400">Select a client...</span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${showClientDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showClientDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowClientDropdown(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-lg z-20 max-h-48 overflow-y-auto">
                      {selectedClientId && (
                        <button
                          type="button"
                          onClick={clearClientSelection}
                          className="w-full px-4 py-2.5 text-left text-sm text-neutral-500 hover:bg-neutral-50 border-b border-neutral-100"
                        >
                          Clear selection
                        </button>
                      )}
                      {clientsWithEmail.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectClient(client)}
                          className={`w-full px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors ${selectedClientId === client.id ? 'bg-[#476E66]/5' : ''
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-medium text-neutral-600">
                              {(client.display_name || client.name || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-900 truncate">
                                {client.display_name || client.name}
                              </p>
                              <p className="text-xs text-neutral-500 truncate">
                                {client.email}
                              </p>
                            </div>
                            {selectedClientId === client.id && (
                              <Check className="w-4 h-4 text-[#476E66]" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${role === r.value
                      ? 'bg-[#476E66] text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-400 mt-1">
              {ROLES.find((r) => r.value === role)?.description}
            </p>
          </div>

          {/* Relationship */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Relationship
            </label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as Relationship)}
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
            >
              {RELATIONSHIPS.map((rel) => (
                <option key={rel.value} value={rel.value}>
                  {rel.label}
                </option>
              ))}
            </select>
          </div>

          {/* Permissions */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              Permissions
            </label>
            <div className="space-y-2">
              <PermissionToggle
                icon={<MessageSquare className="w-4 h-4" />}
                label="Comment"
                description="Can post comments"
                checked={permissions.can_comment}
                onChange={() => togglePermission('can_comment')}
              />
              <PermissionToggle
                icon={<DollarSign className="w-4 h-4" />}
                label="View Financials"
                description="Can see budget and invoices"
                checked={permissions.can_view_financials}
                onChange={() => togglePermission('can_view_financials')}
              />
              <PermissionToggle
                icon={<Clock className="w-4 h-4" />}
                label="View Time Entries"
                description="Can see logged hours"
                checked={permissions.can_view_time_entries}
                onChange={() => togglePermission('can_view_time_entries')}
              />
              <PermissionToggle
                icon={<Edit3 className="w-4 h-4" />}
                label="Edit Tasks"
                description="Can modify tasks"
                checked={permissions.can_edit_tasks}
                onChange={() => togglePermission('can_edit_tasks')}
              />
              <PermissionToggle
                icon={<UserPlus className="w-4 h-4" />}
                label="Invite Others"
                description="Can share with more people"
                checked={permissions.can_invite_others}
                onChange={() => togglePermission('can_invite_others')}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || success}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : success ? (
              <>
                <Check className="w-4 h-4" />
                Sent!
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Invitation
              </>
            )}
          </button>

          <p className="text-[10px] text-neutral-400 text-center mt-3">
            They&apos;ll receive an email invitation to view this project
          </p>
        </form>
      </div>
    </div>
  );
}

function PermissionToggle({
  icon,
  label,
  description,
  checked,
  onChange
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${checked
          ? 'border-[#476E66] bg-[#476E66]/5'
          : 'border-neutral-200 hover:bg-neutral-50'
        }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${checked ? 'bg-[#476E66] text-white' : 'bg-neutral-100 text-neutral-400'
          }`}
      >
        {icon}
      </div>
      <div className="flex-1 text-left">
        <p className={`text-sm font-medium ${checked ? 'text-[#476E66]' : 'text-neutral-700'}`}>
          {label}
        </p>
        <p className="text-[10px] text-neutral-400">{description}</p>
      </div>
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-[#476E66] bg-[#476E66]' : 'border-neutral-300'
          }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  );
}
