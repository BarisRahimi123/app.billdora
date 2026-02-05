import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Building2, FileText, User } from 'lucide-react';

interface CollaborationInvite {
  id: string;
  collaborator_email: string;
  collaborator_name: string;
  collaborator_company_name: string;
  collaborator_user_id: string | null;
  message: string;
  status: string;
  parent_quote_id: string;
  owner_company_id: string;
  owner_user_id: string;
  // Joined data
  project_name?: string;
  inviter_name?: string;
  inviter_company_name?: string;
}

export default function CollaboratorAcceptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invite, setInvite] = useState<CollaborationInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<'accept' | 'reject' | null>(null);

  useEffect(() => {
    loadInvitation();
  }, [id]);

  // If user is already logged in and this invite belongs to them, redirect to proposal
  useEffect(() => {
    if (user && invite && invite.status === 'accepted') {
      navigate(`/quotes/${invite.parent_quote_id}/document?mode=view&collaboration_id=${invite.id}`);
    }
  }, [user, invite, navigate]);

  async function loadInvitation() {
    if (!id) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    console.log('[CollaboratorAccept] Loading invitation:', id);

    // Try multiple methods to load the invitation
    let inviteLoaded = false;

    // Method 1: Try edge function with retry (if deployed)
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries && !inviteLoaded; attempt++) {
      try {
        console.log(`[CollaboratorAccept] Trying edge function (attempt ${attempt}/${maxRetries})...`);
        const response = await supabase.functions.invoke('get-collaboration-invite', {
          body: { invitationId: id }
        });

        if (!response.error && response.data && !response.data.error) {
          const invitation = response.data;
          console.log('[CollaboratorAccept] Edge function success:', invitation);
          setInvite({
            id: invitation.id,
            collaborator_email: invitation.collaborator_email,
            collaborator_name: invitation.collaborator_name || '',
            collaborator_company_name: invitation.collaborator_company_name || '',
            collaborator_user_id: invitation.collaborator_user_id,
            message: invitation.message || '',
            status: invitation.status,
            parent_quote_id: invitation.parent_quote_id,
            owner_company_id: invitation.owner_company_id,
            owner_user_id: invitation.owner_user_id,
            project_name: invitation.project_name || 'Untitled Project',
            inviter_name: invitation.inviter_name || 'Unknown',
            inviter_company_name: invitation.inviter_company_name || 'Unknown Company'
          });
          inviteLoaded = true;
        } else {
          console.log('[CollaboratorAccept] Edge function failed:', response.error || response.data?.error);
          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, attempt * 500));
          }
        }
      } catch (err) {
        console.log(`[CollaboratorAccept] Edge function attempt ${attempt} error:`, err);
        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
      }
    }

    // Method 2: Try RPC function (if exists in database)
    if (!inviteLoaded) {
      try {
        console.log('[CollaboratorAccept] Trying RPC function...');
        const { data, error } = await supabase.rpc('get_collaboration_details', { lookup_id: id });
        
        if (!error && data && data.length > 0) {
          const invitation = data[0];
          console.log('[CollaboratorAccept] RPC success:', invitation);
          setInvite({
            id: invitation.id,
            collaborator_email: invitation.collaborator_email,
            collaborator_name: invitation.collaborator_name,
            collaborator_company_name: invitation.collaborator_company_name,
            collaborator_user_id: null,
            message: invitation.message,
            status: invitation.status,
            parent_quote_id: invitation.parent_quote_id,
            owner_company_id: invitation.owner_company_id,
            owner_user_id: invitation.owner_user_id,
            project_name: invitation.project_name || 'Untitled Project',
            inviter_name: invitation.inviter_name || 'Unknown',
            inviter_company_name: invitation.inviter_company_name || 'Unknown Company'
          });
          inviteLoaded = true;
        } else {
          console.log('[CollaboratorAccept] RPC failed:', error);
        }
      } catch (err) {
        console.log('[CollaboratorAccept] RPC not available:', err);
      }
    }

    // Method 3: Try direct fetch (works if user is authenticated)
    if (!inviteLoaded) {
      try {
        console.log('[CollaboratorAccept] Trying direct fetch...');
        const { data: directData, error: directError } = await supabase
          .from('proposal_collaborations')
          .select(`
            *,
            parent_quote:quotes(title),
            owner_profile:profiles(full_name, company_id),
            owner_company:companies(name)
          `)
          .eq('id', id)
          .single();

        if (!directError && directData) {
          console.log('[CollaboratorAccept] Direct fetch success:', directData);
          setInvite({
            id: directData.id,
            collaborator_email: directData.collaborator_email,
            collaborator_name: directData.collaborator_name || '',
            collaborator_company_name: directData.collaborator_company_name || '',
            collaborator_user_id: directData.collaborator_user_id,
            message: directData.message || '',
            status: directData.status,
            parent_quote_id: directData.parent_quote_id,
            owner_company_id: directData.owner_company_id,
            owner_user_id: directData.owner_user_id,
            project_name: (directData.parent_quote as any)?.title || 'Untitled Project',
            inviter_name: (directData.owner_profile as any)?.full_name || 'Unknown',
            inviter_company_name: (directData.owner_company as any)?.name || 'Unknown Company'
          });
          inviteLoaded = true;
        } else {
          console.log('[CollaboratorAccept] Direct fetch failed:', directError);
        }
      } catch (err) {
        console.log('[CollaboratorAccept] Direct fetch error:', err);
      }
    }

    // If nothing worked, show error
    if (!inviteLoaded) {
      console.error('[CollaboratorAccept] All methods failed for invitation:', id);
      setError('Unable to load invitation. This may be because you need to log in first, or the invitation link is invalid.');
    }

    setLoading(false);
  }

  async function handleAccept() {
    if (!invite) return;
    setActionLoading('accept');

    try {
      // Update status to 'accepted'
      const { error: updateError } = await supabase
        .from('proposal_collaborations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      if (updateError) throw updateError;

      // Redirect to signup with pre-filled data
      const params = new URLSearchParams({
        signup: 'true',
        email: invite.collaborator_email,
        name: invite.collaborator_name || '',
        company: invite.collaborator_company_name || '',
        collaborator: 'true',
        collaboration_id: invite.id
      });

      navigate(`/login?${params.toString()}`);
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError('Failed to accept invitation. Please try again.');
      setActionLoading(null);
    }
  }

  async function handleReject() {
    if (!invite) return;
    setActionLoading('reject');

    try {
      // Update status to 'rejected'
      const { error: updateError } = await supabase
        .from('proposal_collaborations')
        .update({ status: 'rejected' })
        .eq('id', invite.id);

      if (updateError) throw updateError;

      // Show rejection confirmation
      setInvite({ ...invite, status: 'rejected' });
    } catch (err) {
      console.error('Error rejecting invitation:', err);
      setError('Failed to reject invitation. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8faf9] to-[#e8f0ed] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#476E66] animate-spin" />
      </div>
    );
  }

  if (error) {
    // Check if user is not logged in - offer to redirect to login
    const isAuthError = error.includes('log in') || error.includes('Unable to load');
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8faf9] to-[#e8f0ed] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Oops!</h1>
          <p className="text-neutral-600 mb-4">{error}</p>
          
          {/* Always show retry button */}
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              loadInvitation();
            }}
            className="mb-4 px-6 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3a5a54] transition-colors"
          >
            Try Again
          </button>
          
          {isAuthError && id && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm text-neutral-500">
                If you have an account, please log in to view this invitation.
              </p>
              <button
                onClick={() => {
                  const params = new URLSearchParams({
                    collaborator: 'true',
                    collaboration_id: id,
                    return_to: `/collaborate/${id}`
                  });
                  navigate(`/login?${params.toString()}`);
                }}
                className="px-6 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Log In to View
              </button>
              <p className="text-xs text-neutral-400">
                New user? Click "Accept & Continue" after logging in to create your account.
              </p>
            </div>
          )}
          
          {!isAuthError && (
            <button
              onClick={() => navigate('/login')}
              className="mt-4 px-6 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Go to Login
            </button>
          )}
        </div>
      </div>
    );
  }

  if (invite?.status === 'rejected') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8faf9] to-[#e8f0ed] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <XCircle className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Invitation Declined</h1>
          <p className="text-neutral-600">You have declined the collaboration invitation.</p>
        </div>
      </div>
    );
  }

  // If status is "accepted" but user hasn't completed signup, redirect to complete it
  if (invite?.status === 'accepted' && !invite.collaborator_user_id) {
    const params = new URLSearchParams({
      signup: 'true',
      email: invite.collaborator_email,
      name: invite.collaborator_name || '',
      company: invite.collaborator_company_name || '',
      collaborator: 'true',
      collaboration_id: invite.id
    });
    navigate(`/login?${params.toString()}`);
    return null;
  }

  if (invite?.status !== 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8faf9] to-[#e8f0ed] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-[#476E66] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Already Responded</h1>
          <p className="text-neutral-600 mb-4">You have already responded to this invitation.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3a5a54]"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8faf9] to-[#e8f0ed] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#476E66]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-[#476E66]" />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
            Collaboration Invitation
          </h1>
          <p className="text-neutral-600">
            You've been invited to collaborate on a proposal
          </p>
        </div>

        {/* Invitation Details */}
        <div className="bg-neutral-50 rounded-xl p-6 mb-6 space-y-4">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-[#476E66] mt-0.5" />
            <div>
              <p className="text-sm text-neutral-500">From</p>
              <p className="font-medium text-neutral-900">{invite?.inviter_company_name}</p>
              <p className="text-sm text-neutral-600">{invite?.inviter_name}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-[#476E66] mt-0.5" />
            <div>
              <p className="text-sm text-neutral-500">Project</p>
              <p className="font-medium text-neutral-900">{invite?.project_name}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-[#476E66] mt-0.5" />
            <div>
              <p className="text-sm text-neutral-500">Your Company</p>
              <p className="font-medium text-neutral-900">{invite?.collaborator_company_name || 'Not specified'}</p>
            </div>
          </div>

          {invite?.message && (
            <div className="pt-3 border-t border-neutral-200">
              <p className="text-sm text-neutral-500 mb-1">Message</p>
              <p className="text-neutral-700 italic">"{invite.message}"</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleReject}
            disabled={!!actionLoading}
            className="flex-1 py-3 px-4 border border-neutral-300 text-neutral-700 rounded-xl font-medium hover:bg-neutral-50 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {actionLoading === 'reject' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                Decline
              </>
            )}
          </button>
          <button
            onClick={handleAccept}
            disabled={!!actionLoading}
            className="flex-1 py-3 px-4 bg-[#476E66] text-white rounded-xl font-medium hover:bg-[#3a5a54] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {actionLoading === 'accept' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Accept & Continue
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-neutral-500 text-center mt-4">
          By accepting, you'll create an account to collaborate on this proposal.
        </p>
      </motion.div>
    </div>
  );
}
