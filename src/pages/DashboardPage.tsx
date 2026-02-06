import { useEffect, useState, useRef, useCallback } from 'react';
import { Clock, CheckSquare, DollarSign, TrendingUp, Plus, FileText, FolderPlus, Timer, ChevronDown, X, CheckCircle, XCircle, BarChart3, TreePine, Camera, Target, Settings2, ArrowUpRight, ArrowDownRight, Wallet, Briefcase, Send, FileCheck, Users, Trophy, Building2 } from 'lucide-react';
import BusinessHealthTree from '../components/BusinessHealthTree';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { api, Project, Client, TimeEntry, Invoice, Quote, Expense, Task, companyExpensesApi, notificationsApi } from '../lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { InlineError } from '../components/ErrorBoundary';
import { DEFAULT_HOURLY_RATE, EXPECTED_MONTHLY_HOURS, RECENT_ACTIVITIES_LIMIT, REVENUE_TREND_MONTHS, MIN_TIME_ENTRY_HOURS, MAX_TIME_ENTRY_HOURS } from '../lib/constants';

interface DashboardStats {
  hoursToday: number;
  hoursThisWeek: number;
  pendingTasks: number;
  unbilledWIP: number;
  utilization: number;
  billableHours: number;
  nonBillableHours: number;
  draftInvoices: number;
  sentInvoices: number;
  totalRevenue: number;
  outstandingInvoices: number;
  activeProjects: number;
}

interface ActivityItem {
  id: string;
  type: 'time' | 'invoice' | 'project' | 'proposal_signed' | 'proposal_viewed' | 'proposal_sent' | 'collaboration' | 'system';
  description: string;
  date: string;
  meta?: string;
  icon?: string;
}

interface RevenueData {
  month: string;
  revenue: number;
}

interface AgingData {
  range: string;
  count: number;
  amount: number;
}

interface SalesStats {
  proposalsSent: number;
  proposalsAccepted: number;
  proposalsPending: number;
  pipelineValue: number;
  winRate: number;
}

interface TopClient {
  id: string;
  name: string;
  totalRevenue: number;
  invoiceCount: number;
}

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { canViewFinancials } = usePermissions();
  const { refreshSubscription } = useSubscription();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeEntry, setTimeEntry] = useState({ project_id: '', task_id: '', hours: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [timeErrors, setTimeErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [agingData, setAgingData] = useState<AgingData[]>([]);
  const [salesStats, setSalesStats] = useState<SalesStats>({ proposalsSent: 0, proposalsAccepted: 0, proposalsPending: 0, pipelineValue: 0, winRate: 0 });
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const quickAddRef = useRef<HTMLDivElement>(null);
  const [subscriptionNotice, setSubscriptionNotice] = useState<{ type: 'success' | 'canceled'; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'health'>('overview');
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [healthTargets, setHealthTargets] = useState(() => {
    const saved = localStorage.getItem('billdora_health_targets');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {
      cashFlow: 80,
      utilization: 75,
      winRate: 30,
      momentum: 10,
      profitMargin: 20,
    };
  });
  const [healthMetrics, setHealthMetrics] = useState({
    cashFlow: 0,
    utilization: 0,
    winRate: 0,
    momentum: 0,
    profitMargin: 0,
  });
  const [profitTarget, setProfitTarget] = useState(() => {
    const saved = localStorage.getItem('billdora_profit_target');
    return saved ? Number(saved) : 10000;
  });
  const [targetPeriod, setTargetPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>(() => {
    const saved = localStorage.getItem('billdora_target_period');
    return (saved as 'monthly' | 'quarterly' | 'yearly') || 'monthly';
  });
  const [actualProfit, setActualProfit] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [showProfitTargetModal, setShowProfitTargetModal] = useState(false);
  const [tempProfitTarget, setTempProfitTarget] = useState(profitTarget);
  const [tempTargetPeriod, setTempTargetPeriod] = useState(targetPeriod);

  // Handle subscription success/cancel URL params
  useEffect(() => {
    const subscriptionStatus = searchParams.get('subscription');
    if (subscriptionStatus === 'success') {
      setSubscriptionNotice({
        type: 'success',
        message: 'Your subscription has been activated successfully! Thank you for upgrading.'
      });
      refreshSubscription();
      searchParams.delete('subscription');
      setSearchParams(searchParams, { replace: true });
    } else if (subscriptionStatus === 'canceled') {
      setSubscriptionNotice({
        type: 'canceled',
        message: 'Subscription checkout was canceled. You can try again anytime from the Settings page.'
      });
      searchParams.delete('subscription');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshSubscription]);

  // Load dashboard data function
  const loadData = useCallback(async (signal?: AbortSignal) => {
    console.log('[Dashboard] loadData called - userId:', user?.id, 'companyId:', profile?.company_id, 'authLoading:', authLoading);
    
    if (!profile?.company_id || !user?.id) {
      console.log('[Dashboard] Early return - userId:', user?.id, 'profile:', profile ? JSON.stringify({ id: profile.id, email: profile.email, company_id: profile.company_id }) : 'null');
      
      if (user?.id && !profile) {
        console.log('[Dashboard] User exists but profile still loading, showing loading state');
        setLoading(true);
        return;
      }
      
      setLoading(false);
      if (!authLoading && user?.id) {
        if (!profile) {
          console.error('[Dashboard] ERROR: User exists but profile is null!');
          setError('Unable to load your profile. Please try signing out and back in.');
        } else if (!profile.company_id) {
          console.error('[Dashboard] ERROR: Profile exists but company_id is missing!', profile.email);
          setError('Your account is not associated with a company. Please contact support.');
        }
      }
      return;
    }
    
    try {
      if (signal?.aborted) return;
      
      console.log('[Dashboard] Starting data fetch for company:', profile.company_id);
      setLoading(true);
      
      const [statsData, projectsData, timeEntries, invoicesData, quotesData, allTimeEntries, companyExpenses, companyProfiles, clientsData] = await Promise.all([
        api.getDashboardStats(profile.company_id, user.id),
        api.getProjects(profile.company_id),
        api.getTimeEntries(profile.company_id, user.id),
        api.getInvoices(profile.company_id),
        api.getQuotes(profile.company_id),
        api.getTimeEntries(profile.company_id),
        companyExpensesApi.getExpenses(profile.company_id),
        api.getCompanyProfiles(profile.company_id),
        api.getClients(profile.company_id),
      ]);
      
      const activeProjects = projectsData.filter(p => p.status === 'active' || p.status === 'in_progress').length;
      const totalRevenue = invoicesData.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
      const outstandingInvoices = invoicesData.filter(i => i.status === 'sent').reduce((sum, i) => sum + Number(i.total), 0);
      const hoursThisWeek = statsData.billableHours + statsData.nonBillableHours;
      
      setStats({ ...statsData, activeProjects, totalRevenue, outstandingInvoices, hoursThisWeek });
      setProjects(projectsData);
      
      const timeActivities: ActivityItem[] = timeEntries.slice(0, 5).map((te: TimeEntry) => ({
        id: te.id,
        type: 'time' as const,
        description: `Logged ${te.hours}h on ${te.project?.name || 'No project'}`,
        date: te.date,
        meta: te.description,
      }));
      
      let notificationActivities: ActivityItem[] = [];
      try {
        const notifications = await notificationsApi.getNotifications(profile.company_id, undefined, 10);
        notificationActivities = notifications.map((n: any) => ({
          id: n.id,
          type: n.type as ActivityItem['type'],
          description: n.title?.replace(/^[^\w\s]+\s*/, '') || n.message,
          date: n.created_at,
          meta: n.message,
          icon: n.title?.match(/^[^\w\s]+/)?.[0] || undefined,
        }));
      } catch (err) {
        console.warn('Failed to load notifications for activity feed:', err);
      }
      
      const allActivities = [...timeActivities, ...notificationActivities]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, RECENT_ACTIVITIES_LIMIT);
      setActivities(allActivities);
      
      const monthlyRevenue: Record<string, number> = {};
      const now = new Date();
      for (let i = REVENUE_TREND_MONTHS - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthlyRevenue[key] = 0;
      }
      invoicesData.filter(i => i.status === 'paid').forEach(inv => {
        if (inv.created_at) {
          const d = new Date(inv.created_at);
          const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          if (monthlyRevenue[key] !== undefined) {
            monthlyRevenue[key] += Number(inv.total) || 0;
          }
        }
      });
      setRevenueData(Object.entries(monthlyRevenue).map(([month, revenue]) => ({ month, revenue })));
      
      const aging = { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 } };
      const today = new Date();
      invoicesData.filter(i => i.status === 'sent' && i.due_date).forEach(inv => {
        const due = new Date(inv.due_date!);
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(inv.total) || 0;
        if (daysOverdue <= 30) { aging['0-30'].count++; aging['0-30'].amount += amount; }
        else if (daysOverdue <= 60) { aging['31-60'].count++; aging['31-60'].amount += amount; }
        else if (daysOverdue <= 90) { aging['61-90'].count++; aging['61-90'].amount += amount; }
        else { aging['90+'].count++; aging['90+'].amount += amount; }
      });
      setAgingData(Object.entries(aging).map(([range, data]) => ({ range, ...data })));

      const totalInvoiceAmount = invoicesData.reduce((sum, i) => sum + Number(i.total || 0), 0);
      const paidInvoiceAmount = invoicesData.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total || 0), 0);
      const cashFlowPct = totalInvoiceAmount > 0 ? Math.round((paidInvoiceAmount / totalInvoiceAmount) * 100) : 0;

      const activeEmployees = companyProfiles?.length || 1;
      const expectedCapacity = activeEmployees * EXPECTED_MONTHLY_HOURS;
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
      const billableThisMonth = allTimeEntries
        .filter(e => e.billable && e.date && e.date >= monthStart)
        .reduce((sum, e) => sum + Number(e.hours || 0), 0);
      const utilizationPct = expectedCapacity > 0 ? Math.min(100, Math.round((billableThisMonth / expectedCapacity) * 100)) : 0;

      const totalQuotes = quotesData.length;
      const acceptedQuotes = quotesData.filter(q => q.status === 'accepted' || q.status === 'converted').length;
      const winRatePct = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;

      const thisMonth = new Date();
      const firstOfMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1).toISOString();
      const quotesThisMonth = quotesData.filter(q => q.created_at && q.created_at >= firstOfMonth).length;

      const monthlyOverhead = companyExpenses.reduce((sum, e) => {
        return sum + companyExpensesApi.getMonthlyAmount(e);
      }, 0);
      const annualRevenue = totalRevenue;
      const annualOverhead = monthlyOverhead * 12;
      const profitMarginPct = annualRevenue > 0 ? Math.round(((annualRevenue - annualOverhead) / annualRevenue) * 100) : 0;

      setHealthMetrics({
        cashFlow: cashFlowPct,
        utilization: utilizationPct,
        winRate: winRatePct,
        momentum: quotesThisMonth,
        profitMargin: Math.max(0, profitMarginPct),
      });
      
      setActualProfit(totalRevenue - annualOverhead);
      setTotalExpenses(annualOverhead);

      // Calculate Sales Stats
      const proposalsSent = quotesData.filter(q => q.status === 'sent').length;
      const proposalsAccepted = quotesData.filter(q => q.status === 'accepted' || q.status === 'converted').length;
      const proposalsPending = quotesData.filter(q => q.status === 'sent' || q.status === 'draft').length;
      const pipelineValue = quotesData
        .filter(q => q.status === 'sent' || q.status === 'draft')
        .reduce((sum, q) => sum + Number(q.total || 0), 0);
      
      setSalesStats({
        proposalsSent: quotesData.filter(q => ['sent', 'accepted', 'converted', 'declined'].includes(q.status || '')).length,
        proposalsAccepted,
        proposalsPending,
        pipelineValue,
        winRate: winRatePct,
      });

      // Calculate Top Clients by Revenue
      const clientRevenueMap = new Map<string, { revenue: number; invoiceCount: number }>();
      invoicesData.filter(i => i.status === 'paid' && i.client_id).forEach(inv => {
        const existing = clientRevenueMap.get(inv.client_id!) || { revenue: 0, invoiceCount: 0 };
        clientRevenueMap.set(inv.client_id!, {
          revenue: existing.revenue + Number(inv.total || 0),
          invoiceCount: existing.invoiceCount + 1,
        });
      });

      const topClientsList: TopClient[] = Array.from(clientRevenueMap.entries())
        .map(([clientId, data]) => {
          const client = clientsData.find(c => c.id === clientId);
          return {
            id: clientId,
            name: client?.display_name || client?.name || 'Unknown Client',
            totalRevenue: data.revenue,
            invoiceCount: data.invoiceCount,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 3);
      
      setTopClients(topClientsList);
      
      setError(null);
      console.log('[Dashboard] Data loaded successfully');
    } catch (err: any) {
      if (signal?.aborted) return;
      console.error('[Dashboard] Failed to load data:', {
        message: err?.message || 'Unknown error',
        code: err?.code,
        details: err?.details,
        stack: err?.stack
      });
      setError(`Failed to load dashboard data: ${err?.message || 'Unknown error'}. Please try again.`);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [profile?.company_id, user?.id]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  
  useEffect(() => {
    console.log('[Dashboard] useEffect triggered - userId:', user?.id, 'companyId:', profile?.company_id, 'authLoading:', authLoading);
    
    const abortController = new AbortController();
    loadDataRef.current(abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [profile?.company_id, user?.id, authLoading]);

  useEffect(() => {
    if (timeEntry.project_id && profile?.company_id) {
      api.getTasks(timeEntry.project_id).then(tasks => {
        const filtered = tasks.filter(t => 
          !t.collaborator_company_id || t.collaborator_company_id === profile.company_id
        );
        setProjectTasks(filtered);
      }).catch(console.error);
    } else {
      setProjectTasks([]);
    }
    setTimeEntry(prev => ({ ...prev, task_id: '' }));
  }, [timeEntry.project_id, profile?.company_id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickAddRef.current && !quickAddRef.current.contains(event.target as Node)) {
        setShowQuickAdd(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const validateTimeEntry = () => {
    const errors: Record<string, string> = {};
    const hours = parseFloat(timeEntry.hours);
    
    if (!timeEntry.hours || isNaN(hours)) {
      errors.hours = 'Hours is required';
    } else if (hours < MIN_TIME_ENTRY_HOURS) {
      errors.hours = `Minimum ${MIN_TIME_ENTRY_HOURS} hours`;
    } else if (hours > MAX_TIME_ENTRY_HOURS) {
      errors.hours = `Maximum ${MAX_TIME_ENTRY_HOURS} hours per entry`;
    } else if (hours % 0.25 !== 0) {
      errors.hours = 'Hours must be in 0.25 increments';
    }
    
    if (!timeEntry.date) {
      errors.date = 'Date is required';
    } else {
      const entryDate = new Date(timeEntry.date);
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      
      if (entryDate > today) {
        errors.date = 'Date cannot be in the future';
      } else if (entryDate < oneYearAgo) {
        errors.date = 'Date cannot be more than 1 year ago';
      }
    }
    
    if (timeEntry.description && timeEntry.description.length > 500) {
      errors.description = 'Description must be less than 500 characters';
    }
    
    setTimeErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveTime = async () => {
    if (!profile?.company_id || !user?.id) return;
    if (!validateTimeEntry()) return;
    
    setSaving(true);
    try {
      await api.createTimeEntry({
        company_id: profile.company_id,
        user_id: user.id,
        project_id: timeEntry.project_id || undefined,
        task_id: timeEntry.task_id || undefined,
        hours: parseFloat(timeEntry.hours),
        description: timeEntry.description,
        date: timeEntry.date,
        billable: true,
        hourly_rate: profile.hourly_rate || DEFAULT_HOURLY_RATE,
      });
      showToast('Time entry saved successfully', 'success');
      setShowTimeModal(false);
      setTimeEntry({ project_id: '', task_id: '', hours: '', description: '', date: new Date().toISOString().split('T')[0] });
      setTimeErrors({});
      loadData();
    } catch (err) {
      console.error('Failed to save time entry:', err);
      showToast('Failed to save time entry. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <InlineError 
          message={error} 
          onDismiss={() => setError(null)} 
        />
      </div>
    );
  }

  // Calculate profit status
  const profitPct = profitTarget > 0 ? (actualProfit / profitTarget) * 100 : 0;
  const isOnTrack = profitPct >= 100;
  const isBehind = profitPct >= 50 && profitPct < 100;
  const isCritical = profitPct < 50;

  return (
    <div className="space-y-6">
      {/* Subscription Notice Banner */}
      {subscriptionNotice && (
        <div className={`flex items-center gap-3 p-4 rounded-xl ${
          subscriptionNotice.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
            : 'bg-amber-50 border border-amber-200 text-amber-800'
        }`}>
          {subscriptionNotice.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <p className="flex-1 text-sm font-medium">{subscriptionNotice.message}</p>
          <button 
            onClick={() => setSubscriptionNotice(null)}
            className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 sm:mt-1">Welcome back, {profile?.full_name || 'User'}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Tab Toggle */}
          <div className="flex bg-neutral-100 rounded-lg p-0.5 sm:p-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                activeTab === 'overview' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all flex items-center gap-1 sm:gap-1.5 ${
                activeTab === 'health' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <TreePine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Health
            </button>
          </div>
          
          {/* Quick Add */}
          <div className="relative" ref={quickAddRef}>
            <button 
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-xs sm:text-sm font-medium"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            {showQuickAdd && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl py-2 z-50 border border-neutral-100" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                <button onClick={() => { setShowTimeModal(true); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <Timer className="w-4 h-4 text-neutral-400" />
                  Log Time
                </button>
                <button onClick={() => { navigate('/projects?new=1'); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <FolderPlus className="w-4 h-4 text-neutral-400" />
                  New Project
                </button>
                <button onClick={() => { navigate('/invoicing?new=1'); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <FileText className="w-4 h-4 text-neutral-400" />
                  Create Invoice
                </button>
                <button onClick={() => { navigate('/receipts?scan=1'); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <Camera className="w-4 h-4 text-neutral-400" />
                  Scan Receipt
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'health' ? (
        <BusinessHealthTree
          metrics={healthMetrics}
          targets={healthTargets}
          onConfigureTargets={() => setShowTargetsModal(true)}
        />
      ) : (
        <>
          {/* Hero Metrics Row - 4 Uniform Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-4">
            {/* Profit/Loss Card */}
            {canViewFinancials && (
              <div 
                onClick={() => setShowProfitTargetModal(true)}
                className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5 cursor-pointer hover:shadow-md transition-all group min-w-0" 
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-center gap-2 sm:block">
                  <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl flex items-center justify-center flex-shrink-0 sm:mb-3 ${isOnTrack ? 'bg-emerald-100' : isBehind ? 'bg-amber-100' : 'bg-red-100'}`}>
                    <Target className={`w-3 h-3 sm:w-5 sm:h-5 ${isOnTrack ? 'text-emerald-600' : isBehind ? 'text-amber-600' : 'text-red-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm sm:text-2xl font-bold truncate ${actualProfit >= 0 ? 'text-neutral-900' : 'text-red-600'}`}>
                      {formatCurrency(actualProfit)}
                    </p>
                    <p className="text-[9px] sm:text-sm text-neutral-500">P&L</p>
                  </div>
                </div>
              </div>
            )}

            {/* Revenue Card */}
            {canViewFinancials && (
              <div 
                onClick={() => navigate('/invoicing')}
                className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5 cursor-pointer hover:shadow-md transition-all min-w-0" 
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-center gap-2 sm:block">
                  <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 sm:mb-3">
                    <DollarSign className="w-3 h-3 sm:w-5 sm:h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-2xl font-bold text-neutral-900 truncate">{formatCurrency(stats?.totalRevenue || 0)}</p>
                    <p className="text-[9px] sm:text-sm text-neutral-500">Revenue</p>
                  </div>
                </div>
              </div>
            )}

            {/* Outstanding Card */}
            {canViewFinancials && (
              <div 
                onClick={() => navigate('/invoicing')}
                className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5 cursor-pointer hover:shadow-md transition-all min-w-0" 
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-center gap-2 sm:block">
                  <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 sm:mb-3">
                    <Wallet className="w-3 h-3 sm:w-5 sm:h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-2xl font-bold text-neutral-900 truncate">{formatCurrency(stats?.outstandingInvoices || 0)}</p>
                    <p className="text-[9px] sm:text-sm text-neutral-500">Outstanding</p>
                  </div>
                </div>
              </div>
            )}

            {/* Hours Card */}
            <div 
              onClick={() => navigate('/time-expense')}
              className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5 cursor-pointer hover:shadow-md transition-all min-w-0" 
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center gap-2 sm:block">
                <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 sm:mb-3">
                  <Clock className="w-3 h-3 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-2xl font-bold text-neutral-900">{stats?.hoursThisWeek || 0}h</p>
                  <p className="text-[9px] sm:text-sm text-neutral-500">Hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Work in Progress Section */}
          <div className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[9px] sm:text-sm font-semibold text-neutral-900 mb-1.5 sm:mb-4">Work in Progress</h2>
            <div className="flex justify-between sm:grid sm:grid-cols-4 sm:gap-4">
              <div 
                onClick={() => navigate('/projects')}
                className="flex items-center gap-1.5 sm:block sm:p-4 sm:bg-neutral-50 sm:rounded-xl cursor-pointer"
              >
                <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#476E66] flex-shrink-0 sm:mb-2" />
                <div className="sm:block">
                  <span className="text-sm sm:text-xl font-bold text-neutral-900">{stats?.activeProjects || 0}</span>
                  <span className="text-[8px] sm:text-xs text-neutral-400 ml-0.5 sm:ml-0 sm:block">proj</span>
                </div>
              </div>
              <div 
                onClick={() => navigate('/projects')}
                className="flex items-center gap-1.5 sm:block sm:p-4 sm:bg-neutral-50 sm:rounded-xl cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#476E66] flex-shrink-0 sm:mb-2" />
                <div className="sm:block">
                  <span className="text-sm sm:text-xl font-bold text-neutral-900">{stats?.pendingTasks || 0}</span>
                  <span className="text-[8px] sm:text-xs text-neutral-400 ml-0.5 sm:ml-0 sm:block">tasks</span>
                </div>
              </div>
              {canViewFinancials && (
                <div 
                  onClick={() => navigate('/time-expense')}
                  className="flex items-center gap-1.5 sm:block sm:p-4 sm:bg-neutral-50 sm:rounded-xl cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#476E66] flex-shrink-0 sm:mb-2" />
                  <div className="sm:block">
                    <span className="text-sm sm:text-xl font-bold text-neutral-900">{formatCurrency(stats?.unbilledWIP || 0)}</span>
                    <span className="text-[8px] sm:text-xs text-neutral-400 ml-0.5 sm:ml-0 sm:block hidden sm:inline">wip</span>
                  </div>
                </div>
              )}
              {canViewFinancials && (
                <div 
                  onClick={() => navigate('/invoicing')}
                  className="flex items-center gap-1.5 sm:block sm:p-4 sm:bg-neutral-50 sm:rounded-xl cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#476E66] flex-shrink-0 sm:mb-2" />
                  <div className="sm:block">
                    <span className="text-sm sm:text-xl font-bold text-neutral-900">{stats?.draftInvoices || 0}</span>
                    <span className="text-[8px] sm:text-xs text-neutral-400 ml-0.5 sm:ml-0 sm:block">drafts</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sales Pipeline & Top Clients Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 sm:gap-4">
            {/* Sales Pipeline */}
            <div 
              onClick={() => navigate('/sales')}
              className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5 cursor-pointer hover:shadow-md transition-all" 
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <h2 className="text-[9px] sm:text-sm font-semibold text-neutral-900">Sales Pipeline</h2>
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <div className="text-center sm:text-left p-2 sm:p-3 bg-purple-50 rounded-lg sm:rounded-xl">
                  <p className="text-sm sm:text-xl font-bold text-purple-700">{salesStats.proposalsSent}</p>
                  <p className="text-[8px] sm:text-xs text-purple-600">Sent</p>
                </div>
                <div className="text-center sm:text-left p-2 sm:p-3 bg-emerald-50 rounded-lg sm:rounded-xl">
                  <p className="text-sm sm:text-xl font-bold text-emerald-700">{salesStats.proposalsAccepted}</p>
                  <p className="text-[8px] sm:text-xs text-emerald-600">Won</p>
                </div>
                <div className="text-center sm:text-left p-2 sm:p-3 bg-blue-50 rounded-lg sm:rounded-xl">
                  <p className="text-sm sm:text-xl font-bold text-blue-700">{salesStats.winRate}%</p>
                  <p className="text-[8px] sm:text-xs text-blue-600">Win Rate</p>
                </div>
                <div className="text-center sm:text-left p-2 sm:p-3 bg-amber-50 rounded-lg sm:rounded-xl">
                  <p className="text-sm sm:text-xl font-bold text-amber-700 truncate">{formatCurrency(salesStats.pipelineValue)}</p>
                  <p className="text-[8px] sm:text-xs text-amber-600">Pipeline</p>
                </div>
              </div>
            </div>

            {/* Top Clients */}
            <div 
              onClick={() => navigate('/sales?tab=clients')}
              className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5 cursor-pointer hover:shadow-md transition-all" 
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <h2 className="text-[9px] sm:text-sm font-semibold text-neutral-900">Top Clients</h2>
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
              </div>
              {topClients.length === 0 ? (
                <div className="text-center py-4 sm:py-6">
                  <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-[9px] sm:text-xs text-neutral-400">No client revenue yet</p>
                </div>
              ) : (
                <div className="space-y-1.5 sm:space-y-2">
                  {topClients.map((client, index) => (
                    <div 
                      key={client.id} 
                      className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-neutral-50 rounded-lg sm:rounded-xl"
                    >
                      <div className={`w-5 h-5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] sm:text-sm font-bold ${
                        index === 0 ? 'bg-amber-100 text-amber-700' :
                        index === 1 ? 'bg-neutral-200 text-neutral-600' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] sm:text-sm font-medium text-neutral-900 truncate">{client.name}</p>
                        <p className="text-[8px] sm:text-xs text-neutral-500">{client.invoiceCount} invoice{client.invoiceCount !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-[10px] sm:text-sm font-semibold text-emerald-600 flex-shrink-0">{formatCurrency(client.totalRevenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Insights Row */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-4">
            {/* Billability */}
            <div className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
              <h2 className="text-[9px] sm:text-sm font-semibold text-neutral-900 mb-1.5 sm:mb-4">Billability</h2>
              <div className="flex items-center gap-2 sm:gap-6">
                <div className="relative w-10 h-10 sm:w-24 sm:h-24 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#F3F4F6" strokeWidth="12" />
                    <circle
                      cx="48" cy="48" r="40" fill="none" stroke="#476E66" strokeWidth="12"
                      strokeDasharray={`${(stats?.utilization || 0) * 2.51} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] sm:text-xl font-bold text-neutral-900">{stats?.utilization || 0}%</span>
                  </div>
                </div>
                <div className="flex-1 space-y-1 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] sm:text-sm text-neutral-600">Billable</span>
                    <span className="text-[8px] sm:text-sm font-semibold text-neutral-900">{stats?.billableHours || 0}h</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] sm:text-sm text-neutral-600">Non-bill</span>
                    <span className="text-[8px] sm:text-sm font-semibold text-neutral-900">{stats?.nonBillableHours || 0}h</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Aging */}
            {canViewFinancials && (
              <div className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
                <h2 className="text-[9px] sm:text-sm font-semibold text-neutral-900 mb-1.5 sm:mb-4">Aging</h2>
                <div className="space-y-1 sm:space-y-3">
                  {agingData.map((d, i) => {
                    const maxAmount = Math.max(...agingData.map(a => a.amount), 1);
                    const width = (d.amount / maxAmount) * 100;
                    const colors = ['#476E66', '#8B7355', '#6B5B4F', '#4A4A4A'];
                    return (
                      <div key={d.range} className="flex items-center gap-1.5">
                        <span className="text-[8px] sm:text-sm text-neutral-500 w-7 sm:w-auto">{d.range}d</span>
                        <div className="flex-1 h-1.5 sm:h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(width, 2)}%`, backgroundColor: colors[i] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Revenue Trend - Hidden on mobile */}
          {canViewFinancials && (
            <div className="hidden sm:block bg-white rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-neutral-400" />
                <h2 className="text-sm font-semibold text-neutral-900">Revenue Trend</h2>
              </div>
              <div className="h-48">
                {revenueData.length > 0 && revenueData.some(d => d.revenue > 0) ? (
                  <div className="flex items-end justify-between h-full gap-1 sm:gap-2">
                    {revenueData.map((d, i) => {
                      const maxRevenue = Math.max(...revenueData.map(r => r.revenue), 1);
                      const height = (d.revenue / maxRevenue) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 sm:gap-2">
                          <div className="w-full flex flex-col items-center justify-end h-24 sm:h-36">
                            {d.revenue > 0 && (
                              <span className="text-[9px] sm:text-xs font-medium text-neutral-600 mb-0.5 sm:mb-1 truncate max-w-full">
                                {formatCurrency(d.revenue)}
                              </span>
                            )}
                            <div 
                              className="w-full max-w-8 sm:max-w-12 bg-[#476E66] rounded-t-md sm:rounded-t-lg transition-all hover:bg-[#3A5B54]"
                              style={{ height: `${Math.max(height, 4)}%` }}
                            />
                          </div>
                          <span className="text-[9px] sm:text-xs text-neutral-500">{d.month}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-neutral-400 text-xs sm:text-sm">
                    No revenue data yet
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white rounded-lg sm:rounded-xl px-2.5 py-2 sm:p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[9px] sm:text-sm font-semibold text-neutral-900 mb-1.5 sm:mb-4">Recent Activity</h2>
            {activities.length === 0 ? (
              <p className="text-neutral-400 text-center py-3 sm:py-8 text-[9px] sm:text-sm">No recent activity</p>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-neutral-50 rounded-lg sm:rounded-xl hover:bg-neutral-100 transition-colors">
                    <div className={`w-6 h-6 sm:w-9 sm:h-9 rounded-md sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                      activity.type === 'time' ? 'bg-[#476E66]/10' :
                      activity.type === 'proposal_signed' ? 'bg-emerald-100' :
                      activity.type === 'proposal_viewed' ? 'bg-blue-100' :
                      activity.type === 'proposal_sent' ? 'bg-purple-100' :
                      activity.type === 'collaboration' ? 'bg-amber-100' :
                      'bg-neutral-100'
                    }`}>
                      {activity.icon ? (
                        <span className="text-xs sm:text-base">{activity.icon}</span>
                      ) : (
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-[#476E66]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] sm:text-sm font-medium text-neutral-900 line-clamp-1">{activity.description}</p>
                      {activity.meta && <p className="text-[8px] sm:text-xs text-neutral-500 truncate">{activity.meta}</p>}
                    </div>
                    <span className="text-[8px] sm:text-xs text-neutral-400 flex-shrink-0">{formatDate(activity.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Targets Config Modal */}
      {showTargetsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-neutral-900">Configure Health Targets</h3>
              <button onClick={() => setShowTargetsModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Time Period</label>
                <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
                  {(['monthly', 'quarterly', 'yearly'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => {
                        setTargetPeriod(period);
                        localStorage.setItem('billdora_target_period', period);
                      }}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        targetPeriod === period
                          ? 'bg-white text-neutral-900 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { key: 'cashFlow', label: 'Cash Flow Target', suffix: '%' },
                { key: 'utilization', label: 'Utilization Target', suffix: '%' },
                { key: 'winRate', label: 'Win Rate Target', suffix: '%' },
                { key: 'momentum', label: `${targetPeriod.charAt(0).toUpperCase() + targetPeriod.slice(1)} Quotes Target`, suffix: '' },
                { key: 'profitMargin', label: 'Profit Margin Target', suffix: '%' },
              ].map(({ key, label, suffix }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={healthTargets[key as keyof typeof healthTargets]}
                      onChange={(e) => setHealthTargets(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      className="flex-1 px-3 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm"
                    />
                    {suffix && <span className="text-neutral-500 text-sm">{suffix}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTargetsModal(false)} className="flex-1 px-4 py-2.5 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors text-sm font-medium">
                Cancel
              </button>
              <button 
                onClick={() => {
                  localStorage.setItem('billdora_health_targets', JSON.stringify(healthTargets));
                  setShowTargetsModal(false);
                }} 
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
              >
                Save Targets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profit Target Modal */}
      {showProfitTargetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Set Profit Target</h3>
              <button onClick={() => setShowProfitTargetModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <p className="text-sm text-neutral-500 mb-4">
              Set your profit goal. The card will show your progress toward this target.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-2">Time Period</label>
              <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
                {(['monthly', 'quarterly', 'yearly'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setTempTargetPeriod(period)}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      tempTargetPeriod === period
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-2">Target Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
                <input
                  type="number"
                  value={tempProfitTarget}
                  onChange={(e) => setTempProfitTarget(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  className="w-full pl-7 pr-3 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm"
                  placeholder="10000"
                />
              </div>
            </div>
            <div className="p-4 bg-neutral-50 rounded-xl mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Current Profit:</span>
                <span className={`font-semibold ${actualProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(actualProfit)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-neutral-500">Total Expenses:</span>
                <span className="font-semibold text-neutral-700">{formatCurrency(totalExpenses)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowProfitTargetModal(false)} className="flex-1 px-4 py-2.5 text-neutral-700 hover:bg-neutral-100 rounded-lg border border-neutral-200 transition-colors text-sm font-medium">
                Cancel
              </button>
              <button 
                onClick={() => {
                  setProfitTarget(tempProfitTarget);
                  setTargetPeriod(tempTargetPeriod);
                  localStorage.setItem('billdora_profit_target', String(tempProfitTarget));
                  localStorage.setItem('billdora_target_period', tempTargetPeriod);
                  setShowProfitTargetModal(false);
                }} 
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <h3 className="text-lg font-semibold text-neutral-900">Log Time</h3>
              <button onClick={() => setShowTimeModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Project</label>
                  <select 
                    value={timeEntry.project_id} 
                    onChange={(e) => setTimeEntry({ ...timeEntry, project_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm"
                  >
                    <option value="">No Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {timeEntry.project_id && projectTasks.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Task</label>
                    <select 
                      value={timeEntry.task_id} 
                      onChange={(e) => setTimeEntry({ ...timeEntry, task_id: e.target.value })}
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm"
                    >
                      <option value="">No Task</option>
                      {projectTasks.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Hours *</label>
                    <input 
                      type="number" 
                      step="0.25"
                      value={timeEntry.hours} 
                      onChange={(e) => { setTimeEntry({ ...timeEntry, hours: e.target.value }); setTimeErrors(prev => ({ ...prev, hours: '' })); }}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm ${timeErrors.hours ? 'border-red-300' : 'border-neutral-200'}`}
                      placeholder="1.5"
                    />
                    {timeErrors.hours && <p className="mt-1 text-xs text-red-600">{timeErrors.hours}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Date *</label>
                    <input 
                      type="date" 
                      value={timeEntry.date} 
                      onChange={(e) => { setTimeEntry({ ...timeEntry, date: e.target.value }); setTimeErrors(prev => ({ ...prev, date: '' })); }}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm ${timeErrors.date ? 'border-red-300' : 'border-neutral-200'}`}
                    />
                    {timeErrors.date && <p className="mt-1 text-xs text-red-600">{timeErrors.date}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Description {timeEntry.description && <span className="text-neutral-400 font-normal">({timeEntry.description.length}/500)</span>}
                  </label>
                  <textarea 
                    value={timeEntry.description} 
                    onChange={(e) => { 
                      setTimeEntry({ ...timeEntry, description: e.target.value }); 
                      setTimeErrors(prev => ({ ...prev, description: '' })); 
                    }}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm ${timeErrors.description ? 'border-red-300' : 'border-neutral-200'}`}
                    rows={3}
                    placeholder="What did you work on?"
                    maxLength={500}
                  />
                  {timeErrors.description && <p className="mt-1 text-xs text-red-600">{timeErrors.description}</p>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              <button 
                onClick={() => setShowTimeModal(false)} 
                className="flex-1 px-4 py-2.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors font-medium text-neutral-700"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTime} 
                disabled={saving || !timeEntry.hours}
                className="flex-1 px-4 py-2.5 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
