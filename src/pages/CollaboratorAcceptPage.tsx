import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseRest } from '../lib/supabase';
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
      navigate(`/quotes/${invite.parent_quote_id}/document`);
    }
  }, [user, invite, navigate]);

  async function loadInvitation() {
    if (!id) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    try {
      // Fetch the collaboration invitation with related data
      const { data: collab, error: collabError } = await supabaseRest.query<CollaborationInvite[]>(
        'proposal_collaborations',
        {
          select: '*',
          eq: { id: id }
        }
      );

      if (collabError || !collab || collab.length === 0) {
        setError('Invitation not found or has expired');
        setLoading(false);
        return;
      }

      const invitation = collab[0];

      // Fetch project name from quotes table
      const { data: quote } = await supabaseRest.query<{ project_name: string }[]>(
        'quotes',
        {
          select: 'project_name',
          eq: { id: invitation.parent_quote_id }
        }
      );

      // Fetch inviter info from profiles
      const { data: inviterProfile } = await supabaseRest.query<{ full_name: string }[]>(
        'profiles',
        {
          select: 'full_name',
          eq: { id: invitation.owner_user_id }
        }
      );

      // Fetch inviter company
      const { data: inviterCompany } = await supabaseRest.query<{ name: string }[]>(
        'companies',
        {
          select: 'name',
          eq: { id: invitation.owner_company_id }
        }
      );

      setInvite({
        ...invitation,
        project_name: quote?.[0]?.project_name || 'Untitled Project',
        inviter_name: inviterProfile?.[0]?.full_name || 'Unknown',
        inviter_company_name: inviterCompany?.[0]?.name || 'Unknown Company'
      });
    } catch (err) {
      console.error('Error loading invitation:', err);
      setError('Failed to load invitation details');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!invite) return;
    setActionLoading('accept');

    try {
      // Update status to 'accepted'
      const { error: updateError } = await supabaseRest.update(
        'proposal_collaborations',
        { status: 'accepted', accepted_at: new Date().toISOString() },
        { id: `eq.${invite.id}` }
      );

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
      const { error: updateError } = await supabaseRest.update(
        'proposal_collaborations',
        { status: 'rejected' },
        { id: `eq.${invite.id}` }
      );

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
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8faf9] to-[#e8f0ed] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Oops!</h1>
          <p className="text-neutral-600">{error}</p>
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
