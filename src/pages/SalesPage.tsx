import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, Filter, Download, MoreHorizontal, X, FileText, ArrowRight, Eye, Printer, Send, Check, XCircle, Mail, Trash2, List, LayoutGrid, ChevronDown, ChevronRight, ArrowLeft, Edit2, Loader2, Link2, Copy, User, Tag, Users, Phone, Building2, Calendar, DollarSign, Clock, FileSignature } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useFeatureGating } from '../hooks/useFeatureGating';
import { api, Client, Quote, Lead, leadsApi, clientPortalApi, ProposalTemplate, collaborationApi, ProposalCollaboration, leadFormsApi } from '../lib/api';
import { NotificationService } from '../lib/notificationService';
import { useToast } from '../components/Toast';
import { FieldError } from '../components/ErrorBoundary';
import { validateEmail } from '../lib/validation';
import { getCachedData, setCachedData, CACHE_KEYS } from '../lib/dataCache';
import { supabase } from '../lib/supabase';
import { LeadModal, ConvertToClientModal } from '../components/leads';
import { QuoteModal } from '../components/quotes';

type Tab = 'leads' | 'clients' | 'proposals';
type ProposalsSubTab = 'all' | 'inbox' | 'templates' | 'collaborations';
type LeadsViewMode = 'list' | 'kanban';

type LeadStage = 'all' | 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'won' | 'lost';

const PIPELINE_STAGES: { key: LeadStage; label: string; color: string; bgColor: string }[] = [
  { key: 'all', label: 'All', color: 'text-neutral-700', bgColor: 'bg-neutral-100' },
  { key: 'new', label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { key: 'contacted', label: 'Contacted', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { key: 'qualified', label: 'Qualified', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  { key: 'proposal_sent', label: 'Proposal', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  { key: 'won', label: 'Won', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  { key: 'lost', label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100' },
];

// Generate quote number in format: YYMMDD-XXX (e.g., 250102-001)
function generateQuoteNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${yy}${mm}${dd}-${seq}`;
}

export default function SalesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading: authLoading, authReady, resumeCount } = useAuth();
  const { isAdmin } = usePermissions();
  const { checkAndProceed } = useFeatureGating();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showLeadFormLinkModal, setShowLeadFormLinkModal] = useState(false);
  const [leadFormLink, setLeadFormLink] = useState<string>('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [selectedPipelineStage, setSelectedPipelineStage] = useState<LeadStage>('all');
  const [responses, setResponses] = useState<any[]>([]);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [proposalsSubTab, setProposalsSubTab] = useState<ProposalsSubTab>('all');
  const [leadsViewMode, setLeadsViewMode] = useState<LeadsViewMode>('list');
  const [showWonConvertModal, setShowWonConvertModal] = useState<Lead | null>(null);
  const [leadBottomSheet, setLeadBottomSheet] = useState<Lead | null>(null); // Mobile bottom sheet
  const [showLeadBottomSheetMenu, setShowLeadBottomSheetMenu] = useState(false); // 3-dot menu in bottom sheet
  
  const [collaborationInbox, setCollaborationInbox] = useState<ProposalCollaboration[]>([]);
  const [sentCollaborations, setSentCollaborations] = useState<ProposalCollaboration[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
  const [showDeleteTemplateConfirm, setShowDeleteTemplateConfirm] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ProposalTemplate | null>(null);
  const [selectedSignature, setSelectedSignature] = useState<any>(null);
  const [showProposalChoiceModal, setShowProposalChoiceModal] = useState<{ type: 'client' | 'lead'; id?: string; name?: string; email?: string; company?: string } | null>(null);
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
  // Pages render immediately with cached/empty data, then refresh in background
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false); // Subtle indicator for background refresh
  const [searchTerm, setSearchTerm] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [activeQuoteMenu, setActiveQuoteMenu] = useState<string | null>(null);
  const [quoteViewMode, setQuoteViewMode] = useState<'list' | 'client'>('client');
  const [quoteSourceTab, setQuoteSourceTab] = useState<'clients' | 'leads'>('clients');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isAddingNewClient, setIsAddingNewClient] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('quotesExpandedClients');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const toggleClientExpanded = useCallback((clientName: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientName)) newExpanded.delete(clientName);
    else newExpanded.add(clientName);
    setExpandedClients(newExpanded);
    localStorage.setItem('quotesExpandedClients', JSON.stringify([...newExpanded]));
  }, [expandedClients]);

  // Simple data loading - loads when auth is ready, we have a company, or on resume
  useEffect(() => {
    let mounted = true;
    if (authReady && profile?.company_id) {
      loadData().then(() => {
        if (!mounted) return;
      });
    }
    return () => { mounted = false; };
  }, [profile?.company_id, authReady, resumeCount]);

  // Close dropdown menu on outside click
  useEffect(() => {
    if (!activeQuoteMenu) return;
    const handleClickOutside = () => setActiveQuoteMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeQuoteMenu]);

  // Track if we're currently loading to prevent duplicate calls
  const loadingRef = useRef(false);
  const hasCacheLoaded = useRef(false);
  const lastResumeCount = useRef(0);
  
  async function loadData(retryCount = 0) {
    const MAX_RETRIES = 3;
    
    if (!profile?.company_id) {
      setIsRefreshing(false);
      return;
    }
    
    // Reset loading state on resume
    if (resumeCount > lastResumeCount.current) {
      console.log('[SalesPage] Resume detected, resetting loading state');
      lastResumeCount.current = resumeCount;
      loadingRef.current = false;
    }
    
    // Prevent duplicate loads (but allow retries)
    if (loadingRef.current && retryCount === 0) {
      console.log('[SalesPage] Already loading, skipping duplicate call');
      return;
    }
    
    const companyId = profile.company_id;
    loadingRef.current = true;
    
    // STEP 1: Load cached data INSTANTLY (no loading spinner)
    if (!hasCacheLoaded.current) {
      const [cachedLeads, cachedClients, cachedQuotes] = await Promise.all([
        getCachedData<Lead[]>(CACHE_KEYS.SALES_LEADS),
        getCachedData<Client[]>(CACHE_KEYS.SALES_CLIENTS),
        getCachedData<Quote[]>(CACHE_KEYS.SALES_QUOTES),
      ]);
      
      if (cachedLeads.data || cachedClients.data || cachedQuotes.data) {
        console.log('[SalesPage] Rendering cached data instantly');
        if (cachedLeads.data) setLeads(cachedLeads.data);
        if (cachedClients.data) setClients(cachedClients.data);
        if (cachedQuotes.data) setQuotes(cachedQuotes.data);
        hasCacheLoaded.current = true;
      }
    }
    
    // STEP 2: Quick auth check using cached token (no SDK call - it can hang!)
    // The SDK's getSession() has been known to deadlock, so we use cached auth
    const { getStoredAuth } = await import('../lib/supabase');
    const auth = getStoredAuth();
    if (!auth?.accessToken) {
      console.warn('[SalesPage] No valid auth token, skipping data fetch');
      setIsRefreshing(false);
      loadingRef.current = false;
      return;
    }
    
    // STEP 3: Fetch fresh data in background (subtle indicator, no blocking spinner)
    setIsRefreshing(true);
    console.log(`[SalesPage] Fetching fresh data... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    const startTime = Date.now();
    
    try {
      // Load ALL data in PARALLEL for faster loading
      // Use individual try/catch so one failure doesn't block others
      const userEmail = profile?.email || '';
      const userId = profile?.id;
      const [leadsData, clientsData, quotesData, responsesData, templatesData, inboxData, sentData] = await Promise.all([
        leadsApi.getLeads(companyId).catch(err => { console.warn('[SalesPage] Failed to load leads:', err?.message); return []; }),
        api.getClients(companyId).catch(err => { console.warn('[SalesPage] Failed to load clients:', err?.message); return []; }),
        api.getQuotes(companyId).catch(err => { console.warn('[SalesPage] Failed to load quotes:', err?.message); return []; }),
        api.getProposalResponses(companyId).catch(err => { console.warn('[SalesPage] Failed to load responses:', err?.message); return []; }),
        api.getProposalTemplates(companyId).catch(err => { console.warn('[SalesPage] Failed to load templates:', err?.message); return []; }),
        collaborationApi.getReceivedInvitations(userEmail, userId).catch(err => { console.warn('[SalesPage] Failed to load inbox:', err?.message); return []; }),
        collaborationApi.getSentInvitations(companyId).catch(err => { console.warn('[SalesPage] Failed to load sent:', err?.message); return []; }),
      ]);
      
      const elapsed = Date.now() - startTime;
      console.log('[SalesPage] Fresh data loaded in', elapsed, 'ms');
      
      // Check if we got meaningful data (at least clients should load)
      const gotData = clientsData.length > 0 || leadsData.length > 0;
      
      if (!gotData && retryCount < MAX_RETRIES) {
        // No data returned - might be a stale connection, retry
        console.warn(`[SalesPage] No data returned, retrying in ${(retryCount + 1) * 2}s...`);
        // Reset loading state before retry delay
        loadingRef.current = false;
        setIsRefreshing(false);
        
        // Exponential backoff: 2s, 4s, 6s
        await new Promise(r => setTimeout(r, (retryCount + 1) * 2000));
        return loadData(retryCount + 1);
      }
      
      // Set all state at once
      setLeads(leadsData);
      setClients(clientsData);
      setQuotes(quotesData);
      setResponses(responsesData);
      setTemplates(templatesData);
      setCollaborationInbox(inboxData);
      setSentCollaborations(sentData);
      
      // STEP 4: Cache the fresh data for next time
      setCachedData(CACHE_KEYS.SALES_LEADS, leadsData);
      setCachedData(CACHE_KEYS.SALES_CLIENTS, clientsData);
      setCachedData(CACHE_KEYS.SALES_QUOTES, quotesData);
      
      // Auto-convert accepted quotes in BACKGROUND (non-blocking)
      // Skip if project already exists or if already attempted
      const quotesToProcess = quotesData.filter((q: Quote) => 
        (q.status === 'accepted' || q.status === 'approved') && !q.project_id
      );
      const attemptedConversions = new Set(JSON.parse(sessionStorage.getItem('attempted_conversions') || '[]'));
      const newQuotesToProcess = quotesToProcess.filter((q: Quote) => !attemptedConversions.has(q.id));
      
      if (newQuotesToProcess.length > 0) {
        // Mark as attempted to avoid repeated failures
        newQuotesToProcess.forEach((q: Quote) => attemptedConversions.add(q.id));
        sessionStorage.setItem('attempted_conversions', JSON.stringify([...attemptedConversions]));
        
        // Run in background, don't await - use setTimeout to defer
        setTimeout(() => {
          Promise.all(newQuotesToProcess.map(async (quote: Quote) => {
            try {
              await api.convertQuoteToProject(quote.id, companyId);
              console.log(`Auto-converted quote ${quote.quote_number} to project`);
            } catch (err) {
              console.error(`Failed to auto-convert quote ${quote.id}:`, err);
            }
          })).then(() => {
            // Refresh quotes after background conversion completes
            api.getQuotes(companyId).then(setQuotes).catch(() => {});
          });
        }, 100);
      }
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.error('[SalesPage] Data load failed after', elapsed, 'ms:', error?.message || error);
      
      // Retry on network/timeout/abort errors
      if (retryCount < MAX_RETRIES) {
        const isRetryable = error?.name === 'AbortError' ||
                           error?.message?.includes('abort') ||
                           error?.message?.includes('network') || 
                           error?.message?.includes('timeout') ||
                           error?.message?.includes('fetch') ||
                           error?.code === 'NETWORK_ERROR';
        
        if (isRetryable) {
          console.warn(`[SalesPage] Retryable error, will retry in ${(retryCount + 1) * 2}s...`);
          // Reset loading state before retry delay
          loadingRef.current = false;
          setIsRefreshing(false);
          
          await new Promise(r => setTimeout(r, (retryCount + 1) * 2000));
          return loadData(retryCount + 1);
        }
      }
      
      // Final failure - just log it, cached data is already displayed
      console.error('[SalesPage] All retries exhausted, using cached data');
    }
    
    setIsRefreshing(false);
    loadingRef.current = false;
  }

  const filteredClients = useMemo(() => 
    clients.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [clients, searchTerm]
  );

  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      const matchesSearch = q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.quote_number?.toLowerCase().includes(searchTerm.toLowerCase());
      if (quoteSourceTab === 'clients') {
        return matchesSearch && q.client_id && !q.lead_id;
      } else {
        return matchesSearch && q.lead_id;
      }
    });
  }, [quotes, searchTerm, quoteSourceTab]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-50 text-emerald-600';
      case 'pending': case 'draft': return 'bg-amber-50 text-amber-600';
      case 'pending_collaborators': return 'bg-purple-50 text-purple-600';
      case 'sent': return 'bg-blue-50 text-blue-600';
      case 'approved': case 'accepted': return 'bg-emerald-50 text-emerald-600';
      case 'dropped': case 'rejected': case 'declined': return 'bg-red-50 text-red-600';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getStatusLabel = (status?: string) => {
    if (status === 'pending_collaborators') return 'Waiting for Collaborators';
    return status || 'draft';
  };

  const updateQuoteStatus = useCallback(async (quoteId: string, status: string) => {
    try {
      await api.updateQuote(quoteId, { status });
      loadData();
    } catch (error) {
      console.error('Failed to update quote:', error);
    }
    setActiveQuoteMenu(null);
  }, []);

  const generateQuotePDF = useCallback((quote: Quote) => {
    const client = clients.find(c => c.id === quote.client_id);
    const content = `
<!DOCTYPE html>
<html>
<head>
  <title>Quote ${quote.quote_number}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .quote-title { font-size: 32px; font-weight: bold; color: #333; }
    .quote-number { color: #666; margin-top: 8px; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 14px; font-weight: bold; color: #666; margin-bottom: 8px; text-transform: uppercase; }
    .client-name { font-size: 18px; font-weight: bold; }
    .description { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .total { font-size: 24px; font-weight: bold; margin-top: 30px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: right; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .validity { color: #666; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="quote-title">QUOTE</div>
      <div class="quote-number">${quote.quote_number}</div>
    </div>
    <div style="text-align: right;">
      <span class="status">${(quote.status || 'draft').toUpperCase()}</span>
      <div style="margin-top: 8px; color: #666;">Date: ${new Date(quote.created_at || '').toLocaleDateString()}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Prepared For</div>
    <div class="client-name">${client?.name || 'N/A'}</div>
    ${client?.email ? `<div>${client.email}</div>` : ''}
  </div>
  <div class="section">
    <div class="section-title">Project</div>
    <div style="font-size: 18px; font-weight: 600;">${quote.title}</div>
  </div>
  ${quote.description ? `<div class="description">${quote.description}</div>` : ''}
  <div class="total">Total: ${formatCurrency(quote.total_amount)}</div>
  ${quote.valid_until ? `<div class="validity"><strong>Valid Until:</strong> ${new Date(quote.valid_until).toLocaleDateString()}</div>` : ''}
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    }
    setActiveQuoteMenu(null);
  }, [clients]);

  const formatCurrency = useCallback((amount?: number) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  }, []);

  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(null);

  const handleConvertToProject = useCallback(async (quote: Quote) => {
    if (!profile?.company_id) return;
    setConvertingQuoteId(quote.id);
    try {
      const result = await api.convertQuoteToProject(quote.id, profile.company_id);
      showToast(`Project "${result.projectName}" created with ${result.tasksCreated} tasks!`, 'success');
      
      // Send notification for project creation
      const clientName = clients.find(c => c.id === quote.client_id)?.name || 'Client';
      NotificationService.projectCreated(profile.company_id, result.projectName, clientName, result.projectId);
      
      await loadData();
      setTimeout(() => navigate(`/projects`), 2000);
    } catch (error: any) {
      console.error('Failed to convert quote:', error);
      showToast(error?.message || 'Failed to convert quote to project', 'error');
    } finally {
      setConvertingQuoteId(null);
    }
  }, [profile, clients, showToast]);

  const handleDeleteQuote = useCallback(async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this quote? This action cannot be undone.')) return;
    try {
      await api.deleteQuote(quoteId);
      showToast('Quote deleted successfully', 'success');
      await loadData();
    } catch (error: any) {
      console.error('Failed to delete quote:', error);
      showToast(error?.message || 'Failed to delete quote', 'error');
    }
    setActiveQuoteMenu(null);
  }, [showToast]);

  const handleRecreateQuote = useCallback(async (quote: Quote) => {
    if (!profile?.company_id) return;
    setActiveQuoteMenu(null);
    try {
      const newQuote = await api.createQuote({
        company_id: profile.company_id,
        client_id: quote.client_id,
        title: `${quote.title} (Copy)`,
        description: quote.description,
        total_amount: quote.total_amount,
        billing_model: quote.billing_model,
        valid_until: quote.valid_until,
        status: 'draft',
        quote_number: generateQuoteNumber(),
      });
      showToast('Quote duplicated successfully', 'success');
      await loadData();
      navigate(`/quotes/${newQuote.id}/document`);
    } catch (error: any) {
      console.error('Failed to recreate quote:', error);
      showToast(error?.message || 'Failed to recreate quote', 'error');
    }
  }, [profile, showToast]);

  // Only block UI for initial auth loading, NOT for data loading
  // This prevents the 5-8 second spinner on iOS resume
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile?.company_id) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500">Unable to load data. Please log in again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 sm:space-y-3 lg:space-y-4">
      
      {/* Header - Hidden on mobile, title shown in tabs area */}
      <div className="hidden sm:flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Sales Pipeline</h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 sm:mt-1">Manage your leads, clients, and proposals</p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'leads') {
              setEditingLead(null);
              setShowLeadModal(true);
            } else if (activeTab === 'clients') {
              checkAndProceed('clients', clients.length, () => {
                setSelectedClient(null);
                setIsAddingNewClient(true);
              });
            } else if (activeTab === 'proposals') {
              setShowProposalChoiceModal({ type: 'client' });
            } else {
              navigate('/quotes/new/document');
            }
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add {activeTab === 'leads' ? 'Lead' : activeTab === 'clients' ? 'Client' : 'Proposal'}</span>
        </button>
      </div>

      {/* Mobile Subtitle */}
      <p className="text-xs text-neutral-500 sm:hidden">Manage your leads, clients, and proposals</p>

      {/* Tabs */}
      <div className="flex gap-0.5 p-0.5 bg-neutral-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('leads')}
          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
            activeTab === 'leads' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <span>Leads</span>
          <span className={`px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full min-w-[18px] sm:min-w-[20px] text-center ${
            activeTab === 'leads' ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-200/50 text-neutral-500'
          }`}>
            {leads.filter(l => l.status !== 'won' && l.status !== 'lost').length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
            activeTab === 'clients' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <span>Clients</span>
          <span className={`px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full min-w-[18px] sm:min-w-[20px] text-center ${
            activeTab === 'clients' ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-200/50 text-neutral-500'
          }`}>
            {clients.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('proposals')}
          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
            activeTab === 'proposals' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <span>Proposals</span>
          <span className={`px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full min-w-[18px] sm:min-w-[20px] text-center ${
            activeTab === 'proposals' ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-200/50 text-neutral-500'
          }`}>
            {quotes.length}
          </span>
          {collaborationInbox.length > 0 && (
            <span className="px-1 sm:px-1.5 py-0.5 bg-[#476E66] text-white text-[10px] sm:text-xs rounded-full min-w-[18px] sm:min-w-[20px] text-center">
              {collaborationInbox.length}
            </span>
          )}
        </button>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 sm:h-11 pl-8 sm:pl-9 pr-2 sm:pr-3 py-1.5 sm:py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none text-xs sm:text-sm"
          />
        </div>
        <button className="hidden sm:flex items-center gap-1.5 px-3 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-sm flex-shrink-0">
          <Filter className="w-4 h-4" />
          <span className="hidden md:inline">Filters</span>
        </button>
        {activeTab === 'proposals' && (
          <>
          <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100 rounded-lg flex-shrink-0">
            <button
              onClick={() => setQuoteSourceTab('clients')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${quoteSourceTab === 'clients' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Clients
            </button>
            <button
              onClick={() => setQuoteSourceTab('leads')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${quoteSourceTab === 'leads' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Leads
            </button>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100 rounded-lg flex-shrink-0">
            <button
              onClick={() => setQuoteViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${quoteViewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-neutral-200'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setQuoteViewMode('client')}
              className={`p-1.5 rounded transition-colors ${quoteViewMode === 'client' ? 'bg-white shadow-sm' : 'hover:bg-neutral-200'}`}
              title="Client View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          </>
        )}
        <button className="hidden lg:flex items-center gap-1.5 px-4 py-2.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-sm flex-shrink-0">
          <Download className="w-4 h-4" />
          <span className="hidden xl:inline">Export</span>
        </button>
        {activeTab === 'leads' && (
          <>
            {/* View mode toggle for leads */}
            <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100 rounded-lg flex-shrink-0">
              <button
                onClick={() => setLeadsViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${leadsViewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-neutral-200'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLeadsViewMode('kanban')}
                className={`p-1.5 rounded-md transition-colors ${leadsViewMode === 'kanban' ? 'bg-white shadow-sm' : 'hover:bg-neutral-200'}`}
                title="Board View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={async () => {
                if (!profile?.company_id) return;
                try {
                  const form = await leadFormsApi.getOrCreateDefaultForm(profile.company_id);
                  const link = `${window.location.origin}/lead/${form.id}`;
                  setLeadFormLink(link);
                  setShowLeadFormLinkModal(true);
                } catch (err) {
                  showToast('Failed to get lead form link', 'error');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors text-sm flex-shrink-0"
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Lead Form</span>
            </button>
          </>
        )}
      </div>

      {/* Leads Section */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          {/* Empty State */}
          {leads.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">No leads yet</h3>
              <p className="text-sm text-neutral-500 mb-4 max-w-sm mx-auto">Start tracking your potential clients and watch your pipeline grow</p>
              <button
                onClick={() => { setEditingLead(null); setShowLeadModal(true); }}
                className="px-4 py-2.5 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors font-medium"
              >
                Add Your First Lead
              </button>
            </div>
          ) : leadsViewMode === 'kanban' ? (
            /* Kanban Board View */
            <>
              {/* Mobile: Full-width swipeable columns */}
              <div className="sm:hidden">
                {/* Horizontal scroll container with snap */}
                <div 
                  className="flex overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-3 scrollbar-hide"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {PIPELINE_STAGES.filter(s => s.key !== 'all').map((stage, index) => {
                    const stageLeads = leads.filter(l => {
                      const matchesSearch = searchTerm ? l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) : true;
                      return matchesSearch && l.status === stage.key;
                    });
                    return (
                      <div 
                        key={stage.key} 
                        className="flex-shrink-0 w-[calc(100vw-2rem)] snap-center pr-3 last:pr-0"
                      >
                        {/* Column Header - Brand color */}
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-t-xl bg-[#476E66]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{stage.label}</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-[#476E66] bg-white">
                              {stageLeads.length}
                            </span>
                          </div>
                          <span className="text-xs text-white/70">{index + 1}/{PIPELINE_STAGES.filter(s => s.key !== 'all').length}</span>
                        </div>
                        
                        {/* Column Body */}
                        <div className="bg-[#476E66]/5 rounded-b-xl p-3 min-h-[50vh] space-y-2.5">
                          {stageLeads.map((lead) => (
                            <div
                              key={lead.id}
                              className="bg-white rounded-xl p-3.5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer border border-neutral-100"
                              onClick={() => setLeadBottomSheet(lead)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#476E66]/10 flex items-center justify-center text-[#476E66] font-semibold text-sm flex-shrink-0">
                                  {lead.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-neutral-900 text-sm">{lead.name}</p>
                                  <p className="text-xs text-neutral-500 truncate">{lead.company_name || lead.email || '-'}</p>
                                </div>
                                {lead.estimated_value && (
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-[#476E66]">${lead.estimated_value.toLocaleString()}</p>
                                  </div>
                                )}
                              </div>
                              {lead.source && (
                                <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between">
                                  <span className="text-[10px] text-neutral-400 uppercase tracking-wide">{lead.source.replace('_', ' ')}</span>
                                  <ChevronRight className="w-4 h-4 text-neutral-300" />
                                </div>
                              )}
                            </div>
                          ))}
                          {stageLeads.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
                                <User className="w-6 h-6 text-neutral-300" />
                              </div>
                              <p className="text-sm font-medium text-neutral-500">No {stage.label.toLowerCase()} leads</p>
                              <p className="text-xs text-neutral-400 mt-1">Swipe to see other stages</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Swipe hint */}
                <p className="text-center text-[10px] text-neutral-400 mt-2">Swipe left or right to see other stages</p>
              </div>

              {/* Desktop: Traditional multi-column Kanban */}
              <div className="hidden sm:flex gap-4 overflow-x-auto pb-4">
                {PIPELINE_STAGES.filter(s => s.key !== 'all').map((stage) => {
                  const stageLeads = leads.filter(l => {
                    const matchesSearch = searchTerm ? l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) : true;
                    return matchesSearch && l.status === stage.key;
                  });
                  return (
                    <div key={stage.key} className="flex-shrink-0 w-72">
                      {/* Column Header */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-t-lg bg-[#476E66]/10">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#476E66]">{stage.label}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-[#476E66] bg-[#476E66]/10">
                            {stageLeads.length}
                          </span>
                        </div>
                      </div>
                      {/* Column Body */}
                      <div className="bg-neutral-50 rounded-b-lg p-2 min-h-[400px] space-y-2">
                        {stageLeads.map((lead) => (
                          <div
                            key={lead.id}
                            className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-neutral-100"
                            onClick={() => { setEditingLead(lead); setShowLeadModal(true); }}
                          >
                            <div className="flex items-start gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full bg-[#476E66]/10 flex items-center justify-center text-[#476E66] font-medium text-xs flex-shrink-0">
                                {lead.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-neutral-900 text-sm truncate">{lead.name}</p>
                                <p className="text-xs text-neutral-500 truncate">{lead.company_name || lead.email || '-'}</p>
                              </div>
                            </div>
                            {lead.estimated_value && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-neutral-500">Est. Value</span>
                                <span className="font-medium text-[#476E66]">${lead.estimated_value.toLocaleString()}</span>
                              </div>
                            )}
                            {lead.source && (
                              <div className="mt-2 pt-2 border-t border-neutral-100">
                                <span className="text-[10px] text-neutral-400 uppercase tracking-wide">{lead.source.replace('_', ' ')}</span>
                              </div>
                            )}
                            {/* Quick Actions */}
                            <div className="mt-2 pt-2 border-t border-neutral-100 flex gap-1">
                              {lead.status !== 'won' && lead.status !== 'lost' && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowProposalChoiceModal({ type: 'lead', id: lead.id, name: lead.name, email: lead.email || '', company: lead.company_name || '' }); }}
                                    className="flex-1 px-2 py-1 text-[10px] font-medium text-[#476E66] bg-[#476E66]/10 rounded hover:bg-[#476E66]/20 transition-colors"
                                  >
                                    Proposal
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConvertingLead(lead); setShowConvertModal(true); }}
                                    className="flex-1 px-2 py-1 text-[10px] font-medium text-[#476E66] bg-[#476E66]/10 rounded hover:bg-[#476E66]/20 transition-colors"
                                  >
                                    Convert
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {stageLeads.length === 0 && (
                          <div className="text-center py-8 text-neutral-400 text-xs">
                            No leads in this stage
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* List View */
            <div className="space-y-2 sm:space-y-3">
              {/* Pipeline Stage Filter Pills */}
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {PIPELINE_STAGES.map((stage) => {
                  const count = stage.key === 'all' 
                    ? leads.length 
                    : leads.filter(l => l.status === stage.key).length;
                  const isSelected = selectedPipelineStage === stage.key;
                  return (
                    <button
                      key={stage.key}
                      onClick={() => setSelectedPipelineStage(stage.key)}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all flex-shrink-0 ${
                        isSelected 
                          ? `${stage.bgColor} ${stage.color}` 
                          : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      <span>{stage.label}</span>
                      <span className={`px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] ${isSelected ? 'bg-white/50' : 'bg-neutral-100'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Leads Table */}
              <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wide">Lead</th>
                        <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden sm:table-cell">Source</th>
                        <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">Est. Value</th>
                        <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">Created</th>
                        <th className="text-right px-3 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wide sr-only sm:not-sr-only">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {leads.filter(l => {
                        const matchesSearch = searchTerm ? l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) : true;
                        const matchesStage = selectedPipelineStage === 'all' || l.status === selectedPipelineStage;
                        return matchesSearch && matchesStage;
                      }).map((lead) => (
                        <tr 
                          key={lead.id} 
                          className="hover:bg-neutral-50 transition-colors cursor-pointer sm:cursor-default"
                          onClick={() => { 
                            // On mobile, clicking row opens lead action sheet (not edit)
                            if (window.innerWidth < 640) {
                              setLeadBottomSheet(lead);
                            }
                          }}
                        >
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                                {lead.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-neutral-900 text-xs sm:text-sm">{lead.name}</p>
                                <p className="text-[10px] sm:text-xs text-neutral-500 truncate max-w-[120px] sm:max-w-[180px]">{lead.company_name || lead.email || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 hidden sm:table-cell">
                            <span className="text-xs sm:text-sm text-neutral-600 capitalize">{lead.source?.replace('_', ' ') || '-'}</span>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                            <select
                              value={lead.status || 'new'}
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                const newStatus = e.target.value as Lead['status'];
                                try {
                                  await leadsApi.updateLead(lead.id, { status: newStatus });
                                  loadData();
                                  if (newStatus === 'won') {
                                    setShowWonConvertModal({ ...lead, status: newStatus });
                                  }
                                } catch (error) {
                                  console.error('Failed to update lead:', error);
                                }
                              }}
                              className={`text-[10px] sm:text-xs font-medium px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border-0 cursor-pointer ${
                                lead.status === 'new' ? 'bg-blue-50 text-blue-700' :
                                lead.status === 'contacted' ? 'bg-purple-50 text-purple-700' :
                                lead.status === 'qualified' ? 'bg-amber-50 text-amber-700' :
                                lead.status === 'proposal_sent' ? 'bg-cyan-50 text-cyan-700' :
                                lead.status === 'won' ? 'bg-emerald-50 text-emerald-700' :
                                lead.status === 'lost' ? 'bg-red-50 text-red-700' :
                                'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="proposal_sent">Proposal</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                            </select>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-neutral-600 hidden md:table-cell">
                            {lead.estimated_value ? `$${lead.estimated_value.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-neutral-500 hidden lg:table-cell">
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 hidden sm:table-cell">
                            <div className="flex items-center justify-end gap-1">
                              {lead.status !== 'won' && lead.status !== 'lost' && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowProposalChoiceModal({ type: 'lead', id: lead.id, name: lead.name, email: lead.email || '', company: lead.company_name || '' }); }}
                                    className="px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-[#476E66] bg-[#476E66]/10 rounded-lg hover:bg-[#476E66]/20 transition-colors hidden sm:block"
                                  >
                                    Proposal
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConvertingLead(lead); setShowConvertModal(true); }}
                                    className="px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors hidden md:block"
                                  >
                                    Convert
                                  </button>
                                </>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingLead(lead); setShowLeadModal(true); }}
                                className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm('Delete this lead?')) {
                                    try {
                                      await leadsApi.deleteLead(lead.id);
                                      loadData();
                                    } catch (error) {
                                      console.error('Failed to delete lead:', error);
                                    }
                                  }
                                }}
                                className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors hidden sm:block"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clients Section - Inline editing */}
      {activeTab === 'clients' && (
        <div className="flex gap-4">
          {/* Client List - Hidden on mobile when client selected */}
          <div className={`bg-white rounded-lg overflow-hidden ${
            selectedClient || isAddingNewClient 
              ? 'hidden lg:block lg:w-72 lg:flex-shrink-0' 
              : 'flex-1'
          }`} style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => { setSelectedClient(client); setIsAddingNewClient(false); }}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-neutral-100 cursor-pointer transition-colors ${
                    selectedClient?.id === client.id ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#476E66]/20 flex items-center justify-center text-neutral-600 font-medium text-xs flex-shrink-0">
                    {client.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900 text-sm truncate">{client.name}</p>
                    <p className="text-xs text-neutral-500 truncate">{client.email || client.display_name || '-'}</p>
                  </div>
                  {!selectedClient && !isAddingNewClient && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(client.lifecycle_stage)}`}>
                      {client.lifecycle_stage || 'active'}
                    </span>
                  )}
                </div>
              ))}
              {filteredClients.length === 0 && (
                <div className="text-center py-8 text-neutral-500 text-xs">No clients found</div>
              )}
            </div>
          </div>

          {/* Client Detail Panel - Full width on mobile */}
          {(selectedClient || isAddingNewClient) && (
            <div className="flex-1 bg-white rounded-lg p-3 lg:p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
              <InlineClientEditor
                client={isAddingNewClient ? null : selectedClient}
                companyId={profile?.company_id || ''}
                onClose={() => { setSelectedClient(null); setIsAddingNewClient(false); }}
                onSave={(savedClient) => {
                  loadData();
                  if (isAddingNewClient) {
                    setIsAddingNewClient(false);
                    setSelectedClient(savedClient);
                  }
                }}
                onDelete={() => {
                  loadData();
                  setSelectedClient(null);
                }}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </div>
      )}

      {/* Proposals Section with Subtabs */}
      {activeTab === 'proposals' && (
        <>
          {/* Proposals Subtabs */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg w-fit">
            <button
              onClick={() => setProposalsSubTab('all')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                proposalsSubTab === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              All Proposals
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${proposalsSubTab === 'all' ? 'bg-neutral-100' : 'bg-neutral-200/50'}`}>{quotes.length}</span>
            </button>
            <button
              onClick={() => setProposalsSubTab('inbox')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                proposalsSubTab === 'inbox' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Inbox
              {collaborationInbox.length > 0 && (
                <span className="px-1.5 py-0.5 bg-[#476E66] text-white text-xs rounded-full">{collaborationInbox.length}</span>
              )}
            </button>
            <button
              onClick={() => setProposalsSubTab('templates')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                proposalsSubTab === 'templates' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Templates
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${proposalsSubTab === 'templates' ? 'bg-neutral-100' : 'bg-neutral-200/50'}`}>{templates.length}</span>
            </button>
            <button
              onClick={() => setProposalsSubTab('collaborations')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                proposalsSubTab === 'collaborations' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Sent
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${proposalsSubTab === 'collaborations' ? 'bg-neutral-100' : 'bg-neutral-200/50'}`}>{new Set(sentCollaborations.map(c => c.parent_quote_id)).size}</span>
            </button>
          </div>

          {/* All Quotes View */}
          {proposalsSubTab === 'all' && (
            quoteViewMode === 'list' ? (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* Mobile Card View */}
            <div className="block lg:hidden divide-y divide-neutral-100">
              {filteredQuotes.map((quote) => (
                <div key={quote.id} className="p-3 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-start gap-3" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-neutral-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-900 text-sm truncate">{quote.title}</p>
                          <p className="text-xs text-neutral-500">{quote.quote_number}</p>
                        </div>
                        <span className="flex-shrink-0 font-semibold text-neutral-900 text-sm">{formatCurrency(quote.total_amount)}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(quote.status)}`}>
                          {getStatusLabel(quote.status)}
                        </span>
                        <span className="text-xs text-neutral-500">{clients.find(c => c.id === quote.client_id)?.name || '-'}</span>
                      </div>
                      {quote.status === 'pending_collaborators' && quote.collaborators_invited && (
                        <div className="flex items-center gap-1.5 mb-2 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                          <Users className="w-3 h-3" />
                          <span>{quote.collaborators_responded || 0}/{quote.collaborators_invited} responses</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${quote.id}/document`); }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          {quote.status !== 'accepted' && quote.status !== 'approved' ? 'Edit' : 'View'}
                        </button>
                        {!quote.project_id && (quote.status === 'sent' || quote.status === 'approved' || quote.status === 'accepted' || quote.status === 'pending_collaborators' || quote.status === 'draft') && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleConvertToProject(quote); }}
                            disabled={convertingQuoteId === quote.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50"
                          >
                            <ArrowRight className="w-3 h-3" />
                            {convertingQuoteId === quote.id ? 'Converting...' : 'Convert'}
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(activeQuoteMenu === quote.id ? null : quote.id); }}
                          className="ml-auto p-1 hover:bg-neutral-100 rounded"
                        >
                          <MoreHorizontal className="w-4 h-4 text-neutral-500" />
                        </button>
                      </div>
                      {activeQuoteMenu === quote.id && (
                        <div className="mt-2 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20" onClick={(e) => e.stopPropagation()}>
                          <button onClick={(e) => { e.stopPropagation(); generateQuotePDF(quote); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50">
                            <Printer className="w-3.5 h-3.5" /> Download PDF
                          </button>
                          {quote.status === 'draft' && (
                            <button onClick={(e) => { e.stopPropagation(); updateQuoteStatus(quote.id, 'sent'); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50">
                              <Send className="w-3.5 h-3.5" /> Mark as Sent
                            </button>
                          )}
                          {(quote.status === 'sent' || quote.status === 'draft') && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); updateQuoteStatus(quote.id, 'accepted'); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-900 hover:bg-neutral-100">
                                <Check className="w-3.5 h-3.5" /> Mark as Accepted
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); updateQuoteStatus(quote.id, 'declined'); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-900 hover:bg-neutral-100">
                                <XCircle className="w-3.5 h-3.5" /> Mark as Declined
                              </button>
                            </>
                          )}
                          <div className="border-t border-neutral-100 my-1"></div>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteQuote(quote.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" /> Delete Quote
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredQuotes.length === 0 && (
                <div className="text-center py-12 text-neutral-500 text-sm">No quotes found</div>
              )}
            </div>

            {/* Desktop Table View */}
            <table className="w-full hidden lg:table">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">Quote</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">Views</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">Valid Until</th>
                  <th className="w-48"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-neutral-600" />
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900">{quote.title}</p>
                          <p className="text-sm text-neutral-500">{quote.quote_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-neutral-600">
                      {clients.find(c => c.id === quote.client_id)?.name || '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-neutral-900">{formatCurrency(quote.total_amount)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        {getStatusLabel(quote.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {(quote.view_count ?? 0) > 0 ? (
                        <div className="text-sm">
                          <div className="flex items-center gap-1 text-[#476E66] font-medium">
                            <Eye className="w-3.5 h-3.5" />
                            {quote.view_count} view{quote.view_count !== 1 ? 's' : ''}
                          </div>
                          {quote.last_viewed_at && (
                            <div className="text-xs text-neutral-400 mt-0.5">
                              Last: {new Date(quote.last_viewed_at).toLocaleDateString()} {new Date(quote.last_viewed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-sm">Not viewed</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-neutral-600">
                      {quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 relative">
                        {quote.status !== 'accepted' && quote.status !== 'approved' ? (
                          <button 
                            onClick={() => navigate(`/quotes/${quote.id}/document`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors"
                            title="Edit Quote Document"
                          >
                            <Eye className="w-4 h-4" />
                            Edit
                          </button>
                        ) : (
                          <button 
                            onClick={() => navigate(`/quotes/${quote.id}/document`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors"
                            title="View Quote Document"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                        )}
                        {!quote.project_id && (quote.status === 'sent' || quote.status === 'approved' || quote.status === 'accepted' || quote.status === 'pending_collaborators' || quote.status === 'draft') && (
                          <button 
                            onClick={() => handleConvertToProject(quote)}
                            disabled={convertingQuoteId === quote.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50"
                            title="Convert to Project"
                          >
                            <ArrowRight className="w-4 h-4" />
                            {convertingQuoteId === quote.id ? 'Converting...' : 'Convert'}
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(activeQuoteMenu === quote.id ? null : quote.id); }}
                          className="p-1.5 hover:bg-neutral-100 rounded-lg"
                        >
                          <MoreHorizontal className="w-4 h-4 text-neutral-500" />
                        </button>
                        {activeQuoteMenu === quote.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-neutral-100 py-1 z-20" onClick={(e) => e.stopPropagation()}>
                            <button onClick={(e) => { e.stopPropagation(); generateQuotePDF(quote); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                              <Printer className="w-4 h-4" /> Download PDF
                            </button>
                            {quote.status === 'draft' && (
                              <button onClick={(e) => { e.stopPropagation(); updateQuoteStatus(quote.id, 'sent'); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                                <Send className="w-4 h-4" /> Mark as Sent
                              </button>
                            )}
                            {(quote.status === 'sent' || quote.status === 'draft') && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); updateQuoteStatus(quote.id, 'accepted'); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-100">
                                  <Check className="w-4 h-4" /> Mark as Accepted
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); updateQuoteStatus(quote.id, 'declined'); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-100">
                                  <XCircle className="w-4 h-4" /> Mark as Declined
                                </button>
                              </>
                            )}
                            <div className="border-t border-neutral-100 my-1"></div>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteQuote(quote.id); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" /> Delete Quote
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredQuotes.length === 0 && (
              <div className="text-center py-12 text-neutral-500 hidden lg:block">No quotes found</div>
            )}
          </div>
        ) : (
          /* Grouped View - for both Clients and Leads */
          quoteSourceTab === 'clients' ? (
          <div className="space-y-4">
            {(() => {
              const grouped: Record<string, Quote[]> = {};
              filteredQuotes.forEach(q => {
                const clientName = clients.find(c => c.id === q.client_id)?.name || 'Unassigned';
                if (!grouped[clientName]) grouped[clientName] = [];
                grouped[clientName].push(q);
              });
              const sortedClients = Object.keys(grouped).sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));
              return sortedClients.map(clientName => {
                const clientQuotes = grouped[clientName];
                const clientTotal = clientQuotes.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);
                return (
                  <div key={clientName} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <button
                      onClick={() => toggleClientExpanded(clientName)}
                      className="w-full flex items-center justify-between px-3 py-3 sm:px-4 sm:py-4 bg-neutral-50 hover:bg-neutral-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {expandedClients.has(clientName) ? <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500 flex-shrink-0" />}
                        <div className="min-w-0">
                          <span className="font-semibold text-neutral-900 text-sm sm:text-base truncate block">{clientName}</span>
                          <span className="text-xs sm:text-sm text-neutral-500">({clientQuotes.length} quote{clientQuotes.length !== 1 ? 's' : ''})</span>
                      </div>
                      </div>
                      <span className="font-semibold text-neutral-900 text-sm sm:text-base flex-shrink-0">{formatCurrency(clientTotal)}</span>
                    </button>
                    {expandedClients.has(clientName) && (
                      <div className="divide-y divide-neutral-100">
                        {clientQuotes.map(quote => (
                          <div key={quote.id} className="hover:bg-neutral-50 cursor-pointer" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                            {/* Mobile Layout */}
                            <div className="block lg:hidden p-3">
                              <div className="flex items-start gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-neutral-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="font-medium text-neutral-900 text-sm truncate flex-1">{quote.title}</p>
                                    <span className="font-semibold text-neutral-900 text-sm flex-shrink-0">{formatCurrency(quote.total_amount)}</span>
                                  </div>
                                  <p className="text-xs text-neutral-500 mb-1.5">
                                    {quote.quote_number} • {new Date(quote.created_at || '').toLocaleDateString()}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${getStatusColor(quote.status)}`}>
                                      {getStatusLabel(quote.status)}
                                    </span>
                                    {(quote.view_count ?? 0) > 0 && (
                                      <span className="text-[10px] text-[#476E66] flex items-center gap-0.5">
                                        <Eye className="w-3 h-3" /> {quote.view_count}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pl-10">
                                {!quote.project_id && (quote.status === 'sent' || quote.status === 'approved' || quote.status === 'accepted' || quote.status === 'pending' || quote.status === 'pending_collaborators' || quote.status === 'draft') && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleConvertToProject(quote); }}
                                    disabled={convertingQuoteId === quote.id}
                                    className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors disabled:opacity-50"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                    {convertingQuoteId === quote.id ? '...' : 'Convert'}
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(activeQuoteMenu === quote.id ? null : quote.id); }}
                                  className="ml-auto p-1 hover:bg-neutral-100 rounded"
                                >
                                  <MoreHorizontal className="w-4 h-4 text-neutral-500" />
                                </button>
                              </div>
                              {activeQuoteMenu === quote.id && (
                                <div className="mt-2 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(null); navigate(`/quotes/${quote.id}/document`); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50">
                                    <Edit2 className="w-3.5 h-3.5" /> Edit
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleRecreateQuote(quote); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50">
                                    <Copy className="w-3.5 h-3.5" /> Recreate
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); generateQuotePDF(quote); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50">
                                    <Printer className="w-3.5 h-3.5" /> Download PDF
                                  </button>
                                  <div className="border-t border-neutral-100 my-1"></div>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteQuote(quote.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50">
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Desktop Layout */}
                            <div className="hidden lg:flex items-center gap-4 px-6 py-3">
                            <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-neutral-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-neutral-900 truncate">{quote.title}</p>
                              <p className="text-sm text-neutral-500">
                                {quote.quote_number} • {new Date(quote.created_at || '').toLocaleDateString()}
                                {(quote.view_count ?? 0) > 0 && (
                                  <span className="ml-2 text-[#476E66]">
                                    • <Eye className="w-3 h-3 inline" /> {quote.view_count} view{quote.view_count !== 1 ? 's' : ''}
                                    {quote.last_viewed_at && ` (${new Date(quote.last_viewed_at).toLocaleDateString()} ${new Date(quote.last_viewed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center shrink-0">
                              <span className="font-medium text-neutral-900 w-24 text-right">{formatCurrency(quote.total_amount)}</span>
                              <span className={`w-20 text-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(quote.status)}`}>
                                {getStatusLabel(quote.status)}
                              </span>
                              <div className="w-20 flex justify-center">
                                {!quote.project_id && (quote.status === 'sent' || quote.status === 'approved' || quote.status === 'accepted' || quote.status === 'pending' || quote.status === 'pending_collaborators' || quote.status === 'draft') ? (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleConvertToProject(quote); }}
                                    disabled={convertingQuoteId === quote.id}
                                      className="flex items-center gap-1 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors disabled:opacity-50"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                    {convertingQuoteId === quote.id ? '...' : 'Convert'}
                                  </button>
                                ) : <span className="text-xs text-neutral-300">—</span>}
                              </div>
                              <div className="relative w-8 flex justify-center">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(activeQuoteMenu === quote.id ? null : quote.id); }}
                                  className="p-1.5 hover:bg-neutral-100 rounded-md transition-colors"
                                >
                                  <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                                </button>
                                {activeQuoteMenu === quote.id && (
                                  <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-neutral-100 py-1 z-50" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(null); navigate(`/quotes/${quote.id}/document`); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                                      <Edit2 className="w-4 h-4" /> Edit
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleRecreateQuote(quote); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                                      <Copy className="w-4 h-4" /> Recreate
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); generateQuotePDF(quote); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                                      <Printer className="w-4 h-4" /> Download PDF
                                    </button>
                                    <div className="border-t border-neutral-100 my-1"></div>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteQuote(quote.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                                      <Trash2 className="w-4 h-4" /> Delete
                                    </button>
                                  </div>
                                )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            {filteredQuotes.length === 0 && (
              <div className="text-center py-12 text-sm text-neutral-500 bg-white rounded-2xl" style={{ boxShadow: 'var(--shadow-card)' }}>No quotes found</div>
            )}
          </div>
          ) : (
          /* Leads Grouped View */
          <div className="space-y-4">
            {(() => {
              const grouped: Record<string, Quote[]> = {};
              filteredQuotes.forEach(q => {
                const leadName = leads.find(l => l.id === q.lead_id)?.name || 'Unassigned';
                if (!grouped[leadName]) grouped[leadName] = [];
                grouped[leadName].push(q);
              });
              const sortedLeads = Object.keys(grouped).sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));
              return sortedLeads.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">No Lead Quotes</h3>
                  <p className="text-neutral-500">Create a proposal for a lead to see it here</p>
                </div>
              ) : sortedLeads.map(leadName => {
                const leadQuotes = grouped[leadName];
                const leadTotal = leadQuotes.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);
                const draftQuotes = leadQuotes.filter(q => q.status === 'draft');
                const sentQuotes = leadQuotes.filter(q => q.status === 'sent');
                const signedQuotes = leadQuotes.filter(q => q.status === 'accepted' || q.status === 'approved');
                return (
                  <div key={leadName} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <button
                      onClick={() => toggleClientExpanded(leadName)}
                      className="w-full flex items-center justify-between px-3 py-3 sm:px-4 sm:py-4 bg-neutral-50 hover:bg-neutral-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {expandedClients.has(leadName) ? <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500 flex-shrink-0" />}
                        <div className="min-w-0">
                          <span className="font-semibold text-neutral-900 text-sm sm:text-base truncate block">{leadName}</span>
                          <span className="text-xs sm:text-sm text-neutral-500">({leadQuotes.length} quote{leadQuotes.length !== 1 ? 's' : ''})</span>
                        </div>
                      </div>
                      <span className="font-semibold text-neutral-900 text-sm sm:text-base flex-shrink-0">{formatCurrency(leadTotal)}</span>
                    </button>
                    {expandedClients.has(leadName) && (
                      <div className="divide-y divide-neutral-100">
                        {draftQuotes.length > 0 && (
                          <div>
                            <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200">
                              <span className="text-xs font-semibold text-neutral-600 uppercase">Draft ({draftQuotes.length})</span>
                            </div>
                            {draftQuotes.map(quote => (
                              <div key={quote.id} className="px-4 py-3 hover:bg-neutral-50 cursor-pointer flex items-center justify-between gap-2" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-neutral-900 text-sm truncate">{quote.title}</p>
                                    <p className="text-xs text-neutral-500">{quote.quote_number} • {new Date(quote.created_at || '').toLocaleDateString()}
                                      {(quote.view_count ?? 0) > 0 && (
                                        <span className="ml-1"> • <Eye className="w-3 h-3 inline" /> {quote.view_count} view{quote.view_count !== 1 ? 's' : ''} ({new Date(quote.last_viewed_at || '').toLocaleDateString()} {new Date(quote.last_viewed_at || '').toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-medium text-neutral-900 text-sm flex-shrink-0">{formatCurrency(quote.total_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {sentQuotes.length > 0 && (
                          <div>
                            <div className="px-4 py-2 bg-blue-50/50 border-b border-blue-100">
                              <span className="text-xs font-semibold text-blue-700 uppercase">Sent ({sentQuotes.length})</span>
                            </div>
                            {sentQuotes.map(quote => (
                              <div key={quote.id} className="px-4 py-3 hover:bg-neutral-50 cursor-pointer flex items-center justify-between gap-2" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-neutral-900 text-sm truncate">{quote.title}</p>
                                    <p className="text-xs text-neutral-500">{quote.quote_number} • {new Date(quote.created_at || '').toLocaleDateString()}
                                      {(quote.view_count ?? 0) > 0 && (
                                        <span className="ml-1"> • <Eye className="w-3 h-3 inline" /> {quote.view_count} view{quote.view_count !== 1 ? 's' : ''} ({new Date(quote.last_viewed_at || '').toLocaleDateString()} {new Date(quote.last_viewed_at || '').toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-medium text-neutral-900 text-sm flex-shrink-0">{formatCurrency(quote.total_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {signedQuotes.length > 0 && (
                          <div>
                            <div className="px-4 py-2 bg-emerald-50/50 border-b border-emerald-100">
                              <span className="text-xs font-semibold text-emerald-700 uppercase">Signed ({signedQuotes.length})</span>
                            </div>
                            {signedQuotes.map(quote => (
                              <div key={quote.id} className="px-4 py-3 hover:bg-neutral-50 cursor-pointer flex items-center justify-between gap-2" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-neutral-900 text-sm truncate">{quote.title}</p>
                                    <p className="text-xs text-neutral-500">{quote.quote_number} • {new Date(quote.created_at || '').toLocaleDateString()}
                                      {(quote.view_count ?? 0) > 0 && (
                                        <span className="ml-1"> • <Eye className="w-3 h-3 inline" /> {quote.view_count} view{quote.view_count !== 1 ? 's' : ''} ({new Date(quote.last_viewed_at || '').toLocaleDateString()} {new Date(quote.last_viewed_at || '').toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-medium text-neutral-900 text-sm flex-shrink-0">{formatCurrency(quote.total_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          )
          )
          )}

          {/* Templates Subtab */}
          {proposalsSubTab === 'templates' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {templates.length === 0 ? (
            <div className="text-center py-16 px-4">
              <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">No Templates Yet</h3>
              <p className="text-neutral-500 text-sm mb-6 max-w-md mx-auto">
                Templates help you quickly create proposals. Create a proposal and click "Save as Template" to get started.
              </p>
              <button
                onClick={() => setShowProposalChoiceModal({ type: 'client' })}
                className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
              >
                Create Your First Proposal
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {templates.filter(t => 
                t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.category?.toLowerCase().includes(searchTerm.toLowerCase())
              ).map(template => (
                <div key={template.id} className="p-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-[#476E66]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-[#476E66]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-neutral-900">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-neutral-500 mt-0.5 line-clamp-1">{template.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {template.category && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 rounded text-xs text-neutral-600">
                              <Tag className="w-3 h-3" />
                              {template.category}
                            </span>
                          )}
                          {template.client_type && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 rounded text-xs text-neutral-600">
                              <User className="w-3 h-3" />
                              {template.client_type}
                            </span>
                          )}
                          <span className="text-xs text-neutral-400">
                            Used {template.use_count}x
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => navigate(`/quotes/new/document?template_id=${template.id}`)}
                        className="px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
                      >
                        Use Template
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(activeQuoteMenu === template.id ? null : template.id); }}
                          className="p-2 hover:bg-neutral-100 rounded-lg"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {activeQuoteMenu === template.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10 min-w-[120px]">
                            <button
                              onClick={async () => {
                                setActiveQuoteMenu(null);
                                if (confirm('Delete this template?')) {
                                  try {
                                    await api.deleteProposalTemplate(template.id);
                                    setTemplates(templates.filter(t => t.id !== template.id));
                                  } catch (e) {
                                    console.error('Failed to delete template:', e);
                                  }
                                }
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          )}

          {/* Collaborations Subtab */}
          {proposalsSubTab === 'collaborations' && (
            <div className="space-y-4">
              {sentCollaborations.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
                  <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="w-6 h-6 text-neutral-400" />
                  </div>
                  <h3 className="text-base font-semibold text-neutral-900 mb-1">No collaborations yet</h3>
                  <p className="text-sm text-neutral-500">When you invite collaborators to your proposals, they'll appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group collaborations by parent_quote_id */}
                  {Object.entries(
                    sentCollaborations.reduce((acc, collab) => {
                      const key = collab.parent_quote_id;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(collab);
                      return acc;
                    }, {} as Record<string, typeof sentCollaborations>)
                  ).map(([quoteId, collabs]) => {
                    const firstCollab = collabs[0];
                    const submittedCount = collabs.filter(c => c.status === 'submitted' || c.status === 'merged').length;
                    const pendingCount = collabs.filter(c => c.status === 'pending' || c.status === 'accepted').length;
                    const mergedCount = collabs.filter(c => c.status === 'merged').length;
                    const allMerged = mergedCount === collabs.length;
                    const hasSubmitted = collabs.some(c => c.status === 'submitted');
                    
                    return (
                      <div key={quoteId} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                        {/* Proposal Header */}
                        <div 
                          className="p-4 bg-gradient-to-r from-neutral-50 to-white border-b border-neutral-100 cursor-pointer hover:bg-neutral-50 transition-colors"
                          onClick={() => navigate(`/quotes/${quoteId}/document?step=5`)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                allMerged ? 'bg-purple-100' : hasSubmitted ? 'bg-emerald-100' : 'bg-amber-100'
                              }`}>
                                {allMerged ? (
                                  <Check className="w-5 h-5 text-purple-600" />
                                ) : (
                                  <Users className="w-5 h-5 text-amber-600" />
                                )}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-neutral-900 text-lg">
                                  {firstCollab.parent_quote?.title || 'Untitled Proposal'}
                                </h3>
                                {((firstCollab.parent_quote as any)?.client?.name || (firstCollab.parent_quote as any)?.client?.company_name) && (
                                  <p className="text-sm text-neutral-600 mt-0.5">
                                    Client: <span className="font-medium">{(firstCollab.parent_quote as any)?.client?.company_name || (firstCollab.parent_quote as any)?.client?.name}</span>
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-sm">
                                  <span className="text-neutral-500">
                                    Shared with <span className="font-semibold text-neutral-700">{collabs.length}</span> collaborator{collabs.length > 1 ? 's' : ''}
                                  </span>
                                  <span className="text-neutral-300">•</span>
                                  {submittedCount > 0 && (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                                      {submittedCount} ready
                                    </span>
                                  )}
                                  {pendingCount > 0 && (
                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                                      {pendingCount} pending
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${quoteId}/document`); }}
                              className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium flex-shrink-0"
                            >
                              View Proposal
                            </button>
                          </div>
                        </div>
                        
                        {/* Collaborators List */}
                        <div className="divide-y divide-neutral-100">
                          {collabs.map((collab) => (
                            <div key={collab.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-neutral-50 transition-colors">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  collab.status === 'merged' ? 'bg-purple-100' :
                                  collab.status === 'submitted' ? 'bg-emerald-100' :
                                  collab.status === 'declined' ? 'bg-red-100' : 'bg-neutral-100'
                                }`}>
                                  {collab.status === 'merged' ? (
                                    <Check className="w-4 h-4 text-purple-600" />
                                  ) : collab.status === 'submitted' ? (
                                    <Check className="w-4 h-4 text-emerald-600" />
                                  ) : collab.status === 'declined' ? (
                                    <XCircle className="w-4 h-4 text-red-500" />
                                  ) : (
                                    <Clock className="w-4 h-4 text-neutral-400" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-neutral-900 truncate">
                                    {collab.collaborator_name || collab.collaborator_email}
                                  </p>
                                  {collab.collaborator_company_name && (
                                    <p className="text-xs text-neutral-500 truncate">{collab.collaborator_company_name}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  collab.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                                  collab.status === 'accepted' ? 'bg-blue-50 text-blue-600' :
                                  collab.status === 'submitted' ? 'bg-emerald-50 text-emerald-600' :
                                  collab.status === 'merged' ? 'bg-purple-50 text-purple-600' :
                                  collab.status === 'declined' ? 'bg-red-50 text-red-600' : 'bg-neutral-100 text-neutral-600'
                                }`}>
                                  {collab.status === 'merged' ? 'Merged ✓' : 
                                   collab.status === 'submitted' ? 'Submitted' :
                                   collab.status === 'accepted' ? 'Working' :
                                   collab.status === 'declined' ? 'Declined' : 'Pending'}
                                </span>
                                {collab.status === 'submitted' && collab.response_quote_id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${quoteId}/document?merge_collaboration_id=${collab.id}`); }}
                                    className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs font-medium"
                                  >
                                    Review & Merge
                                  </button>
                                )}
                                {/* Sign & Approve button - shows when merged AND parent quote is approved by client */}
                                {collab.status === 'merged' && firstCollab.parent_quote?.status === 'approved' && !collab.owner_signed_at && collab.response_quote_id && (
                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation();
                                      // Navigate to collaborator's response quote for signing
                                      navigate(`/quotes/${collab.response_quote_id}/document?sign_mode=owner&collaboration_id=${collab.id}`);
                                    }}
                                    className="px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-medium flex items-center gap-1"
                                  >
                                    <FileSignature className="w-3 h-3" />
                                    Sign & Approve
                                  </button>
                                )}
                                {/* Already signed indicator */}
                                {collab.status === 'merged' && collab.owner_signed_at && (
                                  <span className="px-2 py-1 bg-green-50 text-green-600 rounded text-xs font-medium flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Signed
                                  </span>
                                )}
                                {collab.status === 'declined' && (
                                  <button
                                    onClick={async (e) => { 
                                      e.stopPropagation();
                                      try {
                                        await supabase.from('proposal_collaborations').delete().eq('id', collab.id);
                                        setSentCollaborations(prev => prev.filter(c => c.id !== collab.id));
                                        showToast?.('Collaboration removed', 'success');
                                      } catch (err) {
                                        console.error('Failed to remove:', err);
                                        showToast?.('Failed to remove', 'error');
                                      }
                                    }}
                                    className="px-2.5 py-1 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-xs font-medium"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Action Footer - Show when there are ready responses */}
                        {hasSubmitted && !allMerged && (
                          <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-100 flex items-center justify-between">
                            <p className="text-sm text-emerald-700">
                              <span className="font-semibold">{submittedCount}</span> response{submittedCount > 1 ? 's' : ''} ready to merge
                              {pendingCount > 0 && <span className="text-emerald-600"> • {pendingCount} still pending</span>}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => navigate(`/quotes/${quoteId}/document?merge_collaboration_id=${collabs.find(c => c.status === 'submitted')?.id}`)}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                              >
                                Merge Now
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {/* Client Approved Footer - Show when client approved and there are unsigned collaborators */}
                        {firstCollab.parent_quote?.status === 'approved' && allMerged && collabs.some(c => !c.owner_signed_at) && (
                          <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-t border-purple-100 flex items-center gap-2">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                              <FileSignature className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-purple-900">Client Approved ✓</p>
                              <p className="text-xs text-purple-600">
                                Click "Sign & Approve" next to each collaborator to review and sign their proposal
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* All Signed Success Footer */}
                        {firstCollab.parent_quote?.status === 'approved' && allMerged && collabs.every(c => c.owner_signed_at) && (
                          <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border-t border-green-100 flex items-center gap-2">
                            <Check className="w-5 h-5 text-green-600" />
                            <p className="text-sm font-medium text-green-800">
                              All collaborators signed • Projects created successfully
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Collaboration Inbox - Shows received collaboration requests (now inside Proposals tab) */}
      {activeTab === 'proposals' && proposalsSubTab === 'inbox' && (
        <div className="space-y-4">
          {collaborationInbox.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
              <Mail className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">No Pending Invitations</h3>
              <p className="text-neutral-500 text-sm max-w-md mx-auto">
                When other users invite you to collaborate on proposals, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="divide-y divide-neutral-100">
                {collaborationInbox.map((collab) => (
                  <div key={collab.id} className="p-4 hover:bg-neutral-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-[#476E66]/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <Mail className="w-5 h-5 text-[#476E66]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-neutral-900">
                            {(collab.parent_quote as any)?.description || collab.parent_quote?.title || 'Collaboration Request'}
                          </h3>
                          <p className="text-sm text-neutral-600 mt-0.5">
                            <span className="font-medium">{collab.owner_profile?.full_name || collab.owner_profile?.email || 'Someone'}</span>
                            {' invited you to collaborate'}
                          </p>
                          {collab.owner_profile?.company_name && (
                            <p className="text-xs text-neutral-500 mt-0.5">{collab.owner_profile.company_name}</p>
                          )}
                          {collab.message && (
                            <p className="text-sm text-neutral-500 mt-2 italic">"{collab.message}"</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs text-neutral-500">
                            <span>{new Date(collab.invited_at).toLocaleDateString()}</span>
                            {collab.share_line_items && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">Shared scope</span>
                            )}
                            <span className={`px-2 py-0.5 rounded ${
                              collab.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                              collab.status === 'accepted' ? 'bg-blue-50 text-blue-600' :
                              collab.status === 'submitted' ? 'bg-emerald-50 text-emerald-600' :
                              collab.status === 'merged' ? 'bg-purple-50 text-purple-600' : 'bg-neutral-100 text-neutral-600'
                            }`}>
                              {collab.status === 'submitted' ? 'Submitted ✓' :
                               collab.status === 'merged' ? 'Merged & Complete' : collab.status}
                            </span>
                          </div>
                          {/* What's Next messaging */}
                          {collab.status === 'submitted' && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                              Waiting for {collab.owner_profile?.full_name || 'owner'} to review and merge
                            </p>
                          )}
                          {collab.status === 'merged' && (
                            <p className="text-xs text-purple-600 mt-2">
                              ✓ Your contribution has been merged into the final proposal
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {collab.status === 'pending' && (
                          <>
                            <button
                              onClick={async () => {
                                if (!profile?.id || !profile?.company_id) {
                                  console.error('[Inbox] Missing profile data:', { userId: profile?.id, companyId: profile?.company_id });
                                  showToast?.('Unable to accept: Profile data not loaded. Please refresh the page.', 'error');
                                  return;
                                }
                                try {
                                  console.log('[Inbox] Accepting collaboration:', collab.id, 'owner_profile:', collab.owner_profile, 'parent_quote:', collab.parent_quote);
                                  await collaborationApi.acceptInvitation(collab.id, profile.id, profile.company_id);
                                  
                                  // Get owner email - either from enriched data or fetch directly
                                  let ownerEmail = collab.owner_profile?.email;
                                  let ownerName = collab.owner_profile?.full_name || '';
                                  let ownerCompany = collab.owner_profile?.company_name || '';
                                  
                                  // Fallback: if owner_profile not enriched, fetch from collaboration record
                                  if (!ownerEmail && collab.owner_user_id) {
                                    console.log('[Inbox] owner_profile missing, fetching from DB for user:', collab.owner_user_id);
                                    try {
                                      const { data: ownerData } = await supabase
                                        .from('profiles')
                                        .select('email, full_name, company_id')
                                        .eq('id', collab.owner_user_id)
                                        .single();
                                      if (ownerData) {
                                        ownerEmail = ownerData.email;
                                        ownerName = ownerData.full_name || '';
                                        // Fetch company name
                                        if (ownerData.company_id) {
                                          const { data: companyData } = await supabase
                                            .from('companies')
                                            .select('company_name')
                                            .eq('id', ownerData.company_id)
                                            .single();
                                          ownerCompany = companyData?.company_name || '';
                                        }
                                        console.log('[Inbox] Fetched owner data:', { ownerEmail, ownerName, ownerCompany });
                                      }
                                    } catch (fetchErr) {
                                      console.error('[Inbox] Failed to fetch owner data:', fetchErr);
                                    }
                                  }
                                  
                                  // Create or find lead for the inviting company
                                  let leadId = '';
                                  if (ownerEmail) {
                                    try {
                                      // First check if lead exists in current company
                                      const existingLeads = await leadsApi.getLeads(profile.company_id);
                                      const existingLead = existingLeads.find(l => 
                                        l.email?.toLowerCase() === ownerEmail!.toLowerCase()
                                      );
                                      
                                      if (existingLead) {
                                        leadId = existingLead.id;
                                        console.log('[Inbox] Found existing lead:', existingLead.id, existingLead.email);
                                      } else {
                                        // Try to create new lead
                                        try {
                                          const newLead = await leadsApi.createLead({
                                            company_id: profile.company_id,
                                            email: ownerEmail,
                                            name: ownerName,
                                            company_name: ownerCompany,
                                            source: 'referral',
                                            status: 'qualified',
                                            notes: `Added automatically from collaboration on "${collab.parent_quote?.title || 'proposal'}"`
                                          });
                                          leadId = newLead.id;
                                          console.log('[Inbox] Created new lead:', newLead.id, ownerEmail, ownerCompany);
                                        } catch (createErr: any) {
                                          // If duplicate error, search by email directly
                                          if (createErr?.code === '23505' || createErr?.message?.includes('duplicate')) {
                                            console.log('[Inbox] Lead exists elsewhere, searching by email...');
                                            const { data: foundLead } = await supabase
                                              .from('leads')
                                              .select('id, email')
                                              .eq('email', ownerEmail.toLowerCase())
                                              .eq('company_id', profile.company_id)
                                              .maybeSingle();
                                            if (foundLead) {
                                              leadId = foundLead.id;
                                              console.log('[Inbox] Found lead by direct query:', foundLead.id);
                                            } else {
                                              console.warn('[Inbox] Lead exists in different company, cannot use');
                                            }
                                          } else {
                                            throw createErr;
                                          }
                                        }
                                      }
                                    } catch (leadErr: any) {
                                      console.error('[Inbox] Could not create/find lead:', leadErr?.message, leadErr);
                                    }
                                  } else {
                                    console.warn('[Inbox] No owner email available, cannot create lead');
                                  }
                                  
                                  // Navigate to create the response
                                  const projectTitle = encodeURIComponent(collab.parent_quote?.title || '');
                                  const navUrl = `/quotes/new/document?collaboration_id=${collab.id}&parent_quote_id=${collab.parent_quote_id}&project_title=${projectTitle}${leadId ? `&lead_id=${leadId}` : ''}`;
                                  console.log('[Inbox] Navigating to:', navUrl);
                                  showToast?.('Invitation accepted! Redirecting to create your response...', 'success');
                                  navigate(navUrl);
                                } catch (err: any) {
                                  console.error('Failed to accept:', err);
                                  showToast?.(err?.message || 'Failed to accept invitation', 'error');
                                }
                              }}
                              className="px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
                            >
                              Accept
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  // Optimistically remove from UI
                                  setCollaborationInbox(prev => prev.filter(c => c.id !== collab.id));
                                  
                                  await collaborationApi.declineInvitation(collab.id);
                                  
                                  // Notify the owner
                                  if (collab.owner_company_id) {
                                    const projectTitle = collab.parent_quote?.title || 'Project';
                                    const collaboratorName = profile?.full_name || profile?.email || 'A collaborator';
                                    NotificationService.collaborationDeclined(
                                      collab.owner_company_id,
                                      projectTitle,
                                      collaboratorName,
                                      collab.parent_quote_id
                                    ).catch(err => console.warn('Failed to send decline notification:', err));
                                  }
                                  
                                  showToast?.('Invitation declined', 'success');
                                } catch (err: any) {
                                  console.error('Failed to decline:', err);
                                  showToast?.(err?.message || 'Failed to decline invitation', 'error');
                                  loadData(); // Reload to restore state
                                }
                              }}
                              className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {(collab.status === 'submitted' || collab.status === 'merged') && collab.response_quote_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${collab.response_quote_id}/document?step=5`); }}
                            className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                          >
                            View My Response
                          </button>
                        )}
                        {collab.status === 'accepted' && (
                          <button
                            onClick={async () => {
                              if (!profile?.company_id) return;
                              
                              // Get owner email - from enriched data or fetch directly
                              let ownerEmail = collab.owner_profile?.email;
                              
                              // Fallback: fetch from DB if not enriched
                              if (!ownerEmail && collab.owner_user_id) {
                                console.log('[Inbox] CreateResponse: owner_profile missing, fetching...');
                                try {
                                  const { data: ownerData } = await supabase
                                    .from('profiles')
                                    .select('email')
                                    .eq('id', collab.owner_user_id)
                                    .single();
                                  ownerEmail = ownerData?.email;
                                } catch (e) {
                                  console.error('[Inbox] Failed to fetch owner:', e);
                                }
                              }
                              
                              // Find the lead for the inviting company
                              let leadId = '';
                              if (ownerEmail) {
                                try {
                                  // Direct query for lead by email in current company
                                  const { data: foundLead } = await supabase
                                    .from('leads')
                                    .select('id, email')
                                    .eq('email', ownerEmail.toLowerCase())
                                    .eq('company_id', profile.company_id)
                                    .maybeSingle();
                                  
                                  if (foundLead) {
                                    leadId = foundLead.id;
                                    console.log('[Inbox] CreateResponse: Found lead:', leadId);
                                  } else {
                                    console.log('[Inbox] CreateResponse: No lead found for', ownerEmail, 'in company', profile.company_id);
                                  }
                                } catch (err) {
                                  console.warn('[Inbox] Could not find lead:', err);
                                }
                              }
                              
                              const projectTitle = encodeURIComponent(collab.parent_quote?.title || '');
                              const navUrl = `/quotes/new/document?collaboration_id=${collab.id}&parent_quote_id=${collab.parent_quote_id}&project_title=${projectTitle}${leadId ? `&lead_id=${leadId}` : ''}`;
                              console.log('[Inbox] CreateResponse navigating:', navUrl);
                              navigate(navUrl);
                            }}
                            className="px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
                          >
                            Create Response
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Signature Modal */}
      {selectedSignature && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSignature(null)}>
          <div className="bg-white rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-neutral-900">Signature</h3>
              <button onClick={() => setSelectedSignature(null)} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">Signed by</p>
                <p className="font-medium text-sm">{selectedSignature.signer_name}</p>
                {selectedSignature.signer_title && <p className="text-xs text-neutral-600">{selectedSignature.signer_title}</p>}
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-2">Signature</p>
                <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
                  <img src={selectedSignature.signature_data} alt="Signature" className="max-w-full h-auto" />
                </div>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Date</p>
                <p className="font-medium text-sm">{selectedSignature.responded_at ? new Date(selectedSignature.responded_at).toLocaleString() : '-'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Modal */}
      {showQuoteModal && (
        <QuoteModal
          quote={editingQuote}
          clients={clients}
          companyId={profile?.company_id || ''}
          onClose={() => { setShowQuoteModal(false); setEditingQuote(null); }}
          onSave={() => { loadData(); setShowQuoteModal(false); setEditingQuote(null); }}
        />
      )}

      {/* Mobile Floating Action Button */}
      <button
        onClick={() => {
          if (activeTab === 'leads') {
            setEditingLead(null);
            setShowLeadModal(true);
          } else if (activeTab === 'clients') {
            checkAndProceed('clients', clients.length, () => {
              setSelectedClient(null);
              setIsAddingNewClient(true);
            });
          } else if (activeTab === 'proposals') {
            setShowProposalChoiceModal({ type: 'client' });
          }
        }}
        className="sm:hidden fixed right-4 bottom-20 w-14 h-14 bg-[#476E66] text-white rounded-full shadow-lg hover:bg-[#3A5B54] transition-all flex items-center justify-center z-40"
        style={{ boxShadow: '0 4px 12px rgba(71, 110, 102, 0.4)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Mobile Lead Bottom Sheet */}
      {leadBottomSheet && (
        <div className="sm:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity"
            onClick={() => setLeadBottomSheet(null)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-neutral-300 rounded-full" />
            </div>
            
            {/* Header */}
            <div className="px-4 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#476E66]/10 flex items-center justify-center text-[#476E66] font-semibold text-lg">
                  {leadBottomSheet.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-neutral-900">{leadBottomSheet.name}</h3>
                  {leadBottomSheet.company_name && (
                    <p className="text-sm text-neutral-500">{leadBottomSheet.company_name}</p>
                  )}
                </div>
                
                {/* 3-dot menu */}
                <div className="relative">
                  <button 
                    onClick={() => setShowLeadBottomSheetMenu(!showLeadBottomSheetMenu)}
                    className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  
                  {showLeadBottomSheetMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowLeadBottomSheetMenu(false)} 
                      />
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-neutral-100 py-1 z-20">
                        <button
                          onClick={() => {
                            setShowLeadBottomSheetMenu(false);
                            setLeadBottomSheet(null);
                            setEditingLead(leadBottomSheet);
                            setShowLeadModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            setShowLeadBottomSheetMenu(false);
                            if (confirm('Delete this lead?')) {
                              try {
                                await leadsApi.deleteLead(leadBottomSheet.id);
                                setLeadBottomSheet(null);
                                loadData();
                              } catch (error) {
                                console.error('Failed to delete lead:', error);
                              }
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
                
                <button 
                  onClick={() => { setShowLeadBottomSheetMenu(false); setLeadBottomSheet(null); }}
                  className="p-2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Status Badge */}
            <div className="px-4 py-3 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Status</span>
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-[#476E66]/10 text-[#476E66]">
                  {leadBottomSheet.status?.replace('_', ' ').charAt(0).toUpperCase() + (leadBottomSheet.status?.replace('_', ' ').slice(1) || '')}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="px-4 py-3 space-y-3">
              {leadBottomSheet.estimated_value && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#476E66]/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-[#476E66]" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Est. Value</p>
                    <p className="text-sm font-medium text-neutral-900">${leadBottomSheet.estimated_value.toLocaleString()}</p>
                  </div>
                </div>
              )}
              
              {leadBottomSheet.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#476E66]/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-[#476E66]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-500">Email</p>
                    <p className="text-sm font-medium text-neutral-900 truncate">{leadBottomSheet.email}</p>
                  </div>
                </div>
              )}
              
              {leadBottomSheet.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#476E66]/10 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-[#476E66]" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Phone</p>
                    <p className="text-sm font-medium text-neutral-900">{leadBottomSheet.phone}</p>
                  </div>
                </div>
              )}
              
              {leadBottomSheet.source && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#476E66]/10 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-[#476E66]" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Source</p>
                    <p className="text-sm font-medium text-neutral-900 capitalize">{leadBottomSheet.source.replace('_', ' ')}</p>
                  </div>
                </div>
              )}
              
              {leadBottomSheet.created_at && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-neutral-600" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Created</p>
                    <p className="text-sm font-medium text-neutral-900">{new Date(leadBottomSheet.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-4 border-t border-neutral-100 space-y-2 pb-safe">
              {leadBottomSheet.status !== 'won' && leadBottomSheet.status !== 'lost' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setLeadBottomSheet(null);
                      setShowProposalChoiceModal({ 
                        type: 'lead', 
                        id: leadBottomSheet.id, 
                        name: leadBottomSheet.name, 
                        email: leadBottomSheet.email || '', 
                        company: leadBottomSheet.company_name || '' 
                      });
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-[#476E66] text-white rounded-xl font-medium text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    Proposal
                  </button>
                  <button
                    onClick={() => {
                      setLeadBottomSheet(null);
                      setConvertingLead(leadBottomSheet);
                      setShowConvertModal(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-[#476E66]/20 text-[#476E66] rounded-xl font-medium text-sm"
                  >
                    <Users className="w-4 h-4" />
                    Convert
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lead Modal */}
      {showLeadModal && (
        <LeadModal
          lead={editingLead}
          companyId={profile?.company_id || ''}
          onClose={() => { setShowLeadModal(false); setEditingLead(null); }}
          onSave={() => { loadData(); setShowLeadModal(false); setEditingLead(null); }}
        />
      )}

      {/* Convert Lead to Client Modal */}
      {showConvertModal && convertingLead && (
        <ConvertToClientModal
          lead={convertingLead}
          companyId={profile?.company_id || ''}
          onClose={() => { setShowConvertModal(false); setConvertingLead(null); }}
          onSave={() => { loadData(); setShowConvertModal(false); setConvertingLead(null); }}
        />
      )}

      {/* Won Lead - Prompt to Convert Modal */}
      {showWonConvertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900 mb-2">Lead Won!</h2>
              <p className="text-sm text-neutral-500 mb-6">
                Congratulations on winning <span className="font-medium text-neutral-700">{showWonConvertModal.name}</span>! Would you like to convert them to a client now?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowWonConvertModal(null)} 
                  className="flex-1 px-4 py-2.5 border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                >
                  Later
                </button>
                <button 
                  onClick={() => {
                    setConvertingLead(showWonConvertModal);
                    setShowConvertModal(true);
                    setShowWonConvertModal(null);
                  }} 
                  className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
                >
                  Convert Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proposal Choice Modal - Select Template or Create New */}
      {showProposalChoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-6 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">Create Proposal</h2>
                <button 
                  onClick={() => setShowProposalChoiceModal(null)} 
                  className="p-2 hover:bg-neutral-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>
              <p className="text-sm text-neutral-500 mt-1">How would you like to create your proposal?</p>
            </div>
            <div className="p-4 space-y-3">
              {/* Use Template Option */}
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  if (showProposalChoiceModal.type === 'lead' && showProposalChoiceModal.id) {
                    params.set('lead_id', showProposalChoiceModal.id);
                    if (showProposalChoiceModal.name) params.set('lead_name', showProposalChoiceModal.name);
                    if (showProposalChoiceModal.email) params.set('lead_email', showProposalChoiceModal.email);
                    if (showProposalChoiceModal.company) params.set('lead_company', showProposalChoiceModal.company);
                  }
                  params.set('show_templates', 'true');
                  navigate(`/quotes/new/document?${params.toString()}`);
                  setShowProposalChoiceModal(null);
                }}
                className="w-full flex items-center gap-4 p-4 border-2 border-neutral-200 rounded-xl hover:border-[#476E66] hover:bg-[#476E66]/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#476E66]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#476E66]/20 transition-colors">
                  <FileText className="w-6 h-6 text-[#476E66]" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-neutral-900">Use a Template</h3>
                  <p className="text-sm text-neutral-500">Start from a saved template for faster creation</p>
                </div>
                <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-[#476E66] transition-colors" />
              </button>

              {/* Create Blank Option */}
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  if (showProposalChoiceModal.type === 'lead' && showProposalChoiceModal.id) {
                    params.set('lead_id', showProposalChoiceModal.id);
                    if (showProposalChoiceModal.name) params.set('lead_name', showProposalChoiceModal.name);
                    if (showProposalChoiceModal.email) params.set('lead_email', showProposalChoiceModal.email);
                    if (showProposalChoiceModal.company) params.set('lead_company', showProposalChoiceModal.company);
                  }
                  navigate(`/quotes/new/document${params.toString() ? '?' + params.toString() : ''}`);
                  setShowProposalChoiceModal(null);
                }}
                className="w-full flex items-center gap-4 p-4 border-2 border-neutral-200 rounded-xl hover:border-[#476E66] hover:bg-[#476E66]/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#476E66]/10 transition-colors">
                  <Plus className="w-6 h-6 text-neutral-600 group-hover:text-[#476E66]" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-neutral-900">Create from Scratch</h3>
                  <p className="text-sm text-neutral-500">Start with a blank proposal</p>
                </div>
                <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-[#476E66] transition-colors" />
              </button>
            </div>
            {templates.length > 0 && (
              <div className="px-4 pb-4">
                <p className="text-xs text-neutral-400 text-center">{templates.length} template{templates.length !== 1 ? 's' : ''} available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">{previewTemplate.name}</h2>
                {previewTemplate.description && (
                  <p className="text-sm text-neutral-500 mt-1">{previewTemplate.description}</p>
                )}
              </div>
              <button 
                onClick={() => setPreviewTemplate(null)} 
                className="p-2 hover:bg-neutral-100 rounded-lg"
              >
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Template Info */}
              <div className="flex items-center gap-4 flex-wrap text-sm">
                {previewTemplate.category && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-100 rounded text-neutral-600">
                    <Tag className="w-3.5 h-3.5" />
                    {previewTemplate.category}
                  </span>
                )}
                {previewTemplate.client_type && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-100 rounded text-neutral-600">
                    <User className="w-3.5 h-3.5" />
                    {previewTemplate.client_type}
                  </span>
                )}
                <span className="text-neutral-400">Used {previewTemplate.use_count}x</span>
              </div>

              {/* Template Data Preview */}
              {previewTemplate.template_data && (
                <>
                  {/* Title */}
                  {previewTemplate.template_data.title && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">Proposal Title</h3>
                      <p className="text-neutral-900 font-medium">{previewTemplate.template_data.title}</p>
                    </div>
                  )}

                  {/* Scope of Work */}
                  {previewTemplate.template_data.scope_of_work && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">Scope of Work</h3>
                      <p className="text-neutral-700 text-sm whitespace-pre-wrap bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                        {previewTemplate.template_data.scope_of_work}
                      </p>
                    </div>
                  )}

                  {/* Line Items / Tasks */}
                  {previewTemplate.template_data.line_items && previewTemplate.template_data.line_items.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        Tasks / Line Items ({previewTemplate.template_data.line_items.length})
                      </h3>
                      <div className="space-y-2">
                        {previewTemplate.template_data.line_items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                            <div className="w-6 h-6 rounded-full bg-[#476E66]/20 flex items-center justify-center text-[#476E66] text-xs font-medium flex-shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-neutral-900 text-sm">{item.description || 'Untitled Task'}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500 flex-wrap">
                                {item.estimated_days && (
                                  <span>{item.estimated_days} day{item.estimated_days !== 1 ? 's' : ''}</span>
                                )}
                                {item.unit_price > 0 && (
                                  <span>${item.unit_price.toLocaleString()} × {item.quantity || 1} {item.unit || 'each'}</span>
                                )}
                                {item.start_type && item.start_type !== 'parallel' && (
                                  <span className="text-amber-600">
                                    {item.start_type === 'sequential' ? 'Sequential' : `Overlap ${item.overlap_days}d`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Total estimate */}
                      {(() => {
                        const totalDays = previewTemplate.template_data.line_items.reduce((sum: number, item: any) => sum + (item.estimated_days || 0), 0);
                        const totalAmount = previewTemplate.template_data.line_items.reduce((sum: number, item: any) => sum + ((item.unit_price || 0) * (item.quantity || 1)), 0);
                        return (
                          <div className="mt-3 pt-3 border-t border-neutral-200 flex items-center justify-between text-sm">
                            <span className="text-neutral-500">Estimated Total</span>
                            <div className="text-right">
                              <span className="font-semibold text-neutral-900">${totalAmount.toLocaleString()}</span>
                              <span className="text-neutral-400 ml-2">• {totalDays} total days</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-neutral-100 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="flex-1 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-xl hover:bg-neutral-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  navigate(`/quotes/new/document?template_id=${previewTemplate.id}`);
                  setPreviewTemplate(null);
                }}
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors"
              >
                Use This Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Form Link Modal */}
      {showLeadFormLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-neutral-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Lead Capture Form</h2>
                <button onClick={() => setShowLeadFormLinkModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-neutral-600">
                Share this link on your website or social media to capture leads directly into Billdora.
              </p>
              <div className="flex items-center gap-2 p-3 bg-neutral-100 rounded-lg">
                <input
                  type="text"
                  value={leadFormLink}
                  readOnly
                  className="flex-1 bg-transparent text-sm text-neutral-700 outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(leadFormLink);
                    showToast('Link copied to clipboard', 'success');
                  }}
                  className="p-2 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-200 flex justify-end">
              <button
                onClick={() => setShowLeadFormLinkModal(false)}
                className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Client Editor Component - No modal, shows inline
function InlineClientEditor({ client, companyId, onClose, onSave, onDelete, isAdmin = false }: { 
  client: Client | null; 
  companyId: string; 
  onClose: () => void; 
  onSave: (client: Client) => void;
  onDelete: () => void;
  isAdmin?: boolean;
}) {
  const isNew = !client;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isNew);
  const [openMenu, setOpenMenu] = useState(false);
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const portalCopiedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (portalCopiedTimeoutRef.current) clearTimeout(portalCopiedTimeoutRef.current);
    };
  }, []);
  
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'dropped': return 'bg-neutral-100 text-neutral-600';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };
  // Load portal token when client changes
  useEffect(() => {
    let mounted = true;
    if (client?.id && companyId) {
      loadPortalToken().then(() => {
        if (!mounted) return;
      });
    }
    return () => { mounted = false; };
  }, [client?.id, companyId]);

  const loadPortalToken = async () => {
    if (!client?.id) return;
    try {
      const token = await clientPortalApi.getTokenByClient(client.id);
      setPortalToken(token?.token || null);
    } catch (err) {
      console.error('Failed to load portal token:', err);
    }
  };

  const handleGeneratePortalLink = async () => {
    if (!client?.id || !companyId) return;
    try {
      setPortalLoading(true);
      const newToken = portalToken 
        ? await clientPortalApi.regenerateToken(client.id, companyId)
        : await clientPortalApi.createToken(client.id, companyId);
      setPortalToken(newToken.token);
    } catch (err) {
      console.error('Failed to generate portal link:', err);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCopyPortalLink = async () => {
    if (!portalToken) return;
    const url = clientPortalApi.getPortalUrl(portalToken);
    await navigator.clipboard.writeText(url);
    if (portalCopiedTimeoutRef.current) clearTimeout(portalCopiedTimeoutRef.current);
    setPortalCopied(true);
    portalCopiedTimeoutRef.current = setTimeout(() => setPortalCopied(false), 2000);
  };
  
  const [formData, setFormData] = useState({
    name: client?.name || '',
    display_name: client?.display_name || '',
    type: client?.type || 'company',
    email: client?.email || '',
    phone: client?.phone || '',
    website: client?.website || '',
    address: client?.address || '',
    city: client?.city || '',
    state: client?.state || '',
    zip: client?.zip || '',
    lifecycle_stage: client?.lifecycle_stage || 'active',
    primary_contact_name: client?.primary_contact_name || '',
    primary_contact_title: client?.primary_contact_title || '',
    primary_contact_email: client?.primary_contact_email || '',
    primary_contact_phone: client?.primary_contact_phone || '',
    billing_contact_name: client?.billing_contact_name || '',
    billing_contact_title: client?.billing_contact_title || '',
    billing_contact_email: client?.billing_contact_email || '',
    billing_contact_phone: client?.billing_contact_phone || '',
  });

  // Reset form when client changes
  useEffect(() => {
    setFormData({
      name: client?.name || '',
      display_name: client?.display_name || '',
      type: client?.type || 'company',
      email: client?.email || '',
      phone: client?.phone || '',
      website: client?.website || '',
      address: client?.address || '',
      city: client?.city || '',
      state: client?.state || '',
      zip: client?.zip || '',
      lifecycle_stage: client?.lifecycle_stage || 'active',
      primary_contact_name: client?.primary_contact_name || '',
      primary_contact_title: client?.primary_contact_title || '',
      primary_contact_email: client?.primary_contact_email || '',
      primary_contact_phone: client?.primary_contact_phone || '',
      billing_contact_name: client?.billing_contact_name || '',
      billing_contact_title: client?.billing_contact_title || '',
      billing_contact_email: client?.billing_contact_email || '',
      billing_contact_phone: client?.billing_contact_phone || '',
    });
    setEditing(isNew);
  }, [client?.id]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Company name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Company name must be at least 2 characters';
    }
    
    if (formData.email && !validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (formData.primary_contact_email && !validateEmail(formData.primary_contact_email)) {
      errors.primary_contact_email = 'Please enter a valid email address';
    }
    
    if (formData.billing_contact_email && !validateEmail(formData.billing_contact_email)) {
      errors.billing_contact_email = 'Please enter a valid email address';
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setError(null);
    setSaving(true);
    try {
      let savedClient: Client;
      const dataToSave = {
        ...formData,
        display_name: formData.display_name || formData.name
      };
      console.log('Saving client data:', dataToSave);
      if (client) {
        savedClient = await api.updateClient(client.id, dataToSave);
      } else {
        savedClient = await api.createClient({ 
          company_id: companyId, 
          ...dataToSave
        });
        // Send notification for new client
        NotificationService.newClientAdded(companyId, savedClient.name || savedClient.display_name || 'New Client', savedClient.id);
      }
      console.log('Saved client:', savedClient);
      setEditing(false);
      onSave(savedClient);
    } catch (err: any) {
      console.error('Failed to save client:', err);
      setError(err?.message || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!client) return;
    if (!confirm('Are you sure you want to delete this client? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.deleteClient(client.id);
      onDelete();
    } catch (err: any) {
      console.error('Failed to delete client:', err);
      setError(err?.message || 'Failed to delete client');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-600" />
          </button>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-900">
              {isNew ? 'New Client' : client?.name}
            </h2>
            {!isNew && client?.display_name && client.display_name !== client.name && (
              <p className="text-xs sm:text-sm text-neutral-500">{client.display_name}</p>
            )}
          </div>
        </div>
        {!isNew && !editing && (
              <div className="relative">
            <button onClick={() => setOpenMenu(!openMenu)} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
                  <MoreHorizontal className="w-5 h-5 text-neutral-500" />
                </button>
                {openMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10">
                    <button onClick={() => { setEditing(true); setOpenMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                <button onClick={handleDelete} disabled={deleting} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete'}
                    </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Company Information */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 sm:p-5">
        <h3 className="text-base font-semibold text-neutral-900 mb-4">Company Information</h3>
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Company Name *</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => { setFormData({...formData, name: e.target.value}); setFieldErrors(prev => ({ ...prev, name: '' })); }} 
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors ${fieldErrors.name ? 'border-red-300 bg-red-50' : 'border-neutral-300'}`} 
                  placeholder="Acme Corporation" 
                />
                <FieldError message={fieldErrors.name} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Display Name</label>
                <input type="text" value={formData.display_name} onChange={(e) => setFormData({...formData, display_name: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="Acme" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Type</label>
                <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors bg-white">
                  <option value="company">Company</option>
                  <option value="person">Person</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Status</label>
                <select value={formData.lifecycle_stage} onChange={(e) => setFormData({...formData, lifecycle_stage: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors bg-white">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Email</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => { setFormData({...formData, email: e.target.value}); setFieldErrors(prev => ({ ...prev, email: '' })); }} 
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors ${fieldErrors.email ? 'border-red-300 bg-red-50' : 'border-neutral-300'}`} 
                  placeholder="contact@company.com" 
                />
                <FieldError message={fieldErrors.email} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="(555) 123-4567" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">Website</label>
              <input type="url" value={formData.website} onChange={(e) => setFormData({...formData, website: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="https://company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="123 Main Street" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">City</label>
                <input type="text" value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="City" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">State</label>
                <input type="text" value={formData.state} onChange={(e) => setFormData({...formData, state: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="State" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">ZIP</label>
                <input type="text" value={formData.zip} onChange={(e) => setFormData({...formData, zip: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="ZIP" />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-1">Company Name</p>
              <p className="text-sm font-medium text-neutral-900">{client?.name || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Type</p>
              <p className="text-sm font-medium text-neutral-900 capitalize">{client?.type || 'company'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Email</p>
              <p className="text-sm font-medium text-neutral-900 truncate">{client?.email || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Phone</p>
              <p className="text-sm font-medium text-neutral-900">{client?.phone || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Website</p>
              <p className="text-sm font-medium text-neutral-900 truncate">{client?.website ? <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-[#476E66] hover:underline">{client.website}</a> : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Status</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(client?.lifecycle_stage || 'active')}`}>
                {client?.lifecycle_stage || 'active'}
              </span>
            </div>
            <div className="col-span-full">
              <p className="text-xs text-neutral-500 mb-1">Address</p>
              <p className="text-sm font-medium text-neutral-900">
                {client?.address ? `${client.address}${client.city ? `, ${client.city}` : ''}${client.state ? `, ${client.state}` : ''} ${client.zip || ''}`.trim() : '-'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contacts Section - Clean Layout (Admin only) */}
      {isAdmin && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4 sm:p-5">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4">Contacts</h3>
          {editing ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Primary Contact Edit */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <User className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-sm font-medium text-neutral-700">Primary Contact</span>
                </div>
                <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Name</label>
                      <input type="text" value={formData.primary_contact_name} onChange={(e) => setFormData({...formData, primary_contact_name: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="John Doe" />
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Title</label>
                      <input type="text" value={formData.primary_contact_title} onChange={(e) => setFormData({...formData, primary_contact_title: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="CEO" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Email</label>
                    <input type="email" value={formData.primary_contact_email} onChange={(e) => setFormData({...formData, primary_contact_email: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="john@company.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone</label>
                    <input type="tel" value={formData.primary_contact_phone} onChange={(e) => setFormData({...formData, primary_contact_phone: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="(555) 123-4567" />
                  </div>
                </div>
              </div>
              {/* Billing Contact Edit */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <User className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-sm font-medium text-neutral-700">Billing Contact</span>
                </div>
                <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Name</label>
                      <input type="text" value={formData.billing_contact_name} onChange={(e) => setFormData({...formData, billing_contact_name: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="Jane Smith" />
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Title</label>
                      <input type="text" value={formData.billing_contact_title} onChange={(e) => setFormData({...formData, billing_contact_title: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="CFO" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Email</label>
                    <input type="email" value={formData.billing_contact_email} onChange={(e) => setFormData({...formData, billing_contact_email: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="jane@company.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone</label>
                    <input type="tel" value={formData.billing_contact_phone} onChange={(e) => setFormData({...formData, billing_contact_phone: e.target.value})} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="(555) 987-6543" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Primary Contact View */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <User className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-sm font-medium text-neutral-700">Primary Contact</span>
                </div>
                <div className="space-y-1.5 pl-5">
                  <p className="text-sm font-medium text-neutral-900">{client?.primary_contact_name || '-'}</p>
                  {client?.primary_contact_title && <p className="text-xs text-neutral-500">{client.primary_contact_title}</p>}
                  <p className="text-xs text-neutral-600 truncate">{client?.primary_contact_email || '-'}</p>
                  <p className="text-xs text-neutral-600">{client?.primary_contact_phone || '-'}</p>
                </div>
              </div>
              {/* Billing Contact View */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <User className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-sm font-medium text-neutral-700">Billing Contact</span>
                </div>
                <div className="space-y-1.5 pl-5">
                  <p className="text-sm font-medium text-neutral-900">{client?.billing_contact_name || '-'}</p>
                  {client?.billing_contact_title && <p className="text-xs text-neutral-500">{client.billing_contact_title}</p>}
                  <p className="text-xs text-neutral-600 truncate">{client?.billing_contact_email || '-'}</p>
                  <p className="text-xs text-neutral-600">{client?.billing_contact_phone || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Client Portal Link */}
      {!isNew && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4 sm:p-5">
          <h3 className="text-base font-semibold text-neutral-900 mb-2">Client Portal</h3>
          <p className="text-xs text-neutral-500 mb-4">
            Generate a secure link for this client to view their invoices and payment status.
          </p>
          {portalToken ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 bg-neutral-50 rounded-lg border border-neutral-200">
                <Link2 className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                <span className="text-xs text-neutral-600 truncate flex-1 font-mono">
                  {clientPortalApi.getPortalUrl(portalToken)}
                </span>
                <button
                  onClick={handleCopyPortalLink}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-neutral-300 rounded hover:bg-neutral-50 transition-colors flex-shrink-0"
                >
                  {portalCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {portalCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                onClick={handleGeneratePortalLink}
                disabled={portalLoading}
                className="text-xs text-neutral-600 hover:text-neutral-900 underline transition-colors disabled:opacity-50"
              >
                {portalLoading ? 'Regenerating...' : 'Regenerate Link'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGeneratePortalLink}
              disabled={portalLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 transition-colors"
            >
              <Link2 className="w-4 h-4" />
              {portalLoading ? 'Generating...' : 'Generate Portal Link'}
            </button>
          )}
        </div>
      )}

      {/* Action Buttons - Bottom of Form */}
      {editing && (
        <div className="flex items-center gap-3 pt-2 border-t border-neutral-200 sticky bottom-0 bg-white pb-safe">
          <button
            onClick={() => {
              if (isNew) {
                onClose();
              } else {
                setEditing(false);
              }
            }}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : isNew ? 'Create Client' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
