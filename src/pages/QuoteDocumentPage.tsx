import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Send, Upload, Plus, Trash2, Check, Save, X, Package, UserPlus, Settings, Eye, EyeOff, Image, Users, FileText, Calendar, ClipboardList, ChevronRight, Bookmark, Info, Bell, Lock, FileSignature, Timer, Layout, Link, ArrowRight, User, CheckCircle2, Loader2, Heading1, Heading2, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, Quote, Client, ClientContact, QuoteLineItem, CompanySettings, Service, Lead, leadsApi, ProposalTemplate, collaboratorCategoryApi, CollaboratorCategory, collaborationApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { NotificationService } from '../lib/notificationService';
import SaveAsTemplateModal from '../components/SaveAsTemplateModal';
import TemplatePickerModal from '../components/TemplatePickerModal';
import { useToast } from '../components/Toast';
import SimpleEditor, { SimpleMarkdownRenderer, FONT_OPTIONS } from '../components/SimpleEditor';

// Timeline View Component
const TimelineView = ({ items, computedOffsets }: { items: LineItem[], computedOffsets: Map<string, number> }) => {
  const validItems = items.filter(item => item.description.trim());
  if (validItems.length === 0) return null;

  const minStart = Math.min(...validItems.map(item => computedOffsets.get(item.id) || 0));
  const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimatedDays));
  const timelineRange = maxEnd - minStart;
  const totalDays = maxEnd || 1;

  return (
    <div className="w-full">
      <h3 className="text-lg font-bold text-neutral-900 mb-8 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>Estimated Timeline</h3>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-neutral-400 font-medium mb-6 px-1">
          <span>Project Schedule</span>
          <div className="flex gap-16">
            <span>Start (Day 1)</span>
            <span>Completion (Day {totalDays})</span>
          </div>
        </div>

        {/* List of Tasks */}
        <div className="space-y-6">
          {[...validItems]
            .sort((a, b) => (computedOffsets.get(a.id) || 0) - (computedOffsets.get(b.id) || 0))
            .map((item, idx) => {
              const startDay = computedOffsets.get(item.id) || 0;
              const widthPercent = (item.estimatedDays / totalDays) * 100;
              const leftPercent = (startDay / totalDays) * 100;

              return (
                <div key={item.id} className="relative group">
                  {/* Background Line */}
                  <div className="absolute top-[50%] left-0 right-0 h-px bg-neutral-100/80 -translate-y-1/2 z-0"></div>

                  {/* Content Row */}
                  <div className="relative z-10 flex items-center justify-between w-full h-12">

                    {/* Task Description */}
                    <div className="font-medium text-neutral-900 text-sm bg-white pr-4 max-w-[40%] truncate relative z-20" title={item.description} style={{ fontFamily: 'Inter, sans-serif' }}>
                      {item.description}
                    </div>

                    {/* Timeline Interaction Area - Simplified visual */}
                    <div className="absolute inset-0 left-[40%] right-16 flex items-center">
                      {/* Actual Gantt Bar */}
                      <div
                        className="h-7 bg-neutral-100 rounded-sm relative group-hover:bg-neutral-200 transition-colors"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${Math.max(widthPercent, 1)}%`, // Ensure at least 1% visible
                          position: 'absolute'
                        }}
                      >
                        {/* Optional: subtle strip for 'start' indication if needed */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-neutral-300/50 rounded-l-sm"></div>
                      </div>
                    </div>

                    {/* Duration Label */}
                    <div className="text-right text-xs font-semibold text-neutral-900 bg-white pl-4 whitespace-nowrap z-20 w-16" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {item.estimatedDays} Days
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Total Duration Footer */}
        <div className="mt-10 flex justify-end border-t border-neutral-100 pt-6">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-1">Total Project Duration</p>
            <p className="text-xl font-bold text-neutral-900" style={{ fontFamily: 'Inter, sans-serif' }}>{totalDays} Days</p>
          </div>
        </div>
      </div>
    </div>
  );
};
// SIMPLE FIELD HINT STYLES
interface LineItem {
  id: string;
  description: string;
  unitPrice: number;
  qty: number;
  unit: string;
  taxed: boolean;
  estimatedDays: number;
  startOffset: number;
  dependsOn: string; // '' = starts day 1, 'item-id' = starts after that item
  startType: 'parallel' | 'sequential' | 'overlap'; // parallel=day 1, sequential=after dep ends, overlap=custom offset from dep start
  overlapDays: number; // for 'overlap' type: start N days after dependency starts
}

// Generate quote number in format: YYMMDD-XXX (e.g., 250102-001)
function generateQuoteNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${yy}${mm}${dd}-${seq}`;
}

export default function QuoteDocumentPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const isNewQuote = quoteId === 'new';

  // Lead info from URL params (when creating proposal from lead)
  const leadId = searchParams.get('lead_id');
  const clientIdParam = searchParams.get('client_id'); // Support pre-selecting client
  const leadName = searchParams.get('lead_name') || '';
  const leadEmail = searchParams.get('lead_email') || '';
  const leadCompany = searchParams.get('lead_company') || '';
  const templateId = searchParams.get('template_id');
  const showTemplatesParam = searchParams.get('show_templates') === 'true';

  // Collaboration params (when creating response to collaboration request)
  const collaborationId = searchParams.get('collaboration_id');
  const parentQuoteId = searchParams.get('parent_quote_id');
  const projectTitleParam = searchParams.get('project_title') || '';

  // Merge params (when reviewing and merging collaborator's response)
  const mergeCollaborationId = searchParams.get('merge_collaboration_id');

  // Step param (to open at specific step, e.g., step=5 for preview)
  const stepParam = searchParams.get('step');
  const ownerSigningMode = searchParams.get('owner_signing') === 'true';

  // View-only mode (for viewing signed proposals without edit functionality)
  const isViewOnly = searchParams.get('mode') === 'view';

  // Collaboration view mode (shows collaboration status panel with preview)
  const isCollaborationView = searchParams.get('view') === 'collaboration';

  const [quote, setQuote] = useState<Quote | null>(null);

  // Lock editing when proposal is sent or approved, or in owner signing mode, or in view-only mode
  const isLocked = quote?.status === 'sent' || quote?.status === 'approved' || quote?.status === 'accepted' || ownerSigningMode || isViewOnly;

  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [recipientType, setRecipientType] = useState<'client' | 'lead' | null>(null);
  // Client contacts for recipient selection
  const [clientContacts, setClientContacts] = useState<ClientContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>(''); // '' = use primary contact
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTemplatePickerModal, setShowTemplatePickerModal] = useState(false);

  // Editable fields
  const [documentTitle, setDocumentTitle] = useState('New Quote');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  });
  const [volumeNumber, setVolumeNumber] = useState('Proposal');
  const [coverBgUrl, setCoverBgUrl] = useState('https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80');

  // Retainer settings
  const [retainerEnabled, setRetainerEnabled] = useState(false);
  const [retainerType, setRetainerType] = useState<'percentage' | 'fixed'>('percentage');
  const [retainerPercentage, setRetainerPercentage] = useState(25);
  const [retainerAmount, setRetainerAmount] = useState(0);

  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const companyInfo = {
    name: companySettings?.company_name || 'Your Company',
    address: companySettings?.address || '',
    city: companySettings?.city || '',
    state: companySettings?.state || '',
    zip: companySettings?.zip || '',
    website: companySettings?.website || '',
    phone: companySettings?.phone || '',
    fax: companySettings?.fax || '',
    logo: companySettings?.logo_url,
  };

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', unitPrice: 0, qty: 1, unit: 'each', taxed: false, estimatedDays: 1, startOffset: 0, dependsOn: '', startType: 'parallel', overlapDays: 0 }
  ]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [scopeOfWork, setScopeOfWork] = useState('');
  // scopeTextareaRef and insertFormat removed - handled by SimpleEditor

  const [taxRate, setTaxRate] = useState(8.25);
  const [otherCharges, setOtherCharges] = useState(0);
  const [terms, setTerms] = useState(`1. Customer will be invoiced upon acceptance of this quote.
2. Payment is due within 30 days of invoice date.
3. This quote is valid for the period specified above.
4. Any changes to scope may result in price adjustments.
5. Please sign and return this quote to proceed with the project.`);

  const [signatureName, setSignatureName] = useState('');
  const [revisionComments, setRevisionComments] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [showInviteConfigModal, setShowInviteConfigModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  // Merge mode state
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [collaboratorQuote, setCollaboratorQuote] = useState<Quote | null>(null);
  const [collaboratorLineItems, setCollaboratorLineItems] = useState<LineItem[]>([]);

  // Collaboration response mode - parent quote info for dependency selection
  const [parentQuoteLineItems, setParentQuoteLineItems] = useState<LineItem[]>([]);
  const [parentSharePricing, setParentSharePricing] = useState(false);
  const [isCollaborationResponse, setIsCollaborationResponse] = useState(false);
  const [collaboratorInfo, setCollaboratorInfo] = useState<{ name: string; email: string; company: string } | null>(null);
  const [showCollaboratorInfo, setShowCollaboratorInfo] = useState(true);
  const [paymentMode, setPaymentMode] = useState<'direct' | 'through_owner'>('through_owner');
  const [mergeCollaboration, setMergeCollaboration] = useState<any>(null);
  const [selectedCollabItems, setSelectedCollabItems] = useState<Set<string>>(new Set());

  // Debug: Log merge panel visibility conditions
  useEffect(() => {
    console.log('[MergePanel Debug] isMergeMode:', isMergeMode, 'showMergePanel:', showMergePanel, 'collaboratorLineItems:', collaboratorLineItems.length, 'collaboratorQuote:', collaboratorQuote?.id || 'none', 'mergeCollaboration:', mergeCollaboration?.id || 'none');
    if (collaboratorLineItems.length > 0) {
      console.log('[MergePanel Debug] First item:', collaboratorLineItems[0]);
    }
  }, [isMergeMode, showMergePanel, collaboratorLineItems, collaboratorQuote, mergeCollaboration]);

  const [services, setServices] = useState<Service[]>([]);
  const [showServicesModal, setShowServicesModal] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Section visibility toggles
  const [showSections, setShowSections] = useState({
    cover: true,
    letter: true,
    scopeOfWork: true,
    quoteDetails: true,
    timeline: true,
    terms: true,
    additionalOfferings: true,
  });
  const [showSectionSettings, setShowSectionSettings] = useState(false);

  // 5-Stage Wizard Navigation (with Collaborators step)
  type WizardStep = 1 | 2 | 3 | 4 | 5;
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // Refresh data when entering collaborators tab to see latest statuses
  // Refresh data when entering collaborators tab to see latest statuses
  // DISABLED: Auto-refresh causes unsaved changes in Scope/Timeline to be lost when switching tabs
  /*
  useEffect(() => {
    if (currentStep === 4 && quoteId) {
      loadData();
    }
  }, [currentStep, quoteId]);
  */


  // Collaborator invitation state
  const [collaboratorCategories, setCollaboratorCategories] = useState<CollaboratorCategory[]>([]);
  const [pendingCollaborators, setPendingCollaborators] = useState<Array<{
    name: string;
    email: string;
    company: string;
    categoryId: string;
    categoryName: string;
    deadline: string;
    message: string;
    sharePricing: boolean;
    phone?: string;
    id?: string;
    status?: string;
  }>>([]);
  const [showAddCollaboratorModal, setShowAddCollaboratorModal] = useState(false);
  const [newCollaborator, setNewCollaborator] = useState({
    name: '',
    email: '',
    company: '',
    categoryId: '',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    message: '',
    sharePricing: false
  });
  const [invitingCollaborators, setInvitingCollaborators] = useState(false);
  const [invitationsSent, setInvitationsSent] = useState(false);
  const [sentCollaborators, setSentCollaborators] = useState<Array<{
    name: string;
    email: string;
    company: string;
    categoryName: string;
    status: 'pending' | 'accepted' | 'submitted' | 'merged' | 'declined' | 'approved';
  }>>([]);

  // Inline category creation state
  const [showInlineCategoryForm, setShowInlineCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Previously used collaborators (for quick selection)
  const [previousCollaborators, setPreviousCollaborators] = useState<Array<{
    email: string;
    name: string;
    company: string;
    categoryId: string;
    lastUsed: string;
  }>>([]);
  const [loadingPreviousCollaborators, setLoadingPreviousCollaborators] = useState(false);

  // Wizard step validation
  const canProceedFromStep = (step: WizardStep): boolean => {
    switch (step) {
      case 1: return lineItems.some(item => item.description.trim());
      case 2: return true; // Scope/timeline is optional
      case 3: return true; // Cover/terms are optional
      case 4: return true; // Collaborators are optional
      case 5: return true;
      default: return true;
    }
  };

  const wizardSteps = [
    { step: 1 as WizardStep, label: 'Services & Scope', icon: <ClipboardList className="w-4 h-4" />, complete: lineItems.some(item => item.description.trim()) },
    { step: 2 as WizardStep, label: 'Timeline', icon: <Calendar className="w-4 h-4" />, complete: lineItems.some(item => item.estimatedDays > 0 && item.description.trim()) },
    { step: 3 as WizardStep, label: 'Cover & Terms', icon: <Image className="w-4 h-4" />, complete: true },
    { step: 4 as WizardStep, label: 'Collaborators', icon: <Users className="w-4 h-4" />, complete: true },
    { step: 5 as WizardStep, label: 'Preview & Send', icon: <Send className="w-4 h-4" />, complete: false },
  ];

  // Display name for proposal (based on recipient type selection)
  const displayClientName = recipientType === 'lead'
    ? (selectedLead?.company_name || selectedLead?.name || 'Lead')
    : (client?.name || 'Client');
  const displayClientEmail = recipientType === 'lead'
    ? (selectedLead?.email || '')
    : (client?.email || '');
  const displayContactName = recipientType === 'lead'
    ? (selectedLead?.name || '')
    : (client?.primary_contact_name || '');
  const displayLeadName = recipientType === 'lead'
    ? (selectedLead?.name || '')
    : (client?.primary_contact_name || '');

  // Letter content
  const [letterContent, setLetterContent] = useState('');

  // Send Proposal Modal ('reminder' = same recipient, 'another_contact' = pick a different contact e.g. PM)
  const [sendModalMode, setSendModalMode] = useState<'reminder' | 'another_contact' | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendingProposal, setSendingProposal] = useState(false);
  const [mergingItems, setMergingItems] = useState(false);
  const [justMergedCollaborator, setJustMergedCollaborator] = useState<string | null>(null);
  // Save as Template Modal
  const [showSaveAsTemplateModal, setShowSaveAsTemplateModal] = useState(false);
  const [sentAccessCode, setSentAccessCode] = useState('');
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  // CC Email for send modal
  const [showCcInput, setShowCcInput] = useState(false);
  const [ccEmail, setCcEmail] = useState('');
  const [ccName, setCcName] = useState('');

  // Generate email preview HTML
  const getEmailPreviewHtml = () => {
    const accessCodePreview = '****';
    const proposalLinkPreview = `${window.location.origin}/proposal/[secure-token]`;
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #18181b; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${companyInfo.name}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #18181b; font-size: 18px; font-weight: 600;">
                Hello ${displayClientName},
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Your proposal for <strong style="color: #18181b;">${projectName || documentTitle}</strong> is ready for your review.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="margin: 0 0 8px; color: #71717a; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Access Code</p>
                    <p style="margin: 0; color: #18181b; font-size: 36px; font-weight: 700; letter-spacing: 8px;">${accessCodePreview}</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="#" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Proposal
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px; color: #52525b; font-size: 14px; line-height: 1.6;">
                You'll need to enter the access code above to view your proposal. This ensures your proposal remains secure and private.
              </p>
              ${validUntil ? `<p style="margin: 0; color: #71717a; font-size: 14px;">This proposal is valid until <strong>${new Date(validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 14px; text-align: center;">
                Sent by ${profile?.full_name || companyInfo.name} from ${companyInfo.name}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  };
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    let mounted = true;
    async function load() {
      await loadData();
      // loadData sets state internally, but we wrap it to ensure
      // any future state updates respect the mounted flag
    }
    load();
    return () => { mounted = false; };
  }, [quoteId, profile?.company_id, mergeCollaborationId]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  async function loadData() {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Load clients for dropdown
      const clientsData = await api.getClients(profile.company_id);

      // Sort clients: Favorites first, then by Priority, then by Name
      clientsData.sort((a, b) => {
        // Favorites check
        if (a.is_favorite && !b.is_favorite) return -1;
        if (!a.is_favorite && b.is_favorite) return 1;

        // Priority check (1 is highest, so ascending order)
        const pA = a.priority || 999999;
        const pB = b.priority || 999999;
        if (pA !== pB) return pA - pB;

        // Name check
        return (a.name || '').localeCompare(b.name || '');
      });

      setClients(clientsData);

      // Load leads for dropdown
      const leadsData = await leadsApi.getLeads(profile.company_id);
      setLeads(leadsData);

      // Load services for "Add from Services"
      const servicesData = await api.getServices(profile.company_id);
      setServices(servicesData.filter(s => s.is_active !== false));

      // Load collaborator categories
      try {
        const categories = await collaboratorCategoryApi.getCategories(profile.company_id);
        setCollaboratorCategories(categories);
      } catch (err) {
        console.warn('[QuoteDocument] Failed to load collaborator categories:', err);
      }

      // Load previously used collaborators for quick selection
      try {
        setLoadingPreviousCollaborators(true);
        const prevCollabs = await collaborationApi.getPreviousCollaborators(profile.company_id);
        setPreviousCollaborators(prevCollabs);
      } catch (err) {
        console.warn('[QuoteDocument] Failed to load previous collaborators:', err);
      } finally {
        setLoadingPreviousCollaborators(false);
      }

      // Load company settings
      const settings = await api.getCompanySettings(profile.company_id);
      if (settings) {
        setCompanySettings(settings);
        setTaxRate(settings.default_tax_rate || 8.25);
        if (settings.default_terms) setTerms(settings.default_terms);
      }

      // If creating from a lead URL param, auto-select that lead
      if (isNewQuote && leadId) {
        const foundLead = leadsData.find(l => l.id === leadId);
        if (foundLead) {
          setSelectedLeadId(foundLead.id);
          setSelectedLead(foundLead);
          setRecipientType('lead');
          // Don't auto-fill title - let user enter project name
        }
      }

      // If creating from a client URL param, auto-select that client
      if (isNewQuote && clientIdParam) {
        const foundClient = clientsData.find(c => c.id === clientIdParam);
        if (foundClient) {
          setSelectedClientId(foundClient.id);
          setClient(foundClient);
          setRecipientType('client');
        }
      }

      // If creating from a collaboration, pre-fill the project name and load parent's timeline
      if (isNewQuote && collaborationId && projectTitleParam) {
        const decodedTitle = decodeURIComponent(projectTitleParam);
        setProjectName(decodedTitle);
        setDocumentTitle(`Response: ${decodedTitle}`);
        setIsCollaborationResponse(true);
        console.log('[QuoteDocument] Pre-filled project from collaboration:', decodedTitle);

        // Load collaboration record to get share_line_items setting AND owner info
        try {
          const { data: collabData } = await (await import('../lib/supabase')).supabase
            .from('proposal_collaborations')
            .select('share_line_items, owner_user_id, owner_company_id')
            .eq('id', collaborationId)
            .single();

          if (collabData?.share_line_items) {
            setParentSharePricing(true);
            console.log('[QuoteDocument] Owner shared pricing with collaborator');
          }

          // Fetch owner's company info to pre-fill as the recipient
          if (collabData?.owner_company_id) {
            try {
              // First check if owner is already in collaborator's leads
              const existingLeadMatch = leadsData?.find(
                (l: Lead) => l.company_name === collabData.owner_company_id
              );

              if (existingLeadMatch) {
                // Use existing lead
                setSelectedLeadId(existingLeadMatch.id);
                setSelectedLead(existingLeadMatch);
                setRecipientType('lead');
                console.log('[QuoteDocument] Owner found as existing lead:', existingLeadMatch.name);
              } else {
                // Fetch owner company name from companies table
                const { data: ownerCompanyData } = await (await import('../lib/supabase')).supabase
                  .from('companies')
                  .select('name')
                  .eq('id', collabData.owner_company_id)
                  .single();

                // Fetch owner profile
                const { data: ownerProfile } = await (await import('../lib/supabase')).supabase
                  .from('profiles')
                  .select('full_name, email')
                  .eq('id', collabData.owner_user_id)
                  .single();

                // Also try to get company settings for additional details
                let ownerCompanySettings: { company_name?: string; email?: string; phone?: string } | null = null;
                try {
                  const { data } = await (await import('../lib/supabase')).supabase
                    .from('company_settings')
                    .select('company_name, email, phone')
                    .eq('company_id', collabData.owner_company_id)
                    .maybeSingle();
                  ownerCompanySettings = data;
                } catch {
                  // Ignore errors from company_settings
                }

                const companyName = ownerCompanySettings?.company_name || ownerCompanyData?.name || '';

                if (companyName || ownerProfile) {
                  // Create a pseudo-lead to display owner info
                  // Use company_name property to match what displayClientName expects
                  const ownerAsLead: Lead = {
                    id: 'owner-' + collabData.owner_company_id,
                    company_id: collabData.owner_company_id,
                    name: ownerProfile?.full_name || companyName || 'Project Owner',
                    company_name: companyName,
                    email: ownerProfile?.email || ownerCompanySettings?.email || '',
                    phone: ownerCompanySettings?.phone || '',
                    status: 'qualified',
                    created_at: new Date().toISOString()
                  };
                  setSelectedLead(ownerAsLead);
                  setRecipientType('lead');
                  console.log('[QuoteDocument] Pre-filled owner as recipient:', ownerAsLead.company_name || ownerAsLead.name);
                }
              }
            } catch (ownerErr) {
              console.warn('[QuoteDocument] Could not load owner info:', ownerErr);
            }
          }
        } catch (err) {
          console.warn('[QuoteDocument] Could not load collaboration settings:', err);
        }

        // Load parent quote's line items for dependency selection
        if (parentQuoteId) {
          try {
            const { data: parentItems } = await (await import('../lib/supabase')).supabase
              .from('quote_line_items')
              .select('*')
              .eq('quote_id', parentQuoteId)
              .order('created_at', { ascending: true });

            if (parentItems && parentItems.length > 0) {
              const mappedParentItems = parentItems.map(item => ({
                id: `parent-${item.id}`,
                description: item.description,
                unitPrice: item.unit_price,
                qty: item.quantity,
                unit: item.unit || 'each',
                taxed: item.taxed,
                estimatedDays: item.estimated_days || 1,
                startOffset: item.start_offset || 0,
                dependsOn: '',
                startType: 'parallel' as const,
                overlapDays: 0
              }));
              setParentQuoteLineItems(mappedParentItems);
              console.log('[QuoteDocument] Loaded parent quote line items:', mappedParentItems.length);
            }
          } catch (err) {
            console.error('[QuoteDocument] Failed to load parent line items:', err);
          }
        }
      }

      // If creating from a template, load template data
      if (isNewQuote && templateId) {
        try {
          const template = await api.getProposalTemplate(templateId);
          if (template?.template_data) {
            const data = template.template_data;
            if (data.title) setDocumentTitle(data.title);
            if (data.description) setDescription(data.description);
            if (data.scope_of_work) setScopeOfWork(data.scope_of_work);
            if (data.cover_background_url) setCoverBgUrl(data.cover_background_url);
            if (data.line_items && data.line_items.length > 0) {
              setLineItems(data.line_items.map((item: any, idx: number) => ({
                id: `template-${idx}`,
                description: item.description || '',
                unitPrice: item.unit_price || 0,
                qty: item.quantity || 1,
                unit: item.unit || 'each',
                taxed: item.taxed ?? true,
                estimatedDays: item.estimated_days || 1,
                startOffset: item.start_offset || 0,
                dependsOn: item.depends_on || '',
                startType: item.start_type || 'parallel',
                overlapDays: item.overlap_days || 0
              })));
            }
            // Increment template use count
            api.incrementTemplateUseCount(templateId);
          }
        } catch (e) {
          console.error('Failed to load template:', e);
        }
      }

      if (!isNewQuote && quoteId) {
        // OWNER SIGNING MODE: Use edge function to bypass RLS for cross-company access
        if (ownerSigningMode || isViewOnly) {
          try {
            console.log('[QuoteDocument]', ownerSigningMode ? 'Owner signing mode' : 'View-only mode', '- fetching via edge function');
            const collabData = await api.getCollaborationQuote(quoteId);

            if (collabData.quote) {
              const foundQuote = collabData.quote;
              setQuote(foundQuote);
              setDocumentTitle(foundQuote.title || 'Quote');
              setProjectName(foundQuote.title || '');
              setDescription(foundQuote.description || '');
              setCoverBgUrl(foundQuote.cover_background_url || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80');
              setVolumeNumber(foundQuote.cover_volume_number || 'Volume I');
              setScopeOfWork(foundQuote.scope_of_work || '');
              setLetterContent(foundQuote.letter_content || '');
              setCurrentStep(5); // Go to preview for signing

              // Load line items from edge function response
              if (collabData.lineItems && collabData.lineItems.length > 0) {
                setLineItems(collabData.lineItems.map((item: any) => ({
                  id: item.id,
                  description: item.description,
                  unitPrice: item.unit_price,
                  qty: item.quantity,
                  unit: item.unit || 'each',
                  taxed: item.taxed,
                  estimatedDays: item.estimated_days || 1,
                  startOffset: item.start_offset || 0,
                  dependsOn: item.depends_on || '',
                  startType: item.start_type || 'parallel',
                  overlapDays: item.overlap_days || 0
                })));
              }

              // Store collaboration info for signing
              if (collabData.collaboration) {
                setMergeCollaboration(collabData.collaboration);
              }

              // Set company settings to COLLABORATOR (they are the "contractor" sending the proposal)
              if (collabData.collaboratorAsContractor) {
                setCompanySettings({
                  company_name: collabData.collaboratorAsContractor.name,
                  address: collabData.collaboratorAsContractor.address || '',
                  city: collabData.collaboratorAsContractor.city || '',
                  state: collabData.collaboratorAsContractor.state || '',
                  zip: collabData.collaboratorAsContractor.zip || '',
                  phone: collabData.collaboratorAsContractor.phone || '',
                  website: '',
                  email: collabData.collaboratorAsContractor.email || '',
                  logo_url: collabData.collaboratorAsContractor.logo_url || ''
                } as CompanySettings);
              }

              // Set client to OWNER (they are the "client" receiving the proposal)
              if (collabData.ownerAsClient) {
                setClient({
                  id: 'owner-as-client',
                  name: collabData.ownerAsClient.name,
                  display_name: collabData.ownerAsClient.name,
                  email: collabData.ownerAsClient.email || '',
                  phone: collabData.ownerAsClient.phone || '',
                  address: collabData.ownerAsClient.address || '',
                  city: collabData.ownerAsClient.city || '',
                  state: collabData.ownerAsClient.state || '',
                  zip: collabData.ownerAsClient.zip || ''
                } as Client);
                setRecipientType('client');
              }

              console.log('[QuoteDocument]', ownerSigningMode ? 'Owner signing mode' : 'View-only mode', '- loaded quote and', collabData.lineItems?.length || 0, 'line items');
            }
          } catch (err) {
            console.error('[QuoteDocument] Failed to load collaboration quote:', err);
            showToast?.('Failed to load collaboration quote', 'error');
          }
          setLoading(false);
          return; // Skip normal loading flow
        }

        // Load existing quote (normal flow)
        const quotes = await api.getQuotes(profile.company_id);
        const foundQuote = quotes.find(q => q.id === quoteId);
        if (foundQuote) {
          setQuote(foundQuote);
          setDocumentTitle(foundQuote.title || 'Quote');
          setProjectName(foundQuote.title || ''); // Set project name from quote title
          setDescription(foundQuote.description || '');
          setSelectedClientId(foundQuote.client_id || '');
          setValidUntil(foundQuote.valid_until?.split('T')[0] || '');
          setCoverBgUrl(foundQuote.cover_background_url || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80');
          setVolumeNumber(foundQuote.cover_volume_number || 'Volume I');
          setScopeOfWork(foundQuote.scope_of_work || '');
          setLetterContent(foundQuote.letter_content || '');

          // Load retainer settings
          setRetainerEnabled(foundQuote.retainer_enabled || false);
          setRetainerType((foundQuote.retainer_type as 'percentage' | 'fixed') || 'percentage');
          setRetainerPercentage(foundQuote.retainer_percentage || 25);
          setRetainerAmount(foundQuote.retainer_amount || 0);

          const foundClient = clientsData.find(c => c.id === foundQuote.client_id);
          setClient(foundClient || null);
          if (foundClient) {
            setRecipientType('client');
          } else if (foundQuote.lead_id) {
            // Check if it's a lead-based quote
            const foundLead = leadsData.find(l => l.id === foundQuote.lead_id);
            if (foundLead) {
              setSelectedLeadId(foundQuote.lead_id);
              setSelectedLead(foundLead);
              setRecipientType('lead');
            }
          } else {
            // Check if this is a collaboration response quote (no client/lead set)
            // If so, load the owner's info as the recipient
            try {
              const { data: collabRecord } = await (await import('../lib/supabase')).supabase
                .from('proposal_collaborations')
                .select('id, owner_company_id, owner_user_id, parent_quote_id')
                .eq('response_quote_id', quoteId)
                .maybeSingle();

              if (collabRecord) {
                console.log('[QuoteDocument] This is a collaboration response, loading owner info');
                setIsCollaborationResponse(true);

                // Fetch owner company name
                const { data: ownerCompanyData } = await (await import('../lib/supabase')).supabase
                  .from('companies')
                  .select('name')
                  .eq('id', collabRecord.owner_company_id)
                  .single();

                // Fetch owner profile
                const { data: ownerProfile } = await (await import('../lib/supabase')).supabase
                  .from('profiles')
                  .select('full_name, email')
                  .eq('id', collabRecord.owner_user_id)
                  .single();

                // Also try to get company settings
                let ownerCompanySettings: { company_name?: string; email?: string; phone?: string } | null = null;
                try {
                  const { data } = await (await import('../lib/supabase')).supabase
                    .from('company_settings')
                    .select('company_name, email, phone')
                    .eq('company_id', collabRecord.owner_company_id)
                    .maybeSingle();
                  ownerCompanySettings = data;
                } catch {
                  // Ignore
                }

                const companyName = ownerCompanySettings?.company_name || ownerCompanyData?.name || '';

                if (companyName || ownerProfile) {
                  const ownerAsLead: Lead = {
                    id: 'owner-' + collabRecord.owner_company_id,
                    company_id: collabRecord.owner_company_id,
                    name: ownerProfile?.full_name || companyName || 'Project Owner',
                    company_name: companyName,
                    email: ownerProfile?.email || ownerCompanySettings?.email || '',
                    phone: ownerCompanySettings?.phone || '',
                    status: 'qualified',
                    created_at: new Date().toISOString()
                  };
                  setSelectedLead(ownerAsLead);
                  setRecipientType('lead');
                  console.log('[QuoteDocument] Loaded owner as recipient:', ownerAsLead.company_name || ownerAsLead.name);
                }

                // Load parent quote line items for reference
                if (collabRecord.parent_quote_id) {
                  const { data: parentItems } = await (await import('../lib/supabase')).supabase
                    .from('quote_line_items')
                    .select('*')
                    .eq('quote_id', collabRecord.parent_quote_id)
                    .order('created_at', { ascending: true });

                  if (parentItems && parentItems.length > 0) {
                    const mappedParentItems = parentItems.map(item => ({
                      id: `parent-${item.id}`,
                      description: item.description,
                      unitPrice: item.unit_price,
                      qty: item.quantity,
                      unit: item.unit || 'each',
                      taxed: item.taxed,
                      estimatedDays: item.estimated_days || 1,
                      startOffset: item.start_offset || 0,
                      dependsOn: '',
                      startType: 'parallel' as const,
                      overlapDays: 0
                    }));
                    setParentQuoteLineItems(mappedParentItems);
                    console.log('[QuoteDocument] Loaded parent quote line items:', mappedParentItems.length);
                  }
                }
              }
            } catch (err) {
              console.warn('[QuoteDocument] Could not check if collaboration response:', err);
            }
          }

          // Load line items
          const dbLineItems = await api.getQuoteLineItems(quoteId);
          console.log('[QuoteDocument] Loaded line items from DB:', dbLineItems?.length, 'items');
          console.log('[QuoteDocument] Line items preview:', dbLineItems?.slice(0, 3).map(i => ({ desc: i.description?.substring(0, 50), price: i.unit_price })));
          if (dbLineItems && dbLineItems.length > 0) {
            setLineItems(dbLineItems.map(item => ({
              id: item.id,
              description: item.description,
              unitPrice: item.unit_price,
              qty: item.quantity,
              unit: item.unit || 'each',
              taxed: item.taxed,
              estimatedDays: item.estimated_days || 1,
              startOffset: item.start_offset || 0,
              dependsOn: (item as any).depends_on || '',
              startType: (item as any).start_type || 'parallel',
              overlapDays: (item as any).overlap_days || 0
            })));

            // Load existing collaborations for this quote
            try {
              const collaborations = await collaborationApi.getCollaborations(quoteId);
              if (collaborations && collaborations.length > 0) {
                setInvitationsSent(true);

                // Also populate sent collaborators for tracking status
                setSentCollaborators(collaborations.map(c => ({
                  name: c.collaborator_email,
                  email: c.collaborator_email,
                  company: c.collaborator_company_name || 'Partner',
                  categoryName: (c as any).category?.name || 'Partner',
                  status: c.status || 'pending'
                })));

                const mappedPending = collaborations.map(c => ({
                  name: c.collaborator_email,
                  email: c.collaborator_email,
                  company: c.collaborator_company_name || 'Invited Partner',
                  categoryId: c.category_id || '',
                  categoryName: (c as any).category?.name || 'Partner',
                  deadline: (c as any).response_deadline?.split('T')[0] || '',
                  message: (c as any).invite_message || '',
                  sharePricing: c.share_line_items || false,
                  phone: (c as any).collaborator_phone || '',
                  id: c.id,
                  status: c.status
                }));

                setPendingCollaborators(mappedPending);
                console.log('[QuoteDocument] Loaded', collaborations.length, 'collaborations');
              }
            } catch (err) {
              console.warn('[QuoteDocument] Failed to load collaborations:', err);
            }
          } else if (foundQuote.total_amount) {
            setLineItems([{
              id: 'init-1',
              description: foundQuote.description || 'Professional Services',
              unitPrice: foundQuote.total_amount,
              qty: 1,
              unit: 'each',
              taxed: false,
              estimatedDays: 1,
              startOffset: 0,
              dependsOn: '',
              startType: 'parallel',
              overlapDays: 0
            }]);
          }

          // VIEW-ONLY MODE: Auto-navigate to preview for sent/accepted proposals
          // Skip if merge mode is active (user needs to merge first)
          if (!mergeCollaborationId && (foundQuote.status === 'sent' || foundQuote.status === 'accepted' || foundQuote.status === 'approved')) {
            setCurrentStep(5); // Go directly to preview
            console.log('[QuoteDocument] Sent proposal - auto-navigating to preview mode');
          }
        }
      }

      // Handle merge mode - load collaborator's response for merging
      console.log('[QuoteDocument] Checking merge mode, mergeCollaborationId:', mergeCollaborationId);
      if (mergeCollaborationId) {
        try {
          console.log('[QuoteDocument] Merge mode detected, loading collaboration:', mergeCollaborationId);
          // Get the collaboration record
          const { data: collabData, error: collabError } = await (await import('../lib/supabase')).supabase
            .from('proposal_collaborations')
            .select('*')
            .eq('id', mergeCollaborationId)
            .single();

          if (collabError) {
            console.error('[QuoteDocument] Failed to fetch collaboration:', collabError);
          }

          console.log('[QuoteDocument] Collaboration data fetched:', collabData);
          if (collabData) {
            // Check if already merged - prevent re-merging
            if (collabData.status === 'merged') {
              console.log('[QuoteDocument] Collaboration already merged, skipping merge mode');
              showToast?.('This collaboration has already been merged', 'info');
              // Remove the merge param from URL to prevent confusion
              const newUrl = window.location.pathname;
              window.history.replaceState({}, '', newUrl);
              return; // Don't enable merge mode
            }

            console.log('[QuoteDocument] Setting merge mode with collab:', collabData.id);
            setMergeCollaboration(collabData);
            setIsMergeMode(true);
            setShowMergePanel(true);
            setCurrentStep(4); // Auto-navigate to Collaborators tab in merge mode

            // Load the response quote (collaborator's submission) using edge function to bypass RLS
            if (collabData.response_quote_id) {
              try {
                console.log('[QuoteDocument] Fetching collaboration quote via edge function...');
                const collabQuoteData = await api.getCollaborationQuote(
                  collabData.response_quote_id,
                  mergeCollaborationId
                );
                console.log('[QuoteDocument] Collaboration quote data received:', collabQuoteData);

                if (collabQuoteData?.quote) {
                  setCollaboratorQuote(collabQuoteData.quote);

                  // Load collaborator's line items from edge function response
                  const collabLineItems = collabQuoteData.lineItems || [];
                  console.log('[QuoteDocument] Collaborator line items count:', collabLineItems.length);

                  if (collabLineItems.length > 0) {
                    const mappedItems = collabLineItems.map((item: any) => ({
                      id: `collab-${item.id}`,
                      description: item.description,
                      unitPrice: item.unit_price,
                      qty: item.quantity,
                      unit: item.unit || 'each',
                      taxed: item.taxed,
                      estimatedDays: item.estimated_days || 1,
                      startOffset: item.start_offset || 0,
                      dependsOn: item.depends_on || '',
                      startType: item.start_type || 'parallel',
                      overlapDays: item.overlap_days || 0
                    }));
                    console.log('[QuoteDocument] Mapped collaborator items:', mappedItems);
                    setCollaboratorLineItems(mappedItems);
                    // Select all collaborator items by default
                    setSelectedCollabItems(new Set(mappedItems.map((i: any) => i.id)));
                  } else {
                    console.warn('[QuoteDocument] No line items found in collaborator response');
                  }

                  // Load collaborator info from edge function response
                  const collaboratorCompany = collabQuoteData.collaboratorAsContractor;
                  setCollaboratorInfo({
                    name: collabData.collaborator_name || collaboratorCompany?.name || '',
                    email: collabData.collaborator_email || collaboratorCompany?.email || '',
                    company: collabData.collaborator_company_name || collaboratorCompany?.name || ''
                  });
                  console.log('[QuoteDocument] Collaborator info set:', {
                    name: collabData.collaborator_name || collaboratorCompany?.name,
                    company: collabData.collaborator_company_name || collaboratorCompany?.name
                  });
                }
              } catch (collabFetchError) {
                console.error('[QuoteDocument] Failed to fetch collaboration quote via edge function:', collabFetchError);

                // Fallback: try direct fetch (may fail due to RLS)
                const { data: responseQuote } = await (await import('../lib/supabase')).supabase
                  .from('quotes')
                  .select('*')
                  .eq('id', collabData.response_quote_id)
                  .single();

                if (responseQuote) {
                  setCollaboratorQuote(responseQuote);
                }

                // Set collaborator info from collaboration record
                setCollaboratorInfo({
                  name: collabData.collaborator_name || '',
                  email: collabData.collaborator_email || '',
                  company: collabData.collaborator_company_name || ''
                });
              }
            }
            console.log('[QuoteDocument] Merge mode initialized');
            console.log('[QuoteDocument] Merge state - isMergeMode:', true, 'showMergePanel:', true, 'collaboratorLineItems:', collaboratorLineItems?.length || 0);
          }
        } catch (mergeErr) {
          console.error('[QuoteDocument] Failed to load merge data:', mergeErr);
        }
      }

      // Debug merge panel visibility
      console.log('[QuoteDocument] Final merge check - mergeCollaborationId:', mergeCollaborationId);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setLoading(false);

    // Show template picker if requested via URL param (and no template already selected)
    if (showTemplatesParam && !templateId) {
      setShowTemplatePickerModal(true);
    }

    // Set initial step from URL param (e.g., step=5 for preview mode)
    if (stepParam) {
      const step = parseInt(stepParam, 10);
      if (step >= 1 && step <= 5) {
        setCurrentStep(step as WizardStep);
      }
    }

    // Collaboration view mode - go to preview with status panel visible
    if (isCollaborationView && !stepParam) {
      setCurrentStep(5);
    }
  }

  // Apply template data to the current document
  const applyTemplate = (template: ProposalTemplate) => {
    if (template?.template_data) {
      const data = template.template_data;
      if (data.title) setDocumentTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.scope_of_work) setScopeOfWork(data.scope_of_work);
      if (data.cover_background_url) setCoverBgUrl(data.cover_background_url);
      if (data.line_items && data.line_items.length > 0) {
        setLineItems(data.line_items.map((item: any, idx: number) => ({
          id: `template-${idx}`,
          description: item.description || '',
          unitPrice: item.unit_price || 0,
          qty: item.quantity || 1,
          unit: item.unit || 'each',
          taxed: item.taxed ?? true,
          estimatedDays: item.estimated_days || 1,
          startOffset: item.start_offset || 0,
          dependsOn: item.depends_on || '',
          startType: item.start_type || 'parallel',
          overlapDays: item.overlap_days || 0
        })));
      }
      // Increment template use count
      api.incrementTemplateUseCount(template.id);
      showToast(`Template "${template.name}" applied!`, 'success');
    }
    setShowTemplatePickerModal(false);
  };

  // Update client when selection changes
  useEffect(() => {
    if (selectedClientId) {
      const foundClient = clients.find(c => c.id === selectedClientId);
      setClient(foundClient || null);
      if (foundClient) {
        setRecipientType('client');
        // Load contacts for this client
        api.getClientContacts(selectedClientId).then(contacts => {
          setClientContacts(contacts || []);
        }).catch(console.error);
      }
    } else {
      setClient(null);
      setClientContacts([]);
      setSelectedContactId('');
    }
  }, [selectedClientId, clients]);

  // Update lead when selection changes
  useEffect(() => {
    if (selectedLeadId) {
      const foundLead = leads.find(l => l.id === selectedLeadId);
      setSelectedLead(foundLead || null);
      if (foundLead) setRecipientType('lead');
    } else {
      setSelectedLead(null);
    }
  }, [selectedLeadId, leads]);

  const subtotal = lineItems.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
  const taxableAmount = lineItems.filter(item => item.taxed).reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
  const taxDue = taxableAmount * (taxRate / 100);
  const total = subtotal + taxDue + otherCharges;

  const addLineItem = () => {
    if (isLocked) return; // Prevent adding when locked
    setLineItems([...lineItems, {
      id: crypto.randomUUID(),
      description: '',
      unitPrice: 0,
      qty: 1,
      unit: 'each',
      taxed: false,
      estimatedDays: 1,
      startOffset: 0,
      dependsOn: '',
      startType: 'parallel',
      overlapDays: 0
    }]);
    setHasUnsavedChanges(true);
  };

  // Calculate computed start offset based on dependencies (with cycle detection)
  const getComputedStartOffsets = (items: LineItem[]): Map<string, number> => {
    const offsets = new Map<string, number>();
    const itemMap = new Map(items.map(i => [i.id, i]));

    // Detect cycles: build dependency graph and check for circular refs
    const hasCycle = (startId: string, visited: Set<string>): boolean => {
      if (visited.has(startId)) return true;
      const item = itemMap.get(startId);
      if (!item || !item.dependsOn || item.startType === 'parallel') return false;
      visited.add(startId);
      return hasCycle(item.dependsOn, visited);
    };

    // Calculate start for each item (with cycle protection)
    const getStart = (itemId: string, visited: Set<string>): number => {
      if (visited.has(itemId)) return 0; // Cycle detected, return 0
      visited.add(itemId);

      const item = itemMap.get(itemId);
      if (!item) return 0;

      if (item.startType === 'parallel' || !item.dependsOn) {
        return 0;
      }

      const dep = itemMap.get(item.dependsOn);
      if (!dep) return 0;

      const depStart = getStart(dep.id, visited);

      if (item.startType === 'sequential') {
        return depStart + dep.estimatedDays;
      } else if (item.startType === 'overlap') {
        return depStart + Math.floor(item.overlapDays || 0);
      }
      return 0;
    };

    for (const item of items) {
      offsets.set(item.id, getStart(item.id, new Set()));
    }

    return offsets;
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    if (isLocked) return; // Prevent edits when locked
    setLineItems(lineItems.map(item => item.id === id ? { ...item, ...updates } : item));
    setHasUnsavedChanges(true);
  };

  const removeLineItem = (id: string) => {
    if (isLocked) return; // Prevent deletion when locked
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
      setHasUnsavedChanges(true);
    }
  };

  const [uploadingCover, setUploadingCover] = useState(false);
  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (profile?.company_id) {
      setUploadingCover(true);
      try {
        const url = await api.uploadCoverBackground(profile.company_id, file);
        setCoverBgUrl(url);
        setHasUnsavedChanges(true);
        const settings = await api.getCompanySettings(profile.company_id);
        if (settings) setCompanySettings(settings);
        showToast('Cover image uploaded and saved for reuse', 'success');
      } catch (err: any) {
        showToast(err?.message || 'Upload failed. Create a storage bucket "cover-backgrounds" in Supabase if needed.', 'error');
      } finally {
        setUploadingCover(false);
        e.target.value = '';
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverBgUrl(reader.result as string);
        setHasUnsavedChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const [showExportPreview, setShowExportPreview] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);


  const handleDownloadPdf = async () => {
    // IMPORTANT: We ONLY capture from Step 5 preview now
    // The export modal has old UI and should not be used for PDF
    const isOnStep5 = currentStep === 5;

    // If NOT on step 5, navigate to step 5 first
    if (!isOnStep5) {
      console.log('[PDF] Not on Step 5 - navigating to Step 5 for PDF capture...');
      setCurrentStep(5);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setGeneratingPdf(true);
    try {
      showToast('Generating PDF...', 'info');

      // Get the user's session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session. Please log in again.');
      }

      // FORCE WAIT for DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 300));

      // CAPTURE from Step 5 inline preview ONLY (has .export-page class)
      const exportPages = document.querySelectorAll('.export-page');
      const useRawHtml = exportPages.length > 0;

      console.log(`[PDF] DOM CAPTURE: Found ${exportPages.length} export pages from Step 5 preview`);

      let requestBody;

      // ALWAYS use raw HTML capture - no fallback to old generation
      if (!useRawHtml) {
        console.error('[PDF] CRITICAL ERROR: No export pages found even after opening preview!');
        console.error('[PDF] This should never happen. Debugging info:');
        console.error('[PDF] - showExportPreview:', showExportPreview);
        console.error('[PDF] - All elements with export-page class:', document.querySelectorAll('.export-page'));
        console.error('[PDF] - All elements in body:', document.body.children.length);
        throw new Error('Preview failed to render. Please refresh the page and try again.');
      }

      // DOM capture mode - preview is open
      console.log('[PDF] Capturing DOM with INLINE COMPUTED STYLES for exact match...');

      // Key properties that affect layout and appearance
      const importantProps = [
        'display', 'position', 'top', 'right', 'bottom', 'left',
        'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'border', 'border-width', 'border-style', 'border-color', 'border-radius',
        'background', 'background-color', 'background-image', 'background-size', 'background-position',
        'color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration',
        'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap',
        'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap',
        'opacity', 'transform', 'box-shadow', 'z-index', 'overflow'
      ];

      // Function to inline computed styles ITERATIVELY (no recursion)
      const inlineComputedStylesIterative = (rootElement: HTMLElement, originalRoot: Element) => {
        // Get all elements from both clone and original in the same order
        const cloneElements = rootElement.querySelectorAll('*');
        const originalElements = originalRoot.querySelectorAll('*');

        // Process root element first
        const rootComputed = window.getComputedStyle(originalRoot as HTMLElement);
        let rootStyleString = '';
        importantProps.forEach(prop => {
          const value = rootComputed.getPropertyValue(prop);
          if (value && value !== 'none' && value !== 'auto' && value !== 'initial' && value !== 'inherit') {
            rootStyleString += `${prop}:${value} !important;`;
          }
        });
        if (rootStyleString) {
          rootElement.setAttribute('style', rootStyleString);
        }

        // Process all children (limit to first 500 elements for safety)
        const maxElements = Math.min(cloneElements.length, originalElements.length, 500);
        for (let i = 0; i < maxElements; i++) {
          const cloneEl = cloneElements[i];
          const originalEl = originalElements[i];

          if (!(cloneEl instanceof HTMLElement) || !(originalEl instanceof HTMLElement)) continue;

          const computed = window.getComputedStyle(originalEl);
          let styleString = '';

          importantProps.forEach(prop => {
            const value = computed.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== 'initial' && value !== 'inherit') {
              styleString += `${prop}:${value} !important;`;
            }
          });

          if (styleString) {
            cloneEl.setAttribute('style', styleString);
          }
        }
      };

      // Collect all page HTML with inlined styles
      const pagesHtml = Array.from(exportPages).map((page, idx) => {
        console.log(`[PDF] Processing page ${idx + 1} of ${exportPages.length}...`);
        const clone = page.cloneNode(true) as HTMLElement;

        // Remove interactive/hidden elements
        clone.querySelectorAll('button, input, [contenteditable], .print\\:hidden').forEach(el => el.remove());

        // CRITICAL: Strip out ALL data-* attributes to reduce HTML size
        // These are debug attributes from React dev tools and can bloat HTML from 50KB to 300KB+
        console.log(`[PDF] Stripping data-* attributes from page ${idx + 1}...`);
        const allElements = [clone, ...Array.from(clone.querySelectorAll('*'))];
        allElements.forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          // Get all attributes
          const attrs = Array.from(el.attributes);
          attrs.forEach((attr) => {
            // Remove data-* attributes (React dev tools, debugging, etc.)
            if (attr.name.startsWith('data-')) {
              el.removeAttribute(attr.name);
            }
          });
        });

        // Inline all computed styles ITERATIVELY
        console.log(`[PDF] Inlining computed styles for page ${idx + 1}...`);
        inlineComputedStylesIterative(clone, page);

        return clone.outerHTML;
      }).join('\n');

      console.log(`[PDF] Captured ${exportPages.length} pages with ${pagesHtml.length} total characters`);

      // Minimal CSS - everything is now inlined
      const cssStyles = `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          @page { size: letter; margin: 0; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: 'Inter', sans-serif !important; }
          .export-page { page-break-after: always !important; }
          .export-page:last-child { page-break-after: auto !important; }
        `;

      requestBody = {
        type: 'raw-html',
        returnType: 'pdf',
        data: {
          html: pagesHtml,
          css: cssStyles,
          title: documentTitle || projectName || 'Proposal',
        }
      };

      // CRITICAL DEBUG LOGGING
      console.log('='.repeat(80));
      console.log('PDF GENERATION DEBUG');
      console.log('='.repeat(80));
      console.log('[PDF] Request type:', requestBody.type);
      console.log('[PDF] Using raw HTML:', useRawHtml);
      console.log('[PDF] Export pages found:', exportPages.length);
      console.log('[PDF] Request body keys:', Object.keys(requestBody));
      console.log('[PDF] Data keys:', Object.keys(requestBody.data));
      if (requestBody.type === 'raw-html') {
        console.log('[PDF] HTML length:', requestBody.data.html?.length || 0);
        console.log('[PDF] CSS length:', requestBody.data.css?.length || 0);
        console.log('[PDF] HTML preview (first 500 chars):', requestBody.data.html?.substring(0, 500));
      }
      console.log('='.repeat(80));

      // ========== SIMPLE BROWSER PRINT-TO-PDF (No Browserless) ==========
      // This opens a new window with the EXACT modern UI and triggers print dialog
      console.log('[PDF] Opening browser print dialog with modern UI...');

      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        throw new Error('Could not open print window. Please allow popups.');
      }

      const printHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${documentTitle || projectName || 'Proposal'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { 
      size: letter; 
      margin: 0; 
    }
    
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box;
    }
    
    body { 
      margin: 0; 
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f5f5f5;
    }
    
    .export-page {
      width: 8.5in;
      min-height: 11in;
      margin: 20px auto;
      background: white;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      page-break-after: always;
      overflow: hidden;
    }
    
    .export-page:last-child {
      page-break-after: auto;
    }
    
    /* Table styles for proper rendering */
    table {
      border-collapse: collapse;
      width: 100%;
    }
    
    th, td {
      padding: 12px 8px;
      vertical-align: top;
    }
    
    @media print {
      body { background: white; }
      .export-page { 
        box-shadow: none; 
        margin: 0;
      }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background: #10b981; color: white; padding: 15px 20px; text-align: center; font-weight: 600;">
    📄 Click PRINT below or press Ctrl+P → Choose "Save as PDF" in destination
  </div>
  
  ${pagesHtml}
  
  <div class="no-print" style="text-align: center; padding: 30px;">
    <button onclick="window.print()" style="background: #10b981; color: white; border: none; padding: 15px 40px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer;">
      🖨️ PRINT / SAVE AS PDF
    </button>
  </div>
</body>
</html>`;

      printWindow.document.write(printHTML);
      printWindow.document.close();

      // Auto-trigger print after a short delay to let content render
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 1000);

      showToast('Print dialog opened! Choose "Save as PDF" to download', 'success');

    } catch (error: any) {
      console.error('PDF generation failed:', error);
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Legacy function for print preview
  const handlePrintPreview = () => {
    setShowExportPreview(true);
  };

  const saveChanges = async () => {
    if (!profile?.company_id) {
      showToast('Please log in to save quotes', 'error');
      return;
    }
    if (!documentTitle.trim()) {
      showToast('Please enter a quote title', 'error');
      return;
    }
    // For collaboration responses, the recipient is the project owner (implicit)
    // For regular proposals, require a client or lead to be selected
    if (!isCollaborationResponse && !selectedClientId && !selectedLeadId) {
      showToast('Please select a client or lead', 'error');
      return;
    }

    setSaving(true);
    try {
      let savedQuoteId = quoteId;

      if (isNewQuote) {
        // Create new quote
        const newQuote = await api.createQuote({
          company_id: profile.company_id,
          client_id: selectedClientId || null,
          lead_id: selectedLeadId || null,
          title: documentTitle.trim(),
          description: description || '',
          total_amount: total,
          quote_number: generateQuoteNumber(),
          valid_until: validUntil || undefined,
          cover_background_url: coverBgUrl,
          cover_volume_number: volumeNumber,
          scope_of_work: scopeOfWork || undefined,
          letter_content: letterContent || undefined,
          status: 'draft',
          retainer_enabled: retainerEnabled,
          retainer_type: retainerType,
          retainer_percentage: retainerType === 'percentage' ? retainerPercentage : undefined,
          retainer_amount: retainerType === 'fixed' ? retainerAmount : (retainerType === 'percentage' ? (total * retainerPercentage / 100) : undefined),
        });
        savedQuoteId = newQuote.id;
        setQuote(newQuote);
      } else if (quoteId && quoteId !== 'new') {
        // Update existing quote
        await api.updateQuote(quoteId, {
          title: documentTitle.trim(),
          description: description || '',
          client_id: selectedClientId || null,
          lead_id: selectedLeadId || null,
          total_amount: total,
          valid_until: validUntil || undefined,
          cover_background_url: coverBgUrl,
          cover_volume_number: volumeNumber,
          scope_of_work: scopeOfWork || undefined,
          letter_content: letterContent || undefined,
          retainer_enabled: retainerEnabled,
          retainer_type: retainerType,
          retainer_percentage: retainerType === 'percentage' ? retainerPercentage : undefined,
          retainer_amount: retainerType === 'fixed' ? retainerAmount : (retainerType === 'percentage' ? (total * retainerPercentage / 100) : undefined),
        });
        savedQuoteId = quoteId;
      }

      // Save line items
      if (savedQuoteId && savedQuoteId !== 'new') {
        await api.saveQuoteLineItems(savedQuoteId, lineItems.filter(item => item.description.trim()).map(item => ({
          id: item.id,
          quote_id: savedQuoteId!,
          description: item.description.trim(),
          unit_price: item.unitPrice || 0,
          quantity: item.qty || 1,
          unit: item.unit || 'each',
          taxed: item.taxed || false,
          amount: (item.unitPrice || 0) * (item.qty || 1),
          estimated_days: item.estimatedDays || 1,
          start_offset: item.startOffset || 0,
          start_type: item.startType || 'parallel',
          depends_on: item.dependsOn && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.dependsOn.replace('parent-', '')) ? item.dependsOn.replace('parent-', '') : null,
          overlap_days: item.overlapDays || 0
        })));
      }

      setHasUnsavedChanges(false);
      showToast('Quote saved successfully!', 'success');

      // If this is a collaboration response, update the collaboration status to 'submitted'
      if (collaborationId && savedQuoteId && savedQuoteId !== 'new') {
        try {
          await collaborationApi.submitResponse(collaborationId, savedQuoteId);
          console.log('[QuoteDocument] Collaboration response submitted:', collaborationId, savedQuoteId);
          showToast('Response submitted successfully! The project owner has been notified.', 'success');

          // Send notification to the collaboration owner
          try {
            const { data: collab } = await supabase
              .from('proposal_collaborations')
              .select('owner_company_id, parent_quote:quotes!parent_quote_id(title), collaborator_name')
              .eq('id', collaborationId)
              .single();

            if (collab?.owner_company_id) {
              const parentQuoteArr = collab.parent_quote as Array<{ title: string }> | null;
              const parentQuoteTitle = parentQuoteArr?.[0]?.title || documentTitle;
              await NotificationService.collaborationResponseSubmitted(
                collab.owner_company_id,
                parentQuoteTitle,
                collab.collaborator_name || profile?.full_name || 'A collaborator',
                savedQuoteId
              );
              console.log('[QuoteDocument] Owner notification sent for collaboration response');
            }
          } catch (notifErr) {
            console.error('[QuoteDocument] Failed to send owner notification:', notifErr);
          }

          // Navigate back to the Invited tab to see the submitted status
          navigate('/sales?tab=proposals&subtab=collaborations&collab=invited');
          return; // Exit early after navigation
        } catch (collabErr) {
          console.error('[QuoteDocument] Failed to update collaboration status:', collabErr);
        }
      }

      // If this was a new quote, navigate to the saved quote so user can send it
      if (isNewQuote && savedQuoteId && savedQuoteId !== 'new') {
        navigate(`/quotes/${savedQuoteId}/document`, { replace: true });
      }
    } catch (error: any) {
      console.error('Failed to save:', error);
      showToast(error?.message || 'Failed to save. Please try again.', 'error');
    }
    setSaving(false);
  };

  // Send collaborator invitations and update quote status
  const sendCollaboratorInvitations = async () => {
    if (pendingCollaborators.length === 0) {
      showToast('No collaborators to invite', 'error');
      return;
    }

    setInvitingCollaborators(true);
    try {
      // First save the quote to get an ID
      let savedQuoteId = quoteId;

      if (isNewQuote || !quote?.id) {
        // Create new quote first
        const newQuote = await api.createQuote({
          company_id: profile!.company_id,
          client_id: selectedClientId || null,
          lead_id: selectedLeadId || null,
          title: documentTitle.trim(),
          description: description || '',
          total_amount: total,
          quote_number: generateQuoteNumber(),
          valid_until: validUntil || undefined,
          cover_background_url: coverBgUrl,
          cover_volume_number: volumeNumber,
          scope_of_work: scopeOfWork || undefined,
          letter_content: letterContent || undefined,
          status: 'pending_collaborators',
          collaborators_invited: pendingCollaborators.length,
          collaborators_responded: 0,
          collaborator_invitations_sent_at: new Date().toISOString()
        });
        savedQuoteId = newQuote.id;
        setQuote(newQuote);

        // Navigate to the saved quote URL
        navigate(`/quotes/${newQuote.id}/document`, { replace: true });
      } else {
        // Update existing quote
        await api.updateQuote(quote.id, {
          title: documentTitle.trim(),
          description: description || '',
          client_id: selectedClientId || null,
          lead_id: selectedLeadId || null,
          total_amount: total,
          valid_until: validUntil || undefined,
          cover_background_url: coverBgUrl,
          cover_volume_number: volumeNumber,
          scope_of_work: scopeOfWork || undefined,
          letter_content: letterContent || undefined,
          status: 'pending_collaborators',
          collaborators_invited: pendingCollaborators.length,
          collaborators_responded: 0,
          collaborator_invitations_sent_at: new Date().toISOString()
        });
        savedQuoteId = quote.id;
      }

      // Save line items
      if (savedQuoteId && savedQuoteId !== 'new') {
        await api.saveQuoteLineItems(savedQuoteId, lineItems.filter(item => item.description.trim()).map(item => ({
          id: item.id,
          quote_id: savedQuoteId!,
          description: item.description.trim(),
          unit_price: item.unitPrice || 0,
          quantity: item.qty || 1,
          unit: item.unit || 'each',
          taxed: item.taxed || false,
          amount: (item.unitPrice || 0) * (item.qty || 1),
          estimated_days: item.estimatedDays || 1,
          start_offset: item.startOffset || 0,
          start_type: item.startType || 'parallel',
          depends_on: item.dependsOn && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.dependsOn.replace('parent-', '')) ? item.dependsOn.replace('parent-', '') : null,
          overlap_days: item.overlapDays || 0
        })));
      }

      // Create collaborator invitations and send emails
      const sentCollabs: typeof sentCollaborators = [];
      const isCapacitor = window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost');
      const portalUrl = isCapacitor ? 'https://billdora.com' : window.location.origin;

      for (const collab of pendingCollaborators) {
        try {
          // Create the invitation record
          const invitation = await collaborationApi.createInvitation({
            parent_quote_id: savedQuoteId!,
            owner_user_id: profile!.id,
            owner_company_id: profile!.company_id,
            collaborator_email: collab.email,
            collaborator_name: collab.name || undefined,
            collaborator_company_name: collab.company || undefined,
            category_id: collab.categoryId || undefined,
            message: collab.message || undefined,
            share_line_items: collab.sharePricing,
            expires_at: collab.deadline ? new Date(collab.deadline).toISOString() : undefined
          });

          // Send email notification
          try {
            const respondUrl = `${portalUrl}/collaborate/${invitation.id}`;
            const { error: emailError } = await supabase.functions.invoke('send-email', {
              body: {
                to: collab.email,
                subject: `${companyInfo.name} has invited you to collaborate on a proposal`,
                type: 'collaborator_invitation',
                data: {
                  inviterName: profile?.full_name || companyInfo.name,
                  companyName: companyInfo.name,
                  projectName: projectName || documentTitle,
                  categoryName: collab.categoryName,
                  message: collab.message || undefined,
                  deadline: collab.deadline || undefined,
                  respondUrl
                }
              }
            });
            if (emailError) throw emailError;
            console.log(`[Collaborator] Email sent to ${collab.email}`);
          } catch (emailErr) {
            console.error(`[Collaborator] Failed to send email to ${collab.email}:`, emailErr);
            // Continue even if email fails - invitation is already created
          }

          // Send in-app notification to collaborator (if they have an account)
          try {
            const { data: collabProfiles } = await supabase
              .from('profiles')
              .select('id, company_id')
              .eq('email', collab.email.toLowerCase());

            if (collabProfiles && collabProfiles.length > 0) {
              for (const collabProfile of collabProfiles) {
                await NotificationService.collaborationInvited(
                  collabProfile.id,
                  collabProfile.company_id,
                  projectName || documentTitle,
                  profile?.full_name || companyInfo.name,
                  invitation.id
                );
              }
              console.log(`[Collaborator] Notification sent to ${collab.email}`);
            }
          } catch (notifErr) {
            console.error(`[Collaborator] Failed to send notification to ${collab.email}:`, notifErr);
          }

          sentCollabs.push({
            name: collab.name,
            email: collab.email,
            company: collab.company,
            categoryName: collab.categoryName,
            status: 'pending'
          });
        } catch (err) {
          console.error(`Failed to invite ${collab.email}:`, err);
        }
      }

      // Update state to show "invitations sent" view
      setSentCollaborators(sentCollabs);
      setInvitationsSent(true);
      setPendingCollaborators([]);
      setHasUnsavedChanges(false);

      showToast(`Invitations sent to ${sentCollabs.length} collaborator${sentCollabs.length > 1 ? 's' : ''}!`, 'success');
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      showToast(error?.message || 'Failed to send invitations', 'error');
    }
    setInvitingCollaborators(false);
  };

  // Save quote with pending_collaborators status and stay on proposal page
  const saveAndWaitForResponses = async () => {
    try {
      await saveChanges();
      showToast('Proposal saved. You\'ll be notified when collaborators respond.', 'success');
      // Stay on the proposal page so user can continue working on it
      // No navigation needed
    } catch (error: any) {
      showToast(error?.message || 'Failed to save', 'error');
    }
  };

  const handleSendToCustomer = async () => {
    const recipientEmail = recipientType === 'lead' ? selectedLead?.email : client?.email;
    if (!recipientEmail) {
      showToast(`Please select a ${recipientType || 'client or lead'} with an email address`, 'error');
      return;
    }
    if (!quote && isNewQuote) {
      showToast('Please save the proposal first before sending', 'error');
      return;
    }
    if (hasUnsavedChanges) {
      showToast('You have unsaved changes. Please save the proposal before sending.', 'error');
      return;
    }
    setShowSendModal(true);
  };

  const sendProposalEmail = async () => {
    // If a specific contact is selected, use their email; otherwise use primary contact or client email
    const selectedContact = selectedContactId ? clientContacts.find(c => c.id === selectedContactId) : null;

    let recipientEmail: string | undefined;
    let recipientName: string;

    if (recipientType === 'lead') {
      recipientEmail = selectedLead?.email;
      recipientName = selectedLead?.company_name || selectedLead?.name || 'Lead';
    } else if (selectedContact) {
      // Use selected contact
      recipientEmail = selectedContact.email;
      recipientName = selectedContact.name || client?.name || 'Client';
    } else {
      // Use primary contact or client email
      recipientEmail = client?.primary_contact_email || client?.email;
      recipientName = client?.primary_contact_name || client?.name || 'Client';
    }

    if (!quote || !recipientEmail) return;

    // Determine CC recipient - custom CC takes priority over billing contact
    // Skip CC if it's the same email as the recipient (SendGrid rejects duplicates)
    const rawCcEmail = ccEmail.trim() || (recipientType === 'client' ? (client?.billing_contact_email || null) : null);
    const rawCcName = ccEmail.trim() ? (ccName.trim() || 'CC Recipient') : (recipientType === 'client' ? (client?.billing_contact_name || null) : null);
    const finalCcEmail = rawCcEmail && rawCcEmail.toLowerCase() !== recipientEmail?.toLowerCase() ? rawCcEmail : null;
    const finalCcName = finalCcEmail ? rawCcName : null;

    setSendingProposal(true);
    try {
      // Use production URL for email links (not Capacitor's internal URL)
      const isCapacitor = window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost');
      const portalUrl = isCapacitor ? 'https://billdora.com' : window.location.origin;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-proposal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          quoteId: quote.id,
          companyId: profile?.company_id,
          clientEmail: recipientEmail,
          clientName: recipientName,
          billingContactEmail: finalCcEmail,
          billingContactName: finalCcName,
          projectName: projectName || documentTitle,
          companyName: companyInfo.name,
          senderName: profile?.full_name || companyInfo.name,
          validUntil,
          portalUrl,
          letterContent: letterContent || `Thank you for the potential opportunity to work together on the ${documentTitle || projectName || 'project'}. I have attached the proposal for your consideration which includes a thorough Scope of Work, deliverable schedule, and Fee.\n\nPlease review and let me know if you have any questions or comments. If you are ready for us to start working on the project, please sign the proposal sheet.`,
          retainerEnabled,
          retainerAmount: retainerEnabled ? (retainerType === 'percentage' ? (total * retainerPercentage / 100) : retainerAmount) : 0
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSentAccessCode(data.accessCode);
      await api.updateQuote(quote.id, {
        status: 'sent'
      });
      // Update local state to reflect the sent status immediately
      setQuote(prev => prev ? { ...prev, status: 'sent' } : null);
      showToast('Proposal sent successfully!', 'success');
    } catch (error: any) {
      console.error('Failed to send proposal:', error);
      showToast(error?.message || 'Failed to send proposal', 'error');
    }
    setSendingProposal(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleDateString();
    return new Date(dateStr).toLocaleDateString();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="relative bg-white min-h-screen">

      {/* Lock Banner - Shows when proposal is sent/approved */}
      {isLocked && !ownerSigningMode && (
        <div className={`sticky top-0 z-[60] px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium print:hidden ${quote?.status === 'approved' ? 'bg-green-50 text-green-800 border-b border-green-200' :
          'bg-amber-50 text-amber-800 border-b border-amber-200'
          }`}>
          <Lock className="w-4 h-4" />
          {quote?.status === 'approved'
            ? 'This proposal has been approved by the client. Editing is disabled.'
            : 'This proposal has been sent. Editing is disabled to maintain integrity.'}
        </div>
      )}

      {/* Owner Signing Mode Banner */}
      {ownerSigningMode && (
        <div className="sticky top-0 z-[60] px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium print:hidden bg-purple-50 text-purple-800 border-b border-purple-200">
          <FileSignature className="w-4 h-4" />
          Review and sign this collaborator's proposal to finalize their participation.
        </div>
      )}

      {/* Signature Display - Shows when collaboration is approved/signed */}
      {mergeCollaboration?.status === 'approved' && mergeCollaboration?.owner_signed_at && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-4 print:bg-white">
          <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-green-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">Proposal Approved</span>
            </div>
            <div className="h-6 w-px bg-green-300" />
            <div className="text-green-800">
              <span className="font-medium">Signed by: </span>
              <span>{mergeCollaboration.owner_profile?.full_name || 'Project Owner'}</span>
              <span className="mx-2">•</span>
              <span>{new Date(mergeCollaboration.owner_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation - Minimal */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-100 px-4 lg:px-6 py-4 print:hidden">
        <div className="max-w-[1000px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/sales')} className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500">
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Steps - Text Only */}
            <div className="flex items-center gap-6 text-sm font-medium">
              {wizardSteps.map((ws) => (
                <button
                  key={ws.step}
                  onClick={() => setCurrentStep(ws.step)}
                  className={`transition-colors ${currentStep === ws.step
                    ? 'text-neutral-900'
                    : ws.step < currentStep
                      ? 'text-neutral-900/40 hover:text-neutral-900'
                      : 'text-neutral-300 pointer-events-none'
                    }`}
                >
                  <span className="mr-2 opacity-50">{ws.step}.</span>
                  {ws.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <p className="text-xs text-neutral-400 uppercase tracking-wider font-medium">Total Value</p>
              <p className="text-sm font-bold text-neutral-900">{formatCurrency(total)}</p>
            </div>
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">Unsaved Changes</span>
            )}
            {quote?.revision_of_quote_id && (
              <span className="text-xs text-[#476E66] bg-[#476E66]/10 px-2.5 py-1 rounded-full font-medium" title="This is a revision of a previously sent proposal">
                Revision
              </span>
            )}
            {(quote?.status === 'sent' || (isCollaborationResponse && mergeCollaboration?.submitted_at)) && (
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-medium flex items-center gap-1" title={
                isCollaborationResponse && mergeCollaboration?.submitted_at
                  ? `Submitted on ${new Date(mergeCollaboration.submitted_at).toLocaleDateString()}`
                  : 'Proposal sent'
              }>
                <CheckCircle2 className="w-3 h-3" />
                {isCollaborationResponse ? 'Submitted' : 'Sent'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section Settings Panel */}
      {showSectionSettings && (
        <div className="bg-white border-b border-neutral-200 px-4 lg:px-6 py-4 print:hidden">
          <div className="max-w-[850px] mx-auto">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Show/Hide Proposal Sections</h3>
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'cover', label: 'Cover Page' },
                { key: 'letter', label: 'Letter' },
                { key: 'scopeOfWork', label: 'Scope of Work' },
                { key: 'quoteDetails', label: 'Quote Details' },
                { key: 'timeline', label: 'Timeline' },
                { key: 'terms', label: 'Terms & Signature' },
                { key: 'additionalOfferings', label: 'Additional Offerings' },
              ].map((section) => (
                <button
                  key={section.key}
                  onClick={() => setShowSections(prev => ({ ...prev, [section.key]: !prev[section.key as keyof typeof prev] }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${showSections[section.key as keyof typeof showSections]
                    ? 'bg-[#476E66] text-white'
                    : 'bg-neutral-100 text-neutral-500'
                    }`}
                >
                  {showSections[section.key as keyof typeof showSections] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* Document Canvas */}
      <div className="py-12 px-4 pb-32">
        <div className="w-full max-w-[1000px] mx-auto">

          {/* COVER TAB */}
          {/* STEP 3: Cover, Letter & Terms */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Cover Preview Card */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#476E66]/10 flex items-center justify-center">
                      <Image className="w-5 h-5 text-[#476E66]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900">Cover Page</h3>
                      <p className="text-sm text-neutral-500">Your proposal's first impression</p>
                    </div>
                  </div>
                </div>

                <div className="relative" style={{ minHeight: '500px' }}>
                  {/* Background Image */}
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${coverBgUrl})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
                  </div>

                  {/* Upload Background Button + Saved covers */}
                  {!isLocked && (
                    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2 print:hidden">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" onChange={handleBgUpload} className="hidden" disabled={uploadingCover} />
                        <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white text-sm rounded-xl hover:bg-white/30 transition-colors disabled:opacity-50">
                          {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {uploadingCover ? 'Uploading…' : 'Upload & save'}
                        </div>
                      </label>
                      <div className="flex flex-wrap gap-1.5 justify-end max-w-[280px]">
                        <button
                          type="button"
                          onClick={() => { setCoverBgUrl('https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80'); setHasUnsavedChanges(true); }}
                          className={`w-12 h-12 rounded-lg border-2 bg-neutral-800 bg-cover bg-center flex-shrink-0 ${coverBgUrl?.includes('unsplash') ? 'border-white ring-2 ring-white' : 'border-white/40 hover:border-white/70'}`}
                          style={{ backgroundImage: `url(https://images.unsplash.com/photo-1497366216548-37526070297c?w=200&q=60)` }}
                          title="Default style"
                        />
                        {(companySettings?.saved_cover_background_urls as string[] | undefined)?.map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => { setCoverBgUrl(url); setHasUnsavedChanges(true); }}
                            className={`w-12 h-12 rounded-lg border-2 bg-cover bg-center flex-shrink-0 ${coverBgUrl === url ? 'border-white ring-2 ring-white' : 'border-white/40 hover:border-white/70'}`}
                            style={{ backgroundImage: `url(${url})` }}
                            title="Use this cover"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cover Content */}
                  <div className="relative z-10 h-full flex flex-col text-white p-8 md:p-12" style={{ minHeight: '500px' }}>
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        {companyInfo.logo ? (
                          <img src={companyInfo.logo} alt={companyInfo.name} className="w-16 h-16 object-contain rounded-xl bg-white/10 mb-2" />
                        ) : (
                          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl font-bold mb-2">
                            {companyInfo.name?.charAt(0) || 'C'}
                          </div>
                        )}
                        <p className="text-white/70 text-sm">{companyInfo.website}</p>
                      </div>
                    </div>

                    {/* Client Info */}
                    <div className="mb-auto">
                      <p className="text-white/60 text-sm uppercase tracking-wider mb-2">Prepared For</p>
                      <h3 className="text-2xl font-semibold mb-1">{displayClientName}</h3>
                      {displayLeadName && displayLeadName !== displayClientName && (
                        <p className="text-white/80">{displayLeadName}</p>
                      )}
                      <p className="text-white/60 mt-4">{formatDate(quote?.created_at)}</p>
                    </div>

                    {/* Center Title */}
                    <div className="text-center py-12">
                      {editingTitle ? (
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="text"
                            value={projectName || documentTitle}
                            onChange={(e) => {
                              setProjectName(e.target.value);
                              setDocumentTitle(e.target.value); // Keep in sync for database save
                              setHasUnsavedChanges(true);
                            }}
                            placeholder="Project Name"
                            className="text-4xl md:text-5xl font-bold tracking-tight bg-transparent border-b-2 border-white/50 text-center outline-none"
                            autoFocus
                          />
                          <button onClick={() => setEditingTitle(false)} className="p-2 hover:bg-white/20 rounded">
                            <Check className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <h1
                          onClick={() => !isLocked && setEditingTitle(true)}
                          className={`text-4xl md:text-5xl font-bold tracking-tight print:cursor-default ${isLocked ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
                        >
                          {projectName || documentTitle || 'PROJECT NAME'}
                        </h1>
                      )}
                      <p className="text-lg text-white/70 mt-4">Proposal #{quote?.quote_number || 'New'}</p>
                    </div>

                    {/* Footer */}
                    <div className="mt-auto pt-8 border-t border-white/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xl font-semibold">{companyInfo.name}</p>
                          <p className="text-white/60 text-sm">{companyInfo.address}</p>
                          <p className="text-white/60 text-sm">{companyInfo.city}, {companyInfo.state} {companyInfo.zip}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white/60 text-sm">{companyInfo.phone}</p>
                          <p className="text-white/60 text-sm">{companyInfo.website}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Letter Card - within Cover Tab */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">

                <div className="p-6">
                  {/* Letterhead */}
                  <div className="flex justify-between items-start mb-8">
                    <div className="flex gap-4">
                      {companyInfo.logo ? (
                        <img src={companyInfo.logo} alt={companyInfo.name} className="w-14 h-14 object-contain rounded-lg bg-neutral-100" />
                      ) : (
                        <div className="w-14 h-14 bg-neutral-100 rounded-lg flex items-center justify-center text-xl font-bold text-neutral-700">
                          {companyInfo.name?.charAt(0) || 'C'}
                        </div>
                      )}
                      <div>
                        <h2 className="text-xl font-bold text-neutral-900">{companyInfo.name}</h2>
                        <p className="text-sm text-neutral-600">{companyInfo.address}</p>
                        <p className="text-sm text-neutral-600">{companyInfo.city}, {companyInfo.state} {companyInfo.zip}</p>
                        <p className="text-sm text-neutral-500">{companyInfo.phone} | {companyInfo.website}</p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-neutral-500">
                      <p>{formatDate(quote?.created_at)}</p>
                    </div>
                  </div>

                  {/* Recipient */}
                  <div className="mb-6">
                    <p className="font-semibold text-neutral-900">{displayClientName}</p>
                    {client?.display_name && client.display_name !== client.name && (
                      <p className="text-neutral-600">{client.display_name}</p>
                    )}
                    {client?.email && <p className="text-neutral-500 text-sm">{client.email}</p>}
                  </div>

                  {/* Subject */}
                  <div className="mb-6">
                    <p className="text-neutral-600">
                      <span className="font-semibold">Subject:</span> {documentTitle || projectName || 'Project Proposal'}
                    </p>
                  </div>

                  {/* Letter Body */}
                  <div className="mb-6">
                    <p className="text-neutral-900 mb-4">Dear {displayContactName?.trim().split(' ')[0] || 'Valued Client'},</p>
                    <textarea
                      value={letterContent || `Thank you for the potential opportunity to work together on ${projectName || 'this project'}. I have attached the proposal for your consideration which includes a thorough Scope of Work, deliverable schedule, and Fee.\n\nPlease review and let me know if you have any questions or comments. If you are ready for us to start working on the project, please sign the proposal sheet.`}
                      onChange={(e) => { setLetterContent(e.target.value); setHasUnsavedChanges(true); }}
                      readOnly={isLocked}
                      className="w-full h-32 p-0 text-neutral-700 bg-transparent resize-none outline-none border-none focus:ring-0"
                      placeholder="Enter your letter content..."
                    />
                  </div>

                  {/* Closing */}
                  <div className="mt-8">
                    <p className="text-neutral-900 mb-4">Sincerely,</p>
                    <div className="mt-8">
                      <p className="font-semibold text-neutral-900">{profile?.full_name || companyInfo.name}</p>
                      <p className="text-sm text-neutral-600">{companyInfo.name}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MERGE PANEL - Shows when reviewing collaborator's response */}
          {isMergeMode && showMergePanel && currentStep === 4 && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden mb-8 shadow-sm">
              {/* Header */}
              <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100">
                    <Users className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">Review Collaborator Response</h3>
                    <p className="text-sm text-neutral-500">
                      Response from <span className="font-medium text-neutral-900">{collaboratorInfo?.name || 'Collaborator'}</span> ({collaboratorInfo?.company || 'External'})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMergePanel(!showMergePanel)}
                  className="text-sm text-neutral-500 hover:text-neutral-900 font-medium px-3 py-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  {showMergePanel ? 'Collapse Panel' : 'Expand Panel'}
                </button>
              </div>

              {/* Controls & Breakdown */}
              <div className="px-6 py-6 border-b border-neutral-100 bg-white">
                <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">

                  {/* Left: Configuration Toggles */}
                  <div className="flex flex-col sm:flex-row gap-6">
                    {/* Visibility Control */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Client Visibility</label>
                      <div className="bg-neutral-100 p-1 rounded-lg inline-flex">
                        <button
                          onClick={() => setShowCollaboratorInfo(false)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${!showCollaboratorInfo
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-900'
                            }`}
                        >
                          Anonymous
                        </button>
                        <button
                          onClick={() => setShowCollaboratorInfo(true)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${showCollaboratorInfo
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-900'
                            }`}
                        >
                          Show Info
                        </button>
                      </div>
                    </div>

                    {/* Payment Routing (Conditional) */}
                    {showCollaboratorInfo && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Payment Routing</label>
                        <div className="bg-neutral-100 p-1 rounded-lg inline-flex">
                          <button
                            onClick={() => setPaymentMode('through_owner')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${paymentMode === 'through_owner'
                              ? 'bg-white text-neutral-900 shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-900'
                              }`}
                          >
                            Pay Collaborator
                          </button>
                          <button
                            onClick={() => setPaymentMode('direct')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${paymentMode === 'direct'
                              ? 'bg-white text-neutral-900 shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-900'
                              }`}
                          >
                            Client Pays Direct
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Price Breakdown (Clean) */}
                  <div className="flex items-center gap-8 pl-8 lg:border-l border-neutral-100">
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Your Items</p>
                      <p className="text-base font-semibold text-neutral-900 font-mono">
                        ${lineItems.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.qty || 1), 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-amber-600">
                      <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">+ Collaborator</p>
                      <p className="text-base font-semibold font-mono">
                        ${collaboratorLineItems
                          .filter(item => selectedCollabItems.has(item.id))
                          .reduce((sum, item) => sum + (item.unitPrice || 0) * (item.qty || 1), 0)
                          .toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">= Total</p>
                      <p className="text-xl font-bold text-neutral-900 font-mono">
                        ${(lineItems.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.qty || 1), 0) +
                          collaboratorLineItems
                            .filter(item => selectedCollabItems.has(item.id))
                            .reduce((sum, item) => sum + (item.unitPrice || 0) * (item.qty || 1), 0)
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Line Items List (Table Style) */}
              <div className="bg-white">
                {/* Table Header */}
                <div className="px-6 py-2 border-b border-neutral-100 bg-neutral-50/50 flex items-center text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  <div className="w-10">
                    <button
                      onClick={() => {
                        if (selectedCollabItems.size === collaboratorLineItems.length) {
                          setSelectedCollabItems(new Set());
                        } else {
                          setSelectedCollabItems(new Set(collaboratorLineItems.map(i => i.id)));
                        }
                      }}
                      className="hover:text-neutral-700"
                    >
                      {selectedCollabItems.size === collaboratorLineItems.length ? 'None' : 'All'}
                    </button>
                  </div>
                  <div className="flex-1">Description</div>
                  <div className="w-24 text-center">Qty</div>
                  <div className="w-32 text-right">Amount</div>
                </div>

                {/* List Items */}
                <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto">
                  {collaboratorLineItems.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                        <Package className="w-6 h-6 text-amber-500" />
                      </div>
                      <p className="text-sm font-medium text-neutral-700 mb-1">No line items from collaborator</p>
                      <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                        {collaboratorInfo?.company || collaboratorInfo?.name || 'The collaborator'} didn't add any line items to their response.
                        {collaboratorQuote?.scope_of_work ? ' However, they did provide a scope of work which you can still merge.' : ' They may have only accepted the collaboration without adding their own pricing.'}
                      </p>
                      {!collaboratorQuote && (
                        <button
                          onClick={async () => {
                            // Manual retry - refetch collaboration data
                            console.log('[QuoteDocument] Manual retry - refetching collaboration data');
                            if (mergeCollaboration?.response_quote_id) {
                              try {
                                const collabQuoteData = await api.getCollaborationQuote(
                                  mergeCollaboration.response_quote_id,
                                  mergeCollaboration.id
                                );
                                console.log('[QuoteDocument] Retry response:', collabQuoteData);
                                if (collabQuoteData?.lineItems?.length > 0) {
                                  const mappedItems = collabQuoteData.lineItems.map((item: any) => ({
                                    id: `collab-${item.id}`,
                                    description: item.description,
                                    unitPrice: item.unit_price,
                                    qty: item.quantity,
                                    unit: item.unit || 'each',
                                    taxed: item.taxed,
                                    estimatedDays: item.estimated_days || 1,
                                    startOffset: item.start_offset || 0,
                                    dependsOn: item.depends_on || '',
                                    startType: item.start_type || 'parallel',
                                    overlapDays: item.overlap_days || 0
                                  }));
                                  setCollaboratorLineItems(mappedItems);
                                  setSelectedCollabItems(new Set(mappedItems.map((i: any) => i.id)));
                                  showToast?.(`Loaded ${mappedItems.length} items from collaborator`, 'success');
                                } else {
                                  showToast?.('Collaborator has no line items to merge', 'warning');
                                }
                                if (collabQuoteData?.quote) {
                                  setCollaboratorQuote(collabQuoteData.quote);
                                }
                              } catch (err) {
                                console.error('[QuoteDocument] Retry failed:', err);
                                showToast?.('Failed to load collaborator items: ' + (err as Error).message, 'error');
                              }
                            }
                          }}
                          className="mt-3 px-4 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                        >
                          Retry Loading
                        </button>
                      )}
                    </div>
                  ) : (
                    collaboratorLineItems.map((item) => (
                      <div
                        key={item.id}
                        className={`px-6 py-3 flex items-center hover:bg-neutral-50 cursor-pointer transition-colors group ${selectedCollabItems.has(item.id) ? 'bg-amber-50/10' : ''}`}
                        onClick={() => {
                          const newSelected = new Set(selectedCollabItems);
                          if (newSelected.has(item.id)) newSelected.delete(item.id);
                          else newSelected.add(item.id);
                          setSelectedCollabItems(newSelected);
                        }}
                      >
                        <div className="w-10 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedCollabItems.has(item.id)}
                            onChange={() => { }}
                            className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className={`text-sm font-medium truncate ${selectedCollabItems.has(item.id) ? 'text-neutral-900' : 'text-neutral-600'}`}>
                            {item.description}
                          </p>
                          {item.startType !== 'parallel' && (
                            <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                              <Link className="w-3 h-3" /> Depends on previous task
                            </p>
                          )}
                        </div>
                        <div className="w-24 text-center text-sm text-neutral-500">
                          {item.qty} × <span className="text-xs text-neutral-400">${item.unitPrice}</span>
                        </div>
                        <div className="w-32 text-right">
                          <p className="text-sm font-semibold text-neutral-900 font-mono">
                            ${(item.qty * item.unitPrice).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Collaborator Scope of Work Preview */}
              {collaboratorQuote?.scope_of_work && (
                <div className="px-6 py-4 bg-amber-50/50 border-t border-amber-100">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-amber-900 mb-2">
                        Collaborator's Scope of Work
                        {showCollaboratorInfo && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(will be merged when transparent)</span>
                        )}
                      </h4>
                      <div className="text-sm text-amber-800/80 whitespace-pre-line bg-white/60 rounded-lg p-3 border border-amber-100 max-h-32 overflow-y-auto">
                        {collaboratorQuote.scope_of_work}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Footer */}
              <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  <Info className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5 text-neutral-400" />
                  {collaboratorLineItems.length > 0
                    ? 'Merged items will be added to your project scope.'
                    : collaboratorQuote?.scope_of_work
                      ? 'Scope of work will be merged into your proposal.'
                      : 'No items or scope to merge from this collaborator.'}
                </div>
                <button
                  onClick={async () => {
                    if (mergingItems) return; // Prevent double-click
                    setMergingItems(true);

                    // Check if there's anything to merge
                    const hasItemsToMerge = selectedCollabItems.size > 0;
                    const hasScopeToMerge = showCollaboratorInfo && collaboratorQuote?.scope_of_work;

                    if (!hasItemsToMerge && !hasScopeToMerge) {
                      showToast?.('Nothing to merge - collaborator has no line items or scope of work', 'warning');
                      setMergingItems(false);
                      return;
                    }

                    // DUPLICATE CHECK: Verify items haven't been merged already
                    const collaboratorDescriptions = collaboratorLineItems
                      .filter(i => selectedCollabItems.has(i.id))
                      .map(i => i.description.trim().toLowerCase());

                    const alreadyMerged = lineItems.some(item => {
                      const cleanDesc = item.description.replace(/^\[.*?\]\s*/, '').trim().toLowerCase();
                      return collaboratorDescriptions.includes(cleanDesc);
                    });

                    if (alreadyMerged) {
                      showToast?.('These items have already been merged into your proposal', 'warning');
                      setMergingItems(false);
                      return;
                    }

                    // Find the last task in owner's timeline to chain collaborator items after it
                    const ownerOffsets = getComputedStartOffsets(lineItems.filter(i => i.description.trim()));
                    let lastOwnerTaskId = '';
                    let maxEndDay = 0;
                    for (const item of lineItems) {
                      const startDay = ownerOffsets.get(item.id) || 0;
                      const endDay = startDay + item.estimatedDays;
                      if (endDay > maxEndDay) {
                        maxEndDay = endDay;
                        lastOwnerTaskId = item.id;
                      }
                    }

                    // Add selected collaborator items to main line items
                    // Chain them after the owner's last task if they have no dependencies
                    const itemsToAdd = collaboratorLineItems
                      .filter(i => selectedCollabItems.has(i.id))
                      .map((item, idx) => ({
                        ...item,
                        id: `merged-${Date.now()}-${idx}`,
                        description: showCollaboratorInfo
                          ? `[${collaboratorInfo?.company}] ${item.description}`
                          : item.description,
                        // If collaborator item has no dependency, chain it after owner's last task
                        dependsOn: (!item.dependsOn && item.startType === 'parallel' && lastOwnerTaskId)
                          ? lastOwnerTaskId
                          : item.dependsOn,
                        startType: (!item.dependsOn && item.startType === 'parallel' && lastOwnerTaskId)
                          ? 'sequential'
                          : item.startType
                      }));
                    const newLineItems = [...lineItems, ...itemsToAdd];
                    setLineItems(newLineItems);
                    setShowMergePanel(false);
                    setIsMergeMode(false); // Exit merge mode
                    setSelectedCollabItems(new Set()); // Clear selections

                    // Execute all async operations before navigating
                    try {
                      // 1. Update collaboration status to 'merged' to prevent re-merging
                      if (mergeCollaboration?.id) {
                        const { supabase } = await import('../lib/supabase');
                        await supabase
                          .from('proposal_collaborations')
                          .update({
                            status: 'merged',
                            merged_at: new Date().toISOString(),
                            payment_mode: paymentMode,
                            collaborator_visible: showCollaboratorInfo
                          })
                          .eq('id', mergeCollaboration.id);
                        console.log('[QuoteDocument] Collaboration status updated to merged with payment mode and visibility');
                      }

                      // 2. AUTO-SAVE: Save merged items to database
                      if (quoteId && quoteId !== 'new') {
                        await api.saveQuoteLineItems(quoteId, newLineItems.filter(item => item.description.trim()).map(item => ({
                          id: item.id,
                          quote_id: quoteId,
                          description: item.description.trim(),
                          unit_price: item.unitPrice || 0,
                          quantity: item.qty || 1,
                          unit: item.unit || 'each',
                          taxed: item.taxed || false,
                          amount: (item.unitPrice || 0) * (item.qty || 1),
                          estimated_days: item.estimatedDays || 1,
                          start_offset: item.startOffset || 0,
                          start_type: item.startType || 'parallel',
                          depends_on: item.dependsOn && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.dependsOn.replace('parent-', '')) ? item.dependsOn.replace('parent-', '') : null,
                          overlap_days: item.overlapDays || 0
                        })));
                        console.log('[QuoteDocument] Merged items auto-saved to database');
                        setHasUnsavedChanges(false);
                      } else {
                        setHasUnsavedChanges(true);
                      }

                      // 3. Merge scope of work in transparent mode
                      if (showCollaboratorInfo && collaboratorQuote?.scope_of_work) {
                        const collaboratorName = collaboratorInfo?.company || collaboratorInfo?.name || 'Collaborator';
                        const mergedScope = scopeOfWork
                          ? `${scopeOfWork}\n\n---\n\n### Scope of Work - ${collaboratorName}\n\n${collaboratorQuote.scope_of_work}`
                          : collaboratorQuote.scope_of_work;
                        setScopeOfWork(mergedScope);

                        // Update scope in database
                        if (quoteId && quoteId !== 'new') {
                          const { supabase } = await import('../lib/supabase');
                          await supabase
                            .from('quotes')
                            .update({ scope_of_work: mergedScope })
                            .eq('id', quoteId);
                          console.log('[QuoteDocument] Merged scope of work saved');
                        }
                      }

                      // 4. Remove merge_collaboration_id from URL to prevent re-merging
                      const newUrl = window.location.pathname;
                      window.history.replaceState({}, '', newUrl);

                      // 5. Show success message with clear next steps
                      const collaboratorName = collaboratorInfo?.company || collaboratorInfo?.name || 'Collaborator';
                      const itemCount = itemsToAdd.length;
                      const scopeMerged = showCollaboratorInfo && collaboratorQuote?.scope_of_work;
                      const message = itemCount > 0
                        ? `✓ ${collaboratorName}'s ${itemCount} item${itemCount !== 1 ? 's' : ''} merged! Review and send to client.`
                        : scopeMerged
                          ? `✓ ${collaboratorName}'s scope of work merged! Review and send to client.`
                          : `✓ Collaboration with ${collaboratorName} marked as complete.`;
                      showToast?.(message, 'success');
                      setJustMergedCollaborator(collaboratorName); // Track for banner display

                      // 6. Navigate to Step 5 (Preview & Send) after everything is complete
                      setTimeout(() => {
                        console.log('[QuoteDocument] Navigating to Step 5 after merge');
                        setCurrentStep(5);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setMergingItems(false); // Re-enable button after navigation
                      }, 800);

                    } catch (err) {
                      console.error('[QuoteDocument] Error during merge:', err);
                      showToast?.('Merge completed but some operations failed', 'warning');
                      // Still try to navigate even if there's an error
                      setTimeout(() => {
                        setCurrentStep(5);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setMergingItems(false); // Re-enable button
                      }, 500);
                    }
                  }}
                  disabled={mergingItems || (selectedCollabItems.size === 0 && !(showCollaboratorInfo && collaboratorQuote?.scope_of_work))}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${!mergingItems && (selectedCollabItems.size > 0 || (showCollaboratorInfo && collaboratorQuote?.scope_of_work))
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-500/30'
                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                >
                  {mergingItems ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Merging...
                    </>
                  ) : selectedCollabItems.size > 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Add {selectedCollabItems.size} Item{selectedCollabItems.size !== 1 ? 's' : ''} to Proposal
                    </>
                  ) : collaboratorQuote?.scope_of_work ? (
                    <>
                      <FileText className="w-4 h-4" />
                      Merge Scope of Work Only
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4" />
                      Nothing to Merge
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: Line Items Table */}
          {currentStep === 1 && (
            <>
              {/* Parent Timeline Reference - shown when creating collaboration response */}
              {isCollaborationResponse && parentQuoteLineItems.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-200 overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-blue-200 bg-white/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900">Owner's Project Timeline</h3>
                        <p className="text-sm text-neutral-600">Reference timeline - select which task your work depends on</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="space-y-1">
                      {parentQuoteLineItems.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-3 py-2 px-3 bg-white/60 rounded-lg border border-blue-100">
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">{item.description}</p>
                          </div>
                          {parentSharePricing && item.unitPrice > 0 && (
                            <div className="text-xs text-emerald-600 font-medium">${(item.unitPrice * item.qty).toLocaleString()}</div>
                          )}
                          <div className="text-xs text-blue-600 font-medium">{item.estimatedDays} days</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-12">

                {/* Project Header - Canvas Style */}
                <div className="space-y-6 pb-8 border-b border-neutral-100">
                  <div className={`transition-colors duration-300 rounded-lg -mx-3 px-3 py-2 ${!projectName.trim() && isNewQuote ? 'bg-amber-50/60' : 'bg-transparent'}`}>
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Project</label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => {
                        setProjectName(e.target.value);
                        setDocumentTitle(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full text-4xl font-bold text-neutral-900 placeholder:text-neutral-300 outline-none bg-transparent"
                      placeholder="Project Name..."
                    />
                  </div>

                  {/* Clients Row */}
                  {/* Clients Row - different for collaborators */}
                  {isCollaborationResponse ? (
                    <div className="flex gap-8">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Prepared For</label>
                        <div className="flex items-center gap-3 py-2 border-b border-neutral-200">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-neutral-600" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-neutral-900">{selectedLead?.name || 'Project Owner'}</p>
                            {(selectedLead as any)?.company && <p className="text-xs text-neutral-500">{(selectedLead as any).company}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Submission Date</label>
                        <div className="py-3 border-b border-neutral-200">
                          <p className="text-lg font-medium text-neutral-900">{new Date().toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`flex gap-8 transition-colors duration-300 rounded-lg ${!selectedClientId && !selectedLeadId && isNewQuote ? 'bg-amber-50/60 -mx-3 px-3 py-2' : ''}`}>
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Client</label>
                        <div className="relative group">
                          <select
                            value={selectedClientId}
                            onChange={(e) => {
                              setSelectedClientId(e.target.value);
                              if (e.target.value) {
                                const foundClient = clients.find(c => c.id === e.target.value);
                                if (foundClient) setClient(foundClient);
                                setSelectedLeadId(''); setSelectedLead(null); setRecipientType('client');
                              }
                              setHasUnsavedChanges(true);
                            }}
                            disabled={recipientType === 'lead'}
                            className="w-full appearance-none bg-transparent text-lg font-medium text-neutral-900 outline-none py-2 border-b border-neutral-200 focus:border-neutral-900 transition-colors cursor-pointer"
                          >
                            <option value="">Select Client</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                            <ChevronRight className="w-4 h-4 rotate-90" />
                          </div>
                        </div>
                      </div>

                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Lead (Optional)</label>
                        <div className="relative group">
                          <select
                            value={selectedLeadId}
                            onChange={(e) => {
                              setSelectedLeadId(e.target.value);
                              if (e.target.value) {
                                const foundLead = leads.find(l => l.id === e.target.value);
                                if (foundLead) setSelectedLead(foundLead);
                                setSelectedClientId(''); setClient(null); setRecipientType('lead');
                              }
                              setHasUnsavedChanges(true);
                            }}
                            disabled={recipientType === 'client'}
                            className="w-full appearance-none bg-transparent text-lg font-medium text-neutral-900 outline-none py-2 border-b border-neutral-200 focus:border-neutral-900 transition-colors cursor-pointer"
                          >
                            <option value="">Select Lead</option>
                            {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                            <ChevronRight className="w-4 h-4 rotate-90" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>


                {/* Desktop List Layout (Canvas Style) */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-neutral-900">Scope & Services</h3>
                    <div className={`flex gap-2 transition-colors duration-300 rounded-lg ${lineItems.length === 1 && !lineItems[0].description && isNewQuote ? 'bg-amber-50/60 -my-1 px-3 py-1' : ''}`}>
                      <button
                        onClick={addLineItem}
                        className="flex items-center gap-2 text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add Item
                      </button>
                      <button
                        onClick={() => setShowServicesModal(true)}
                        className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
                      >
                        <Package className="w-4 h-4" /> From Library
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {lineItems.map((item, idx) => (
                      <div key={item.id} className="group relative transition-all duration-300 hover:bg-neutral-50 rounded-xl p-4 -mx-4 border border-transparent hover:border-neutral-200">

                        <div className="flex flex-col md:flex-row gap-6 md:items-start">
                          {/* Left: Content */}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start gap-4">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-400 text-xs font-medium flex items-center justify-center mt-1">
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                className="w-full text-lg font-medium bg-transparent outline-none placeholder:text-neutral-300 text-neutral-900"
                                placeholder="Deliverable Title..."
                              />
                            </div>

                            {/* Rich Description Area (simulated with textarea) */}
                            <div className="pl-10">
                              <textarea
                                className="w-full text-sm text-neutral-500 bg-transparent outline-none resize-none placeholder:text-neutral-300/50"
                                rows={2}
                                value={item.description ? `${item.description} Details...` : ''} // Placeholder for now as we don't have separate desc field
                                placeholder="Add detailed scope description, deliverables, and exclusions..."
                              // Note: In a real implementation we would need a separate 'details' field in the schema
                              />

                              {/* Quick Actions for this item */}
                              <div className="flex items-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <select
                                  value={item.unit}
                                  onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                                  className="text-xs bg-transparent text-neutral-400 hover:text-neutral-600 outline-none cursor-pointer"
                                >
                                  <option value="each">Each</option>
                                  <option value="hour">Per Hour</option>
                                  <option value="project">Project</option>
                                </select>
                                <label className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.taxed}
                                    onChange={(e) => updateLineItem(item.id, { taxed: e.target.checked })}
                                    className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                                  />
                                  Taxable
                                </label>
                                <button onClick={() => removeLineItem(item.id)} className="text-xs text-red-500 hover:text-red-700 ml-auto">
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Right: Pricing & Timeline */}
                          <div className="flex flex-row md:flex-col gap-4 md:items-end justify-between md:justify-start md:w-48 pl-10 md:pl-0">
                            {/* Price */}
                            <div className={`text-right transition-colors duration-300 rounded-lg ${item.unitPrice === 0 && isNewQuote && idx === 0 ? 'bg-amber-50/60 px-2 py-1 -mr-2' : ''}`}>
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="number"
                                  value={item.qty}
                                  onChange={(e) => updateLineItem(item.id, { qty: parseInt(e.target.value) || 1 })}
                                  className="w-12 text-right bg-transparent border-b border-transparent hover:border-neutral-200 outline-none text-neutral-500 focus:text-neutral-900 focus:border-neutral-900 transition-colors"
                                />
                                <span className="text-neutral-400 text-sm">×</span>
                                <input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => updateLineItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                  className="w-24 text-right bg-transparent border-b border-transparent hover:border-neutral-200 outline-none font-medium text-neutral-900 focus:border-neutral-900 transition-colors"
                                />
                              </div>
                              <p className="text-xs text-neutral-400 mt-1">
                                {formatCurrency(item.unitPrice * item.qty)}
                              </p>
                            </div>

                            {/* Timeline */}
                            <div className={`text-right transition-colors duration-300 rounded-lg ${item.estimatedDays === 1 && isNewQuote && idx === 0 ? 'bg-amber-50/60 px-2 py-1 -mr-2' : ''}`}>
                              <div className="flex items-center justify-end gap-1">
                                <Calendar className="w-3 h-3 text-neutral-400" />
                                <input
                                  type="number"
                                  value={item.estimatedDays}
                                  onChange={(e) => updateLineItem(item.id, { estimatedDays: parseInt(e.target.value) || 1 })}
                                  className="w-10 text-right bg-transparent border-b border-transparent hover:border-neutral-200 outline-none text-xs text-neutral-600 focus:border-neutral-900"
                                />
                                <span className="text-xs text-neutral-400">days</span>
                              </div>
                            </div>

                            {/* Scheduling / Dependencies */}
                            {(lineItems.length > 1 || (isCollaborationResponse && parentQuoteLineItems.length > 0)) && (
                              <div className={`text-right mt-1 transition-colors duration-300 rounded-lg ${item.startType === 'parallel' && lineItems.length > 1 && idx > 0 && isNewQuote ? 'bg-amber-50/60 px-2 py-1 -mr-2' : ''}`}>
                                <div className="flex items-center justify-end gap-1">
                                  <Link className="w-3 h-3 text-neutral-400" />
                                  <select
                                    value={item.startType === 'parallel' ? 'parallel' : `${item.startType}:${item.dependsOn}`}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === 'parallel') {
                                        updateLineItem(item.id, { startType: 'parallel', dependsOn: '', overlapDays: 0 });
                                      } else {
                                        const [type, depId] = val.split(':');
                                        // Check both local items and parent/owner items
                                        const depItem = lineItems.find(i => i.id === depId) ||
                                          parentQuoteLineItems.find(i => i.id === depId);

                                        updateLineItem(item.id, {
                                          startType: type as 'sequential' | 'overlap',
                                          dependsOn: depId,
                                          overlapDays: type === 'overlap' ? Math.ceil((depItem?.estimatedDays || 2) / 2) : 0
                                        });
                                      }
                                    }}
                                    className="bg-transparent border-b border-transparent hover:border-neutral-200 outline-none text-xs text-neutral-600 focus:border-neutral-900 text-right appearance-none cursor-pointer max-w-[12rem]"
                                    title="Task scheduling dependency"
                                  >
                                    <option value="parallel">Start: Now</option>

                                    {/* Owner/Parent Items */}
                                    {isCollaborationResponse && parentQuoteLineItems.length > 0 && (
                                      <optgroup label="Owner's Timeline">
                                        {parentQuoteLineItems.map((dep, depIdx) => (
                                          <React.Fragment key={dep.id}>
                                            <option value={`sequential:${dep.id}`}>After Owner's {depIdx + 1}. {dep.description.substring(0, 15)}...</option>
                                            <option value={`overlap:${dep.id}`}>With Owner's {depIdx + 1}. {dep.description.substring(0, 15)}...</option>
                                          </React.Fragment>
                                        ))}
                                      </optgroup>
                                    )}

                                    {/* My Items */}
                                    <optgroup label="My Tasks">
                                      {lineItems.filter(other => {
                                        if (other.id === item.id) return false;
                                        // Cycle Check
                                        let current = other.dependsOn;
                                        while (current) {
                                          if (current === item.id) return false; // Cycle detected
                                          const parent = lineItems.find(i => i.id === current || i.id === `parent-${current}`) ||
                                            parentQuoteLineItems.find(i => i.id === current);
                                          current = parent?.dependsOn;
                                        }
                                        return true;
                                      }).map((dep, depIdx) => (
                                        <React.Fragment key={dep.id}>
                                          <option value={`sequential:${dep.id}`}>After {depIdx + 1}. {dep.description.substring(0, 15)}...</option>
                                          <option value={`overlap:${dep.id}`}>With {depIdx + 1}. {dep.description.substring(0, 15)}...</option>
                                        </React.Fragment>
                                      ))}
                                    </optgroup>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>




              </div>
            </>
          )}

          {/* STEP 2: Scope of Work & Timeline */}
          {/* STEP 2: Scope of Work & Timeline */}
          {currentStep === 2 && (
            <div className="space-y-12">
              {/* Scope of Work - Canvas Style */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-neutral-900">Scope of Work</h3>
                  <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">Deliverables</span>
                </div>
                <SimpleEditor
                  value={scopeOfWork}
                  onChange={(val) => { setScopeOfWork(val); setHasUnsavedChanges(true); }}
                  className="w-full h-auto min-h-[320px]"
                  placeholder={`Describe the scope of work for this project. Include deliverables, milestones, and key objectives...

Example:
• Phase 1: Discovery & Planning
• Phase 2: Design & Development  
• Phase 3: Testing & Launch
• Phase 4: Training & Support`}
                />
              </div>

              {/* Project Timeline - Canvas Style */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900">Project Timeline</h3>
                    <p className="text-sm text-neutral-500 mt-1">Estimated duration based on line items</p>
                  </div>

                  {lineItems.some(i => i.description.startsWith('[')) && (
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#476E66] shadow-[0_0_8px_rgba(71,110,102,0.4)]"></div> My Tasks</div>
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"></div> Collaborator</div>
                    </div>
                  )}
                </div>

                <div className="bg-neutral-50/50 rounded-2xl p-6 md:p-8 border border-neutral-100">
                  {lineItems.filter(item => item.description.trim()).length > 0 ? (
                    <div>
                      {(() => {
                        const validItems = lineItems.filter(item => item.description.trim());
                        const computedOffsets = getComputedStartOffsets(validItems);

                        // Find the min and max days to normalize the timeline
                        const minStart = Math.min(...validItems.map(item => computedOffsets.get(item.id) || 0));
                        const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimatedDays));
                        const timelineRange = maxEnd - minStart;
                        const totalDays = maxEnd || 1;

                        // Generate day markers based on the actual range
                        const dayMarkers: number[] = [minStart + 1]; // Start from first task's start day (1-indexed)
                        const step = timelineRange > 20 ? 5 : timelineRange > 10 ? 4 : 2;
                        for (let day = minStart + step; day < maxEnd; day += step) {
                          dayMarkers.push(day + 1); // 1-indexed
                        }
                        if (dayMarkers[dayMarkers.length - 1] !== maxEnd) {
                          dayMarkers.push(maxEnd);
                        }

                        return (
                          <div className="space-y-4">
                            {/* Header with Day Markers */}
                            <div className="flex items-center text-[10px] sm:text-xs text-neutral-500 pb-2 border-b border-neutral-200/50">
                              <div className="w-32 sm:w-48 flex-shrink-0 font-medium text-neutral-400 uppercase tracking-wider">Phase / Task</div>
                              <div className="flex-1 relative h-6">
                                {dayMarkers.map((day, idx) => {
                                  const normalizedDay = day - minStart - 1; // Normalize to 0-based
                                  const position = idx === 0 ? 0 : idx === dayMarkers.length - 1 ? 100 : (normalizedDay / timelineRange) * 100;
                                  return (
                                    <div
                                      key={day}
                                      className="absolute transform -translate-x-1/2 flex flex-col items-center"
                                      style={{ left: idx === 0 ? '0%' : idx === dayMarkers.length - 1 ? '100%' : `${position}%` }}
                                    >
                                      <div className="h-1.5 w-px bg-neutral-300 mb-1"></div>
                                      <div className="font-medium whitespace-nowrap opacity-70">
                                        {idx === 0 ? 'Start' : `Day ${day}`}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Task Bars - sorted by start day */}
                            <div className="space-y-3 pt-2">
                              {[...validItems]
                                .sort((a, b) => (computedOffsets.get(a.id) || 0) - (computedOffsets.get(b.id) || 0))
                                .map((item, idx) => {
                                  const startDay = computedOffsets.get(item.id) || 0;
                                  const normalizedStart = startDay - minStart;
                                  const widthPercent = (item.estimatedDays / timelineRange) * 100;
                                  const leftPercent = (normalizedStart / timelineRange) * 100;
                                  const isCollaboratorTask = item.description.startsWith('[');
                                  const actualStartDay = startDay + 1;

                                  return (
                                    <div key={item.id} className="mb-8 group">
                                      {/* Task name above the bar */}
                                      <div className="mb-2 flex items-center gap-2">
                                        <span className="text-xs sm:text-sm text-neutral-900 font-medium">
                                          {item.description}
                                        </span>
                                        <span className="text-[10px] text-neutral-400 font-medium">
                                          Day {actualStartDay} • {item.estimatedDays} day{item.estimatedDays !== 1 ? 's' : ''}
                                        </span>
                                      </div>

                                      {/* Timeline bar */}
                                      <div className="h-4 sm:h-5 bg-neutral-200/30 rounded-full relative overflow-visible">
                                        {/* The Bar */}
                                        <div
                                          className={`absolute h-full rounded-full transition-all duration-500 ease-out group-hover:scale-y-110 group-hover:shadow-lg cursor-pointer ${isCollaboratorTask
                                            ? 'bg-amber-500 shadow-[0_2px_8px_rgba(245,158,11,0.2)]'
                                            : 'bg-neutral-900 shadow-[0_2px_8px_rgba(23,23,23,0.2)]'
                                            }`}
                                          style={{
                                            left: `${leftPercent}%`,
                                            width: `${Math.max(widthPercent, 1)}%`,
                                          }}
                                          title={`Starts Day ${actualStartDay}, Duration: ${item.estimatedDays} days`}
                                        >
                                          {/* Duration label on bar */}
                                          <div className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-semibold">
                                            {item.estimatedDays}d
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>

                            {/* Total Duration */}
                            <div className="pt-6 mt-4 border-t border-neutral-200/50 flex justify-end items-center">
                              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-neutral-200 shadow-sm">
                                <Timer className="w-4 h-4 text-neutral-400" />
                                <span className="text-xs font-medium text-neutral-500 uppercase tracking-widest">Est. Completion</span>
                                <span className="text-sm font-bold text-neutral-900">{totalDays} Days</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-center py-24">
                      <Layout className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                      <p className="text-neutral-400 font-medium">Add services in Step 1 to generate visual timeline</p>
                      <button
                        onClick={() => setCurrentStep(1)}
                        className="mt-6 text-sm text-neutral-900 font-medium hover:underline"
                      >
                        ← Back to Services
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TERMS TAB */}
          {/* TERMS - Part of Step 3 */}
          {/* STEP 3: Terms & Acceptance */}
          {currentStep === 3 && showSections.terms && (
            <div className="space-y-12">
              {/* Terms Header */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900">Terms & Conditions</h3>
                      <p className="text-sm text-neutral-500">Legal agreement and project boundries</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">Legals</span>
                </div>

                <div className="p-6">
                  <textarea
                    value={terms}
                    onChange={(e) => { setTerms(e.target.value); setHasUnsavedChanges(true); }}
                    readOnly={isLocked}
                    className="w-full h-64 text-sm text-neutral-600 bg-transparent border-none outline-none resize-none placeholder:text-neutral-300 focus:ring-0 leading-relaxed font-mono"
                    placeholder="Enter strict terms and conditions here..."
                  />
                </div>
              </div>


            </div>
          )}

          {/* STEP 4: Teaming & Partners */}
          {currentStep === 4 && (
            <div className="space-y-12">
              {/* Teaming Header */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900">Teaming & Partners</h3>
                    <p className="text-sm text-neutral-500 mt-1">Manage project partners and sub-consultants</p>
                  </div>
                  {!invitationsSent && !showAddCollaboratorModal && (
                    <button
                      onClick={() => setShowAddCollaboratorModal(true)}
                      className="flex items-center gap-2 text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" /> Add Partner
                    </button>
                  )}
                </div>

                {/* Suggested Partners (Quick Add) */}
                {!invitationsSent && !showAddCollaboratorModal && previousCollaborators.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Recent Partners</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {previousCollaborators.slice(0, 6).map((collab, idx) => {
                        const isAdded = pendingCollaborators.some(p => p.email.toLowerCase() === collab.email.toLowerCase());
                        return (
                          <button
                            key={idx}
                            disabled={isAdded}
                            onClick={() => {
                              if (isAdded) return;
                              const category = collaboratorCategories.find(c => c.id === collab.categoryId);
                              setPendingCollaborators(prev => [...prev, {
                                name: collab.name,
                                email: collab.email,
                                company: collab.company,
                                categoryId: collab.categoryId,
                                categoryName: category?.name || 'Partner',
                                deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                                message: '',
                                sharePricing: false
                              }]);
                              showToast?.(`${collab.name || collab.email} added`, 'success');
                            }}
                            className={`flex items-center gap-3 p-3 text-left border rounded-xl transition-all group ${isAdded
                              ? 'bg-green-50 border-green-200 cursor-default'
                              : 'bg-white border-neutral-100 hover:border-neutral-300 hover:shadow-sm'
                              }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-xs transition-colors ${isAdded
                              ? 'bg-green-100 text-green-600'
                              : 'bg-neutral-100 text-neutral-500 group-hover:bg-neutral-900 group-hover:text-white'
                              }`}>
                              {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className={`font-medium text-sm truncate ${isAdded ? 'text-green-900' : 'text-neutral-900'}`}>
                                {collab.name || collab.email}
                              </p>
                              <p className={`text-xs truncate ${isAdded ? 'text-green-700' : 'text-neutral-500'}`}>
                                {isAdded ? 'Added to list' : (collab.company || 'External')}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending / Active Collaborators List */}
                {pendingCollaborators.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        {invitationsSent ? 'Invited Partners' : `To Be Invited (${pendingCollaborators.length})`}
                      </h4>
                      {invitationsSent && (
                        <button
                          onClick={() => loadData()}
                          className="text-xs flex items-center gap-1 text-[#476E66] hover:text-[#3A5B54]"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                          Refresh Status
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3">
                      {pendingCollaborators.map((collab, idx) => (
                        <div key={idx} className={`group flex items-center justify-between p-4 bg-white rounded-xl transition-all border ${invitationsSent ? 'border-green-100 bg-green-50/30' : 'border-neutral-100 hover:border-neutral-200'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${invitationsSent ? 'bg-green-100 text-green-600' : 'bg-neutral-100 text-neutral-500'}`}>
                              {collab.name ? collab.name.charAt(0) : collab.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-neutral-900">{collab.name || collab.email}</p>
                                {invitationsSent && (
                                  collab.status === 'submitted' ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded uppercase tracking-wide">Submitted</span>
                                  ) : collab.status === 'accepted' ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded uppercase tracking-wide">Accepted</span>
                                  ) : collab.status === 'merged' ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded uppercase tracking-wide">Merged</span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded uppercase tracking-wide">Invited</span>
                                  )
                                )}
                              </div>
                              <div className="flex items-center flex-wrap gap-2 text-xs text-neutral-500">
                                {collab.company && <span className="font-medium text-neutral-700">{collab.company}</span>}
                                {collab.company && <span>•</span>}
                                <span>{collab.categoryName}</span>
                                {collab.email && <><span>•</span><span>{collab.email}</span></>}
                                {collab.phone && <><span>•</span><span>{collab.phone}</span></>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Review Button for Submitted/Accepted Collaborators */}
                            {invitationsSent && (collab.status === 'submitted' || collab.status === 'accepted') && (
                              <button
                                onClick={() => {
                                  // Navigate to merge URL
                                  if (collab.id) {
                                    window.location.href = `/quotes/${quoteId}/document?merge_collaboration_id=${collab.id}`;
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
                              >
                                Review & Merge
                              </button>
                            )}

                            {!invitationsSent && (
                              <button
                                onClick={() => setPendingCollaborators(prev => prev.filter((_, i) => i !== idx))}
                                className="text-neutral-400 hover:text-red-600 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State / Info */}
                {pendingCollaborators.length === 0 && !invitationsSent && !showAddCollaboratorModal && (
                  <div className="py-12 text-center border-2 border-dashed border-neutral-100 rounded-2xl hover:border-neutral-200 transition-colors">
                    <Users className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                    <p className="text-neutral-400 font-medium">No partners added yet</p>
                    <p className="text-sm text-neutral-400 mt-1 mb-6">Invite consultants to quote on specific line items</p>
                    <button
                      onClick={() => setShowAddCollaboratorModal(true)}
                      className="px-6 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition-shadow shadow-lg shadow-neutral-900/10"
                    >
                      Add First Partner
                    </button>
                  </div>
                )}

                {/* Add Partner Form (Inline Canvas) */}
                {!invitationsSent && showAddCollaboratorModal && (
                  <div className="bg-neutral-50/50 p-6 md:p-8 rounded-2xl border border-neutral-100 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="font-semibold text-neutral-900">New Partner Details</h4>
                      <button onClick={() => setShowAddCollaboratorModal(false)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Email</label>
                        <input
                          type="email"
                          value={newCollaborator.email}
                          onChange={(e) => setNewCollaborator(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full bg-white border-b-2 border-neutral-200 px-3 py-2 outline-none focus:border-neutral-900 transition-colors"
                          placeholder="partner@example.com"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Contact Name</label>
                        <input
                          type="text"
                          value={newCollaborator.name}
                          onChange={(e) => setNewCollaborator(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full bg-white border-b-2 border-neutral-200 px-3 py-2 outline-none focus:border-neutral-900 transition-colors"
                          placeholder="Jane Doe"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Company</label>
                        <input
                          type="text"
                          value={newCollaborator.company}
                          onChange={(e) => setNewCollaborator(prev => ({ ...prev, company: e.target.value }))}
                          className="w-full bg-white border-b-2 border-neutral-200 px-3 py-2 outline-none focus:border-neutral-900 transition-colors"
                          placeholder="Company Ltd."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Role / Category</label>
                        <select
                          value={newCollaborator.categoryId}
                          onChange={(e) => {
                            if (e.target.value === '__create_new__') {
                              setShowInlineCategoryForm(true);
                            } else {
                              setNewCollaborator(prev => ({ ...prev, categoryId: e.target.value }));
                            }
                          }}
                          className="w-full bg-white border-b-2 border-neutral-200 px-3 py-2 outline-none focus:border-neutral-900 transition-colors cursor-pointer"
                        >
                          <option value="">Select Role...</option>
                          {collaboratorCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                          <option value="__create_new__">+ Create New Role</option>
                        </select>
                      </div>

                      <div className="md:col-span-2 pt-2">
                        <label className="flex items-center gap-3 cursor-pointer group w-fit">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={newCollaborator.sharePricing}
                              onChange={(e) => setNewCollaborator(prev => ({ ...prev, sharePricing: e.target.checked }))}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-neutral-200 rounded-full peer-checked:bg-neutral-900 transition-colors"></div>
                            <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
                          </div>
                          <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900">Share Pricing Data</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-neutral-200/50">
                      <button
                        onClick={() => {
                          if (!newCollaborator.email || !newCollaborator.categoryId) {
                            showToast?.('Email and Category are required', 'error');
                            return;
                          }
                          const category = collaboratorCategories.find(c => c.id === newCollaborator.categoryId);
                          setPendingCollaborators(prev => [...prev, {
                            ...newCollaborator,
                            categoryName: category?.name || 'Unknown'
                          }]);
                          setShowAddCollaboratorModal(false);
                          setNewCollaborator({ name: '', email: '', company: '', categoryId: '', deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], message: '', sharePricing: false });
                          showToast?.('Partner added successfully', 'success');
                        }}
                        className="px-6 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
                      >
                        Add Partner
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions / Next Steps */}
                {/* Actions moved to Sticky Footer */}
                <div className="pt-8 border-t border-neutral-100 mt-8">
                  {invitationsSent ? (
                    <div className="bg-green-50/50 border border-green-100 rounded-xl p-6 text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
                        <Check className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-neutral-900">Invitations Sent</h3>
                      <p className="text-sm text-neutral-500 mb-6">Waiting for partner responses.</p>

                      <div className="flex justify-center gap-3">
                        <button onClick={saveAndWaitForResponses} className="px-6 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium hover:bg-neutral-50 transition-colors shadow-sm">
                          Save to Draft & Wait
                        </button>
                        <button onClick={() => setCurrentStep(5)} className="px-6 py-3 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors shadow-lg shadow-neutral-900/10">
                          Send Solely to Client
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-neutral-400 italic">
                      {pendingCollaborators.length > 0
                        ? "Click 'Send Invites & Continue' below to proceed."
                        : "Click 'Next Step' below to proceed."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Preview & Send */}
          {currentStep === 5 && (
            <div className="space-y-3 bg-neutral-100/50 -mx-4 md:-mx-8 px-4 md:px-8 py-4 min-h-screen">
              {/* Action Buttons at Top - Floating Modern Bar */}
              <div className="sticky top-2 z-40 mx-auto w-full max-w-[816px] mb-3">
                {isViewOnly && collaborationId ? (
                  /* Collaborator View Bar - Specific CTA to Respond */
                  <div className="bg-white/90 backdrop-blur-xl border border-purple-200/50 shadow-xl shadow-purple-900/5 rounded-full p-2 flex items-center justify-between gap-2">
                    <div className="px-4 text-sm font-medium text-purple-900 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                      Viewing Parent Proposal
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDownloadPdf}
                        disabled={generatingPdf}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-purple-500 hover:text-purple-900 hover:bg-purple-50 transition-all disabled:opacity-50"
                        title="Download PDF"
                      >
                        {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => {
                          const title = encodeURIComponent(quote?.title || '');
                          navigate(`/quotes/new/document?collaboration_id=${collaborationId}&parent_quote_id=${quoteId}&project_title=${title}`);
                        }}
                        className="px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-900/20 transition-all flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-500"
                      >
                        Create Response
                        <ArrowRight className="w-4 h-4 ml-0.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Owner / Editor Bar */
                  <div className="bg-white/90 backdrop-blur-xl border border-neutral-200/50 shadow-xl shadow-neutral-900/5 rounded-full p-2 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={handleDownloadPdf}
                        disabled={generatingPdf}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-all tooltip-trigger disabled:opacity-50"
                        title="Download PDF"
                      >
                        {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => setShowSaveAsTemplateModal(true)}
                        disabled={!lineItems.some(i => i.description.trim())}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Save as Template"
                      >
                        <Bookmark className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="h-6 w-px bg-neutral-200 mx-1"></div>

                    <div className="flex gap-2">
                      {/* Sent Status Badge */}
                      {quote?.status === 'sent' && (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200 mr-2">
                          <Check className="w-3 h-3" />
                          <span>Sent</span>
                        </div>
                      )}

                      <button
                        onClick={async () => {
                          if (hasUnsavedChanges) await saveChanges();
                          const url = `${window.location.origin}/proposal/preview?id=${quote?.id}`;
                          window.open(url, '_blank');
                        }}
                        disabled={saving || isNewQuote || !quote?.id}
                        className="px-5 py-2.5 rounded-full text-sm font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 hover:text-neutral-900 transition-all disabled:opacity-50 flex items-center gap-2"
                        title={isNewQuote ? "Save draft to preview" : "Preview what the client sees"}
                      >
                        <Eye className="w-4 h-4" />
                        <span className="hidden xl:inline">Client Preview</span>
                      </button>

                      <button
                        onClick={saveChanges}
                        disabled={saving || (!isCollaborationResponse && !selectedClientId && !selectedLeadId) || !lineItems.some(i => i.description.trim())}
                        className="px-5 py-2.5 rounded-full text-sm font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 hover:text-neutral-900 transition-all disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button
                        onClick={async () => {
                          // COLLABORATOR CASE: Submit response to owner
                          if (collaborationId) {
                            if (!confirm('Submit your response to the project owner?')) return;
                            await saveChanges();
                            return;
                          }

                          // STANDARD CASE: Send to client
                          if (hasUnsavedChanges || isNewQuote) {
                            await saveChanges();
                            setTimeout(() => setShowSendModal(true), 300);
                          } else {
                            setShowSendModal(true);
                          }
                        }}
                        disabled={saving || (!client?.email && !selectedLead?.email) || !lineItems.some(i => i.description.trim())}
                        className={`px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center gap-2 ${justMergedCollaborator
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-500/30 animate-pulse'
                          : 'bg-neutral-900 hover:bg-neutral-800 shadow-lg shadow-neutral-900/20'
                          }`}
                      >
                        {(hasUnsavedChanges || isNewQuote)
                          ? (collaborationId ? 'Submit Response' : 'Save & Send')
                          : quote?.status === 'sent'
                            ? 'Remind Client'
                            : (collaborationId ? 'Submit Response' : 'Send Proposal')}
                        {quote?.status === 'sent' && !hasUnsavedChanges && !isNewQuote ? <Bell className="w-4 h-4 ml-0.5" /> : <Send className="w-4 h-4 ml-0.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collaboration Status Panel - Show when viewing collaboration project */}
              {isCollaborationView && sentCollaborators.length > 0 && (
                <div className="mx-auto w-full max-w-[816px] mb-3 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <Users className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-neutral-900">Collaboration Status</h3>
                            <p className="text-xs text-neutral-500 mt-0.5">
                              {sentCollaborators.filter(c => c.status === 'submitted' || c.status === 'merged').length} of {sentCollaborators.length} partners responded
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setCurrentStep(4)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                        >
                          Manage
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Collaborators List */}
                    <div className="divide-y divide-neutral-100">
                      {sentCollaborators.map((collab, idx) => (
                        <div key={idx} className="px-5 py-3 flex items-center justify-between hover:bg-neutral-50/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${collab.status === 'submitted' || collab.status === 'merged' || collab.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : collab.status === 'accepted'
                                ? 'bg-blue-100 text-blue-700'
                                : collab.status === 'declined'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                              {(collab.company || collab.name || collab.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-neutral-900 truncate">
                                {collab.company || collab.name || collab.email.split('@')[0]}
                              </p>
                              <p className="text-xs text-neutral-500">{collab.categoryName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${collab.status === 'submitted'
                              ? 'bg-purple-100 text-purple-700'
                              : collab.status === 'merged'
                                ? 'bg-emerald-100 text-emerald-700'
                                : collab.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : collab.status === 'accepted'
                                    ? 'bg-blue-100 text-blue-700'
                                    : collab.status === 'declined'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700'
                              }`}>
                              {collab.status === 'submitted' && <FileText className="w-3 h-3" />}
                              {collab.status === 'merged' && <CheckCircle2 className="w-3 h-3" />}
                              {collab.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                              {collab.status === 'accepted' && <User className="w-3 h-3" />}
                              {collab.status === 'pending' && <Timer className="w-3 h-3" />}
                              {collab.status === 'submitted' ? 'Ready to Review'
                                : collab.status === 'merged' ? 'Merged'
                                  : collab.status === 'approved' ? 'Approved'
                                    : collab.status === 'accepted' ? 'Working on it'
                                      : collab.status === 'declined' ? 'Declined'
                                        : 'Waiting'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer Status */}
                    <div className="px-5 py-3 bg-neutral-50/80 border-t border-neutral-100">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-4">
                          {quote?.status === 'sent' ? (
                            <span className="flex items-center gap-1.5 text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sent to client
                            </span>
                          ) : quote?.status === 'pending_collaborators' ? (
                            <span className="flex items-center gap-1.5 text-amber-600">
                              <Timer className="w-3.5 h-3.5" />
                              Waiting for collaborators
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-neutral-500">
                              <FileText className="w-3.5 h-3.5" />
                              Draft
                            </span>
                          )}
                        </div>
                        {sentCollaborators.some(c => c.status === 'submitted') && (
                          <button
                            onClick={() => setCurrentStep(4)}
                            className="text-purple-600 hover:text-purple-700 font-medium"
                          >
                            Review Submissions →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Merge Success Banner - Show after successful merge */}
              {justMergedCollaborator && !isCollaborationResponse && (
                <div className="mx-auto w-full max-w-[600px] mb-3 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-4 shadow-lg relative overflow-hidden">
                    {/* Animated background decoration */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full opacity-30 -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-100 rounded-full opacity-30 -ml-12 -mb-12" />

                    <div className="relative flex items-start gap-4">
                      <button
                        onClick={() => setJustMergedCollaborator(null)}
                        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white hover:bg-purple-50 flex items-center justify-center text-purple-400 hover:text-purple-600 transition-colors shadow-sm"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-md">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <h3 className="text-base font-bold text-purple-900 mb-1">
                          Collaboration Merged Successfully!
                        </h3>
                        <p className="text-sm text-purple-700 mb-3">
                          <span className="font-semibold">{justMergedCollaborator}</span>'s items have been added to your proposal. Review the combined line items and scope below, then send to your client.
                        </p>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-white/60 px-3 py-1.5 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="font-medium">Items Merged</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-white/60 px-3 py-1.5 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="font-medium">Auto-Saved</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Send History Banner - Show when proposal has been sent */}
              {(quote?.status === 'sent' || (isCollaborationResponse && mergeCollaboration?.submitted_at)) && (
                <div className="mx-auto w-full max-w-[600px] mb-3">
                  <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {isCollaborationResponse && mergeCollaboration?.submitted_at ? (
                          // Collaborator response submitted to owner
                          <>
                            <h3 className="text-sm font-semibold text-emerald-900">Submitted to Owner</h3>
                            <p className="text-xs text-emerald-700 mt-1">
                              Sent to <span className="font-medium">{mergeCollaboration?.owner_profile?.full_name || mergeCollaboration?.owner_profile?.email || 'project owner'}</span> on{' '}
                              <span className="font-medium">
                                {new Date(mergeCollaboration.submitted_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                              {' at '}
                              <span className="font-medium">
                                {new Date(mergeCollaboration.submitted_at).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </span>
                            </p>
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                              Waiting for owner to review and merge
                            </p>
                          </>
                        ) : quote?.status === 'sent' ? (
                          // Owner proposal sent to client
                          <>
                            <h3 className="text-sm font-semibold text-emerald-900">Sent to Client</h3>
                            <p className="text-xs text-emerald-700 mt-1">
                              Sent to <span className="font-medium">{client?.email || selectedLead?.email || 'client'}</span>
                            </p>
                            {(quote.view_count ?? 0) > 0 && (
                              <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                Viewed {quote.view_count} time{quote.view_count !== 1 ? 's' : ''}
                                {quote.last_viewed_at && ` • Last viewed ${new Date(quote.last_viewed_at).toLocaleDateString()}`}
                              </p>
                            )}
                          </>
                        ) : null}
                      </div>
                      {quote?.status === 'sent' && !isCollaborationResponse && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setSendModalMode('reminder'); setShowSendModal(true); }}
                            className="px-3 py-1.5 text-xs font-medium bg-white text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-1"
                          >
                            <Bell className="w-3.5 h-3.5" />
                            Send Reminder
                          </button>
                          <button
                            onClick={() => { setSendModalMode('another_contact'); setSelectedContactId(''); setShowSendModal(true); }}
                            className="px-3 py-1.5 text-xs font-medium bg-white text-[#476E66] border border-[#476E66]/30 rounded-lg hover:bg-[#476E66]/5 transition-colors flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Send to another contact
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Retainer Payment Configuration - Sleek Floating Panel */}
              {!isViewOnly && (
                <div className="mx-auto w-full max-w-[600px] mb-3 transform transition-all duration-300">
                  <div className={`
                  overflow-hidden transition-all duration-300 border
                  ${retainerEnabled
                      ? 'bg-white/80 backdrop-blur-xl border-neutral-200/60 shadow-xl shadow-neutral-900/5 rounded-2xl'
                      : 'bg-white/40 backdrop-blur-sm border-transparent hover:bg-white/60 hover:border-neutral-200/30 rounded-full h-10 flex items-center justify-center cursor-pointer group'}
                `}
                    onClick={!retainerEnabled ? () => { setRetainerEnabled(true); setHasUnsavedChanges(true); } : undefined}
                  >
                    {/* Header Row */}
                    <div className={`
                    flex items-center justify-between transition-all duration-300
                    ${retainerEnabled ? 'px-5 py-4 border-b border-neutral-200/50' : 'px-4 w-full h-full'}
                  `}>
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-full ${retainerEnabled ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-neutral-900/5 text-neutral-400 group-hover:text-neutral-600'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className={`font-semibold text-sm ${retainerEnabled ? 'text-neutral-900' : 'text-neutral-500 group-hover:text-neutral-700'}`}>
                          {retainerEnabled ? 'Retainer Payment Required' : 'Add Retainer Payment'}
                        </span>
                      </div>

                      {retainerEnabled && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRetainerEnabled(false); setHasUnsavedChanges(true); }}
                          className="text-neutral-400 hover:text-neutral-600 focus:outline-none"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Expanded Content */}
                    {retainerEnabled && (
                      <div className="p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                          {/* Type Toggle */}
                          <div className="flex bg-neutral-100/80 p-1 rounded-lg">
                            <button
                              onClick={() => { setRetainerType('percentage'); setHasUnsavedChanges(true); }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${retainerType === 'percentage' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                            >
                              % Percentage
                            </button>
                            <button
                              onClick={() => { setRetainerType('fixed'); setHasUnsavedChanges(true); }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${retainerType === 'fixed' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                            >
                              $ Fixed
                            </button>
                          </div>

                          {/* Divider */}
                          <div className="hidden sm:block w-px h-8 bg-neutral-200/60"></div>

                          {/* Input & Output */}
                          <div className="flex items-center gap-4 flex-1 w-full sm:w-auto justify-between sm:justify-start">
                            <div className="flex items-center gap-2">
                              {retainerType === 'fixed' && <span className="text-neutral-400 font-medium">$</span>}
                              <input
                                type="number"
                                value={retainerType === 'percentage' ? retainerPercentage : retainerAmount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  if (retainerType === 'percentage') setRetainerPercentage(val);
                                  else setRetainerAmount(val);
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-20 bg-transparent border-b border-neutral-300 focus:border-[#476E66] text-center font-bold text-lg text-neutral-900 outline-none pb-1 transition-colors"
                                placeholder="0"
                              />
                              {retainerType === 'percentage' && <span className="text-neutral-400 font-medium">%</span>}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs text-neutral-400 uppercase tracking-wide">Due</span>
                              <span className="text-xl font-bold text-[#476E66]">
                                {formatCurrency(retainerType === 'percentage' ? (total * retainerPercentage / 100) : retainerAmount)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-4 text-[10px] text-neutral-400 text-center">
                          This amount will be collected via Stripe upon acceptance and credited to the final invoice.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col items-center pb-24">

                {/* 1. COVER PAGE - Standalone Visual */}
                {showSections.cover && (
                  <div className="export-page w-full max-w-[816px] mx-auto bg-white min-h-[1056px] shadow-2xl relative mb-12 last:mb-0 transform hover:scale-[1.01] transition-transform duration-500 ease-out origin-top print:shadow-none">
                    <div className="relative h-[1056px]">
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${coverBgUrl})` }}>
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80 mix-blend-multiply" />
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                      <div className="relative z-10 h-full flex flex-col text-white p-16 justify-between">
                        <div className="flex justify-between items-start">
                          <div>
                            {companyInfo.logo ? (
                              <img src={companyInfo.logo} alt={companyInfo.name} className="h-16 object-contain brightness-0 invert opacity-90" />
                            ) : (
                              <div className="text-3xl font-bold tracking-tight">{companyInfo.name}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-white/60 text-xs uppercase tracking-widest font-medium">{formatDate(quote?.created_at)}</p>
                          </div>
                        </div>

                        <div className="space-y-8 my-auto">
                          <div>
                            <p className="text-white/70 text-sm uppercase tracking-widest mb-3 pl-1 border-l-2 border-[#476E66]">Prepared For</p>
                            <h2 className="text-4xl font-light tracking-wide">{displayClientName}</h2>
                          </div>
                          <div className="w-24 h-px bg-white/30"></div>
                          <div>
                            <p className="text-white/70 text-sm uppercase tracking-widest mb-3 pl-1 border-l-2 border-white">Project</p>
                            <h1 className="text-6xl font-bold leading-tight mb-2">{projectName || documentTitle || 'PROJECT NAME'}</h1>
                            <p className="text-2xl text-white/80 font-light">{description || 'Professional Services Proposal'}</p>
                          </div>
                        </div>

                        <div className="flex items-end justify-between border-t border-white/20 pt-8">
                          <div>
                            <p className="text-white/50 text-xs uppercase tracking-widest mb-2">Total Investment</p>
                            <p className="text-4xl font-light">{formatCurrency(total)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white/50 text-xs uppercase tracking-widest mb-2">Proposal Reference</p>
                            <p className="font-mono text-lg text-white/80">{quote?.quote_number || 'DRAFT'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. LETTER SHEET */}
                {showSections.letter && (
                  <div className="export-page w-full max-w-[816px] mx-auto bg-white min-h-[1056px] shadow-2xl relative mb-12 last:mb-0 flex flex-col print:shadow-none">
                    <div className="p-12 md:p-16 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-12">
                        <div className="w-16 h-16 bg-neutral-900 text-white flex items-center justify-center text-xl font-bold">
                          {companyInfo.name?.charAt(0) || 'P'}
                        </div>
                        <div className="text-right text-xs text-neutral-500 space-y-1">
                          <p className="font-semibold text-neutral-900">{companyInfo.name}</p>
                          <p>{companyInfo.address}</p>
                          <p>{companyInfo.city}, {companyInfo.state}</p>
                          <p>{companyInfo.website}</p>
                        </div>
                      </div>

                      <div className="space-y-6 max-w-2xl flex-1">
                        <div>
                          <p className="text-neutral-500 text-sm mb-8">{formatDate(quote?.created_at)}</p>
                          <h2 className="text-2xl font-bold text-neutral-900 mb-1">Project Proposal: {documentTitle || projectName}</h2>
                          <p className="text-neutral-600">Prepared for {displayClientName}</p>
                        </div>

                        <div className="h-px bg-neutral-100 w-full my-8"></div>

                        <p className="text-neutral-900 font-medium">Dear {displayContactName?.trim().split(' ')[0] || 'Client'},</p>

                        <div className="text-neutral-700 whitespace-pre-line leading-relaxed text-lg font-light">
                          {letterContent || `Thank you for the opportunity to work together on this project. We have prepared this proposal to outline our scope of work, timeline, and fee structure.\n\nOur team is dedicated to delivering high-quality results that meet your specific needs.`}
                        </div>

                        <div className="pt-8">
                          <p className="text-neutral-900 mb-2">Sincerely,</p>
                          <div className="font-handwriting text-2xl text-neutral-800 mb-2">{profile?.full_name || 'Generic User'}</div>
                          <p className="font-semibold text-neutral-900">{profile?.full_name || companyInfo.name}</p>
                          <p className="text-sm text-neutral-500">{companyInfo.name}</p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="mt-auto pt-8 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
                        <div className="flex gap-4">
                          <span>{companyInfo.name}</span>
                          <span>|</span>
                          <span>{companyInfo.website}</span>
                        </div>
                        <div className="flex gap-4">
                          <span>Proposal #{quote?.quote_number || 'Draft'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SCOPE & TIMELINE SHEETS - Auto Paginated */}
                {(() => {
                  const hasScope = showSections.scopeOfWork && scopeOfWork;
                  const hasTimeline = showSections.timeline && lineItems.filter(item => item.description.trim()).length > 0;

                  if (!hasScope && !hasTimeline) return null;

                  // Helper to split text into pages based on visual weight (accounting for newlines)
                  // Returns array of string chunks
                  const paginateText = (text: string, maxScore: number = 3200): string[] => {
                    if (!text) return [];
                    const chunks: string[] = [];
                    let remainingText = text;

                    while (remainingText.length > 0) {
                      let currentScore = 0;
                      let splitIndex = remainingText.length;

                      // Scan through text to find cut-off point based on score
                      for (let i = 0; i < remainingText.length; i++) {
                        const char = remainingText[i];
                        // Newline = ~80 chars worth of vertical space. 
                        // Header (#) adds extra height margin.
                        let penalty = 1;
                        if (char === '\n') penalty = 60;

                        // Check for headers start
                        if ((i === 0 || remainingText[i - 1] === '\n') && char === '#') {
                          penalty = 180; // Headers need more vertical space
                        }

                        currentScore += penalty;

                        if (currentScore >= maxScore) {
                          // We crossed the limit. Now assume we need to backtrack to a safe split point.
                          // Look backwards from i for a newline or space
                          let safeBreak = -1;

                          // First try finding a newline in the last 20% of the scanned block to keep paragraphs together
                          const searchBackLimit = Math.max(0, i - 500);
                          for (let j = i; j >= searchBackLimit; j--) {
                            if (remainingText[j] === '\n') {
                              safeBreak = j;
                              break;
                            }
                          }

                          // If no newline, try space
                          if (safeBreak === -1) {
                            for (let j = i; j >= searchBackLimit; j--) {
                              if (remainingText[j] === ' ') {
                                safeBreak = j;
                                break;
                              }
                            }
                          }

                          // If still no safe break, just break at i (mid-word potentially, but better than overflow)
                          splitIndex = safeBreak !== -1 ? safeBreak : i;
                          break;
                        }
                      }

                      // Push chunk and advance
                      chunks.push(remainingText.slice(0, splitIndex + 1));
                      remainingText = remainingText.slice(splitIndex + 1); // Don't trimStart here to preserve paragraph spacing if intentionally double-spaced
                    }
                    return chunks;
                  };

                  const scopePages = hasScope ? paginateText(scopeOfWork, 3800) : [];
                  // If no scope but we have timeline, treat as 1 empty scope page to render timeline
                  if (scopePages.length === 0 && hasTimeline) scopePages.push('');

                  return scopePages.map((pageContent, idx) => {
                    const isLastPage = idx === scopePages.length - 1;

                    // improved check for remaining space on page
                    const pageScore = pageContent.split('').reduce((acc, char) => acc + (char === '\n' ? 60 : 1), 0);
                    const renderTimelineHere = hasTimeline && isLastPage && pageScore < 2000;

                    return (
                      <div key={`scope-${idx}`} className="export-page w-full max-w-[816px] mx-auto bg-white h-[1056px] overflow-hidden shadow-2xl relative mb-12 last:mb-0 flex flex-col print:shadow-none">
                        <div className="p-12 md:p-16 flex-1 flex flex-col">
                          {/* Header */}
                          <div className="flex items-center gap-4 mb-8 flex-shrink-0">
                            <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">
                              {idx === 0 ? 'Scope & Execution' : 'Scope & Execution (Cont.)'}
                            </h2>
                            <div className="h-px bg-neutral-200 flex-1"></div>
                          </div>

                          <div className="flex-1 overflow-hidden relative">
                            {/* FADE OUT for overflow if calculation fails slightly */}
                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"></div>

                            {/* Scope Content Chunk */}
                            {pageContent && (
                              <div className="mb-8">
                                {idx === 0 && <h3 className="text-lg font-semibold text-neutral-900 mb-4">Project Scope</h3>}
                                <div className="text-neutral-700">
                                  {pageContent.split('\n').map((line, lineIdx) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <div key={lineIdx} className="h-4" />; // Empty line spacer

                                    // Header 1 (#)
                                    if (trimmed.startsWith('# ')) {
                                      return (
                                        <h3 key={lineIdx} className="text-xl font-bold text-neutral-900 mt-6 mb-3 tracking-tight">
                                          {trimmed.substring(2)}
                                        </h3>
                                      );
                                    }

                                    // Header 2 (##)
                                    if (trimmed.startsWith('## ')) {
                                      return (
                                        <h4 key={lineIdx} className="text-lg font-semibold text-neutral-800 mt-4 mb-2 tracking-tight">
                                          {trimmed.substring(3)}
                                        </h4>
                                      );
                                    }

                                    // Bullet List (•, -, *)
                                    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                      const content = trimmed.substring(2);
                                      return (
                                        <div key={lineIdx} className="flex items-start gap-3 mb-2 ml-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-2 flex-shrink-0" />
                                          <span className="leading-relaxed text-neutral-600 font-light text-base">{content}</span>
                                        </div>
                                      );
                                    }

                                    // Regular Paragraph
                                    return (
                                      <p key={lineIdx} className="mb-2 leading-relaxed text-neutral-600 font-light text-base">
                                        {line}
                                      </p>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Timeline (if fitting on this page) */}
                            {renderTimelineHere && (
                              <div className="pt-8 border-t border-neutral-100">
                                <TimelineView items={lineItems.filter(item => item.description.trim())} computedOffsets={getComputedStartOffsets(lineItems.filter(item => item.description.trim()))} />
                              </div>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="mt-auto pt-8 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider flex-shrink-0">
                            <div className="flex gap-4">
                              <span>{companyInfo.name}</span>
                              <span>|</span>
                              <span>{companyInfo.website}</span>
                            </div>
                            <div className="flex gap-4">
                              <span>Proposal #{quote?.quote_number || 'Draft'}</span>
                              <span>•</span>
                              <span>Page {showSections.letter ? idx + 2 : idx + 1}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }).concat(
                    // If we have a timeline but it didn't fit on the last scope page, render it now on its own page
                    (hasTimeline && (scopePages.length === 0 || scopePages[scopePages.length - 1].split('').reduce((acc, char) => acc + (char === '\n' ? 60 : 1), 0) >= 2000)) ? [(
                      <div key="timeline-only" className="w-full max-w-[816px] mx-auto bg-white h-[1056px] overflow-hidden shadow-2xl relative mb-12 last:mb-0 flex flex-col">
                        <div className="p-12 md:p-16 flex-1 flex flex-col">
                          <div className="flex items-center gap-4 mb-8 flex-shrink-0">
                            <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Project Schedule</h2>
                            <div className="h-px bg-neutral-200 flex-1"></div>
                          </div>

                          <div className="flex-1">
                            <div className="flex-1">
                              <TimelineView items={lineItems.filter(item => item.description.trim())} computedOffsets={getComputedStartOffsets(lineItems.filter(item => item.description.trim()))} />
                            </div>
                          </div>

                          <div className="mt-auto pt-8 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
                            <div className="flex gap-4">
                              <span>{companyInfo.name}</span>
                              <span>|</span>
                              <span>{companyInfo.website}</span>
                            </div>
                            <div className="flex gap-4">
                              <span>Proposal #{quote?.quote_number || 'Draft'}</span>
                              <span>•</span>
                              <span>Page {showSections.letter ? scopePages.length + 2 : scopePages.length + 1}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )] : []
                  );
                })()}

                {/* 4. INVESTMENT SHEET */}
                <div className="export-page w-full max-w-[816px] mx-auto bg-white h-[1056px] shadow-2xl relative mb-12 last:mb-0 flex flex-col print:shadow-none overflow-hidden">
                  <div className="p-10 md:p-12 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-4 mb-6">
                      <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Investment Breakdown</h2>
                      <div className="h-px bg-neutral-200 flex-1"></div>
                    </div>

                    <div className="mb-4 flex-1 overflow-hidden">
                      <table className="w-full text-sm" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                          <tr className="border-b-2 border-neutral-900">
                            <th className="text-left py-2 font-bold text-neutral-900 uppercase tracking-wider text-xs" style={{ width: '60%' }}>Service / Deliverable</th>
                            <th className="text-center py-2 font-bold text-neutral-900 uppercase tracking-wider text-xs" style={{ width: '15%' }}>Qty</th>
                            <th className="text-right py-2 font-bold text-neutral-900 uppercase tracking-wider text-xs" style={{ width: '25%' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {lineItems.filter(i => i.description.trim()).map(item => (
                            <tr key={item.id}>
                              <td className="py-2 pr-4" style={{ verticalAlign: 'top' }}>
                                <p className="font-semibold text-neutral-900 text-sm" style={{ marginBottom: '1px' }}>{item.description}</p>
                                <p className="text-neutral-500 text-xs" style={{ margin: 0 }}>{formatCurrency(item.unitPrice)} / {item.unit}</p>
                              </td>
                              <td className="py-2 text-center text-neutral-600 text-sm" style={{ verticalAlign: 'top' }}>{item.qty}</td>
                              <td className="py-2 text-right font-medium text-neutral-900 text-sm" style={{ verticalAlign: 'top' }}>{formatCurrency(item.unitPrice * item.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="flex justify-end border-t-2 border-neutral-900 pt-4 mt-4">
                        <div className="w-56 space-y-2">
                          <div className="flex justify-between text-neutral-500 text-sm">
                            <span>Subtotal</span>
                            <span>{formatCurrency(subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-neutral-500 text-sm">
                            <span>Tax ({taxRate}%)</span>
                            <span>{formatCurrency(taxDue)}</span>
                          </div>
                          <div className="flex justify-between items-baseline pt-2 border-t border-neutral-200">
                            <span className="font-bold text-neutral-900 text-sm">Total Investment</span>
                            <span className="text-xl font-bold text-neutral-900">{formatCurrency(total)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Retainer Inline */}
                      {retainerEnabled && (
                        <div className="mt-4 bg-neutral-50 border border-neutral-200 p-3 flex items-center justify-between rounded-none border-l-4 border-l-neutral-900">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-bold text-neutral-900 text-sm">Retainer Required</p>
                              <p className="text-xs text-neutral-500">Due upon acceptance</p>
                            </div>
                          </div>
                          <span className="font-bold text-neutral-900">
                            {formatCurrency(retainerType === 'percentage' ? (total * retainerPercentage / 100) : retainerAmount)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="mt-auto pt-4 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider flex-shrink-0">
                      <div className="flex gap-4">
                        <span>{companyInfo.name}</span>
                        <span>|</span>
                        <span>{companyInfo.website}</span>
                      </div>
                      <div className="flex gap-4">
                        <span>Proposal #{quote?.quote_number || 'Draft'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. TERMS & SIGNATURE SHEET */}
                {showSections.terms && (
                  <div className="export-page w-full max-w-[816px] mx-auto bg-white min-h-[1056px] shadow-2xl relative mb-12 last:mb-0 flex flex-col print:shadow-none">
                    <div className="p-12 md:p-16 flex-1 flex flex-col">
                      <div className="flex items-center gap-4 mb-8">
                        <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Terms & Acceptance</h2>
                        <div className="h-px bg-neutral-200 flex-1"></div>
                      </div>

                      {terms && (
                        <div className="mb-12 flex-1">
                          <div className="text-neutral-600 text-xs leading-relaxed text-justify columns-1 md:columns-2 gap-8 whitespace-pre-line">
                            {terms}
                          </div>
                        </div>
                      )}

                      <div className="mt-auto pt-16">
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-8">Authorization</h3>
                        <p className="text-sm text-neutral-600 mb-12 max-w-2xl">
                          By signing below, the Client agrees to the terms outlined in this proposal along with the payment schedule, and authorizes {companyInfo.name} to proceed with the scope of work defined within.
                        </p>

                        <div className="grid grid-cols-2 gap-x-16 gap-y-12">
                          {/* Signature Line */}
                          <div className="relative group">
                            <div className="absolute bottom-2 left-0 text-neutral-900 font-serif text-3xl opacity-10 select-none">X</div>
                            <div className="border-b border-neutral-400 h-12 w-full"></div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-2">Signature</p>
                          </div>

                          {/* Print Name Line */}
                          <div>
                            <div className="border-b border-neutral-400 h-12 w-full flex items-end pb-1">
                              <span className="font-medium text-neutral-900">{signatureName}</span>
                            </div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-2">Printed Name</p>
                          </div>

                          {/* Title Line */}
                          <div>
                            <div className="border-b border-neutral-400 h-8 w-full"></div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-2">Title</p>
                          </div>

                          {/* Date Line */}
                          <div>
                            <div className="border-b border-neutral-400 h-8 w-full"></div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-2">Date</p>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="mt-16 pt-8 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
                        <div className="flex gap-4">
                          <span>{companyInfo.name}</span>
                          <span>|</span>
                          <span>{companyInfo.website}</span>
                        </div>
                        <div className="flex gap-4">
                          <span>Proposal #{quote?.quote_number || 'Draft'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Keep old sections for export preview - hidden in tab view */}
          <div className="hidden">
            {/* SCOPE OF WORK & TIMELINE PAGE (for export) */}
            {(showSections.scopeOfWork || showSections.timeline) && (
              <div className="bg-white shadow-xl rounded-lg overflow-hidden p-8">
                <h2 className="text-2xl font-bold text-neutral-900 mb-6">Scope of Work & Project Timeline</h2>

                {/* Scope of Work */}
                {showSections.scopeOfWork && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Scope of Work</h3>
                    <div className="border border-neutral-200 rounded-lg">
                      <textarea
                        value={scopeOfWork}
                        onChange={(e) => { setScopeOfWork(e.target.value); setHasUnsavedChanges(true); }}
                        readOnly={isLocked}
                        className="w-full h-48 p-4 text-sm text-neutral-700 rounded-lg resize-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                        placeholder="Describe the scope of work for this project. Include deliverables, milestones, and key objectives..."
                      />
                    </div>
                  </div>
                )}

                {/* Project Timeline / Gantt Chart */}
                {showSections.timeline && lineItems.filter(item => item.description.trim()).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Project Timeline</h3>
                    <div className="border border-neutral-200 rounded-lg p-4">
                      {(() => {
                        const validItems = lineItems.filter(item => item.description.trim());
                        const computedOffsets = getComputedStartOffsets(validItems);

                        // Find the min and max days to normalize the timeline
                        const minStart = Math.min(...validItems.map(item => computedOffsets.get(item.id) || 0));
                        const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimatedDays));
                        const timelineRange = maxEnd - minStart;
                        const totalDays = maxEnd || 1;

                        // Generate day markers based on the actual range
                        const dayMarkers: number[] = [minStart + 1];
                        const step = timelineRange > 20 ? 5 : timelineRange > 10 ? 4 : 2;
                        for (let day = minStart + step; day < maxEnd; day += step) {
                          dayMarkers.push(day + 1);
                        }
                        if (dayMarkers[dayMarkers.length - 1] !== maxEnd) {
                          dayMarkers.push(maxEnd);
                        }

                        return (
                          <div className="space-y-2">
                            {/* Header with Day Markers */}
                            <div className="flex items-center text-xs text-neutral-500 pb-2 border-b border-neutral-200">
                              <div className="w-48 flex-shrink-0 font-semibold text-neutral-700">Task</div>
                              <div className="flex-1 relative h-4">
                                {dayMarkers.map((day, idx) => {
                                  const normalizedDay = day - minStart - 1;
                                  const position = idx === 0 ? 0 : idx === dayMarkers.length - 1 ? 100 : (normalizedDay / timelineRange) * 100;
                                  return (
                                    <div
                                      key={day}
                                      className="absolute transform -translate-x-1/2 text-[10px] font-medium"
                                      style={{ left: idx === 0 ? '0%' : idx === dayMarkers.length - 1 ? '100%' : `${position}%` }}
                                    >
                                      {idx === 0 ? 'Start' : `Day ${day}`}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Timeline bars - sorted by start day */}
                            {[...validItems]
                              .sort((a, b) => (computedOffsets.get(a.id) || 0) - (computedOffsets.get(b.id) || 0))
                              .map((item, idx) => {
                                const startDay = computedOffsets.get(item.id) || 0;
                                const normalizedStart = startDay - minStart;
                                const widthPercent = (item.estimatedDays / timelineRange) * 100;
                                const leftPercent = (normalizedStart / timelineRange) * 100;
                                const actualStartDay = startDay + 1;
                                const isCollaboratorTask = item.description.startsWith('[');
                                return (
                                  <div key={item.id} className="flex items-center gap-2 py-1">
                                    <div className="w-32 flex-shrink-0 text-xs text-neutral-700 truncate" title={item.description}>
                                      {item.description.length > 20 ? item.description.substring(0, 20) + '...' : item.description}
                                    </div>
                                    <div className="flex-1 h-6 bg-neutral-100 rounded-full relative">
                                      <div
                                        className={`absolute h-full rounded-full flex items-center justify-center text-white text-[10px] font-medium ${isCollaboratorTask ? 'bg-amber-500' : 'bg-[#476E66]'}`}
                                        style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 8)}%`, minWidth: '40px' }}
                                        title={`Starts Day ${actualStartDay}, Duration: ${item.estimatedDays} days`}
                                      >
                                        {item.estimatedDays}d
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                            {/* Summary */}
                            <div className="pt-2 mt-1 border-t border-neutral-200 text-sm text-neutral-600 flex justify-between items-center">
                              <span className="font-medium">Total Duration:</span>
                              <span className="font-semibold text-neutral-900 bg-[#476E66]/10 px-2 py-1 rounded">{totalDays} day{totalDays > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DETAILS PAGE */}
            {showSections.quoteDetails && (
              <div className="bg-white shadow-xl rounded-lg overflow-hidden">
                {/* Header */}
                <div className="p-8 border-b border-neutral-200">
                  <div className="flex justify-between">
                    <div className="flex gap-6">
                      {companyInfo.logo ? (
                        <img src={companyInfo.logo} alt={companyInfo.name} className="w-16 h-16 object-contain rounded-xl bg-neutral-100" />
                      ) : (
                        <div className="w-16 h-16 bg-neutral-100 rounded-xl flex items-center justify-center text-2xl font-bold text-neutral-700">
                          {companyInfo.name?.charAt(0) || 'C'}
                        </div>
                      )}
                      <div>
                        <h2 className="text-2xl font-bold text-neutral-900">{companyInfo.name}</h2>
                        <p className="text-neutral-600">{companyInfo.address}</p>
                        <p className="text-neutral-600">{companyInfo.city}, {companyInfo.state} {companyInfo.zip}</p>
                        <p className="text-neutral-500 text-sm mt-1">{companyInfo.website} | {companyInfo.phone}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm">
                        <table className="text-left">
                          <tbody>
                            <tr>
                              <td className="pr-4 py-1 text-neutral-500">DATE:</td>
                              <td className="font-medium text-neutral-900">{formatDate(quote?.created_at)}</td>
                            </tr>
                            <tr>
                              <td className="pr-4 py-1 text-neutral-500">QUOTE #:</td>
                              <td className="font-medium text-neutral-900">{quote?.quote_number || 'New'}</td>
                            </tr>
                            <tr>
                              <td className="pr-4 py-1 text-neutral-500">VALID UNTIL:</td>
                              <td>
                                <input
                                  type="date"
                                  value={validUntil}
                                  onChange={(e) => { setValidUntil(e.target.value); setHasUnsavedChanges(true); }}
                                  className="font-medium text-neutral-900 bg-transparent border-none outline-none"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quote Title & Description */}
                <div className="px-8 py-4 border-b border-neutral-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Quote Title *</label>
                      <input
                        type="text"
                        value={documentTitle}
                        onChange={(e) => {
                          setDocumentTitle(e.target.value);
                          setProjectName(e.target.value); // Keep in sync
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                        placeholder="Enter project name (e.g., Website Redesign)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => { setDescription(e.target.value); setHasUnsavedChanges(true); }}
                        readOnly={isLocked}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                        placeholder="Brief description..."
                      />
                    </div>
                  </div>
                </div>

                {/* Recipient Section - Client OR Lead */}
                <div className="px-8 py-6">
                  <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-4">Send To</h3>
                  <div className="bg-white rounded-2xl border border-neutral-100 p-5 shadow-sm">
                    {/* Onboarding hint for new quotes */}
                    {isNewQuote && !recipientType && (
                      <p className="text-neutral-400 text-sm mb-3 italic">② Select a client or lead to send this proposal to</p>
                    )}

                    <div className="space-y-4 print:hidden">
                      {/* Client Dropdown */}
                      <div className={`transition-opacity ${recipientType === 'lead' ? 'opacity-40' : ''}`}>
                        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Client</label>
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedClientId}
                            onChange={(e) => {
                              setSelectedClientId(e.target.value);
                              if (e.target.value) {
                                const foundClient = clients.find(c => c.id === e.target.value);
                                if (foundClient) {
                                  setClient(foundClient);
                                  // Don't auto-fill title - let user enter project name
                                }
                                setSelectedLeadId('');
                                setSelectedLead(null);
                                setRecipientType('client');
                              }
                              setHasUnsavedChanges(true);
                            }}
                            disabled={recipientType === 'lead'}
                            className={`flex-1 px-3 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none text-sm ${recipientType === 'lead' ? 'bg-neutral-100 cursor-not-allowed' : ''}`}
                          >
                            <option value="">Select a client...</option>
                            {clients.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowNewClientModal(true)}
                            disabled={recipientType === 'lead'}
                            className={`px-3 py-2.5 text-sm border border-neutral-200 rounded-lg ${recipientType === 'lead' ? 'opacity-40 cursor-not-allowed' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'}`}
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* OR Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-neutral-200" />
                        <span className="text-xs font-medium text-neutral-400 uppercase">or</span>
                        <div className="flex-1 h-px bg-neutral-200" />
                      </div>

                      {/* Lead Dropdown */}
                      <div className={`transition-opacity ${recipientType === 'client' ? 'opacity-40' : ''}`}>
                        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Lead</label>
                        <select
                          value={selectedLeadId}
                          onChange={(e) => {
                            setSelectedLeadId(e.target.value);
                            if (e.target.value) {
                              const foundLead = leads.find(l => l.id === e.target.value);
                              if (foundLead) {
                                setSelectedLead(foundLead);
                                // Don't auto-fill title - let user enter project name
                              }
                              setSelectedClientId('');
                              setClient(null);
                              setRecipientType('lead');
                            }
                            setHasUnsavedChanges(true);
                          }}
                          disabled={recipientType === 'client'}
                          className={`w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none text-sm ${recipientType === 'client' ? 'bg-neutral-100 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select a lead...</option>
                          {leads.map(l => (
                            <option key={l.id} value={l.id}>{l.name}{l.company_name ? ` (${l.company_name})` : ''}</option>
                          ))}
                        </select>
                      </div>

                      {/* Clear Selection Button */}
                      {recipientType && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClientId('');
                            setSelectedLeadId('');
                            setClient(null);
                            setSelectedLead(null);
                            setRecipientType(null);
                            setHasUnsavedChanges(true);
                          }}
                          className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                    {client && (
                      <div className="space-y-3">
                        {/* Company Info */}
                        <div>
                          <p className="font-semibold text-neutral-900">{client.name}</p>
                          {client.display_name && client.display_name !== client.name && (
                            <p className="text-neutral-600 text-sm">{client.display_name}</p>
                          )}
                          {(client.address || client.city || client.state || client.zip) && (
                            <p className="text-neutral-500 text-sm">
                              {[client.address, client.city, client.state, client.zip].filter(Boolean).join(', ')}
                            </p>
                          )}
                          {client.website && (
                            <p className="text-neutral-500 text-sm">{client.website}</p>
                          )}
                          {client.phone && <p className="text-neutral-500 text-sm">{client.phone}</p>}
                        </div>

                        {/* Primary Contact */}
                        {client.primary_contact_name && (
                          <div className="border-t border-neutral-100 pt-2">
                            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Primary Contact</p>
                            <p className="text-sm font-medium text-neutral-800">{client.primary_contact_name}</p>
                            {client.primary_contact_title && (
                              <p className="text-xs text-neutral-500">{client.primary_contact_title}</p>
                            )}
                            {client.primary_contact_email && (
                              <p className="text-sm text-neutral-600">{client.primary_contact_email}</p>
                            )}
                            {client.primary_contact_phone && (
                              <p className="text-sm text-neutral-600">{client.primary_contact_phone}</p>
                            )}
                          </div>
                        )}

                        {/* Billing Contact */}
                        {client.billing_contact_name && (
                          <div className="border-t border-neutral-100 pt-2">
                            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Billing Contact</p>
                            <p className="text-sm font-medium text-neutral-800">{client.billing_contact_name}</p>
                            {client.billing_contact_title && (
                              <p className="text-xs text-neutral-500">{client.billing_contact_title}</p>
                            )}
                            {client.billing_contact_email && (
                              <p className="text-sm text-neutral-600">{client.billing_contact_email}</p>
                            )}
                            {client.billing_contact_phone && (
                              <p className="text-sm text-neutral-600">{client.billing_contact_phone}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Lead Info Display */}
                    {selectedLead && recipientType === 'lead' && (
                      <div className="space-y-3 mt-4 pt-4 border-t border-neutral-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-500 rounded-full">Lead</span>
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900">{selectedLead.company_name || selectedLead.name}</p>
                          {selectedLead.company_name && selectedLead.name && (
                            <p className="text-neutral-600 text-sm">{selectedLead.name}</p>
                          )}
                          {selectedLead.email && <p className="text-neutral-500 text-sm">{selectedLead.email}</p>}
                          {selectedLead.phone && <p className="text-neutral-500 text-sm">{selectedLead.phone}</p>}
                        </div>
                        {selectedLead.notes && (
                          <div className="border-t border-neutral-100 pt-2">
                            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Notes</p>
                            <p className="text-sm text-neutral-600">{selectedLead.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!client && !selectedLead && !isNewQuote && <p className="text-neutral-400 text-sm italic">No recipient selected</p>}
                  </div>
                </div>

                {/* Line Items - Mobile Card / Desktop Table Layout */}
                <div className="px-4 sm:px-8 py-6">
                  <div className="flex items-center justify-between mb-4 sticky top-0 bg-white z-10 py-2 -mt-2">
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">Line Items</h3>
                    {isNewQuote && recipientType && lineItems.every(item => !item.description.trim()) && (
                      <span className="text-neutral-400 text-sm italic">③ Add your services</span>
                    )}
                  </div>

                  {/* Mobile Card Layout */}
                  <div className="block lg:hidden space-y-4">
                    {lineItems.map((item, idx) => (
                      <div key={item.id} className="bg-white rounded-2xl border border-neutral-100 p-5 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs font-medium text-neutral-400 uppercase">Item {idx + 1}</span>
                          {lineItems.length > 1 && (
                            <button
                              onClick={() => removeLineItem(item.id)}
                              className="p-2 -m-2 text-red-500 hover:bg-red-50 rounded-lg print:hidden"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs text-neutral-500 mb-1">Description</label>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                              className="w-full px-3 py-3 border border-neutral-200 rounded-lg text-neutral-900 text-base"
                              placeholder="Item description..."
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-neutral-500 mb-1">Unit Price</label>
                              <input
                                type="number"
                                value={item.unitPrice || ''}
                                onChange={(e) => updateLineItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-3 border border-neutral-200 rounded-lg text-neutral-900 text-base"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-neutral-500 mb-1">Quantity</label>
                              <input
                                type="number"
                                value={item.qty || ''}
                                onChange={(e) => updateLineItem(item.id, { qty: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-3 border border-neutral-200 rounded-lg text-neutral-900 text-base"
                                min="1"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-neutral-500 mb-1">Unit</label>
                              <select
                                value={item.unit}
                                onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                                className="w-full px-3 py-3 border border-neutral-200 rounded-lg text-neutral-900 text-base bg-white"
                              >
                                <option value="each">each</option>
                                <option value="hour">hour</option>
                                <option value="day">day</option>
                                <option value="week">week</option>
                                <option value="month">month</option>
                                <option value="sq ft">sq ft</option>
                                <option value="project">project</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-neutral-500 mb-1">Est. Days</label>
                              <input
                                type="number"
                                value={item.estimatedDays || ''}
                                onChange={(e) => updateLineItem(item.id, { estimatedDays: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-3 border border-neutral-200 rounded-lg text-neutral-900 text-base"
                                min="1"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                            <label className="flex items-center gap-3 py-2">
                              <input
                                type="checkbox"
                                checked={item.taxed}
                                onChange={(e) => updateLineItem(item.id, { taxed: e.target.checked })}
                                className="w-5 h-5 rounded border-neutral-300"
                              />
                              <span className="text-sm text-neutral-600">Taxable</span>
                            </label>
                            <div className="text-right">
                              <span className="text-xs text-neutral-500">Amount</span>
                              <p className="text-lg font-semibold text-neutral-900">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.unitPrice * item.qty)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Mobile Add Buttons */}
                    <div className="flex flex-wrap gap-3 print:hidden">
                      <button
                        onClick={addLineItem}
                        className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-xl min-h-[44px]"
                      >
                        <Plus className="w-5 h-5" />
                        Add Item
                      </button>
                      {services.length > 0 ? (
                        <button
                          onClick={() => setShowServicesModal(true)}
                          className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-xl min-h-[44px]"
                        >
                          <Package className="w-5 h-5" />
                          From Services
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate('/settings?tab=services')}
                          className="flex items-center gap-2 px-4 py-3 text-sm text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-xl min-h-[44px]"
                        >
                          <Package className="w-5 h-5" />
                          Add Your Services
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden lg:block bg-white rounded-2xl border border-neutral-100 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-50/70 border-b border-neutral-100">
                          <th className="text-left px-5 py-3.5 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Description</th>
                          <th className="text-right px-4 py-3.5 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-24">Unit Price</th>
                          <th className="text-center px-4 py-3.5 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-20">Unit</th>
                          <th className="text-center px-4 py-3.5 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-14">Qty</th>
                          <th className="text-center px-4 py-3.5 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-14">Tax</th>
                          <th className="text-center px-2 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-12">Days</th>
                          <th className="text-center px-2 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-28">Scheduling</th>
                          <th className="text-right px-5 py-3.5 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-24">Amount</th>
                          <th className="w-10 print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {lineItems.map((item) => (
                          <tr key={item.id} className="group hover:bg-neutral-50">
                            <td className="px-5 py-3">
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                className="w-full bg-transparent outline-none text-neutral-900"
                                placeholder="Item description..."
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => updateLineItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                className="w-full text-right bg-transparent outline-none text-neutral-900"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <select
                                value={item.unit}
                                onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                                className="w-full text-center bg-transparent outline-none text-neutral-900 text-xs"
                              >
                                <option value="each">each</option>
                                <option value="hour">hour</option>
                                <option value="day">day</option>
                                <option value="sq ft">sq ft</option>
                                <option value="linear ft">linear ft</option>
                                <option value="project">project</option>
                                <option value="lump sum">lump sum</option>
                                <option value="month">month</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                value={item.qty}
                                onChange={(e) => updateLineItem(item.id, { qty: parseInt(e.target.value) || 1 })}
                                className="w-full text-center bg-transparent outline-none text-neutral-900"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.taxed}
                                onChange={(e) => updateLineItem(item.id, { taxed: e.target.checked })}
                                className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                              />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <input
                                type="number"
                                value={item.estimatedDays}
                                onChange={(e) => updateLineItem(item.id, { estimatedDays: parseInt(e.target.value) || 1 })}
                                className="w-10 text-center bg-transparent outline-none text-neutral-900 text-xs"
                                min="1"
                                title="Estimated days to complete"
                              />
                            </td>
                            <td className="px-1 py-2 text-center">
                              {(() => {
                                // Find items that would NOT create a circular dependency
                                const wouldCreateCycle = (depId: string): boolean => {
                                  const visited = new Set<string>();
                                  let current = depId;
                                  while (current) {
                                    if (current === item.id) return true;
                                    if (visited.has(current)) return false;
                                    visited.add(current);
                                    const dep = lineItems.find(i => i.id === current);
                                    current = dep?.dependsOn || '';
                                  }
                                  return false;
                                };
                                const availableDeps = lineItems.filter(other =>
                                  other.id !== item.id &&
                                  other.description.trim() &&
                                  !wouldCreateCycle(other.id)
                                );
                                return (
                                  <>
                                    <select
                                      value={item.startType === 'parallel' ? 'parallel' : `${item.startType}:${item.dependsOn}`}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'parallel') {
                                          updateLineItem(item.id, { startType: 'parallel', dependsOn: '', overlapDays: 0 });
                                        } else {
                                          const [type, depId] = val.split(':');
                                          const depItem = lineItems.find(i => i.id === depId);
                                          updateLineItem(item.id, {
                                            startType: type as 'sequential' | 'overlap',
                                            dependsOn: depId,
                                            overlapDays: type === 'overlap' ? Math.ceil((depItem?.estimatedDays || 2) / 2) : 0
                                          });
                                        }
                                      }}
                                      className="w-full text-center bg-transparent outline-none text-neutral-900 text-[10px]"
                                    >
                                      <option value="parallel">Day 1</option>
                                      {availableDeps.map(other => (
                                        <optgroup key={other.id} label={other.description.substring(0, 20)}>
                                          <option value={`sequential:${other.id}`}>After "{other.description.substring(0, 15)}"</option>
                                          <option value={`overlap:${other.id}`}>Overlaps "{other.description.substring(0, 12)}"</option>
                                        </optgroup>
                                      ))}
                                    </select>
                                    {item.startType === 'overlap' && item.dependsOn && (
                                      <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px] text-neutral-500">
                                        <span>+</span>
                                        <input
                                          type="number"
                                          value={item.overlapDays}
                                          onChange={(e) => updateLineItem(item.id, { overlapDays: Math.max(0, parseInt(e.target.value) || 0) })}
                                          className="w-8 text-center bg-neutral-100 rounded px-0.5 py-0.5"
                                          min="0"
                                          step="1"
                                        />
                                        <span>d</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-neutral-900">
                              {formatCurrency(item.unitPrice * item.qty)}
                            </td>
                            <td className="px-2 py-3 print:hidden">
                              <button
                                onClick={() => removeLineItem(item.id)}
                                className="p-1 text-neutral-300 hover:text-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Add Line Item Buttons - Desktop */}
                    <div className="px-5 py-3 border-t border-neutral-100 print:hidden flex gap-4">
                      <button
                        onClick={addLineItem}
                        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 min-h-[44px]"
                      >
                        <Plus className="w-4 h-4" />
                        Add Item
                      </button>
                      {services.length > 0 ? (
                        <button
                          onClick={() => setShowServicesModal(true)}
                          className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 min-h-[44px]"
                        >
                          <Package className="w-4 h-4" />
                          From Services
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate('/settings?tab=services')}
                          className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 min-h-[44px]"
                        >
                          <Package className="w-4 h-4" />
                          Add Your Services
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="px-8 py-4 flex justify-end">
                  <div className="w-72">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">Subtotal:</span>
                        <span className="font-medium text-neutral-900">{formatCurrency(subtotal)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">Taxable Amount:</span>
                        <span className="text-neutral-900">{formatCurrency(taxableAmount)}</span>
                      </div>
                      <div className="flex justify-between py-1 items-center">
                        <span className="text-neutral-600">Tax Rate:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={taxRate}
                            onChange={(e) => { setTaxRate(parseFloat(e.target.value) || 0); setHasUnsavedChanges(true); }}
                            disabled={isLocked}
                            className="w-16 text-right bg-transparent border-b border-neutral-200 outline-none focus:border-neutral-500 print:border-none text-neutral-900"
                            step="0.01"
                          />
                          <span className="text-neutral-900">%</span>
                        </div>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">Tax Due:</span>
                        <span className="text-neutral-900">{formatCurrency(taxDue)}</span>
                      </div>
                      <div className="flex justify-between py-1 items-center">
                        <span className="text-neutral-600">Other:</span>
                        <input
                          type="number"
                          value={otherCharges}
                          onChange={(e) => { setOtherCharges(parseFloat(e.target.value) || 0); setHasUnsavedChanges(true); }}
                          className="w-24 text-right bg-transparent border-b border-neutral-200 outline-none focus:border-neutral-500 print:border-none text-neutral-900"
                        />
                      </div>
                      <div className="flex justify-between py-2 border-t-2 border-neutral-900 mt-2">
                        <span className="text-lg font-bold text-neutral-900">TOTAL:</span>
                        <span className="text-lg font-bold text-neutral-900">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terms and Conditions */}
                {showSections.terms && (
                  <>
                    <div className="px-8 py-4">
                      <h3 className="font-bold text-neutral-900 mb-2">TERMS AND CONDITIONS</h3>
                      <textarea
                        value={terms}
                        onChange={(e) => { setTerms(e.target.value); setHasUnsavedChanges(true); }}
                        readOnly={isLocked}
                        className="w-full h-32 p-3 text-sm text-neutral-700 border border-neutral-200 rounded-lg resize-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none print:border-none print:resize-none"
                      />
                    </div>

                    {/* Signature Section */}
                    <div className="px-8 py-6 border-t border-neutral-200 mt-4">
                      <h3 className="font-bold text-neutral-900 mb-4">Customer Acceptance (sign below):</h3>
                      <div className="grid grid-cols-2 gap-8">
                        <div>
                          <div className="border-b-2 border-neutral-900 pb-1 mb-2">
                            <span className="text-2xl font-serif">X</span>
                            <span className="ml-4 text-neutral-400">___________________________</span>
                          </div>
                          <p className="text-sm text-neutral-500">Signature</p>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            placeholder="Print Name"
                            className="w-full border-b-2 border-neutral-900 pb-1 mb-2 bg-transparent outline-none focus:border-neutral-600 print:border-neutral-900 text-neutral-900"
                          />
                          <p className="text-sm text-neutral-500">Print Name</p>
                        </div>
                      </div>

                      {/* Request Revisions */}
                      <div className="mt-6 print:hidden">
                        {!showRevisionForm ? (
                          <button
                            onClick={() => setShowRevisionForm(true)}
                            className="text-neutral-700 hover:text-neutral-900 text-sm font-medium"
                          >
                            Request Revisions
                          </button>
                        ) : (
                          <div className="bg-neutral-50 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-neutral-900">Request Revisions</h4>
                              <button onClick={() => setShowRevisionForm(false)} className="text-neutral-400 hover:text-neutral-600">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <textarea
                              value={revisionComments}
                              onChange={(e) => setRevisionComments(e.target.value)}
                              placeholder="Enter your comments or requested changes..."
                              className="w-full h-24 p-3 text-sm border border-neutral-200 rounded-lg resize-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                            />
                            <button className="mt-2 px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-sm font-medium">
                              Submit Revision Request
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

              </div>
            )}

            {/* ADDITIONAL OFFERINGS PAGE - Separate Section */}
            {showSections.additionalOfferings && services.length > 0 && (
              <div className="bg-white shadow-xl rounded-lg overflow-hidden">
                <div className="p-8">
                  <h2 className="text-2xl font-bold text-neutral-900 mb-2">Additional Offerings</h2>
                  <p className="text-neutral-600 mb-6">Explore our complete range of professional services:</p>

                  {/* Services Table */}
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                          <th className="text-left px-6 py-3 font-semibold text-neutral-900">Service / Product</th>
                          <th className="text-right px-6 py-3 font-semibold text-neutral-900 w-40">Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {services.map((service) => (
                          <tr key={service.id} className="hover:bg-neutral-50">
                            <td className="px-6 py-4">
                              <p className="font-medium text-neutral-900">{service.name}</p>
                              {service.description && (
                                <p className="text-sm text-neutral-500 mt-0.5">{service.description}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {service.pricing_type === 'per_sqft' && service.min_rate && service.max_rate ? (
                                <span className="text-neutral-900">${service.min_rate} - ${service.max_rate}</span>
                              ) : service.base_rate ? (
                                <span className="text-neutral-900">${service.base_rate}</span>
                              ) : (
                                <span className="text-neutral-500">Contact us</span>
                              )}
                              {service.unit_label && (
                                <p className="text-xs text-neutral-500">per {service.unit_label}</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Thank You Footer */}
                <div className="px-8 py-6 border-t border-neutral-200 text-center">
                  <p className="text-neutral-600">{companyInfo.phone} | {companyInfo.website}</p>
                  <p className="text-lg font-semibold text-neutral-900 mt-2">Thank you and looking forward to doing business with you again!</p>
                </div>
              </div>
            )}
          </div>{/* End hidden div for export sections */}

        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:resize-none { resize: none !important; }
          .print\\:cursor-default { cursor: default !important; }
          .export-page { page-break-after: always; }
          .export-page:last-child { page-break-after: avoid; }
        }
      `}</style>

      {/* Export Preview Modal - Shows All Enabled Sections */}
      {
        showExportPreview && (() => {
          // Calculate total pages and page numbers
          const visiblePages: string[] = [];
          if (showSections.cover) visiblePages.push('cover');
          if (showSections.letter) visiblePages.push('letter');
          if (showSections.scopeOfWork || showSections.timeline) visiblePages.push('scope');
          if (showSections.quoteDetails) visiblePages.push('details');
          if (showSections.additionalOfferings && services.length > 0) visiblePages.push('offerings');
          const totalPages = visiblePages.length;

          const PageFooter = ({ pageNum }: { pageNum: number }) => (
            <div className="absolute bottom-0 left-0 right-0 px-8 py-4 border-t border-neutral-200 bg-white">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <div className="flex items-center gap-4">
                  <span className="font-medium">Proposal #{quote?.quote_number || 'Draft'}</span>
                  <span>|</span>
                  <span>{projectName || documentTitle}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>{displayClientName}</span>
                  <span>|</span>
                  <span className="font-medium">Page {pageNum} of {totalPages}</span>
                </div>
              </div>
            </div>
          );

          return (
            <div className="fixed inset-0 bg-black/80 z-50 overflow-auto print:bg-white print:overflow-visible">
              {/* Toolbar - Fixed on mobile for easy access */}
              <div className="sticky top-0 bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between print:hidden z-50">
                <button
                  onClick={() => setShowExportPreview(false)}
                  className="flex items-center gap-2 px-3 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg min-h-[44px]"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="hidden sm:inline">Back</span>
                </button>
                <h2 className="font-semibold text-neutral-900 text-sm sm:text-base">Preview</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark min-h-[44px]"
                    title="Use browser's print dialog (Ctrl/Cmd+P) for exact preview match"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Print to PDF</span>
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={generatingPdf}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 min-h-[44px] disabled:opacity-50"
                  >
                    {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="hidden sm:inline">{generatingPdf ? 'Export' : 'Download'}</span>
                  </button>
                </div>
              </div>

              <div className="py-8 flex flex-col items-center gap-8 print:p-0 print:gap-0">

                {/* Cover Page */}
                {showSections.cover && (
                  <div className="old-export-page w-[850px] bg-white shadow-xl print:shadow-none print:w-full" style={{ minHeight: '1100px', aspectRatio: '8.5/11' }}>
                    <div className="relative h-full">
                      {/* Background Image & Overlay */}
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${coverBgUrl})` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-900/90 via-zinc-900/40 to-black/60" />
                      </div>

                      {/* Content Container */}
                      <div className="relative z-10 h-full flex flex-col text-white p-14">

                        {/* TOP HEADER */}
                        <div className="flex justify-between items-start">
                          <div>
                            {companyInfo.logo ? (
                              <img src={companyInfo.logo} alt={companyInfo.name} className="h-16 w-auto object-contain brightness-0 invert" />
                            ) : (
                              <div className="text-7xl font-light tracking-tighter leading-none opacity-90">
                                P
                              </div>
                            )}
                          </div>

                          <div className="text-sm font-medium tracking-wider opacity-80 pt-2">
                            {formatDate(quote?.created_at || new Date().toISOString())}
                          </div>
                        </div>

                        {/* MAIN CONTENT AREA */}
                        <div className="flex-1 flex flex-col justify-center pl-2">

                          {/* Client Name Section */}
                          <div className="mb-10">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-0.5 h-3 bg-white/50"></div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">PREPARED FOR</p>
                            </div>
                            <h2 className="text-5xl font-thin tracking-wide text-white opacity-95">
                              {displayClientName || 'Valued Client'}
                            </h2>
                          </div>

                          {/* Decorative Divider */}
                          <div className="w-24 h-px bg-white/20 mb-10"></div>

                          {/* Project Title Section */}
                          <div>
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-0.5 h-3 bg-white/50"></div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">PROJECT</p>
                            </div>
                            <h1 className="text-7xl font-bold text-white mb-4 leading-none tracking-tight">
                              {projectName || documentTitle || 'Project Proposal'}
                            </h1>
                            <p className="text-2xl font-light text-white/80">
                              Professional Services Proposal
                            </p>
                          </div>

                        </div>

                        {/* BOTTOM FOOTER */}
                        <div className="mt-auto">
                          {/* Divider Line */}
                          <div className="w-full h-px bg-white/10 mb-8"></div>

                          <div className="flex justify-between items-end">
                            {/* Total Investment */}
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2">TOTAL INVESTMENT</p>
                              <p className="text-5xl font-thin text-white tracking-tight">
                                {formatCurrency(total)}
                              </p>
                            </div>

                            {/* Reference Number */}
                            <div className="text-right pb-1">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2">PROPOSAL REFERENCE</p>
                              <p className="text-xl font-medium text-white/90 tracking-widest">
                                {quote?.quote_number || 'New'}
                              </p>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                )}

                {/* Letter Page */}
                {showSections.letter && (
                  <div className="old-export-page w-[850px] bg-white shadow-xl print:shadow-none print:w-full relative" style={{ minHeight: '1100px' }}>
                    <div className="p-16">

                      {/* HEADER - Logo Left, Company Info Right */}
                      <div className="flex justify-between items-start mb-16">
                        {/* Logo Box */}
                        <div>
                          {companyInfo.logo ? (
                            <img src={companyInfo.logo} alt={companyInfo.name} className="w-20 h-20 object-contain" />
                          ) : (
                            <div className="w-20 h-20 bg-neutral-900 flex items-center justify-center">
                              <span className="text-3xl font-bold text-white tracking-tighter">
                                {companyInfo.name?.charAt(0) || 'C'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Company Contact Info - Right Aligned */}
                        <div className="text-right">
                          <h3 className="text-sm font-bold text-neutral-900 mb-1">{companyInfo.name}</h3>
                          <div className="text-xs text-neutral-500 space-y-1">
                            <p>{companyInfo.address}</p>
                            <p>{companyInfo.city}, {companyInfo.state} {companyInfo.zip}</p>
                            <p>{companyInfo.website?.replace(/^https?:\/\//, '')}</p>
                          </div>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="mb-12">
                        <p className="text-sm text-neutral-500">
                          {formatDate(quote?.created_at || new Date().toISOString())}
                        </p>
                      </div>

                      {/* Title Section */}
                      <div className="mb-12 border-b border-neutral-100 pb-12">
                        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
                          Project Proposal: {projectName || documentTitle}
                        </h1>
                        <p className="text-lg text-neutral-500 font-light">
                          Prepared for {displayClientName}
                        </p>
                      </div>

                      {/* Main Letter Body */}
                      <div className="mb-16">
                        <p className="font-semibold text-neutral-900 mb-6">
                          Dear {displayContactName?.trim().split(' ')[0] || 'Client'},
                        </p>

                        <div className="text-neutral-600 font-light leading-relaxed whitespace-pre-line text-lg">
                          {letterContent || `Thank you for the opportunity to work together on this project. We have prepared this proposal to outline our scope of work, timeline, and fee structure.

Our team is dedicated to delivering high-quality results that meet your specific needs.`}
                        </div>
                      </div>

                      {/* Closing Signature */}
                      <div>
                        <p className="text-neutral-900 mb-6">Sincerely,</p>

                        <div className="mt-8">
                          <p className="text-xl font-medium text-neutral-900 mb-1">
                            {profile?.full_name || 'Project Manager'}
                          </p>
                          <p className="font-bold text-sm text-neutral-900">
                            {profile?.full_name || 'Project Manager'}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {companyInfo.name}
                          </p>
                        </div>
                      </div>

                    </div>

                    {/* Footer - Stick to bottom */}
                    <div className="absolute bottom-0 left-0 right-0 px-16 py-8 border-t border-neutral-100/50">
                      <div className="flex justify-between items-center text-[10px] tracking-widest text-neutral-400 uppercase">
                        <div className="flex items-center gap-4">
                          <span>{companyInfo.name}</span>
                          <span className="text-neutral-300">|</span>
                          <span>{companyInfo.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                        </div>
                        <div>
                          PROPOSAL #{quote?.quote_number || 'NEW'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scope of Work & Timeline Page */}
                {(showSections.scopeOfWork || showSections.timeline) && (
                  <div className="old-export-page w-[850px] bg-white shadow-xl print:shadow-none print:w-full relative" style={{ minHeight: '1100px' }}>
                    <div className="p-12 pb-20">
                      <h2 className="text-2xl font-bold text-neutral-900 mb-8">Scope of Work & Project Timeline</h2>

                      {/* Scope of Work */}
                      {showSections.scopeOfWork && scopeOfWork && (
                        <div className="mb-8">
                          <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Scope of Work</h3>
                          <div className="border border-neutral-200 rounded-lg p-4">
                            <SimpleMarkdownRenderer content={scopeOfWork} />
                          </div>
                        </div>
                      )}

                      {/* Project Timeline / Gantt Chart */}
                      {showSections.timeline && lineItems.filter(item => item.description.trim()).length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Project Timeline</h3>
                          <div className="border border-neutral-200 rounded-lg p-4">
                            {(() => {
                              const validItems = lineItems.filter(item => item.description.trim());
                              const computedOffsets = getComputedStartOffsets(validItems);
                              const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimatedDays));
                              const totalDays = maxEnd || 1;

                              // Generate day markers
                              const dayMarkers: number[] = [1];
                              const step = totalDays > 20 ? 5 : totalDays > 10 ? 4 : 2;
                              for (let day = step; day < totalDays; day += step) {
                                dayMarkers.push(day);
                              }
                              if (dayMarkers[dayMarkers.length - 1] !== totalDays) {
                                dayMarkers.push(totalDays);
                              }

                              return (
                                <div className="space-y-6 flex-1 flex flex-col">
                                  {/* Header */}
                                  <div className="flex items-center text-[10px] text-neutral-400 pb-2 border-b border-neutral-100 mb-2">
                                    <span className="w-32">PROJECT SCHEDULE</span>
                                    <div className="flex-1 relative h-4">
                                      <span className="absolute left-0">Start (Day 1)</span>
                                      <span className="absolute right-0">Completion (Day {totalDays})</span>
                                    </div>
                                  </div>

                                  <div className="flex-1">
                                    {validItems.map((item, idx) => {
                                      const startDay = computedOffsets.get(item.id) || 0;
                                      const widthPercent = (item.estimatedDays / totalDays) * 100;
                                      const leftPercent = (startDay / totalDays) * 100;
                                      const actualStartDay = startDay + 1;
                                      const isCollaboratorTask = item.description.startsWith('[');

                                      return (
                                        <div key={item.id} className="relative h-12 flex items-center mb-4 border-b border-neutral-50">
                                          {/* Background Guide Line */}
                                          <div className="absolute top-1/2 left-[128px] right-0 h-px bg-neutral-100 -translate-y-1/2"></div>

                                          {/* Active Bar - Thinner */}
                                          <div className="absolute inset-0 w-full h-full">
                                            <div
                                              className={`absolute top-1/2 -translate-y-1/2 h-8 rounded ${isCollaboratorTask ? 'bg-amber-100' : 'bg-neutral-200'}`}
                                              style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 1)}%` }}
                                            >
                                              {/* Collaborate Stripe */}
                                              {isCollaboratorTask && (
                                                <div className="absolute top-0 bottom-0 left-0 w-1 bg-amber-500 rounded-l"></div>
                                              )}
                                            </div>
                                          </div>

                                          {/* Text */}
                                          <div className="relative z-10 w-full px-4 flex justify-between items-center text-sm">
                                            <span className="font-medium text-neutral-900 truncate pr-4">{item.description}</span>
                                            <span className="text-xs text-neutral-500 font-medium whitespace-nowrap">{item.estimatedDays} Days</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="flex justify-end pt-4 mt-2 border-t border-neutral-100">
                                    <div className="text-sm font-bold text-neutral-900">Total Duration: {totalDays} Days</div>
                                  </div>

                                  {/* Footer - Stick to bottom */}
                                  <div className="absolute bottom-0 left-0 right-0 px-12 py-8 border-t border-neutral-100/50 bg-white">
                                    <div className="flex justify-between items-center text-[10px] tracking-widest text-neutral-400 uppercase">
                                      <div className="flex items-center gap-4">
                                        <span>{companyInfo.name}</span>
                                        <span className="text-neutral-300">|</span>
                                        <span>{companyInfo.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                                      </div>
                                      <div className="flex gap-4">
                                        <span>PROPOSAL #{quote?.quote_number || 'NEW'}</span>
                                        <span className="text-neutral-300">•</span>
                                        <span>PAGE {visiblePages.indexOf('scope') + 1}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quote Details Page */}
                {showSections.quoteDetails && (
                  <div className="old-export-page w-[850px] bg-white shadow-xl print:shadow-none print:w-full relative" style={{ minHeight: '1100px' }}>
                    <div className="pb-20">
                      {/* Header */}
                      <div className="p-8 border-b border-neutral-200">
                        <div className="flex justify-between">
                          <div className="flex gap-6">
                            {companyInfo.logo ? (
                              <img src={companyInfo.logo} alt={companyInfo.name} className="w-16 h-16 object-contain rounded-xl bg-neutral-100" />
                            ) : (
                              <div className="w-16 h-16 bg-neutral-100 rounded-xl flex items-center justify-center text-2xl font-bold text-neutral-700">
                                {companyInfo.name?.charAt(0) || 'C'}
                              </div>
                            )}
                            <div>
                              <h2 className="text-2xl font-bold text-neutral-900">{companyInfo.name}</h2>
                              <p className="text-neutral-600">{companyInfo.address}</p>
                              <p className="text-neutral-600">{companyInfo.city}, {companyInfo.state} {companyInfo.zip}</p>
                              <p className="text-neutral-500 text-sm mt-1">{companyInfo.website} | {companyInfo.phone}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm">
                              <table className="text-left">
                                <tbody>
                                  <tr><td className="pr-4 py-1 text-neutral-500">DATE:</td><td className="font-medium text-neutral-900">{formatDate(quote?.created_at)}</td></tr>
                                  <tr><td className="pr-4 py-1 text-neutral-500">QUOTE #:</td><td className="font-medium text-neutral-900">{quote?.quote_number || 'New'}</td></tr>
                                  <tr><td className="pr-4 py-1 text-neutral-500">VALID UNTIL:</td><td className="font-medium text-neutral-900">{validUntil ? formatDate(validUntil) : '-'}</td></tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Customer */}
                      <div className="px-8 py-4">
                        <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Customer</h3>
                        <div className="border border-neutral-200 rounded-lg p-5">
                          {client && (
                            <div className="space-y-1">
                              <p className="font-semibold text-neutral-900">{client.name}</p>
                              {client.display_name && client.display_name !== client.name && <p className="text-neutral-600 text-sm">{client.display_name}</p>}
                              {client.email && <p className="text-neutral-500 text-sm">{client.email}</p>}
                              {client.phone && <p className="text-neutral-500 text-sm">{client.phone}</p>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Line Items */}
                      <div className="px-8 py-4">
                        <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Line Items</h3>
                        <div className="border border-neutral-200 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-neutral-50 border-b border-neutral-200">
                                <th className="text-left px-5 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Description</th>
                                <th className="text-right px-4 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-24">Unit Price</th>
                                <th className="text-center px-4 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-16">Unit</th>
                                <th className="text-center px-4 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-12">Qty</th>
                                <th className="text-right px-5 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-24">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {lineItems.filter(item => item.description.trim()).map((item) => (
                                <tr key={item.id}>
                                  <td className="px-5 py-3 text-neutral-900">{item.description}</td>
                                  <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(item.unitPrice)}</td>
                                  <td className="px-4 py-3 text-center text-neutral-500 text-xs">{item.unit}</td>
                                  <td className="px-4 py-3 text-center text-neutral-900">{item.qty}</td>
                                  <td className="px-5 py-3 text-right font-medium text-neutral-900">{formatCurrency(item.unitPrice * item.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Totals */}
                      <div className="px-8 py-4 flex justify-end">
                        <div className="w-72 space-y-2 text-sm">
                          <div className="flex justify-between py-1"><span className="text-neutral-600">Subtotal:</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
                          <div className="flex justify-between py-1"><span className="text-neutral-600">Tax ({taxRate}%):</span><span>{formatCurrency(taxDue)}</span></div>
                          {otherCharges > 0 && <div className="flex justify-between py-1"><span className="text-neutral-600">Other:</span><span>{formatCurrency(otherCharges)}</span></div>}
                          <div className="flex justify-between py-2 border-t-2 border-neutral-900 mt-2">
                            <span className="text-lg font-bold">TOTAL:</span>
                            <span className="text-lg font-bold">{formatCurrency(total)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Terms */}
                      {showSections.terms && (
                        <>
                          <div className="px-8 py-4">
                            <h3 className="font-bold text-neutral-900 mb-2">TERMS AND CONDITIONS</h3>
                            <div className="text-sm text-neutral-700 whitespace-pre-line">{terms}</div>
                          </div>

                          {/* Signature */}
                          {/* Signature Layout */}
                          <div className="px-8 py-16 border-t border-neutral-100 mt-8">
                            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-8">Authorization</h3>
                            <p className="text-sm text-neutral-600 mb-12 max-w-2xl font-light">
                              By signing below, the Client agrees to the terms outlined in this proposal along with the payment schedule, and authorizes {companyInfo.name} to proceed with the scope of work defined within.
                            </p>

                            <div className="grid grid-cols-2 gap-x-20 gap-y-16">

                              {/* Signature */}
                              <div className="relative group">
                                {mergeCollaboration?.owner_signed_at ? (
                                  <>
                                    <div className="absolute bottom-3 left-0 text-emerald-800 font-serif text-3xl italic select-none">
                                      {mergeCollaboration.owner_profile?.full_name || 'Signed'}
                                    </div>
                                    <div className="border-b border-neutral-300 h-10 w-full"></div>
                                  </>
                                ) : (
                                  <>
                                    <div className="absolute bottom-3 left-0 text-neutral-900 font-serif text-4xl opacity-[0.08] select-none">X</div>
                                    <div className="border-b border-neutral-300 h-10 w-full"></div>
                                  </>
                                )}
                                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Signature</p>
                              </div>

                              {/* Printed Name */}
                              <div>
                                <div className="border-b border-neutral-300 h-10 w-full flex items-end pb-1">
                                  <span className="font-medium text-neutral-900 text-sm">
                                    {mergeCollaboration?.owner_profile?.full_name || ''}
                                  </span>
                                </div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Printed Name</p>
                              </div>

                              {/* Title */}
                              <div>
                                <div className="border-b border-neutral-300 h-8 w-full"></div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Title</p>
                              </div>

                              {/* Date */}
                              <div>
                                <div className="border-b border-neutral-300 h-8 w-full flex items-end pb-1">
                                  {mergeCollaboration?.owner_signed_at && (
                                    <span className="font-medium text-neutral-900 text-sm">
                                      {new Date(mergeCollaboration.owner_signed_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Date</p>
                              </div>

                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <PageFooter pageNum={visiblePages.indexOf('details') + 1} />
                  </div>
                )}

                {/* Additional Offerings Page */}
                {showSections.additionalOfferings && services.length > 0 && (
                  <div className="old-export-page w-[850px] bg-white shadow-xl print:shadow-none print:w-full relative" style={{ minHeight: '1100px' }}>
                    <div className="p-12 pb-32">
                      <h2 className="text-2xl font-bold text-neutral-900 mb-2">Additional Offerings</h2>
                      <p className="text-neutral-600 mb-8">Explore our complete range of professional services:</p>

                      {/* Services Table */}
                      <div className="border border-neutral-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                              <th className="text-left px-6 py-4 font-semibold text-neutral-900">Service / Product</th>
                              <th className="text-right px-6 py-4 font-semibold text-neutral-900 w-40">Unit Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {services.map((service) => (
                              <tr key={service.id}>
                                <td className="px-6 py-4">
                                  <p className="font-medium text-neutral-900">{service.name}</p>
                                  {service.description && (
                                    <p className="text-sm text-neutral-500 mt-0.5">{service.description}</p>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {service.pricing_type === 'per_sqft' && service.min_rate && service.max_rate ? (
                                    <span className="text-neutral-900">${service.min_rate} - ${service.max_rate}</span>
                                  ) : service.base_rate ? (
                                    <span className="text-neutral-900">${service.base_rate}</span>
                                  ) : (
                                    <span className="text-neutral-500">Contact us</span>
                                  )}
                                  {service.unit_label && (
                                    <p className="text-xs text-neutral-500">per {service.unit_label}</p>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Thank You Message */}
                      <div className="mt-12 text-center">
                        <p className="text-lg font-semibold text-neutral-900">Thank you and looking forward to doing business with you again!</p>
                        <p className="text-neutral-500 mt-2">{companyInfo.phone} | {companyInfo.website}</p>
                      </div>
                    </div>
                    <PageFooter pageNum={visiblePages.indexOf('offerings') + 1} />
                  </div>
                )}

              </div>
            </div>
          );
        })()
      }

      {/* Services Modal - Multi-Select Design */}
      {
        showServicesModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 max-h-[70vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
                <h2 className="text-base font-medium text-neutral-900">Add from Services</h2>
                <button onClick={() => { setShowServicesModal(false); setSelectedServices(new Set()); }} className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-400 hover:text-neutral-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {services.length === 0 ? (
                  <p className="text-neutral-500 text-center py-8 text-sm">No services available. Add services in Settings.</p>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {services.map((service) => {
                      const isAlreadyAdded = lineItems.some(item =>
                        item.description.startsWith(service.name)
                      );
                      const isSelected = selectedServices.has(service.id);
                      return (
                        <button
                          key={service.id}
                          disabled={isAlreadyAdded}
                          onClick={() => {
                            if (isAlreadyAdded) return;
                            const newSelected = new Set(selectedServices);
                            if (isSelected) {
                              newSelected.delete(service.id);
                            } else {
                              newSelected.add(service.id);
                            }
                            setSelectedServices(newSelected);
                          }}
                          className={`w-full text-left px-5 py-3 flex justify-between items-center transition-colors ${isAlreadyAdded
                            ? 'opacity-40 cursor-not-allowed bg-neutral-50'
                            : isSelected
                              ? 'bg-[#476E66]/10'
                              : 'hover:bg-neutral-50'
                            }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#476E66] border-[#476E66]' : 'border-neutral-300'
                              }`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-neutral-900 text-sm truncate">{service.name}</p>
                              <p className="text-xs text-neutral-400">{service.category}</p>
                            </div>
                          </div>
                          <div className="text-right ml-4 flex-shrink-0">
                            <p className="font-medium text-neutral-900 text-sm">
                              {service.pricing_type === 'per_sqft' && service.min_rate && service.max_rate
                                ? `$${service.min_rate} - $${service.max_rate}`
                                : service.base_rate ? `$${service.base_rate}` : '-'}
                            </p>
                            <p className="text-xs text-neutral-400">per {service.unit_label}</p>
                          </div>
                          {isAlreadyAdded && (
                            <Check className="w-4 h-4 text-neutral-400 ml-3" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedServices.size > 0 && (
                <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50">
                  <button
                    onClick={() => {
                      const newItems: LineItem[] = [];
                      services.filter(s => selectedServices.has(s.id)).forEach((service, index) => {
                        const rate = service.pricing_type === 'per_sqft'
                          ? (service.min_rate || 0)
                          : (service.base_rate || 0);
                        const unit = service.pricing_type === 'per_sqft' ? 'sq ft'
                          : service.pricing_type === 'hourly' ? 'hour'
                            : service.pricing_type === 'fixed' ? 'project'
                              : 'each';
                        newItems.push({
                          id: crypto.randomUUID(),
                          description: service.name + (service.description ? ` - ${service.description}` : ''),
                          unitPrice: rate,
                          qty: 1,
                          unit,
                          taxed: false,
                          estimatedDays: 1,
                          startOffset: 0,
                          dependsOn: '',
                          startType: 'parallel',
                          overlapDays: 0
                        });
                      });
                      const filteredItems = lineItems.filter(item => item.description.trim() !== '');
                      setLineItems([...filteredItems, ...newItems]);
                      setHasUnsavedChanges(true);
                      setSelectedServices(new Set());
                      setShowServicesModal(false);
                    }}
                    className="w-full py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3a5b54] transition-colors font-medium text-sm"
                  >
                    Add {selectedServices.size} Service{selectedServices.size > 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      }

      {/* New Client Modal */}
      {
        showNewClientModal && (
          <NewClientModal
            companyId={profile?.company_id || ''}
            onClose={() => setShowNewClientModal(false)}
            onSave={async (newClient) => {
              setClients([...clients, newClient]);
              setSelectedClientId(newClient.id);
              setClient(newClient);
              setHasUnsavedChanges(true);
              setShowNewClientModal(false);
            }}
          />
        )
      }

      {/* Invite Configuration Modal */}
      {
        showInviteConfigModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">Send Partner Invites</h3>
                  <p className="text-sm text-neutral-500">You are inviting {pendingCollaborators.length} partner{pendingCollaborators.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={() => setShowInviteConfigModal(false)}
                  className="p-1 hover:bg-neutral-100 rounded-full text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Due Date Config */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-neutral-700">Response Deadline</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:border-neutral-900 outline-none transition-colors"
                      defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                      onChange={(e) => {
                        // Update all pending collaborators with this new deadline
                        setPendingCollaborators(prev => prev.map(c => ({ ...c, deadline: e.target.value })));
                      }}
                    />
                  </div>
                  <p className="text-xs text-neutral-400">Partners will see this as the due date for their proposal.</p>
                </div>

                {/* Global Message */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-neutral-700">Message to Partners</label>
                  <textarea
                    className="w-full h-32 p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:border-neutral-900 outline-none resize-none transition-colors placeholder:text-neutral-400"
                    placeholder="e.g. Please review the scope regarding the electrical work and provide your estimate..."
                    onChange={(e) => {
                      // Update all with this message
                      setPendingCollaborators(prev => prev.map(c => ({ ...c, message: e.target.value })));
                    }}
                  />
                </div>
              </div>

              <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex gap-3">
                <button
                  onClick={() => setShowInviteConfigModal(false)}
                  className="flex-1 px-4 py-2.5 bg-white border border-neutral-200 text-neutral-700 font-medium rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowInviteConfigModal(false);
                    sendCollaboratorInvitations();
                  }}
                  disabled={invitingCollaborators}
                  className="flex-1 px-4 py-2.5 bg-neutral-900 text-white font-medium rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                >
                  {invitingCollaborators ? 'Sending...' : 'Send Invites'}
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Send Proposal Modal */}
      {
        showSendModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`bg-white rounded-2xl shadow-2xl ${showEmailPreview ? 'max-w-2xl' : 'max-w-md'} w-full overflow-hidden`}>
              {!sentAccessCode ? (
                showEmailPreview ? (
                  <>
                    <div className="p-6 border-b">
                      <h2 className="text-xl font-semibold text-neutral-900">Email Preview</h2>
                      <p className="text-sm text-neutral-500 mt-1">This is what your client will receive</p>
                    </div>
                    <div className="p-4 bg-neutral-100">
                      <iframe
                        srcDoc={getEmailPreviewHtml()}
                        title="Email Preview"
                        className="w-full h-[400px] bg-white rounded-lg border"
                        sandbox=""
                      />
                    </div>
                    <div className="p-6 bg-neutral-50 flex gap-3">
                      <button
                        onClick={() => setShowEmailPreview(false)}
                        className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl hover:bg-white transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={sendProposalEmail}
                        disabled={sendingProposal}
                        className="flex-1 px-4 py-2.5 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {sendingProposal ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send Proposal
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-6 border-b">
                      <h2 className="text-xl font-semibold text-neutral-900">
                        {sendModalMode === 'another_contact'
                          ? 'Send to another contact'
                          : quote?.status === 'sent'
                            ? 'Send Reminder'
                            : 'Send Proposal'}
                      </h2>
                      <p className="text-sm text-neutral-500 mt-1">
                        {sendModalMode === 'another_contact'
                          ? 'Choose a contact at this company (e.g. project manager) to send this proposal to.'
                          : quote?.status === 'sent'
                            ? 'Send a reminder email to your recipient'
                            : `Send this proposal to your ${recipientType || 'recipient'} via email`}
                      </p>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="bg-neutral-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm text-neutral-500">Sending to</p>
                          {recipientType === 'lead' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-500 rounded-full">Lead</span>
                          )}
                          {recipientType === 'client' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Client</span>
                          )}
                        </div>

                        {/* Contact Selector for Clients with multiple contacts */}
                        {recipientType === 'client' && clientContacts.length > 0 ? (
                          <div className="space-y-2">
                            <p className="font-medium text-neutral-900">{client?.name}</p>
                            <div>
                              <label className="block text-xs text-neutral-500 mb-1">
                                {sendModalMode === 'another_contact' ? 'Select contact to send to (e.g. project manager)' : 'Select Recipient'}
                              </label>
                              <select
                                value={selectedContactId}
                                onChange={(e) => setSelectedContactId(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] bg-white"
                              >
                                <option value="">
                                  {client?.primary_contact_name || 'Primary Contact'} - {client?.primary_contact_email || client?.email}
                                </option>
                                {clientContacts.map(contact => (
                                  <option key={contact.id} value={contact.id}>
                                    {contact.name} ({contact.role === 'project_manager' ? 'Project Manager' : contact.role}) - {contact.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {selectedContactId && (() => {
                              const contact = clientContacts.find(c => c.id === selectedContactId);
                              return contact ? (
                                <div className="mt-2 p-2 bg-purple-50 rounded-lg">
                                  <p className="text-sm font-medium text-purple-900">{contact.name}</p>
                                  {contact.title && <p className="text-xs text-purple-600">{contact.title}</p>}
                                  <p className="text-xs text-purple-700">{contact.email}</p>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ) : recipientType === 'client' && sendModalMode === 'another_contact' ? (
                          <p className="text-sm text-neutral-500">
                            No project contacts yet. Add project managers in Sales → select this client → Project Contacts, then return here to send to them.
                          </p>
                        ) : (
                          <>
                            <p className="font-medium text-neutral-900">{displayClientName}</p>
                            <p className="text-sm text-neutral-600">{recipientType === 'lead' ? selectedLead?.email : (client?.primary_contact_email || client?.email)}</p>
                          </>
                        )}

                        {/* Show billing contact CC if exists and no custom CC */}
                        {recipientType === 'client' && client?.billing_contact_email && !ccEmail.trim() && !showCcInput && (
                          <div className="mt-2 pt-2 border-t border-neutral-200">
                            <p className="text-xs text-neutral-400">CC: Billing Contact</p>
                            <p className="text-sm text-neutral-600">{client.billing_contact_name || 'Billing'} - {client.billing_contact_email}</p>
                          </div>
                        )}
                      </div>

                      {/* CC Input Section */}
                      <div className="border border-neutral-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowCcInput(!showCcInput)}
                          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-neutral-700">CC Someone Else</span>
                            <span className="text-xs text-neutral-400">(Optional)</span>
                          </div>
                          <svg className={`w-4 h-4 text-neutral-400 transition-transform ${showCcInput ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {showCcInput && (
                          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100 bg-neutral-50/50">
                            <div>
                              <label className="block text-xs font-medium text-neutral-500 mb-1">CC Email</label>
                              <input
                                type="email"
                                value={ccEmail}
                                onChange={(e) => setCcEmail(e.target.value)}
                                placeholder="additional@email.com"
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-neutral-500 mb-1">CC Name (Optional)</label>
                              <input
                                type="text"
                                value={ccName}
                                onChange={(e) => setCcName(e.target.value)}
                                placeholder="John Doe"
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                              />
                            </div>
                            {ccEmail.trim() && (
                              <p className="text-xs text-[#476E66]">
                                This person will also receive the proposal email with the access code.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="bg-neutral-50 rounded-xl p-4">
                        <p className="text-sm text-neutral-500 mb-1">Proposal</p>
                        <p className="font-medium text-neutral-900">{projectName || documentTitle}</p>
                        <p className="text-sm text-neutral-600">Total: {formatCurrency(total)}</p>
                      </div>
                      <p className="text-xs text-neutral-500">
                        The client will receive an email with a secure link and 4-digit access code to view and respond to this proposal.
                      </p>
                    </div>
                    <div className="p-6 bg-neutral-50 space-y-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => { setShowSendModal(false); setSendModalMode(null); setShowCcInput(false); setCcEmail(''); setCcName(''); }}
                          className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl hover:bg-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => setShowEmailPreview(true)}
                          className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          Preview
                        </button>
                      </div>
                      <button
                        onClick={sendProposalEmail}
                        disabled={sendingProposal || (sendModalMode === 'another_contact' && recipientType === 'client' && clientContacts.length > 0 && !selectedContactId)}
                        className="w-full px-4 py-3 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
                      >
                        {sendingProposal ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            {sendModalMode === 'another_contact' ? <Send className="w-4 h-4" /> : quote?.status === 'sent' ? <Bell className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                            {sendModalMode === 'another_contact' ? 'Send to selected contact' : quote?.status === 'sent' ? 'Send Reminder Now' : 'Send Proposal Now'}
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-green-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-neutral-900 mb-2">Proposal Sent!</h2>
                    <p className="text-neutral-600 mb-6">
                      Your proposal has been sent to {client?.email}
                    </p>
                    <div className="bg-neutral-100 rounded-xl p-4 mb-4">
                      <p className="text-sm text-neutral-500 mb-1">Access Code</p>
                      <p className="text-3xl font-bold tracking-widest text-neutral-900">{sentAccessCode}</p>
                    </div>
                    <p className="text-xs text-neutral-500 mb-6">
                      The access code was included in the email. You can also share it manually if needed.
                    </p>
                  </div>
                  <div className="p-6 bg-neutral-50 space-y-3">
                    <button
                      onClick={() => { setShowSendModal(false); setSendModalMode(null); setSentAccessCode(''); setShowEmailPreview(false); setShowCcInput(false); setCcEmail(''); setCcName(''); }}
                      className="w-full px-4 py-2.5 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => navigate('/quotes')}
                      className="w-full px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-xl hover:bg-neutral-100 transition-colors"
                    >
                      Back to Proposals
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      }

      {/* Save as Template Modal */}
      {
        showSaveAsTemplateModal && profile?.company_id && (
          <SaveAsTemplateModal
            companyId={profile.company_id}
            templateData={{
              title: documentTitle,
              description: description,
              scope_of_work: scopeOfWork,
              cover_background_url: coverBgUrl,
              line_items: lineItems.filter(i => i.description.trim() && !i.id.startsWith('collab-') && !i.description.startsWith('[')).map(item => ({
                description: item.description,
                unit_price: item.unitPrice,
                quantity: item.qty,
                unit: item.unit,
                taxed: item.taxed,
                estimated_days: item.estimatedDays,
                start_offset: item.startOffset,
                start_type: item.startType,
                depends_on: item.dependsOn,
                overlap_days: item.overlapDays
              }))
            }}
            onSave={(template) => {
              showToast(`Template "${template.name}" saved!`, 'success');
              setShowSaveAsTemplateModal(false);
            }}
            onClose={() => setShowSaveAsTemplateModal(false)}
          />
        )
      }

      {/* Template Picker Modal */}
      {
        showTemplatePickerModal && profile?.company_id && (
          <TemplatePickerModal
            companyId={profile.company_id}
            onSelect={applyTemplate}
            onClose={() => setShowTemplatePickerModal(false)}
          />
        )
      }


      {/* Sticky Bottom Actions */}
      {
        !invitationsSent && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-100 p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
            <div className="max-w-[1000px] mx-auto flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400 uppercase font-medium">Total Estimate</p>
                <p className="text-xl font-bold text-neutral-900">{formatCurrency(total)}</p>
              </div>

              <div className="flex items-center gap-3">
                {currentStep > 1 && (
                  <button
                    onClick={() => setCurrentStep((currentStep - 1) as WizardStep)}
                    className="px-6 py-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 rounded-xl transition-colors"
                  >
                    Back
                  </button>
                )}
                {currentStep < 5 && !ownerSigningMode ? (
                  currentStep === 4 && pendingCollaborators.length > 0 && !invitationsSent ? (
                    <button
                      onClick={() => setShowInviteConfigModal(true)}
                      className="px-8 py-3 text-sm font-medium bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-all shadow-lg shadow-[#476E66]/20 flex items-center gap-2"
                    >
                      Send Invites & Continue
                      <Send className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentStep((currentStep + 1) as WizardStep)}
                      className="px-8 py-3 text-sm font-medium bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/20"
                    >
                      Next Step
                    </button>
                  )
                ) : (
                  <button
                    onClick={async () => {
                      if (ownerSigningMode) {
                        const collaborationId = searchParams.get('collaboration_id');
                        if (!collaborationId) {
                          alert('Missing collaboration ID');
                          return;
                        }
                        try {
                          await api.signCollaborationProposal(collaborationId, quoteId || '');
                          alert('Successfully signed! The collaborator has been notified and a project was created for them.');
                          navigate('/sales');
                        } catch (err: any) {
                          console.error('Signing error:', err);
                          alert(err.message || 'An error occurred while signing.');
                        }
                      } else {
                        handleSendToCustomer();
                      }
                    }}
                    disabled={sendingProposal}
                    className="px-8 py-3 text-sm font-medium bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/20 flex items-center gap-2"
                  >
                    {sendingProposal ? 'Sending...' : ownerSigningMode ? 'Approve & Sign' : 'Send Proposal'}
                    {!sendingProposal && <Send className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      }

    </div >
  );
}

function NewClientModal({ companyId, onClose, onSave }: {
  companyId: string;
  onClose: () => void;
  onSave: (client: Client) => void;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Client name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const newClient = await api.createClient({
        company_id: companyId,
        name: name.trim(),
        display_name: displayName.trim() || name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      onSave(newClient);
    } catch (err: any) {
      console.error('Failed to create client:', err);
      setError(err?.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">New Client</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Client Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="e.g., Acme Corporation"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="Optional short name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="client@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
