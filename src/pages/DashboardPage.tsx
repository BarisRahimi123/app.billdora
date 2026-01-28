import { useEffect, useState, useRef, useCallback } from 'react';
import { Clock, CheckSquare, DollarSign, TrendingUp, Plus, FileText, FolderPlus, Timer, ChevronDown, X, CheckCircle, XCircle, BarChart3, TreePine, Camera, Target, Settings2 } from 'lucide-react';
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

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { canViewFinancials } = usePermissions();
  const { refreshSubscription } = useSubscription();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
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
      // Clear the URL param
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

  // Load dashboard data function - used by both initial load and refresh
  const loadData = useCallback(async (signal?: AbortSignal) => {
    // Debug: Log what's happening (stringify to see values in console)
    console.log('[Dashboard] loadData called - userId:', user?.id, 'companyId:', profile?.company_id, 'authLoading:', authLoading);
    
    if (!profile?.company_id || !user?.id) {
      console.log('[Dashboard] Early return - userId:', user?.id, 'profile:', profile ? JSON.stringify({ id: profile.id, email: profile.email, company_id: profile.company_id }) : 'null');
      setLoading(false);
      // If auth is ready but profile or company_id is missing, show an error
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
      // Check if request was cancelled
      if (signal?.aborted) return;
      
      console.log('[Dashboard] Starting data fetch for company:', profile.company_id);
      setLoading(true);
      
      const [statsData, projectsData, timeEntries, invoicesData, quotesData, allTimeEntries, companyExpenses, companyProfiles] = await Promise.all([
        api.getDashboardStats(profile.company_id, user.id),
        api.getProjects(profile.company_id),
        api.getTimeEntries(profile.company_id, user.id),
        api.getInvoices(profile.company_id),
        api.getQuotes(profile.company_id),
        api.getTimeEntries(profile.company_id), // All company time entries for utilization
        companyExpensesApi.getExpenses(profile.company_id),
        api.getCompanyProfiles(profile.company_id), // Get employee count for capacity
      ]);
      
      // Calculate additional stats
      const activeProjects = projectsData.filter(p => p.status === 'active' || p.status === 'in_progress').length;
      const totalRevenue = invoicesData.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
      const outstandingInvoices = invoicesData.filter(i => i.status === 'sent').reduce((sum, i) => sum + Number(i.total), 0);
      const hoursThisWeek = statsData.billableHours + statsData.nonBillableHours;
      
      setStats({ ...statsData, activeProjects, totalRevenue, outstandingInvoices, hoursThisWeek });
      setProjects(projectsData);
      
      // Build recent activities from time entries AND notifications
      const timeActivities: ActivityItem[] = timeEntries.slice(0, 5).map((te: TimeEntry) => ({
        id: te.id,
        type: 'time' as const,
        description: `Logged ${te.hours}h on ${te.project?.name || 'No project'}`,
        date: te.date,
        meta: te.description,
      }));
      
      // Fetch notifications for activity feed
      let notificationActivities: ActivityItem[] = [];
      try {
        const notifications = await notificationsApi.getNotifications(profile.company_id, undefined, 10);
        notificationActivities = notifications.map((n: any) => ({
          id: n.id,
          type: n.type as ActivityItem['type'],
          description: n.title?.replace(/^[^\w\s]+\s*/, '') || n.message, // Remove emoji prefix
          date: n.created_at,
          meta: n.message,
          icon: n.title?.match(/^[^\w\s]+/)?.[0] || undefined, // Extract emoji
        }));
      } catch (err) {
        console.warn('Failed to load notifications for activity feed:', err);
      }
      
      // Combine and sort by date, take top N
      const allActivities = [...timeActivities, ...notificationActivities]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, RECENT_ACTIVITIES_LIMIT);
      setActivities(allActivities);
      
      // Calculate revenue trends (last 6 months)
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
      
      // Calculate aging report
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

      // Calculate Business Health Metrics
      // 1. Cash Flow: paid invoices / total invoices
      const totalInvoiceAmount = invoicesData.reduce((sum, i) => sum + Number(i.total || 0), 0);
      const paidInvoiceAmount = invoicesData.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total || 0), 0);
      const cashFlowPct = totalInvoiceAmount > 0 ? Math.round((paidInvoiceAmount / totalInvoiceAmount) * 100) : 0;

      // 2. Utilization: billable hours this month / expected capacity (employees × 160 hrs/month)
      const activeEmployees = companyProfiles?.length || 1;
      const expectedCapacity = activeEmployees * EXPECTED_MONTHLY_HOURS;
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
      const billableThisMonth = allTimeEntries
        .filter(e => e.billable && e.date && e.date >= monthStart)
        .reduce((sum, e) => sum + Number(e.hours || 0), 0);
      const utilizationPct = expectedCapacity > 0 ? Math.min(100, Math.round((billableThisMonth / expectedCapacity) * 100)) : 0;

      // 3. Win Rate: accepted quotes / total quotes
      const totalQuotes = quotesData.length;
      const acceptedQuotes = quotesData.filter(q => q.status === 'accepted' || q.status === 'converted').length;
      const winRatePct = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;

      // 4. Momentum: quotes created this month
      const thisMonth = new Date();
      const firstOfMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1).toISOString();
      const quotesThisMonth = quotesData.filter(q => q.created_at && q.created_at >= firstOfMonth).length;

      // 5. Profit Margin: (revenue - expenses) / revenue
      const monthlyOverhead = companyExpenses.reduce((sum, e) => {
        return sum + companyExpensesApi.getMonthlyAmount(e);
      }, 0);
      const annualRevenue = totalRevenue; // Using all-time for now
      const annualOverhead = monthlyOverhead * 12;
      const profitMarginPct = annualRevenue > 0 ? Math.round(((annualRevenue - annualOverhead) / annualRevenue) * 100) : 0;

      setHealthMetrics({
        cashFlow: cashFlowPct,
        utilization: utilizationPct,
        winRate: winRatePct,
        momentum: quotesThisMonth,
        profitMargin: Math.max(0, profitMarginPct), // Don't show negative
      });
      
      // Set actual P&L values for the P&L card
      setActualProfit(totalRevenue - annualOverhead);
      setTotalExpenses(annualOverhead);
      
      // Clear any previous errors on successful load
      setError(null);
      console.log('[Dashboard] Data loaded successfully');
    } catch (err: any) {
      // Don't show error if request was cancelled
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

  // Initial data load and reload on navigation with cancellation support
  // FIX: Use refs to avoid re-running effect when loadData reference changes
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  
  useEffect(() => {
    console.log('[Dashboard] useEffect triggered - userId:', user?.id, 'companyId:', profile?.company_id, 'authLoading:', authLoading);
    
    const abortController = new AbortController();
    
    // Use ref to call the latest loadData without re-running effect
    loadDataRef.current(abortController.signal);
    
    // Only abort on TRUE unmount, not on every loadData change
    return () => {
      abortController.abort();
    };
  }, [profile?.company_id, user?.id, authLoading]); // Re-run when auth state changes

  // Load tasks when project changes in time entry modal
  useEffect(() => {
    if (timeEntry.project_id && profile?.company_id) {
      api.getTasks(timeEntry.project_id).then(tasks => {
        // Filter tasks: show only tasks user should work on
        const filtered = tasks.filter(t => 
          !t.collaborator_company_id || // Main company's own tasks
          t.collaborator_company_id === profile.company_id // Collaborator's assigned tasks
        );
        setProjectTasks(filtered);
      }).catch(console.error);
    } else {
      setProjectTasks([]);
    }
    setTimeEntry(prev => ({ ...prev, task_id: '' })); // Reset task when project changes
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
    
    // Validate hours
    if (!timeEntry.hours || isNaN(hours)) {
      errors.hours = 'Hours is required';
    } else if (hours < MIN_TIME_ENTRY_HOURS) {
      errors.hours = `Minimum ${MIN_TIME_ENTRY_HOURS} hours`;
    } else if (hours > MAX_TIME_ENTRY_HOURS) {
      errors.hours = `Maximum ${MAX_TIME_ENTRY_HOURS} hours per entry`;
    } else if (hours % 0.25 !== 0) {
      errors.hours = 'Hours must be in 0.25 increments';
    }
    
    // Validate date
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
    
    // Validate description length
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
      // Refresh data without full page reload
      loadData();
    } catch (err) {
      console.error('Failed to save time entry:', err);
      showToast('Failed to save time entry. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Only block for auth loading, NOT data loading (prevents iOS resume spinner)
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

  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Subscription Notice Banner */}
      {subscriptionNotice && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border ${
          subscriptionNotice.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {subscriptionNotice.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <p className="flex-1 text-sm font-medium">{subscriptionNotice.message}</p>
          <button 
            onClick={() => setSubscriptionNotice(null)}
            className="p-1 hover:bg-black/5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900">Dashboard</h1>
            <div className="flex bg-neutral-100 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'overview' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('health')}
                className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                  activeTab === 'health' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <TreePine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Business Health</span>
                <span className="sm:hidden">Health</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">Welcome back, {profile?.full_name || 'User'}</p>
        </div>
        <div className="relative inline-block" ref={quickAddRef}>
          <button 
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Quick Add</span>
            <span className="sm:hidden">Add</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showQuickAdd && (
            <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-48 bg-white rounded-xl py-2 z-50" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
              <button onClick={() => { setShowTimeModal(true); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                <Timer className="w-4 h-4" />
                Log Time
              </button>
              <button onClick={() => { navigate('/projects?new=1'); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                <FolderPlus className="w-4 h-4" />
                New Project
              </button>
              <button onClick={() => { navigate('/invoicing?new=1'); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                <FileText className="w-4 h-4" />
                Create Invoice
              </button>
              <button onClick={() => { navigate('/receipts?scan=1'); setShowQuickAdd(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                <Camera className="w-4 h-4" />
                Scan Receipt
              </button>
            </div>
          )}
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
      {/* P&L Target Card */}
      {canViewFinancials && (() => {
        const profitPct = profitTarget > 0 ? (actualProfit / profitTarget) * 100 : 0;
        const isOnTrack = profitPct >= 100;
        const isBehind = profitPct >= 50 && profitPct < 100;
        const isCritical = profitPct < 50;
        
        return (
          <div 
            className={`bg-white rounded-xl p-3 mb-2 ${isCritical ? 'animate-pulse ring-2 ring-red-400' : isBehind ? 'animate-pulse ring-2 ring-amber-400' : ''}`}
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOnTrack ? 'bg-green-100' : isBehind ? 'bg-amber-100' : 'bg-red-100'}`}>
                  <Target className={`w-4 h-4 ${isOnTrack ? 'text-green-600' : isBehind ? 'text-amber-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <span className="text-sm font-medium text-neutral-700">Profit & Loss</span>
                  <p className="text-[10px] text-neutral-400">vs Target</p>
                </div>
              </div>
              <button 
                onClick={() => { setTempProfitTarget(profitTarget); setTempTargetPeriod(targetPeriod); setShowProfitTargetModal(true); }}
                className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <Settings2 className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className={`text-xl font-bold ${isOnTrack ? 'text-green-600' : isBehind ? 'text-amber-600' : 'text-red-600'}`}>
                  {formatCurrency(actualProfit)}
                </p>
                <p className="text-[10px] text-neutral-400">Actual Profit</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-neutral-600">{formatCurrency(profitTarget)}</p>
                <p className="text-[10px] text-neutral-400 capitalize">{targetPeriod} Target</p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-1">
              <div 
                className={`h-full rounded-full transition-all ${isOnTrack ? 'bg-green-500' : isBehind ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, profitPct))}%` }}
              />
            </div>
            
            <div className="flex items-center justify-between text-[10px]">
              <span className={`font-medium ${isOnTrack ? 'text-green-600' : isBehind ? 'text-amber-600' : 'text-red-600'}`}>
                {profitPct.toFixed(0)}% of target
              </span>
              <span className="text-neutral-400">
                {isOnTrack ? '✓ On Track' : isBehind ? '⚠ Behind Target' : '⚠ Critical'}
              </span>
            </div>
          </div>
        );
      })()}
      
      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {canViewFinancials && <div className="bg-white rounded-lg p-2 cursor-pointer hover:bg-neutral-50 transition-colors" style={{ boxShadow: 'var(--shadow-card)' }} onClick={() => navigate('/invoicing')}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
              <DollarSign className="w-3 h-3 text-[#476E66]" />
            </div>
            <span className="text-neutral-500 text-[11px]">Total Revenue</span>
          </div>
          <p className="text-base font-bold text-neutral-900">{formatCurrency(stats?.totalRevenue || 0)}</p>
          <p className="text-[10px] text-neutral-400 mt-0">All-time paid</p>
        </div>}

        {canViewFinancials && <div className="bg-white rounded-lg p-2 cursor-pointer hover:bg-neutral-50 transition-colors" style={{ boxShadow: 'var(--shadow-card)' }} onClick={() => navigate('/invoicing')}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
              <FileText className="w-3 h-3 text-[#476E66]" />
            </div>
            <span className="text-neutral-500 text-[11px]">Outstanding</span>
          </div>
          <p className="text-base font-bold text-neutral-900">{formatCurrency(stats?.outstandingInvoices || 0)}</p>
          <p className="text-[10px] text-neutral-400 mt-0">Awaiting payment</p>
        </div>}

        <div className="bg-white rounded-lg p-2 cursor-pointer hover:bg-neutral-50 transition-colors" style={{ boxShadow: 'var(--shadow-card)' }} onClick={() => navigate('/time-expense')}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
              <Clock className="w-3 h-3 text-[#476E66]" />
            </div>
            <span className="text-neutral-500 text-[11px]">Hours/Week</span>
          </div>
          <p className="text-base font-bold text-neutral-900">{stats?.hoursThisWeek || 0}h</p>
          <p className="text-[10px] text-neutral-400 mt-0">{stats?.hoursToday || 0}h today</p>
        </div>

        <div className="bg-white rounded-lg p-2 cursor-pointer hover:bg-neutral-50 transition-colors" style={{ boxShadow: 'var(--shadow-card)' }} onClick={() => navigate('/projects')}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
              <FolderPlus className="w-3 h-3 text-[#476E66]" />
            </div>
            <span className="text-neutral-500 text-[11px]">Projects</span>
          </div>
          <p className="text-base font-bold text-neutral-900">{stats?.activeProjects || 0}</p>
          <p className="text-[10px] text-neutral-400 mt-0">{stats?.pendingTasks || 0} tasks</p>
        </div>
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {canViewFinancials && <div className="bg-white rounded-lg p-2 cursor-pointer hover:bg-neutral-50 transition-colors" style={{ boxShadow: 'var(--shadow-card)' }} onClick={() => navigate('/time-expense')}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-[#476E66]" />
            </div>
            <span className="text-neutral-500 text-[11px]">Unbilled WIP</span>
          </div>
          <p className="text-base font-bold text-neutral-900">{formatCurrency(stats?.unbilledWIP || 0)}</p>
        </div>}

        <div className="bg-white rounded-lg p-2 cursor-pointer hover:bg-neutral-50 transition-colors" style={{ boxShadow: 'var(--shadow-card)' }} onClick={() => navigate('/projects')}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
              <CheckSquare className="w-3 h-3 text-[#476E66]" />
            </div>
            <span className="text-neutral-500 text-[11px]">Tasks</span>
          </div>
          <p className="text-base font-bold text-neutral-900">{stats?.pendingTasks || 0}</p>
          <p className="text-[10px] text-neutral-400 mt-0">Pending</p>
        </div>

        {/* Utilization and Drafts cards hidden per user request */}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Billability Chart */}
        <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-xs font-semibold text-neutral-900 mb-2">Billability</h3>
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="56" cy="56" r="48" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                <circle
                  cx="56" cy="56" r="48" fill="none" stroke="#111827" strokeWidth="10"
                  strokeDasharray={`${(stats?.utilization || 0) * 3.01} 301`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-neutral-900">{stats?.utilization || 0}%</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#476E66]" />
                <span className="text-neutral-600 text-xs">Billable</span>
                <span className="font-medium text-neutral-900 ml-auto text-xs">{stats?.billableHours || 0}h</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-200" />
                <span className="text-neutral-600 text-xs">Non-Billable</span>
                <span className="font-medium text-neutral-900 ml-auto text-xs">{stats?.nonBillableHours || 0}h</span>
              </div>
              <div className="pt-1.5 border-t border-neutral-100">
                <p className="text-neutral-600 font-medium text-xs">{stats?.utilization || 0}% Overall Utilization</p>
              </div>
            </div>
          </div>
        </div>

        {/* Invoicing Summary */}
        {canViewFinancials && (
          <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h3 className="text-xs font-semibold text-neutral-900 mb-2">Invoicing Summary</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-neutral-50 rounded-lg">
                <p className="text-base font-bold text-neutral-900">{formatCurrency(stats?.unbilledWIP || 0)}</p>
                <p className="text-[10px] text-neutral-500 mt-0">Unbilled WIP</p>
              </div>
              <div className="text-center p-2 bg-neutral-50 rounded-lg">
                <p className="text-base font-bold text-neutral-900">{stats?.draftInvoices || 0}</p>
                <p className="text-[10px] text-neutral-500 mt-0">Drafts</p>
              </div>
              <div className="text-center p-2 bg-neutral-50 rounded-lg">
                <p className="text-base font-bold text-neutral-900">{stats?.sentInvoices || 0}</p>
                <p className="text-[10px] text-neutral-500 mt-0">Finalized</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analytics Charts Row */}
      {canViewFinancials && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {/* Revenue Trend Chart */}
          <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-neutral-700" />
              <h3 className="text-xs font-semibold text-neutral-900">Revenue Trend (6 Months)</h3>
            </div>
            <div className="h-40">
              {revenueData.length > 0 ? (
                <div className="flex items-end justify-between h-full gap-1.5">
                  {revenueData.map((d, i) => {
                    const maxRevenue = Math.max(...revenueData.map(r => r.revenue), 1);
                    const height = (d.revenue / maxRevenue) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="w-full flex flex-col items-center justify-end h-32">
                          <span className="text-[10px] font-medium text-neutral-600 mb-0.5">
                            {formatCurrency(d.revenue)}
                          </span>
                          <div 
                            className="w-full max-w-8 bg-[#476E66] rounded-t-lg transition-all"
                            style={{ height: `${Math.max(height, 4)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-neutral-500">{d.month}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-500 text-xs">
                  No revenue data available
                </div>
              )}
            </div>
          </div>

          {/* Payment Aging Report */}
          <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-neutral-700" />
              <h3 className="text-xs font-semibold text-neutral-900">Payment Aging Report</h3>
            </div>
            <div className="space-y-3">
              {agingData.map((d, i) => {
                const maxAmount = Math.max(...agingData.map(a => a.amount), 1);
                const width = (d.amount / maxAmount) * 100;
                // Subtle brand-aligned color progression: brand color → amber → darker tones
                const colors = [
                  '#476E66',  // 0-30 days: Brand color (good)
                  '#8B7355',  // 31-60 days: Warm neutral brown
                  '#6B5B4F',  // 61-90 days: Darker brown
                  '#4A4A4A'   // 90+ days: Dark neutral (attention needed)
                ];
                return (
                  <div key={d.range} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-700 font-medium">{d.range} days</span>
                      <span className="text-neutral-900 font-semibold">{formatCurrency(d.amount)} ({d.count})</span>
                    </div>
                    <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${Math.max(width, 2)}%`,
                          backgroundColor: colors[i]
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {agingData.every(d => d.amount === 0) && (
                <div className="text-center text-neutral-500 py-3 text-xs">No outstanding invoices</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-xs font-semibold text-neutral-900 mb-2">Recent Activity</h3>
        {activities.length === 0 ? (
          <p className="text-neutral-500 text-center py-6 text-xs">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activity.type === 'time' ? 'bg-[#476E66]/20' :
                  activity.type === 'proposal_signed' ? 'bg-emerald-100' :
                  activity.type === 'proposal_viewed' ? 'bg-blue-100' :
                  activity.type === 'proposal_sent' ? 'bg-purple-100' :
                  activity.type === 'collaboration' ? 'bg-amber-100' :
                  'bg-neutral-100'
                }`}>
                  {activity.icon ? (
                    <span className="text-sm">{activity.icon}</span>
                  ) : (
                    <Clock className="w-3 h-3 text-neutral-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-900">{activity.description}</p>
                  {activity.meta && activity.type !== 'time' && <p className="text-[10px] text-neutral-500 truncate">{activity.meta}</p>}
                  {activity.meta && activity.type === 'time' && <p className="text-[10px] text-neutral-500 truncate">{activity.meta}</p>}
                </div>
                <span className="text-[10px] text-neutral-400 flex-shrink-0">{formatDate(activity.date)}</span>
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
              <button onClick={() => setShowTargetsModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Time Period Selector */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Time Period</label>
                <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
                  {(['monthly', 'quarterly', 'yearly'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => {
                        setTargetPeriod(period);
                        localStorage.setItem('billdora_target_period', period);
                      }}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={healthTargets[key as keyof typeof healthTargets]}
                      onChange={(e) => setHealthTargets(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent"
                    />
                    {suffix && <span className="text-neutral-500">{suffix}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowTargetsModal(false)} className="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg">
                Cancel
              </button>
              <button 
                onClick={() => {
                  localStorage.setItem('billdora_health_targets', JSON.stringify(healthTargets));
                  setShowTargetsModal(false);
                }} 
                className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54]"
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
          <div className="bg-white rounded-xl p-4 w-full max-w-sm shadow-xl border border-neutral-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-neutral-900">Set Profit Target</h3>
              <button onClick={() => setShowProfitTargetModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              Set your profit target and period. The card will flash yellow when below target, and red when below 50%.
            </p>
            <div className="mb-3">
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Time Period</label>
              <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
                {(['monthly', 'quarterly', 'yearly'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setTempTargetPeriod(period)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
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
            <div className="mb-3">
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                {tempTargetPeriod.charAt(0).toUpperCase() + tempTargetPeriod.slice(1)} Target Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">$</span>
                <input
                  type="number"
                  value={tempProfitTarget}
                  onChange={(e) => setTempProfitTarget(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  className="w-full pl-7 pr-3 py-2.5 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent"
                  placeholder="10000"
                />
              </div>
            </div>
            <div className="p-2.5 bg-neutral-50 rounded-lg mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Current Profit:</span>
                <span className={`font-medium ${actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(actualProfit)}
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-neutral-500">Total Expenses:</span>
                <span className="font-medium text-neutral-700">{formatCurrency(totalExpenses)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowProfitTargetModal(false)} className="flex-1 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg border border-neutral-200 transition-colors">
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
                className="flex-1 px-3 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors"
              >
                Save Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            {/* Fixed Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-neutral-100 flex-shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-neutral-900">Log Time</h3>
              <button onClick={() => setShowTimeModal(false)} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 px-4 sm:px-5 py-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Project</label>
                  <select 
                    value={timeEntry.project_id} 
                    onChange={(e) => setTimeEntry({ ...timeEntry, project_id: e.target.value })}
                    className="w-full h-11 px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm"
                  >
                    <option value="">No Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {timeEntry.project_id && projectTasks.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Task</label>
                    <select 
                      value={timeEntry.task_id} 
                      onChange={(e) => setTimeEntry({ ...timeEntry, task_id: e.target.value })}
                      className="w-full h-11 px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm"
                    >
                      <option value="">No Task</option>
                      {projectTasks.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Hours *</label>
                    <input 
                      type="number" 
                      step="0.25"
                      value={timeEntry.hours} 
                      onChange={(e) => { setTimeEntry({ ...timeEntry, hours: e.target.value }); setTimeErrors(prev => ({ ...prev, hours: '' })); }}
                      className={`w-full h-11 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm ${timeErrors.hours ? 'border-red-300' : 'border-neutral-200'}`}
                      placeholder="1.5"
                    />
                    {timeErrors.hours && <p className="mt-1 text-xs text-red-600">{timeErrors.hours}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Date *</label>
                    <input 
                      type="date" 
                      value={timeEntry.date} 
                      onChange={(e) => { setTimeEntry({ ...timeEntry, date: e.target.value }); setTimeErrors(prev => ({ ...prev, date: '' })); }}
                      className={`w-full h-11 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm ${timeErrors.date ? 'border-red-300' : 'border-neutral-200'}`}
                    />
                    {timeErrors.date && <p className="mt-1 text-xs text-red-600">{timeErrors.date}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                    Description {timeEntry.description && <span className="text-neutral-400">({timeEntry.description.length}/500)</span>}
                  </label>
                  <textarea 
                    value={timeEntry.description} 
                    onChange={(e) => { 
                      setTimeEntry({ ...timeEntry, description: e.target.value }); 
                      setTimeErrors(prev => ({ ...prev, description: '' })); 
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent text-sm ${timeErrors.description ? 'border-red-300' : 'border-neutral-200'}`}
                    rows={3}
                    placeholder="What did you work on?"
                    maxLength={500}
                  />
                  {timeErrors.description && <p className="mt-1 text-xs text-red-600">{timeErrors.description}</p>}
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-neutral-100 flex-shrink-0 bg-neutral-50">
              <button 
                onClick={() => setShowTimeModal(false)} 
                className="flex-1 sm:flex-none px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors font-medium text-neutral-700"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTime} 
                disabled={saving || !timeEntry.hours}
                className="flex-1 sm:flex-none px-4 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
