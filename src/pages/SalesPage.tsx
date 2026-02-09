import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, Download, MoreHorizontal, X, FileText, ArrowRight, Eye, Printer, Send, Check, XCircle, Mail, Trash2, List, LayoutGrid, ChevronDown, ChevronRight, ArrowLeft, Edit2, Loader2, Link2, Copy, User, Tag, Users, Phone, Building2, Calendar, DollarSign, Clock, FileSignature, CheckCircle2, Bell, BarChart2, FilePlus, Star, Columns3, MapPin, Globe, Archive, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useFeatureGating } from '../hooks/useFeatureGating';
import { api, Client, ClientContact, ClientContactRole, Quote, Lead, leadsApi, clientPortalApi, ProposalTemplate, collaborationApi, ProposalCollaboration, leadFormsApi } from '../lib/api';
import { NotificationService } from '../lib/notificationService';
import { useToast } from '../components/Toast';
import { FieldError } from '../components/ErrorBoundary';
import { validateEmail } from '../lib/validation';
import { getCachedData, setCachedData, CACHE_KEYS } from '../lib/dataCache';
import { supabase } from '../lib/supabase';
import { LeadModal, ConvertToClientModal } from '../components/leads';
import { QuoteModal } from '../components/quotes';

type Tab = 'leads' | 'clients' | 'proposals';
type ProposalsSubTab = 'direct' | 'collaborations' | 'signed' | 'partners' | 'templates';
type CollaborationsSubTab = 'my-projects' | 'invited';
type DirectFilter = 'all' | 'drafts' | 'sent' | 'archived';
type LeadsViewMode = 'list' | 'kanban';

type LeadStage = 'all' | 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'won' | 'lost';

const PIPELINE_STAGES: { key: LeadStage; label: string; color: string; bgColor: string }[] = [
  { key: 'all', label: 'All', color: 'text-neutral-500', bgColor: '' },
  { key: 'new', label: 'New', color: 'text-blue-600', bgColor: '' },
  { key: 'contacted', label: 'Contacted', color: 'text-purple-600', bgColor: '' },
  { key: 'qualified', label: 'Qualified', color: 'text-amber-600', bgColor: '' },
  { key: 'proposal_sent', label: 'Proposal', color: 'text-cyan-600', bgColor: '' },
  { key: 'won', label: 'Won', color: 'text-emerald-600', bgColor: '' },
  { key: 'lost', label: 'Lost', color: 'text-red-600', bgColor: '' },
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

// Client columns configuration
const DEFAULT_CLIENT_COLUMNS = ['name', 'contact', 'email', 'phone', 'status'];
const ALL_CLIENT_COLUMNS = [
  { key: 'name', label: 'Client Name', group: 'Basic' },
  { key: 'contact', label: 'Primary Contact', group: 'Basic' },
  { key: 'email', label: 'Email', group: 'Contact' },
  { key: 'phone', label: 'Phone', group: 'Contact' },
  { key: 'status', label: 'Status', group: 'Basic' },
  { key: 'type', label: 'Client Type', group: 'Basic' },
  { key: 'lifecycle_stage', label: 'Lifecycle Stage', group: 'Basic' },
  { key: 'address', label: 'Address', group: 'Location' },
  { key: 'city', label: 'City', group: 'Location' },
  { key: 'state', label: 'State', group: 'Location' },
  { key: 'website', label: 'Website', group: 'Contact' },
  { key: 'billing_contact', label: 'Billing Contact', group: 'Billing' },
  { key: 'billing_email', label: 'Billing Email', group: 'Billing' },
  { key: 'created_at', label: 'Created Date', group: 'Dates' },
];

export default function SalesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [proposalsSubTab, setProposalsSubTab] = useState<ProposalsSubTab>('direct');
  const [collaborationsSubTab, setCollaborationsSubTab] = useState<CollaborationsSubTab>('my-projects');
  const [directFilter, setDirectFilter] = useState<DirectFilter>('all');
  const [leadsViewMode, setLeadsViewMode] = useState<LeadsViewMode>('list');
  const [showWonConvertModal, setShowWonConvertModal] = useState<Lead | null>(null);
  const [leadBottomSheet, setLeadBottomSheet] = useState<Lead | null>(null); // Mobile bottom sheet
  const [showLeadBottomSheetMenu, setShowLeadBottomSheetMenu] = useState(false); // 3-dot menu in bottom sheet

  const [collaborationInbox, setCollaborationInbox] = useState<ProposalCollaboration[]>([]);
  const [sentCollaborations, setSentCollaborations] = useState<ProposalCollaboration[]>([]);
  const [partners, setPartners] = useState<Array<{
    id: string;
    email: string;
    name: string;
    companyName: string;
    companyId: string | null;
    trade: string;
    phone: string;
    projectCount: number;
    lastCollaboration: string;
    relationship: 'invited' | 'received' | 'mutual';
  }>>([]);
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
  const [activeDirectQuoteMenu, setActiveDirectQuoteMenu] = useState<string | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);
  const [duplicatingQuoteId, setDuplicatingQuoteId] = useState<string | null>(null);
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

  // Filter states
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all');
  const [leadSourceFilter, setLeadSourceFilter] = useState<string>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<string>('all');
  const [proposalStatusFilter, setProposalStatusFilter] = useState<string>('all');

  // Client View Mode & Analysis
  const [clientsViewMode, setClientsViewMode] = useState<'list' | 'chart'>('list');
  const [chartTimeframe, setChartTimeframe] = useState<'month' | 'year'>('year');

  // Client columns customization
  const [visibleClientColumns, setVisibleClientColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('clientsVisibleColumns');
    return saved ? JSON.parse(saved) : DEFAULT_CLIENT_COLUMNS;
  });
  const [showClientColumnsDropdown, setShowClientColumnsDropdown] = useState(false);

  // Priority dropdown state
  const [openPriorityDropdown, setOpenPriorityDropdown] = useState<string | null>(null);

  // Roman numeral helper
  const toRoman = (num: number | null | undefined) => {
    if (!num) return null;
    const numerals: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };
    return numerals[num] || null;
  };

  // Sort clients by priority (1 first, then 2, then 3, then null)
  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      // Priority sorting: 1 > 2 > 3 > null
      const aPriority = a.priority || 999;
      const bPriority = b.priority || 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Then alphabetically
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [clients]);

  // Set client priority
  const setClientPriority = async (clientId: string, newPriority: number | null) => {
    if (!profile?.company_id) return;

    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const currentPriority = client.priority;

    // Optimistic update
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, priority: newPriority } : c
    ));
    setOpenPriorityDropdown(null);

    try {
      await supabase
        .from('clients')
        .update({ priority: newPriority })
        .eq('id', clientId);
    } catch (err) {
      console.error('Failed to set client priority:', err);
      // Revert on failure
      setClients(prev => prev.map(c =>
        c.id === clientId ? { ...c, priority: currentPriority } : c
      ));
    }
  };

  // Priority dropdown component
  const ClientPriorityDropdown = ({ 
    clientId, 
    currentPriority 
  }: { 
    clientId: string; 
    currentPriority: number | null | undefined; 
  }) => {
    const isOpen = openPriorityDropdown === clientId;

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenPriorityDropdown(isOpen ? null : clientId);
          }}
          className="w-6 h-6 rounded hover:bg-neutral-100 transition-colors flex items-center justify-center"
          title="Set priority"
        >
          {currentPriority ? (
            <span className="text-[11px] font-semibold text-neutral-400">{toRoman(currentPriority)}</span>
          ) : (
            <Star className="w-3.5 h-3.5 text-neutral-200 hover:text-neutral-300" />
          )}
        </button>
        {isOpen && (
          <div 
            className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 min-w-[80px]"
            onClick={(e) => e.stopPropagation()}
          >
            {[1, 2, 3].map((num) => (
              <button
                key={num}
                onClick={() => setClientPriority(clientId, num)}
                className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-neutral-50 flex items-center gap-2 ${
                  currentPriority === num ? 'bg-neutral-50 font-medium' : ''
                }`}
              >
                <span className="text-neutral-400 font-semibold w-4">{toRoman(num)}</span>
                <span className="text-neutral-500">Priority {num}</span>
              </button>
            ))}
            {currentPriority && (
              <>
                <div className="border-t border-neutral-100 my-1" />
                <button
                  onClick={() => setClientPriority(clientId, null)}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-neutral-400 hover:bg-neutral-50"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // Close priority dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenPriorityDropdown(null);
    if (openPriorityDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openPriorityDropdown]);

  const clientRevenueData = useMemo(() => {
    if (activeTab !== 'clients') return [];

    return clients.map(client => {
      // Filter accepted/approved quotes
      const clientQuotes = quotes.filter(q =>
        q.client_id === client.id &&
        (q.status === 'accepted' || q.status === 'approved')
      );

      const now = new Date();

      // Calculate revenue based on timeframe
      const revenue = clientQuotes.reduce((sum, q) => {
        const quoteDate = new Date(q.created_at || ''); // Ideally use signed_at/updated_at
        const isThisYear = quoteDate.getFullYear() === now.getFullYear();
        const isThisMonth = isThisYear && quoteDate.getMonth() === now.getMonth();

        if (chartTimeframe === 'year' && isThisYear) return sum + (q.total_amount || 0);
        if (chartTimeframe === 'month' && isThisMonth) return sum + (q.total_amount || 0);
        return sum;
      }, 0);

      // Get top projects for display in large bars
      const topProjects = clientQuotes
        .filter(q => {
          const quoteDate = new Date(q.created_at || '');
          const isThisYear = quoteDate.getFullYear() === now.getFullYear();
          const isThisMonth = isThisYear && quoteDate.getMonth() === now.getMonth();
          return chartTimeframe === 'year' ? isThisYear : isThisMonth;
        })
        .sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0))
        .slice(0, 5)
        .map(q => q.title);

      return {
        ...client,
        revenue,
        topProjects,
        projectCount: clientQuotes.length
      };
    })
      .filter(c => c.revenue > 0) // Only show clients with revenue in chart
      .sort((a, b) => b.revenue - a.revenue); // Sort by revenue desc
  }, [clients, quotes, activeTab, chartTimeframe]);

  // Handle URL parameters for deep linking (e.g., from notification clicks)
  useEffect(() => {
    const tab = searchParams.get('tab');
    const subtab = searchParams.get('subtab');
    const collab = searchParams.get('collab');

    // Set main tab from URL
    if (tab === 'proposals') {
      setActiveTab('proposals');
    } else if (tab === 'clients') {
      setActiveTab('clients');
    } else if (tab === 'leads') {
      setActiveTab('leads');
    }

    // Set proposals subtab from URL
    if (subtab === 'collaborations') {
      setProposalsSubTab('collaborations');
    } else if (subtab === 'direct') {
      setProposalsSubTab('direct');
    } else if (subtab === 'signed') {
      setProposalsSubTab('signed');
    } else if (subtab === 'partners') {
      setProposalsSubTab('partners');
    } else if (subtab === 'templates') {
      setProposalsSubTab('templates');
    }

    // Set collaborations sub-subtab from URL
    if (collab === 'invited') {
      setCollaborationsSubTab('invited');
    } else if (collab === 'my-projects') {
      setCollaborationsSubTab('my-projects');
    }

    // Clear URL params after applying them (keep URL clean)
    if (tab || subtab || collab) {
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

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

  useEffect(() => {
    if (!activeDirectQuoteMenu) return;
    const handleClickOutside = () => setActiveDirectQuoteMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDirectQuoteMenu]);

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
      const [leadsData, clientsData, quotesData, responsesData, templatesData, inboxData, sentData, partnersData] = await Promise.all([
        leadsApi.getLeads(companyId).catch(err => { console.warn('[SalesPage] Failed to load leads:', err?.message); return []; }),
        api.getClients(companyId).catch(err => { console.warn('[SalesPage] Failed to load clients:', err?.message); return []; }),
        api.getQuotes(companyId).catch(err => { console.warn('[SalesPage] Failed to load quotes:', err?.message); return []; }),
        api.getProposalResponses(companyId).catch(err => { console.warn('[SalesPage] Failed to load responses:', err?.message); return []; }),
        api.getProposalTemplates(companyId).catch(err => { console.warn('[SalesPage] Failed to load templates:', err?.message); return []; }),
        collaborationApi.getReceivedInvitations(userEmail, userId).catch(err => { console.warn('[SalesPage] Failed to load inbox:', err?.message); return []; }),
        collaborationApi.getSentInvitations(companyId).catch(err => { console.warn('[SalesPage] Failed to load sent:', err?.message); return []; }),
        collaborationApi.getPartners(companyId, userId || '', userEmail).catch(err => { console.warn('[SalesPage] Failed to load partners:', err?.message); return []; }),
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
      setPartners(partnersData);

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
            api.getQuotes(companyId).then(setQuotes).catch(() => { });
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
    sortedClients.filter(c => {
      // Search filter
      if (searchTerm && !(
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )) return false;
      // Type filter
      if (clientTypeFilter !== 'all') {
        if (clientTypeFilter === 'priority' && !c.priority) return false;
        if (clientTypeFilter === 'active' && c.is_archived) return false;
        if (clientTypeFilter === 'archived' && !c.is_archived) return false;
        if (clientTypeFilter !== 'priority' && clientTypeFilter !== 'active' && clientTypeFilter !== 'archived' && c.type !== clientTypeFilter) return false;
      }
      return true;
    }),
    [sortedClients, searchTerm, clientTypeFilter]
  );

  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      // Search filter
      if (searchTerm && !(
        q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.quote_number?.toLowerCase().includes(searchTerm.toLowerCase())
      )) return false;
      // Proposal status filter
      if (proposalStatusFilter !== 'all' && q.status !== proposalStatusFilter) return false;
      return true;
    });
  }, [quotes, searchTerm, proposalStatusFilter]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-50 text-emerald-600';
      case 'pending': case 'draft': return 'bg-amber-50 text-amber-600';
      case 'pending_collaborators': return 'bg-purple-50 text-purple-600';
      case 'sent': return 'bg-blue-50 text-blue-600';
      case 'review': return 'bg-blue-100 text-blue-700 bg-opacity-70 border border-blue-200';
      case 'approved': case 'accepted': return 'bg-emerald-50 text-emerald-600';
      case 'dropped': case 'rejected': case 'declined': return 'bg-red-50 text-red-600';
      case 'archived': return 'bg-neutral-100 text-neutral-500';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getStatusLabel = (status?: string) => {
    if (status === 'pending_collaborators') return (
      <span className="flex flex-col items-center leading-tight">
        <span>Waiting For</span>
        <span>Collaborators</span>
      </span>
    );
    if (status === 'review') return (
      <span className="flex flex-col items-center leading-tight font-bold text-blue-700">
        <span>Ready to</span>
        <span>Merge</span>
      </span>
    );
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

  const handleArchiveQuote = useCallback(async (quote: Quote) => {
    try {
      await api.updateQuote(quote.id, { status: 'archived' });
      showToast('Proposal archived', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.message || 'Failed to archive proposal', 'error');
    }
    setActiveDirectQuoteMenu(null);
  }, [showToast]);

  const handleRestoreQuote = useCallback(async (quote: Quote) => {
    try {
      await api.updateQuote(quote.id, { status: 'draft' });
      showToast('Proposal restored to drafts', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.message || 'Failed to restore proposal', 'error');
    }
    setActiveDirectQuoteMenu(null);
  }, [showToast]);

  const handleDeleteQuote = useCallback(async (quote: Quote) => {
    try {
      await api.deleteQuote(quote.id);
      showToast('Proposal deleted', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.message || 'Failed to delete proposal', 'error');
    }
    setQuoteToDelete(null);
    setActiveDirectQuoteMenu(null);
  }, [showToast]);

  const handleCreateRevision = useCallback(async (quote: Quote) => {
    setDuplicatingQuoteId(quote.id);
    try {
      const revision = await api.duplicateQuoteAsRevision(quote.id);
      showToast('Revision created. You can edit and send the new proposal.', 'success');
      loadData();
      setActiveDirectQuoteMenu(null);
      navigate(`/quotes/${revision.id}/document`);
    } catch (error: any) {
      showToast(error?.message || 'Failed to create revision', 'error');
    } finally {
      setDuplicatingQuoteId(null);
    }
  }, [showToast]);

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
      {/* Header - Minimalist */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-neutral-900 mb-1">SALES PIPELINE</h1>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Manage leads, clients & proposals</p>
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
          className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/10"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add {activeTab === 'leads' ? 'Lead' : activeTab === 'clients' ? 'Client' : 'Proposal'}</span>
        </button>
      </div>

      {/* Mobile Subtitle */}
      <p className="text-xs text-neutral-500 sm:hidden">Manage your leads, clients, and proposals</p>

      {/* Tabs */}
      {/* Tabs - Underline Style */}
      <div className="flex border-b border-neutral-100 mb-6 w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab('leads')}
          className={`flex-shrink-0 flex items-center gap-2 px-6 py-4 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'leads' ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
            }`}
        >
          <span>Leads</span>
          <span className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
            {leads.filter(l => l.status !== 'won' && l.status !== 'lost').length}
          </span>
          {activeTab === 'leads' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-neutral-900" />}
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`flex-shrink-0 flex items-center gap-2 px-6 py-4 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'clients' ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
            }`}
        >
          <span>Clients</span>
          <span className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
            {clients.length}
          </span>
          {activeTab === 'clients' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-neutral-900" />}
        </button>
        <button
          onClick={() => setActiveTab('proposals')}
          className={`flex-shrink-0 flex items-center gap-2 px-6 py-4 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'proposals' ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
            }`}
        >
          <span>Proposals</span>
          <span className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
            {quotes.length}
          </span>
          {collaborationInbox.length > 0 && (
            <span className="px-1.5 py-0.5 bg-[#476E66] text-white text-[9px] rounded font-bold">
              {collaborationInbox.length}
            </span>
          )}
          {activeTab === 'proposals' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-neutral-900" />}
        </button>
      </div>

      {/* Search and filters */}
      {/* Search and filters - Clean Design */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-neutral-200 rounded-none focus:ring-1 focus:ring-neutral-900 focus:border-neutral-900 outline-none text-sm transition-all"
          />
        </div>
        {/* Filters Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFiltersDropdown(!showFiltersDropdown)}
            className={`hidden sm:flex items-center gap-2 px-6 py-3 border transition-colors text-[10px] font-bold uppercase tracking-widest ${(activeTab === 'clients' && clientTypeFilter !== 'all') ||
                (activeTab === 'leads' && (leadStatusFilter !== 'all' || leadSourceFilter !== 'all')) ||
                (activeTab === 'proposals' && proposalStatusFilter !== 'all')
                ? 'bg-[#476E66]/10 border-[#476E66]/30 text-[#476E66] hover:bg-[#476E66]/20'
                : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600'
              }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Filters</span>
            {((activeTab === 'clients' && clientTypeFilter !== 'all') ||
              (activeTab === 'leads' && (leadStatusFilter !== 'all' || leadSourceFilter !== 'all')) ||
              (activeTab === 'proposals' && proposalStatusFilter !== 'all')) && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#476E66] text-white rounded-full">1</span>
              )}
          </button>
          {showFiltersDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFiltersDropdown(false)} />
              <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-sm border border-neutral-200 z-50 py-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-2 border-b border-neutral-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#476E66]">
                    Filter {activeTab === 'leads' ? 'Leads' : activeTab === 'clients' ? 'Clients' : 'Proposals'}
                  </p>
                </div>
                <div className="px-4 py-3 space-y-4">
                  {activeTab === 'leads' && (
                    <>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Status</label>
                        <select
                          value={leadStatusFilter}
                          onChange={(e) => setLeadStatusFilter(e.target.value)}
                          className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66]"
                        >
                          <option value="all">All Statuses</option>
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="qualified">Qualified</option>
                          <option value="proposal">Proposal</option>
                          <option value="negotiation">Negotiation</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Source</label>
                        <select
                          value={leadSourceFilter}
                          onChange={(e) => setLeadSourceFilter(e.target.value)}
                          className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66]"
                        >
                          <option value="all">All Sources</option>
                          <option value="website">Website</option>
                          <option value="referral">Referral</option>
                          <option value="social">Social Media</option>
                          <option value="email">Email</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </>
                  )}
                  {activeTab === 'clients' && (
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Show</label>
                      <select
                        value={clientTypeFilter}
                        onChange={(e) => setClientTypeFilter(e.target.value)}
                        className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66]"
                      >
                        <option value="all">All Clients</option>
                        <option value="priority">① Priority Only</option>
                        <option value="active">Active Only</option>
                        <option value="archived">Archived Only</option>
                      </select>
                    </div>
                  )}
                  {activeTab === 'proposals' && (
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Status</label>
                      <select
                        value={proposalStatusFilter}
                        onChange={(e) => setProposalStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66]"
                      >
                        <option value="all">All Proposals</option>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  )}
                </div>
                {((activeTab === 'clients' && clientTypeFilter !== 'all') ||
                  (activeTab === 'leads' && (leadStatusFilter !== 'all' || leadSourceFilter !== 'all')) ||
                  (activeTab === 'proposals' && proposalStatusFilter !== 'all')) && (
                    <div className="px-4 py-2 border-t border-neutral-100">
                      <button
                        onClick={() => {
                          setLeadStatusFilter('all');
                          setLeadSourceFilter('all');
                          setClientTypeFilter('all');
                          setProposalStatusFilter('all');
                        }}
                        className="text-[10px] font-medium text-[#476E66] hover:text-[#3A5B54] uppercase tracking-wide"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
              </div>
            </>
          )}
        </div>
        {activeTab === 'proposals' && (
          <>
            {/* Client/Lead Source Toggle Removed */}
            <div className="flex bg-white border border-neutral-200 ml-2">
              <button
                onClick={() => setQuoteViewMode('list')}
                className={`p-3 transition-colors ${quoteViewMode === 'list' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-50'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <div className="w-px bg-neutral-200"></div>
              <button
                onClick={() => setQuoteViewMode('client')}
                className={`p-3 transition-colors ${quoteViewMode === 'client' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-50'}`}
                title="Client View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
        <button className="hidden lg:flex items-center gap-2 px-6 py-3 border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors text-[10px] font-bold uppercase tracking-widest text-neutral-600">
          <Download className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Export</span>
        </button>

        {/* Clients View Toggles */}
        {activeTab === 'clients' && (
          <>
            <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100 rounded-lg flex-shrink-0">
              <button
                onClick={() => setClientsViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${clientsViewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-neutral-200'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setClientsViewMode('chart')}
                className={`p-1.5 rounded-md transition-colors ${clientsViewMode === 'chart' ? 'bg-white shadow-sm' : 'hover:bg-neutral-200'}`}
                title="Revenue Chart"
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            </div>

            {/* Columns Dropdown for Clients */}
            <div className="relative">
              <button
                onClick={() => { setShowClientColumnsDropdown(!showClientColumnsDropdown); setShowFiltersDropdown(false); }}
                className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 hover:border-neutral-300 rounded-sm hover:bg-neutral-50 transition-all group"
              >
                <Columns3 className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 group-hover:text-neutral-900">Columns</span>
              </button>
              {showClientColumnsDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowClientColumnsDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-sm border border-neutral-200 z-50 py-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-2 border-b border-neutral-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#476E66]">Customize Columns</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">Select which columns to display</p>
                    </div>
                    <div className="px-4 py-2 max-h-72 overflow-y-auto">
                      {['Basic', 'Contact', 'Location', 'Billing', 'Dates'].map(group => {
                        const groupCols = ALL_CLIENT_COLUMNS.filter(col => col.group === group);
                        if (groupCols.length === 0) return null;
                        return (
                          <div key={group} className="mb-3">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">{group}</p>
                            {groupCols.map(col => (
                              <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer group/col">
                                <input
                                  type="checkbox"
                                  checked={visibleClientColumns.includes(col.key)}
                                  onChange={(e) => {
                                    const newCols = e.target.checked
                                      ? [...visibleClientColumns, col.key]
                                      : visibleClientColumns.filter(c => c !== col.key);
                                    setVisibleClientColumns(newCols);
                                    localStorage.setItem('clientsVisibleColumns', JSON.stringify(newCols));
                                  }}
                                  className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                                />
                                <span className="text-[11px] text-neutral-600 group-hover/col:text-neutral-900">{col.label}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-2 border-t border-neutral-100">
                      <button
                        onClick={() => {
                          setVisibleClientColumns(DEFAULT_CLIENT_COLUMNS);
                          localStorage.setItem('clientsVisibleColumns', JSON.stringify(DEFAULT_CLIENT_COLUMNS));
                        }}
                        className="text-[10px] font-medium text-[#476E66] hover:text-[#3A5B54] uppercase tracking-wide"
                      >
                        Reset to Default
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

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
                      className={`flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all flex-shrink-0 ${isSelected
                        ? `bg-neutral-100 ${stage.color}`
                        : 'bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      <span>{stage.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] ${isSelected ? 'bg-white' : 'bg-neutral-100 text-neutral-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Leads Table */}
              {/* Leads Table */}
              <div className="bg-white border border-neutral-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white border-b border-neutral-100">
                      <tr>
                        <th className="text-left px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Lead</th>
                        <th className="text-left px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden sm:table-cell">Source</th>
                        <th className="text-left px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Status</th>
                        <th className="text-left px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden md:table-cell">Est. Value</th>
                        <th className="text-left px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden lg:table-cell">Created</th>
                        <th className="text-right px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest sr-only sm:not-sr-only">Actions</th>
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
                          className="hover:bg-neutral-50/50 transition-colors cursor-pointer sm:cursor-default group"
                          onClick={() => {
                            // On mobile, clicking row opens lead action sheet (not edit)
                            if (window.innerWidth < 640) {
                              setLeadBottomSheet(lead);
                            }
                          }}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 font-bold text-xs flex-shrink-0">
                                {lead.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-neutral-900 text-sm mb-0.5">{lead.name}</p>
                                <p className="text-[11px] text-neutral-400 truncate max-w-[180px] font-medium">{lead.company_name || lead.email || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">{lead.source?.replace('_', ' ') || '-'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="relative inline-block">
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
                                className={`appearance-none py-1.5 text-[10px] font-medium uppercase tracking-widest border-0 cursor-pointer transition-all bg-transparent ${lead.status === 'new' ? 'text-blue-600' :
                                  lead.status === 'contacted' ? 'text-purple-600' :
                                    lead.status === 'qualified' ? 'text-amber-600' :
                                      lead.status === 'proposal_sent' ? 'text-cyan-600' :
                                        lead.status === 'won' ? 'text-emerald-600' :
                                          lead.status === 'lost' ? 'text-red-600' :
                                            'text-neutral-500'
                                  }`}
                              >
                                <option value="new">New</option>
                                <option value="contacted">Contacted</option>
                                <option value="qualified">Qualified</option>
                                <option value="proposal_sent">Proposal</option>
                                <option value="won">Won</option>
                                <option value="lost">Lost</option>
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-current pointer-events-none opacity-50" />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-900 font-light hidden md:table-cell">
                            {lead.estimated_value ? `$${lead.estimated_value.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-[11px] font-medium text-neutral-400 hidden lg:table-cell">
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {lead.status !== 'won' && lead.status !== 'lost' && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowProposalChoiceModal({ type: 'lead', id: lead.id, name: lead.name, email: lead.email || '', company: lead.company_name || '' }); }}
                                    className="px-3 py-1.5 text-[10px] font-bold text-neutral-600 bg-neutral-100 rounded hover:bg-neutral-200 transition-colors hidden sm:block uppercase tracking-wider"
                                  >
                                    Proposal
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConvertingLead(lead); setShowConvertModal(true); }}
                                    className="px-3 py-1.5 text-[10px] font-bold text-white bg-neutral-900 rounded hover:bg-neutral-800 transition-colors hidden md:block uppercase tracking-wider"
                                  >
                                    Convert
                                  </button>
                                </>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingLead(lead); setShowLeadModal(true); }}
                                className="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
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
                                className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors hidden sm:block"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

      {/* Clients Section */}
      {activeTab === 'clients' && (
        <div className="space-y-6">
          {/* Mobile Quick Filters for Clients */}
          <div className="flex sm:hidden gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <button
              onClick={() => setClientTypeFilter('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${clientTypeFilter === 'all'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-600'
                }`}
            >
              All ({clients.length})
            </button>
            <button
              onClick={() => setClientTypeFilter(clientTypeFilter === 'priority' ? 'all' : 'priority')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${clientTypeFilter === 'priority'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-white border border-neutral-200 text-neutral-600'
                }`}
            >
              ① Priority ({clients.filter(c => c.priority).length})
            </button>
            <button
              onClick={() => setClientTypeFilter(clientTypeFilter === 'active' ? 'all' : 'active')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${clientTypeFilter === 'active'
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-white border border-neutral-200 text-neutral-600'
                }`}
            >
              Active ({clients.filter(c => !c.is_archived).length})
            </button>
            <button
              onClick={() => setClientTypeFilter(clientTypeFilter === 'archived' ? 'all' : 'archived')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${clientTypeFilter === 'archived'
                  ? 'bg-neutral-200 text-neutral-700 border border-neutral-300'
                  : 'bg-white border border-neutral-200 text-neutral-600'
                }`}
            >
              Archived ({clients.filter(c => c.is_archived).length})
            </button>
          </div>

          {clientsViewMode === 'chart' ? (
            /* SKYLINE CHART VIEW */
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] border border-white/50 p-8 min-h-[600px] flex flex-col relative overflow-hidden transition-all duration-500 hover:shadow-[0_30px_60px_-12px_rgba(0,0,0,0.15)]">
              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-b from-[#476E66]/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

              <div className="flex justify-between items-end mb-12 relative z-10">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Revenue Skyline</h2>
                  <p className="text-neutral-500 mt-1 font-medium tracking-wide text-sm">Client portfolio value analysis</p>
                </div>
                <div className="flex bg-neutral-100/80 backdrop-blur-md p-1 rounded-lg">
                  <button
                    onClick={() => setChartTimeframe('month')}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-300 ${chartTimeframe === 'month' ? 'bg-white text-neutral-900 shadow-sm scale-105' : 'text-neutral-500 hover:text-neutral-900'}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setChartTimeframe('year')}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-300 ${chartTimeframe === 'year' ? 'bg-white text-neutral-900 shadow-sm scale-105' : 'text-neutral-500 hover:text-neutral-900'}`}
                  >
                    Yearly
                  </button>
                </div>
              </div>

              {clientRevenueData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-300 relative z-10">
                  <BarChart2 className="w-16 h-16 mb-6 opacity-20" />
                  <p className="font-medium">No revenue data for this period</p>
                </div>
              ) : (
                <div className="flex-1 overflow-x-auto pb-4 scrollbar-hide">
                  <div className="h-full min-w-max flex items-end gap-4 px-4 pt-12">
                    {(() => {
                      // Sort by revenue
                      const sortedData = [...clientRevenueData].sort((a, b) => b.revenue - a.revenue);
                      const maxRevenue = Math.max(...sortedData.map(c => c.revenue));

                      return sortedData.map((client, index) => {
                        const rank = index + 1;
                        const heightPercentage = Math.max((client.revenue / maxRevenue) * 100, 15); // Min height 15%
                        const isLarge = heightPercentage > 40;
                        const isTop3 = rank <= 3;
                        return (
                          <div key={client.id} className="w-40 flex flex-col items-center group perspective-1000 relative">
                            {/* Floating Tooltip Value */}
                            <div className="mb-4 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 px-3 py-1.5 bg-neutral-900 text-white text-xs font-bold rounded-lg shadow-xl">
                              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(client.revenue)}
                            </div>

                            {/* The Monolith (Bar) */}
                            <div
                              className="w-full relative transition-all duration-500 ease-out flex flex-col group-hover:scale-[1.02] group-hover:-translate-y-1 origin-bottom"
                              style={{ height: `${heightPercentage}%`, minHeight: '60px' }}
                            >
                              {/* Rank Badge */}
                              {/* Minimalistic Rank - Top Corner */}
                              <div className="absolute top-0 right-0 p-2 z-20">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm shadow-sm border border-white/10 ${isTop3 ? 'bg-white/90 text-neutral-900' : 'bg-black/20 text-white/90'}`}>
                                  #{rank}
                                </span>
                              </div>
                              {/* Main Structure - Update: Neutral / Concrete Gray */}
                              <div className="absolute inset-0 bg-gradient-to-b from-neutral-400 to-neutral-500 rounded-2xl shadow-lg group-hover:shadow-2xl group-hover:shadow-neutral-500/20 transition-shadow duration-500"></div>

                              {/* Glass Reflection Effect */}
                              <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-50 rounded-2xl pointer-events-none"></div>
                              {/* Windows / Content Overlay */}
                              {isLarge ? (
                                <div className="relative z-10 p-3 space-y-2 opacity-100 transition-opacity duration-300">
                                  <div className="bg-white/10 backdrop-blur-md rounded-lg p-2.5 border border-white/10 shadow-inner">
                                    <div className="text-[9px] text-white/70 uppercase tracking-widest font-bold mb-1.5">Top Projects</div>
                                    <div className="space-y-1.5">
                                      {client.topProjects.slice(0, 3).map((proj, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5">
                                          <div className="w-1 h-1 rounded-full bg-emerald-300 shadow-[0_0_4px_rgba(110,231,183,0.8)]"></div>
                                          <div className="text-[10px] text-white font-medium truncate leading-tight">{proj}</div>
                                        </div>
                                      ))}
                                      {(client.projectCount > 3 || client.topProjects.length > 3) && (
                                        <div className="text-[9px] text-emerald-200/70 font-medium pl-2.5">+ {client.projectCount - Math.min(3, client.topProjects.length)} more</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/20 rounded-full"></div>
                              )}
                            </div>

                            {/* Pedestal (Label) */}
                            <div className="mt-4 text-center w-full group-hover:scale-105 transition-transform duration-300">
                              <p className={`font-bold text-sm tracking-tight truncate px-1 ${isTop3 ? 'text-neutral-900' : 'text-neutral-600'}`} title={client.name}>
                                {index + 1}. {client.name}
                              </p>
                              <p className="text-[11px] text-neutral-400 font-medium tracking-wide mt-0.5">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(client.revenue)}
                              </p>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TRADITIONAL LIST VIEW */
            <div className="flex gap-4">
              {/* Client List - Hidden on mobile when client selected */}
              <div className={`bg-white rounded-2xl overflow-hidden border border-neutral-100/50 ${selectedClient || isAddingNewClient
                ? 'hidden lg:block lg:w-80 lg:flex-shrink-0'
                : 'flex-1'
                }`} style={{ boxShadow: '0 4px 20px -2px rgba(0,0,0,0.02)' }}>

                {/* Table View - Show when extra columns selected */}
                {visibleClientColumns.length > 3 && !selectedClient && !isAddingNewClient ? (
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-100">
                          <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-neutral-500 w-[200px]">Client</th>
                          <th className="px-2 py-3 text-center text-[9px] font-bold uppercase tracking-widest text-neutral-500 w-[44px]"></th>
                          {visibleClientColumns.filter(c => c !== 'name').map(col => (
                            <th key={col} className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-neutral-500">
                              {ALL_CLIENT_COLUMNS.find(c => c.key === col)?.label || col}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-widest text-neutral-500 w-[80px]">Actions</th>
                        </tr>
                        {/* Priority Section Header in Table */}
                        {sortedClients.filter(c => c.priority).length > 0 && filteredClients.some(c => c.priority) && clientTypeFilter !== 'priority' && (
                          <tr>
                            <td colSpan={visibleClientColumns.length + 2} className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50/50 border-b border-amber-100/50">
                              ① Priority
                            </td>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {filteredClients.map((client) => {
                          const priorityClients = filteredClients.filter(c => c.priority);
                          const isLastPriority = client.priority && priorityClients.length > 0 && priorityClients.indexOf(client) === priorityClients.length - 1;
                          const showDivider = isLastPriority && filteredClients.some(c => !c.priority) && clientTypeFilter !== 'priority';

                          // Helper to get column value
                          const getColumnValue = (col: string) => {
                            switch (col) {
                              case 'name': return client.name;
                              case 'contact': return client.primary_contact_name || '-';
                              case 'email': return client.email || client.primary_contact_email || '-';
                              case 'phone': return client.phone || client.primary_contact_phone || '-';
                              case 'status': return client.is_archived ? 'Archived' : 'Active';
                              case 'type': return client.type || '-';
                              case 'lifecycle_stage': return client.lifecycle_stage || '-';
                              case 'address': return client.address || '-';
                              case 'city': return client.city || '-';
                              case 'state': return client.state || '-';
                              case 'website': return client.website || '-';
                              case 'billing_contact': return client.billing_contact_name || '-';
                              case 'billing_email': return client.billing_contact_email || '-';
                              case 'created_at': return client.created_at ? new Date(client.created_at).toLocaleDateString() : '-';
                              default: return '-';
                            }
                          };

                          return (
                            <React.Fragment key={client.id}>
                              <tr
                                onClick={() => { setSelectedClient(client); setIsAddingNewClient(false); }}
                                className="cursor-pointer hover:bg-neutral-50 transition-colors group"
                              >
                                {/* Client Name with Avatar */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-neutral-100 text-neutral-500 group-hover:bg-white group-hover:shadow-sm">
                                      {client.name.charAt(0)}
                                    </div>
                                    <span className="font-semibold text-sm text-neutral-900 truncate">{client.name}</span>
                                  </div>
                                </td>

                                {/* Priority */}
                                <td className="px-2 py-3 text-center">
                                  <ClientPriorityDropdown
                                    clientId={client.id}
                                    currentPriority={client.priority}
                                  />
                                </td>

                                {/* Dynamic Columns */}
                                {visibleClientColumns.filter(c => c !== 'name').map(col => (
                                  <td key={col} className="px-3 py-3 text-xs text-neutral-600">
                                    {col === 'status' ? (
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${client.is_archived
                                          ? 'bg-neutral-100 text-neutral-500'
                                          : 'bg-emerald-50 text-emerald-600'
                                        }`}>
                                        {getColumnValue(col)}
                                      </span>
                                    ) : col === 'website' && client.website ? (
                                      <a
                                        href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[#476E66] hover:underline inline-flex items-center gap-1"
                                      >
                                        <Globe className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate max-w-[120px]">{client.website.replace(/^https?:\/\//, '')}</span>
                                      </a>
                                    ) : col === 'email' && (client.email || client.primary_contact_email) ? (
                                      <a
                                        href={`mailto:${client.email || client.primary_contact_email}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[#476E66] hover:underline inline-flex items-center gap-1"
                                      >
                                        <Mail className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate max-w-[150px]">{getColumnValue(col)}</span>
                                      </a>
                                    ) : col === 'phone' && (client.phone || client.primary_contact_phone) ? (
                                      <a
                                        href={`tel:${client.phone || client.primary_contact_phone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-neutral-600 hover:text-[#476E66] inline-flex items-center gap-1"
                                      >
                                        <Phone className="w-3 h-3 flex-shrink-0" />
                                        <span>{getColumnValue(col)}</span>
                                      </a>
                                    ) : col === 'address' ? (
                                      <span className="inline-flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                                        <span className="truncate max-w-[120px]">{getColumnValue(col)}</span>
                                      </span>
                                    ) : (
                                      <span className="truncate">{getColumnValue(col)}</span>
                                    )}
                                  </td>
                                ))}

                                {/* Actions */}
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/quotes/new/document?client_id=${client.id}`);
                                      }}
                                      className="p-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors opacity-0 group-hover:opacity-100"
                                      title="Create Proposal"
                                    >
                                      <FilePlus className="w-3.5 h-3.5" />
                                    </button>
                                    <div className={`w-1.5 h-1.5 rounded-full ${client.lifecycle_stage === 'lead' ? 'bg-blue-400' : 'bg-emerald-400'} shadow-[0_0_8px_rgba(52,211,153,0.4)]`}></div>
                                  </div>
                                </td>
                              </tr>
                              {showDivider && (
                                <tr>
                                  <td colSpan={visibleClientColumns.length + 2} className="px-4 py-0">
                                    <div className="border-t-2 border-neutral-200" />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredClients.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                        <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mb-3">
                          <Users className="w-5 h-5 opacity-20" />
                        </div>
                        <p className="text-xs font-medium">No clients found</p>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Card View - Show on mobile OR when few columns selected OR when client panel open */}
                {(visibleClientColumns.length <= 3 || selectedClient || isAddingNewClient) && (
                  <>
                    {/* Priority Section Header */}
                    {sortedClients.filter(c => c.priority).length > 0 && filteredClients.some(c => c.priority) && clientTypeFilter !== 'priority' && (
                      <div className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50/50 border-b border-amber-100/50">
                        ① Priority
                      </div>
                    )}
                    <div className="max-h-[calc(100vh-320px)] overflow-y-auto p-2 space-y-1">
                      {filteredClients.map((client) => {
                        const priorityClients = filteredClients.filter(c => c.priority);
                        const isLastPriority = client.priority && priorityClients.length > 0 && priorityClients.indexOf(client) === priorityClients.length - 1;
                        const showDivider = isLastPriority && filteredClients.some(c => !c.priority) && clientTypeFilter !== 'priority';
                        const isSelected = selectedClient?.id === client.id;

                        return (
                          <div key={client.id}>
                            <div
                              onClick={() => { setSelectedClient(client); setIsAddingNewClient(false); }}
                              className={`group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 ${isSelected
                                ? 'bg-neutral-900 shadow-lg shadow-neutral-900/10'
                                : 'hover:bg-neutral-50 hover:scale-[1.01]'
                                }`}
                            >
                              {/* Priority */}
                              <ClientPriorityDropdown
                                clientId={client.id}
                                currentPriority={client.priority}
                              />

                              {/* Avatar */}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-neutral-100 text-neutral-500 group-hover:bg-white group-hover:shadow-sm group-hover:text-neutral-700'
                                }`}>
                                {client.name.charAt(0)}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-0.5">
                                  <p className={`font-semibold text-sm truncate ${isSelected ? 'text-white' : 'text-neutral-900'}`}>
                                    {client.name}
                                  </p>
                                  {(!selectedClient && !isAddingNewClient) && (
                                    <div className="flex items-center gap-2">
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mr-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/quotes/new/document?client_id=${client.id}`);
                                          }}
                                          className="p-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                                          title="Create Proposal"
                                        >
                                          <FilePlus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <div className={`w-1.5 h-1.5 rounded-full ${client.lifecycle_stage === 'lead' ? 'bg-blue-400' : 'bg-emerald-400'} shadow-[0_0_8px_rgba(52,211,153,0.4)]`}></div>
                                    </div>
                                  )}
                                </div>
                                <p className={`text-xs truncate ${isSelected ? 'text-white/60' : 'text-neutral-400'}`}>
                                  {client.primary_contact_name || client.email || 'No contact info'}
                                </p>
                              </div>
                            </div>
                            {showDivider && (
                              <div className="mx-4 my-2 border-t border-neutral-100" />
                            )}
                          </div>
                        );
                      })}
                      {filteredClients.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                          <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mb-3">
                            <Users className="w-5 h-5 opacity-20" />
                          </div>
                          <p className="text-xs font-medium">No clients found</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Mobile Card View - Always show on mobile when table mode is active */}
                {visibleClientColumns.length > 3 && !selectedClient && !isAddingNewClient && (
                  <div className="sm:hidden">
                    {/* Priority Section Header */}
                    {sortedClients.filter(c => c.priority).length > 0 && filteredClients.some(c => c.priority) && clientTypeFilter !== 'priority' && (
                      <div className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50/50 border-b border-amber-100/50">
                        ① Priority
                      </div>
                    )}
                    <div className="max-h-[calc(100vh-320px)] overflow-y-auto p-2 space-y-1">
                      {filteredClients.map((client) => {
                        const priorityClients = filteredClients.filter(c => c.priority);
                        const isLastPriority = client.priority && priorityClients.length > 0 && priorityClients.indexOf(client) === priorityClients.length - 1;
                        const showDivider = isLastPriority && filteredClients.some(c => !c.priority) && clientTypeFilter !== 'priority';

                        return (
                          <div key={client.id}>
                            <div
                              onClick={() => { setSelectedClient(client); setIsAddingNewClient(false); }}
                              className="group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-neutral-50"
                            >
                              <ClientPriorityDropdown
                                clientId={client.id}
                                currentPriority={client.priority}
                              />
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-neutral-100 text-neutral-500">
                                {client.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate text-neutral-900">{client.name}</p>
                                <p className="text-xs truncate text-neutral-400">
                                  {client.primary_contact_name || client.email || 'No contact info'}
                                </p>
                              </div>
                            </div>
                            {showDivider && <div className="mx-4 my-2 border-t border-neutral-100" />}
                          </div>
                        );
                      })}
                      {filteredClients.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                          <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mb-3">
                            <Users className="w-5 h-5 opacity-20" />
                          </div>
                          <p className="text-xs font-medium">No clients found</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
        </div>
      )}

      {/* Proposals Section with Subtabs */}
      {activeTab === 'proposals' && (
        <>
          {/* Proposals Subtabs - New Clean Structure */}
          {/* Modern Minimalist Tab Navigation */}
          <div className="border-b border-neutral-200 mb-6 sticky top-0 bg-neutral-50 z-10 pt-4 -mt-2">
            <div className="flex gap-8 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setProposalsSubTab('direct')}
                className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${proposalsSubTab === 'direct' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
              >
                Direct Proposals
                <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${proposalsSubTab === 'direct' ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-100/50 text-neutral-400'}`}>
                  {quotes.filter(q => {
                    const hasCollabs = sentCollaborations.some(c => c.parent_quote_id === q.id);
                    return !hasCollabs && q.status !== 'accepted' && q.status !== 'approved';
                  }).length}
                </span>
              </button>
              <button
                onClick={() => setProposalsSubTab('collaborations')}
                className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${proposalsSubTab === 'collaborations' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
              >
                Collaborations
                {(collaborationInbox.filter(c => c.status === 'pending').length > 0 || sentCollaborations.filter(c => c.status === 'submitted').length > 0) && (
                  <span className="ml-2 w-1.5 h-1.5 inline-block bg-[#476E66] rounded-full animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setProposalsSubTab('signed')}
                className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${proposalsSubTab === 'signed' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
              >
                Signed
                <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${proposalsSubTab === 'signed' ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-100/50 text-neutral-400'}`}>
                  {quotes.filter(q => q.status === 'accepted' || q.status === 'approved').length}
                </span>
              </button>
              <button
                onClick={() => setProposalsSubTab('partners')}
                className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${proposalsSubTab === 'partners' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
              >
                Partners
                <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${proposalsSubTab === 'partners' ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-100/50 text-neutral-400'}`}>
                  {partners.length}
                </span>
              </button>
              <button
                onClick={() => setProposalsSubTab('templates')}
                className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${proposalsSubTab === 'templates' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
              >
                Templates
              </button>
            </div>
          </div>

          {/* List Headers - Visible for document lists */}
          {proposalsSubTab !== 'templates' && proposalsSubTab !== 'partners' && (
            <div className="grid grid-cols-12 gap-6 px-6 py-3 border-b border-neutral-100 text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0 bg-white shadow-sm">
              <div className="col-span-4">Proposal</div>
              <div className="col-span-3">Client</div>
              <div className="col-span-2">Value</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
          )}

          {/* DIRECT PROPOSALS TAB */}
          {proposalsSubTab === 'direct' && (
            <div className="space-y-6">
              {/* Minimal Filters */}
              <div className="flex items-center gap-6 mb-2 px-6 pt-4">
                <span className="text-neutral-400 font-bold text-[10px] uppercase tracking-widest">Show:</span>
                {(['all', 'drafts', 'sent', 'archived'] as DirectFilter[]).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setDirectFilter(filter)}
                    className={`font-bold text-[10px] uppercase tracking-widest transition-all pb-0.5 border-b-2 ${directFilter === filter
                      ? 'text-neutral-900 border-neutral-900'
                      : 'text-neutral-400 border-transparent hover:text-neutral-600'}`}
                  >
                    {filter === 'all' ? 'All' : filter === 'drafts' ? 'Drafts' : filter === 'sent' ? 'Sent' : 'Archived'}
                  </button>
                ))}
              </div>

              {/* Direct Proposals List */}
              {(() => {
                const directProposals = quotes.filter(q => {
                  const hasCollabs = sentCollaborations.some(c => c.parent_quote_id === q.id);
                  if (hasCollabs) return false;
                  if (q.status === 'accepted' || q.status === 'approved') return false;

                  if (directFilter === 'archived') return q.status === 'archived';
                  if (q.status === 'archived') return false;

                  if (directFilter === 'drafts') return q.status === 'draft' || q.status === 'pending';
                  if (directFilter === 'sent') return q.status === 'sent';
                  return true;
                });

                if (directProposals.length === 0) {
                  return (
                    <div className="py-24 text-center border-2 border-dashed border-neutral-100 rounded-none mx-6">
                      <FileText className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                      <p className="text-neutral-400 font-medium text-sm">No direct proposals found</p>
                      <button
                        onClick={() => navigate('/quotes/new/document')}
                        className="mt-4 text-[11px] font-bold text-neutral-900 uppercase tracking-widest hover:underline"
                      >
                        Create your first proposal
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="bg-white border-t border-b border-neutral-100 divide-y divide-neutral-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                    {directProposals.map((quote) => (
                      <div key={quote.id} className="grid grid-cols-12 gap-6 px-6 py-5 items-center hover:bg-neutral-50/50 transition-all cursor-pointer group relative" onClick={() => !activeDirectQuoteMenu && navigate(`/quotes/${quote.id}/document`)}>
                        <div className="col-span-4 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-neutral-100 flex items-center justify-center text-neutral-400 group-hover:text-neutral-600 transition-colors">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-neutral-900 truncate text-sm group-hover:text-neutral-600 transition-colors">{quote.title || 'Untitled Proposal'}</p>
                              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">#{quote.quote_number || 'DRAFT'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3 min-w-0">
                          <p className="text-xs font-medium text-neutral-600 truncate">{quote.client?.display_name || quote.client?.name || (quote.lead_id && leads.find(l => l.id === quote.lead_id)?.name) || '-'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs font-medium text-neutral-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(quote.total_amount || 0))}</p>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${quote.status === 'sent' ? 'bg-neutral-900' :
                              quote.status === 'archived' ? 'bg-neutral-400' : quote.status === 'draft' ? 'bg-neutral-400' : 'bg-neutral-300'
                              }`}></span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">{quote.status === 'pending' ? 'Draft' : quote.status === 'archived' ? 'Archived' : quote.status}</span>
                          </div>
                          {quote.status === 'sent' && <p className="text-[9px] text-neutral-400 mt-0.5 ml-3.5 italic">Sent</p>}
                        </div>
                        <div className="col-span-1 flex justify-end items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveDirectQuoteMenu(activeDirectQuoteMenu === quote.id ? null : quote.id); }}
                            className="p-2 rounded-md hover:bg-neutral-200 text-neutral-500 hover:text-neutral-700 transition-colors border border-transparent hover:border-neutral-200"
                            aria-label="Proposal actions: Archive, Create revision, Delete"
                            title="Actions (Archive, Create revision, Delete)"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {activeDirectQuoteMenu === quote.id && (
                            <div className="absolute right-6 top-full mt-0.5 z-20 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
                              {quote.status === 'archived' ? (
                                <button onClick={() => handleRestoreQuote(quote)} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                                  <RotateCcw className="w-3.5 h-3.5" /> Restore to drafts
                                </button>
                              ) : (
                                <button onClick={() => handleArchiveQuote(quote)} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                                  <Archive className="w-3.5 h-3.5" /> Archive
                                </button>
                              )}
                              {quote.status === 'sent' && (
                                <button onClick={() => handleCreateRevision(quote)} disabled={duplicatingQuoteId === quote.id} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-[#476E66] hover:bg-[#476E66]/5">
                                  {duplicatingQuoteId === quote.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />} Create revision
                                </button>
                              )}
                              <div className="border-t border-neutral-100 my-1" />
                              <button onClick={() => { setQuoteToDelete(quote); setActiveDirectQuoteMenu(null); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          )}
                          <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* COLLABORATIONS TAB */}
          {/* COLLABORATIONS TAB */}
          {proposalsSubTab === 'collaborations' && (
            <div className="space-y-6">
              <div className="flex gap-6 border-b border-neutral-100 pb-0 px-6 pt-2">
                <button onClick={() => setCollaborationsSubTab('my-projects')} className={`text-[10px] font-bold uppercase tracking-widest pb-3 transition-colors ${collaborationsSubTab === 'my-projects' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 border-b-2 border-transparent hover:text-neutral-600'}`}>My Projects</button>
                <button onClick={() => setCollaborationsSubTab('invited')} className={`text-[10px] font-bold uppercase tracking-widest pb-3 transition-colors ${collaborationsSubTab === 'invited' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 border-b-2 border-transparent hover:text-neutral-600'}`}>Invited</button>
              </div>

              {collaborationsSubTab === 'my-projects' && (
                <div>
                  {/* Review Needed Alert */}
                  {sentCollaborations.filter(c => c.status === 'submitted').length > 0 && (
                    <div className="mb-6 bg-neutral-900 text-white rounded-none p-4 flex justify-between items-center mx-6 shadow-lg shadow-neutral-900/10">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <Bell className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold uppercase tracking-wide">Action Required</p>
                          <p className="text-xs text-white/70">{sentCollaborations.filter(c => c.status === 'submitted').length} collaborator(s) submitted proposals for review.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* List */}
                  {(() => {
                    const collabProjects = quotes.filter(q => {
                      const hasCollabs = sentCollaborations.some(c => c.parent_quote_id === q.id);
                      return hasCollabs && q.status !== 'accepted' && q.status !== 'approved';
                    });

                    if (collabProjects.length === 0 && sentCollaborations.filter(c => c.status === 'submitted').length === 0)
                      return (
                        <div className="py-24 text-center text-neutral-400 text-sm border-2 border-dashed border-neutral-100 rounded-none mx-6">
                          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="uppercase tracking-widest text-[10px] font-bold">No collaboration projects</p>
                        </div>
                      );

                    return (
                      <div className="bg-white border-t border-b border-neutral-100 divide-y divide-neutral-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                        {collabProjects.map(quote => {
                          const quoteCollabs = sentCollaborations.filter(c => c.parent_quote_id === quote.id);
                          const submittedCollabs = quoteCollabs.filter(c => c.status === 'submitted');
                          const hasSubmitted = submittedCollabs.length > 0;
                          return (
                            <div key={quote.id} className="group hover:bg-neutral-50/50 transition-colors">
                              <div className="grid grid-cols-12 gap-6 px-6 py-5 items-center cursor-pointer" onClick={() => navigate(`/quotes/${quote.id}/document?view=collaboration`)}>
                                <div className="col-span-4 min-w-0">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-neutral-100 flex items-center justify-center text-neutral-400 group-hover:text-neutral-600 transition-colors">
                                      <Users className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="font-bold text-neutral-900 truncate text-sm group-hover:text-neutral-600 transition-colors">{quote.title}</p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] text-neutral-400 uppercase tracking-widest">Partners:</span>
                                        <span className="text-[10px] text-neutral-600 font-medium truncate">
                                          {quoteCollabs.map(c => c.collaborator_company_name || c.collaborator_name || c.collaborator_email?.split('@')[0]).join(', ') || 'None'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-span-3 min-w-0">
                                  <p className="text-xs font-medium text-neutral-600 truncate">{quote.client?.name || 'No Client'}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-xs font-medium text-neutral-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(quote.total_amount || 0))}</p>
                                </div>
                                <div className="col-span-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${hasSubmitted ? 'bg-emerald-500' : quote.status === 'pending_collaborators' ? 'bg-purple-500' : 'bg-neutral-400'}`}></span>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${hasSubmitted ? 'text-emerald-700' : 'text-neutral-600'}`}>
                                      {hasSubmitted ? 'Ready to Merge' : quote.status === 'pending_collaborators' ? 'Waiting' : quote.status}
                                    </span>
                                  </div>
                                </div>
                                <div className="col-span-1 flex justify-end">
                                  <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                                </div>
                              </div>
                              {/* Show Review & Merge buttons for submitted collaborations */}
                              {hasSubmitted && (
                                <div className="px-6 pb-4 pt-0 pl-[4.5rem] flex flex-wrap gap-2">
                                  {submittedCollabs.map(collab => (
                                    <button
                                      key={collab.id}
                                      onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${quote.id}/document?merge_collaboration_id=${collab.id}`); }}
                                      className="text-[10px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded hover:bg-emerald-100 transition flex items-center gap-1.5"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      Review & Merge: {collab.collaborator_company_name || collab.collaborator_name || collab.collaborator_email?.split('@')[0]}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Invited Subtab */}
              {collaborationsSubTab === 'invited' && (
                <div className="bg-white border-t border-b border-neutral-100 divide-y divide-neutral-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                  {collaborationInbox.length === 0 ? (
                    <div className="py-24 text-center text-neutral-400 text-sm mx-6">
                      <p className="uppercase tracking-widest text-[10px] font-bold">No new invitations</p>
                    </div>
                  ) : (
                    collaborationInbox.map(collab => {
                      const projectTitle = (collab.parent_quote as any)?.title || 'Invitation';
                      const canRespond = collab.status === 'accepted';
                      const handleRowClick = () => {
                        if (collab.status === 'pending') {
                          navigate(`/collaborate/${collab.id}`);
                        } else if (canRespond) {
                          const title = encodeURIComponent(projectTitle);
                          navigate(`/quotes/new/document?collaboration_id=${collab.id}&parent_quote_id=${collab.parent_quote_id}&project_title=${title}`);
                        } else if (collab.status === 'submitted') {
                          // Navigate to parent quote with merge mode for owner to review and merge
                          navigate(`/quotes/${collab.parent_quote_id}/document?merge_collaboration_id=${collab.id}`);
                        }
                      };

                      return (
                        <div
                          key={collab.id}
                          className={`grid grid-cols-12 gap-6 px-6 py-5 items-center hover:bg-neutral-50/50 transition-colors ${canRespond || collab.status === 'pending' || collab.status === 'submitted' ? 'cursor-pointer' : ''}`}
                          onClick={handleRowClick}
                        >
                          <div className="col-span-4 min-w-0">
                            <p className="font-bold text-neutral-900 truncate text-sm">{projectTitle}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-wide">From {collab.owner_profile?.company_name || 'Partner'}</p>
                          </div>
                          <div className="col-span-3">
                            <span className="text-[10px] font-medium bg-neutral-100 text-neutral-600 px-2 py-1 rounded">{collab.message ? 'Message attached' : 'No message'}</span>
                          </div>
                          <div className="col-span-2"></div>
                          <div className="col-span-2">
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${collab.status === 'pending' ? 'bg-blue-50 text-blue-700' :
                              collab.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' :
                                collab.status === 'submitted' ? 'bg-purple-50 text-purple-700' :
                                  collab.status === 'merged' ? 'bg-indigo-50 text-indigo-700' :
                                    'bg-neutral-100 text-neutral-600'
                              }`}>
                              {collab.status}
                            </span>
                          </div>
                          <div className="col-span-1 flex justify-end">
                            {collab.status === 'pending' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/collaborate/${collab.id}`); }}
                                className="text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-800 transition"
                              >
                                View
                              </button>
                            )}
                            {collab.status === 'accepted' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const title = encodeURIComponent(projectTitle);
                                  navigate(`/quotes/new/document?collaboration_id=${collab.id}&parent_quote_id=${collab.parent_quote_id}&project_title=${title}`);
                                }}
                                className="text-[10px] font-bold uppercase tracking-widest bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 transition"
                              >
                                Respond
                              </button>
                            )}
                            {collab.status === 'merged' && (
                              <span className="text-xs text-indigo-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* SIGNED TAB */}
          {/* SIGNED TAB */}
          {proposalsSubTab === 'signed' && (
            <div className="space-y-4">
              {(() => {
                const signedProposals = quotes.filter(q => q.status === 'accepted' || q.status === 'approved');
                if (signedProposals.length === 0) return <div className="py-24 text-center text-neutral-400 text-sm border-2 border-dashed border-neutral-100 rounded-none mx-6 uppercase tracking-widest font-bold">No signed proposals yet</div>;

                return (
                  <div className="bg-white border-t border-b border-neutral-100 divide-y divide-neutral-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                    {signedProposals.map((quote) => (
                      <div key={quote.id} className="grid grid-cols-12 gap-6 px-6 py-5 items-center hover:bg-neutral-50/50 transition-colors cursor-pointer group" onClick={() => navigate(`/quotes/${quote.id}/document`)}>
                        <div className="col-span-4 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-50 flex items-center justify-center text-emerald-600 rounded-full">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-neutral-900 truncate text-sm">{quote.title}</p>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-0.5">Signed & Approved</p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3 min-w-0">
                          <p className="text-xs font-medium text-neutral-600 truncate">{quote.client?.name}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs font-medium text-neutral-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(quote.total_amount || 0))}</p>
                        </div>
                        <div className="col-span-2">
                          {!quote.project_id ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleConvertToProject(quote); }}
                              disabled={convertingQuoteId === quote.id}
                              className="text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-800 transition flex items-center gap-1.5"
                            >
                              {convertingQuoteId === quote.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              Convert to Project
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" /> Project Active
                            </span>
                          )}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}


          {/* PARTNERS TAB */}
          {proposalsSubTab === 'partners' && (
            <div className="bg-white border-t border-b border-neutral-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
              {partners.length === 0 ? (
                <div className="p-24 text-center">
                  <div className="w-16 h-16 bg-neutral-50 rounded-none flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-neutral-300" />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-900 mb-2 uppercase tracking-widest">No Trade Partners Yet</h3>
                  <p className="text-neutral-500 text-xs max-w-sm mx-auto">
                    When you collaborate with other companies on proposals, they'll appear here as your trade partners.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white border-b border-neutral-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Partner</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Trade</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Contact</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Projects</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Relationship</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Last Activity</th>
                        <th className="px-6 py-4 text-right text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {partners.map((partner) => (
                        <tr key={partner.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-neutral-100 flex items-center justify-center text-neutral-500 font-bold text-xs flex-shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-bold text-neutral-900 text-xs">{partner.companyName || partner.name || 'Unknown'}</p>
                                {partner.name && partner.companyName && partner.name !== partner.companyName && (
                                  <p className="text-[10px] text-neutral-500">{partner.name}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {partner.trade ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] font-bold uppercase tracking-widest">
                                {partner.trade}
                              </span>
                            ) : (
                              <span className="text-neutral-300 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {partner.email && (
                                <div className="flex items-center gap-2 text-xs text-neutral-600">
                                  <Mail className="w-3.5 h-3.5 text-neutral-400" />
                                  <a href={`mailto:${partner.email}`} className="hover:text-neutral-900 transition-colors">{partner.email}</a>
                                </div>
                              )}
                              {partner.phone && (
                                <div className="flex items-center gap-2 text-xs text-neutral-600">
                                  <Phone className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>{partner.phone}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600">
                              <FileText className="w-3.5 h-3.5 text-neutral-400" />
                              {partner.projectCount}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${partner.relationship === 'mutual'
                              ? 'bg-emerald-50 text-emerald-700'
                              : partner.relationship === 'invited'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-purple-50 text-purple-700'
                              }`}>
                              {partner.relationship === 'mutual' ? 'Mutual' : partner.relationship === 'invited' ? 'You Invited' : 'Invited You'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-neutral-500 font-mono">
                            {partner.lastCollaboration ? new Date(partner.lastCollaboration).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            }) : '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => {
                                // Pre-fill new proposal with this partner
                                setShowProposalChoiceModal({ type: 'client' });
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-900 bg-neutral-100 hover:bg-neutral-200 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              New Proposal
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TEMPLATES TAB */}
          {proposalsSubTab === 'templates' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
              {templates.map(template => (
                <div key={template.id} className="group bg-white border border-neutral-200 p-6 hover:border-neutral-900 hover:shadow-lg hover:shadow-neutral-900/5 transition-all cursor-pointer relative" onClick={() => navigate(`/quotes/new/document?template_id=${template.id}`)}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:text-neutral-900 group-hover:bg-neutral-100 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveQuoteMenu(activeQuoteMenu === template.id ? null : template.id); }}
                        className="p-1.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {/* Menu Dropdown */}
                      {activeQuoteMenu === template.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white shadow-xl border border-neutral-100 py-1 z-10 w-32 animate-in fade-in zoom-in-95 duration-100">
                          <button onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template); }} className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-50 transition-colors">Preview</button>
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm('Delete?')) { await api.deleteProposalTemplate(template.id); setTemplates(t => t.filter(x => x.id !== template.id)); }
                          }} className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-600 hover:bg-red-50 transition-colors">Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="font-bold text-neutral-900 mb-1 text-sm tracking-tight">{template.name}</h3>
                  <p className="text-xs text-neutral-500 line-clamp-2 mb-4 h-8 leading-relaxed">{template.description || 'No description provided for this template.'}</p>

                  <div className="flex justify-between items-center pt-4 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{template.category || 'General'}</span>
                    <span className="text-[10px] font-medium text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded-full">{template.use_count} uses</span>
                  </div>
                </div>
              ))}
              {/* Add New Template Card */}
              <button
                onClick={() => navigate(`/quotes/new/document`)}
                className="bg-neutral-50 border-2 border-dashed border-neutral-200 p-6 flex flex-col items-center justify-center hover:border-neutral-400 hover:bg-neutral-100 transition-all group text-center min-h-[200px]"
              >
                <div className="w-12 h-12 bg-white border border-neutral-200 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                  <Plus className="w-5 h-5 text-neutral-400 group-hover:text-neutral-900" />
                </div>
                <span className="font-bold text-neutral-900 text-xs uppercase tracking-widest mb-1">Create New Template</span>
                <span className="text-[10px] text-neutral-500">Start from scratch</span>
              </button>
            </div>
          )}

          {/* Collaborations Subtab */}
          {/* Collaborations Tab Removed */}
        </>
      )}

      {/* Signature Modal */}
      {
        selectedSignature && (
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
        )
      }

      {/* Quote Modal */}
      {
        showQuoteModal && (
          <QuoteModal
            quote={editingQuote}
            clients={clients}
            companyId={profile?.company_id || ''}
            onClose={() => { setShowQuoteModal(false); setEditingQuote(null); }}
            onSave={() => { loadData(); setShowQuoteModal(false); setEditingQuote(null); }}
          />
        )
      }

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
      {
        leadBottomSheet && (
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
        )
      }

      {/* Lead Modal */}
      {
        showLeadModal && (
          <LeadModal
            lead={editingLead}
            companyId={profile?.company_id || ''}
            onClose={() => { setShowLeadModal(false); setEditingLead(null); }}
            onSave={() => { loadData(); setShowLeadModal(false); setEditingLead(null); }}
          />
        )
      }

      {/* Convert Lead to Client Modal */}
      {
        showConvertModal && convertingLead && (
          <ConvertToClientModal
            lead={convertingLead}
            companyId={profile?.company_id || ''}
            onClose={() => { setShowConvertModal(false); setConvertingLead(null); }}
            onSave={() => { loadData(); setShowConvertModal(false); setConvertingLead(null); }}
          />
        )
      }

      {/* Won Lead - Prompt to Convert Modal */}
      {
        showWonConvertModal && (
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
        )
      }

      {/* Proposal Choice Modal - Select Template or Create New */}
      {
        showProposalChoiceModal && (
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
        )
      }

      {/* Delete proposal confirmation */}
      {quoteToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setQuoteToDelete(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-2">Delete proposal?</h2>
              <p className="text-sm text-neutral-500 mb-6">
                &ldquo;{quoteToDelete.title || 'Untitled Proposal'}&rdquo; will be permanently deleted. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setQuoteToDelete(null)} className="flex-1 px-4 py-2.5 border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 text-sm font-medium">Cancel</button>
                <button onClick={() => handleDeleteQuote(quoteToDelete)} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {
        previewTemplate && (
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
        )
      }

      {/* Lead Form Link Modal */}
      {
        showLeadFormLinkModal && (
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
        )
      }
    </div >
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
  // Additional contacts state
  const [additionalContacts, setAdditionalContacts] = useState<ClientContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState<Partial<ClientContact>>({ name: '', email: '', title: '', phone: '', role: 'project_manager' });
  const [savingContact, setSavingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

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

  // Load additional contacts when client changes
  useEffect(() => {
    let mounted = true;
    if (client?.id) {
      setLoadingContacts(true);
      api.getClientContacts(client.id).then((contacts) => {
        if (mounted) {
          setAdditionalContacts(contacts || []);
        }
      }).catch(console.error).finally(() => {
        if (mounted) setLoadingContacts(false);
      });
    } else {
      setAdditionalContacts([]);
    }
    return () => { mounted = false; };
  }, [client?.id]);

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

  // Additional contacts handlers
  const handleAddContact = async () => {
    if (!client?.id || !newContact.name?.trim() || !newContact.email?.trim()) return;
    setSavingContact(true);
    try {
      const created = await api.createClientContact({
        client_id: client.id,
        company_id: companyId,
        name: newContact.name.trim(),
        email: newContact.email.trim(),
        title: newContact.title?.trim() || undefined,
        phone: newContact.phone?.trim() || undefined,
        role: newContact.role as ClientContactRole || 'project_manager',
      });
      setAdditionalContacts(prev => [...prev, created]);
      setNewContact({ name: '', email: '', title: '', phone: '', role: 'project_manager' });
      setShowAddContact(false);
    } catch (err) {
      console.error('Failed to add contact:', err);
    } finally {
      setSavingContact(false);
    }
  };

  const handleUpdateContact = async (contactId: string, updates: Partial<ClientContact>) => {
    try {
      const updated = await api.updateClientContact(contactId, updates);
      setAdditionalContacts(prev => prev.map(c => c.id === contactId ? updated : c));
      setEditingContactId(null);
    } catch (err) {
      console.error('Failed to update contact:', err);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await api.deleteClientContact(contactId);
      setAdditionalContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error('Failed to delete contact:', err);
    }
  };

  const getContactRoleLabel = (role: ClientContactRole) => {
    switch (role) {
      case 'primary': return 'Primary';
      case 'billing': return 'Billing';
      case 'project_manager': return 'Project Manager';
      case 'other': return 'Other';
      default: return role;
    }
  };

  const getContactRoleColor = (role: ClientContactRole) => {
    switch (role) {
      case 'primary': return 'bg-blue-100 text-blue-700';
      case 'billing': return 'bg-green-100 text-green-700';
      case 'project_manager': return 'bg-purple-100 text-purple-700';
      case 'other': return 'bg-neutral-100 text-neutral-600';
      default: return 'bg-neutral-100 text-neutral-600';
    }
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
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFieldErrors(prev => ({ ...prev, name: '' })); }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors ${fieldErrors.name ? 'border-red-300 bg-red-50' : 'border-neutral-300'}`}
                  placeholder="Acme Corporation"
                />
                <FieldError message={fieldErrors.name} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Display Name</label>
                <input type="text" value={formData.display_name} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="Acme" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Type</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors bg-white">
                  <option value="company">Company</option>
                  <option value="person">Person</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Status</label>
                <select value={formData.lifecycle_stage} onChange={(e) => setFormData({ ...formData, lifecycle_stage: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors bg-white">
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
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFieldErrors(prev => ({ ...prev, email: '' })); }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors ${fieldErrors.email ? 'border-red-300 bg-red-50' : 'border-neutral-300'}`}
                  placeholder="contact@company.com"
                />
                <FieldError message={fieldErrors.email} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="(555) 123-4567" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">Website</label>
              <input type="url" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="https://company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="123 Main Street" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">City</label>
                <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="City" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">State</label>
                <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="State" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">ZIP</label>
                <input type="text" value={formData.zip} onChange={(e) => setFormData({ ...formData, zip: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="ZIP" />
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
                      <input type="text" value={formData.primary_contact_name} onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="John Doe" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Title</label>
                      <input type="text" value={formData.primary_contact_title} onChange={(e) => setFormData({ ...formData, primary_contact_title: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="CEO" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Email</label>
                    <input type="email" value={formData.primary_contact_email} onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="john@company.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone</label>
                    <input type="tel" value={formData.primary_contact_phone} onChange={(e) => setFormData({ ...formData, primary_contact_phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="(555) 123-4567" />
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
                      <input type="text" value={formData.billing_contact_name} onChange={(e) => setFormData({ ...formData, billing_contact_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="Jane Smith" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Title</label>
                      <input type="text" value={formData.billing_contact_title} onChange={(e) => setFormData({ ...formData, billing_contact_title: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="CFO" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Email</label>
                    <input type="email" value={formData.billing_contact_email} onChange={(e) => setFormData({ ...formData, billing_contact_email: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="jane@company.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone</label>
                    <input type="tel" value={formData.billing_contact_phone} onChange={(e) => setFormData({ ...formData, billing_contact_phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors" placeholder="(555) 987-6543" />
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

      {/* Additional Contacts Section - For Project Managers and other contacts */}
      {!isNew && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">Project Contacts</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Add project managers and other contacts for this company</p>
            </div>
            <button
              onClick={() => setShowAddContact(!showAddContact)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Contact
            </button>
          </div>

          {/* Add New Contact Form */}
          {showAddContact && (
            <div className="mb-4 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newContact.name || ''}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Email *</label>
                  <input
                    type="email"
                    value={newContact.email || ''}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                    placeholder="john@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={newContact.title || ''}
                    onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                    placeholder="Project Manager"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Role</label>
                  <select
                    value={newContact.role || 'project_manager'}
                    onChange={(e) => setNewContact({ ...newContact, role: e.target.value as ClientContactRole })}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none bg-white"
                  >
                    <option value="project_manager">Project Manager</option>
                    <option value="primary">Primary Contact</option>
                    <option value="billing">Billing Contact</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newContact.phone || ''}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowAddContact(false); setNewContact({ name: '', email: '', title: '', phone: '', role: 'project_manager' }); }}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddContact}
                  disabled={savingContact || !newContact.name?.trim() || !newContact.email?.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                >
                  {savingContact ? 'Adding...' : 'Add Contact'}
                </button>
              </div>
            </div>
          )}

          {/* Contacts List */}
          {loadingContacts ? (
            <div className="text-center py-6 text-sm text-neutral-400">Loading contacts...</div>
          ) : additionalContacts.length === 0 ? (
            <div className="text-center py-6">
              <Users className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-400">No project contacts added yet</p>
              <p className="text-xs text-neutral-400 mt-1">Add project managers to send proposals directly to them</p>
            </div>
          ) : (
            <div className="space-y-2">
              {additionalContacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-100 hover:border-neutral-200 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-[#476E66]/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-[#476E66]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-neutral-900 truncate">{contact.name}</p>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getContactRoleColor(contact.role)}`}>
                        {getContactRoleLabel(contact.role)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 truncate">{contact.email}</p>
                    {contact.title && <p className="text-xs text-neutral-400">{contact.title}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
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
