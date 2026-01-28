import { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import UpgradeModal from './UpgradeModal';
import OnboardingModal from './OnboardingModal';
import { usePermissions } from '../contexts/PermissionsContext';
import { api, Project, Client, Invoice, Task, notificationsApi, Notification as AppNotification } from '../lib/api';
import { DEFAULT_HOURLY_RATE, MIN_TIMER_SAVE_SECONDS, NOTIFICATIONS_LIMIT, SEARCH_RESULTS_PER_TYPE, SEARCH_DEBOUNCE_MS } from '../lib/constants';
import { useDebounce } from '../hooks/useDebounce';
import { 
  LayoutDashboard, Users, FolderKanban, Clock, FileText, Calendar, BarChart3, Settings, LogOut,
  Search, Bell, ChevronDown, ChevronRight, X, Play, Pause, Square, Menu, PieChart, ArrowLeft, Wallet, FileSpreadsheet, Camera
} from 'lucide-react';

const mainNavItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/sales', icon: Users, label: 'Sales' },
  { path: '/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/time-expense', icon: Clock, label: 'Time' },
  { path: '/invoicing', icon: FileText, label: 'Invoicing' },
  { path: '/resourcing', icon: Calendar, label: 'Team' },
];

const financialsSubItems = [
  { path: '/financials', icon: BarChart3, label: 'Overview' },
  { path: '/reports', icon: PieChart, label: 'Reports' },
  { path: '/receipts', icon: Camera, label: 'Receipts' },
];

interface SearchResult {
  id: string;
  type: 'project' | 'client' | 'invoice';
  title: string;
  subtitle?: string;
  path: string;
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const { canViewFinancials, isAdmin } = usePermissions();
  const { upgradeModalState, hideUpgradeModal } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const hideSidebar = false;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Floating Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [timerTaskId, setTimerTaskId] = useState('');

  // Onboarding state - show for new users (unless they dismissed it)
  // Check both localStorage (quick) and profile.onboarding_dismissed (persistent)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Quick check from localStorage first
    if (localStorage.getItem('onboarding_never_show') === 'true') return false;
    if (localStorage.getItem('onboarding_completed') === 'true') return false;
    return true; // Will be updated when profile loads
  });
  
  // Update onboarding state when profile loads (check DB preference)
  useEffect(() => {
    if (profile?.onboarding_dismissed) {
      setShowOnboarding(false);
      localStorage.setItem('onboarding_never_show', 'true');
    }
  }, [profile?.onboarding_dismissed]);
  const [timerDescription, setTimerDescription] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [showTimerWidget, setShowTimerWidget] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  // Search cache - loaded once, searched locally
  const [searchCache, setSearchCache] = useState<{
    projects: Project[];
    clients: Client[];
    invoices: Invoice[];
  } | null>(null);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
    // Auto-expand financials if on a financials page
    if (['/financials', '/reports', '/receipts'].includes(location.pathname)) {
      setFinancialsExpanded(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (profile?.company_id) {
      api.getProjects(profile.company_id).then(setProjects).catch(console.error);
      loadNotifications();
    }
  }, [profile?.company_id]);

  async function loadNotifications() {
    if (!profile?.company_id) return;
    try {
      const [notifs, count] = await Promise.all([
        notificationsApi.getNotifications(profile.company_id, profile?.id, NOTIFICATIONS_LIMIT),
        notificationsApi.getUnreadCount(profile.company_id, profile?.id)
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  async function handleMarkAsRead(id: string) {
    try {
      await notificationsApi.markAsRead(id);
      loadNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  function handleNotificationClick(notif: AppNotification) {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    setNotificationsOpen(false);
    
    // Navigate based on reference type
    if (notif.reference_type === 'quote' && notif.reference_id) {
      if (notif.type?.includes('signed') || notif.type?.includes('approved') || notif.type?.includes('declined') || notif.type?.includes('response_submitted')) {
        navigate('/sales');
      } else {
        navigate(`/quotes/${notif.reference_id}/document`);
      }
    } else if (notif.reference_type === 'invoice' && notif.reference_id) {
      navigate('/invoicing');
    } else if (notif.reference_type === 'project' && notif.reference_id) {
      navigate(`/projects/${notif.reference_id}`);
    } else if (notif.reference_type === 'collaboration' && notif.reference_id) {
      navigate('/sales?tab=inbox');
    }
  }

  async function handleMarkAllAsRead() {
    if (!profile?.company_id) return;
    try {
      await notificationsApi.markAllAsRead(profile.company_id, profile?.id);
      loadNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  useEffect(() => {
    if (timerRunning) {
      timerInterval.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    // Cleanup function to prevent memory leaks
    return () => { 
      if (timerInterval.current) {
        clearInterval(timerInterval.current); 
        timerInterval.current = null;
      }
    };
  }, [timerRunning]);

  // Load tasks when project changes
  useEffect(() => {
    if (timerProjectId && profile?.company_id) {
      api.getTasks(timerProjectId).then(tasks => {
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
    setTimerTaskId(''); // Reset task when project changes
  }, [timerProjectId, profile?.company_id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load search cache once when search opens (not on every keystroke)
  useEffect(() => {
    const loadSearchCache = async () => {
      if (!searchOpen || searchCache || !profile?.company_id) return;
      
      try {
        const [projectsData, clientsData, invoicesData] = await Promise.all([
          api.getProjects(profile.company_id),
          api.getClients(profile.company_id),
          api.getInvoices(profile.company_id),
        ]);
        setSearchCache({ projects: projectsData, clients: clientsData, invoices: invoicesData });
      } catch (error) {
        console.error('Failed to load search data:', error);
      }
    };
    
    loadSearchCache();
  }, [searchOpen, profile?.company_id, searchCache]);

  // Invalidate cache when company changes or navigating to refresh data
  useEffect(() => {
    setSearchCache(null);
  }, [profile?.company_id, location.pathname]);

  // Search locally from cache (instant, no network requests) - using debounced query
  const filteredSearchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim() || !searchCache) return [];
    
    const query = debouncedSearchQuery.toLowerCase();
    const results: SearchResult[] = [];

    searchCache.projects.filter(p => p.name.toLowerCase().includes(query)).slice(0, SEARCH_RESULTS_PER_TYPE).forEach(p => {
      results.push({ id: p.id, type: 'project', title: p.name, subtitle: p.client?.name, path: `/projects/${p.id}` });
    });

    searchCache.clients.filter(c => c.name.toLowerCase().includes(query) || c.display_name?.toLowerCase().includes(query)).slice(0, SEARCH_RESULTS_PER_TYPE).forEach(c => {
      results.push({ id: c.id, type: 'client', title: c.name, subtitle: c.email, path: '/sales' });
    });

    searchCache.invoices.filter(i => i.invoice_number?.toLowerCase().includes(query) || i.client?.name?.toLowerCase().includes(query)).slice(0, SEARCH_RESULTS_PER_TYPE).forEach(i => {
      results.push({ id: i.id, type: 'invoice', title: i.invoice_number || 'Invoice', subtitle: i.client?.name, path: '/invoicing' });
    });

    return results;
  }, [debouncedSearchQuery, searchCache]);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTimer = () => { setTimerRunning(true); setShowTimerWidget(true); };
  const pauseTimer = () => setTimerRunning(false);
  const stopTimer = async () => {
    setTimerRunning(false);
    if (timerSeconds >= MIN_TIMER_SAVE_SECONDS && profile?.company_id) {
      const hours = Math.round((timerSeconds / 3600) * 4) / 4;
      try {
        await api.createTimeEntry({
          company_id: profile.company_id,
          user_id: profile.id,
          project_id: timerProjectId || undefined,
          task_id: timerTaskId || undefined,
          hours: Math.max(0.25, hours),
          description: timerDescription,
          date: new Date().toISOString().split('T')[0],
          billable: true,
          hourly_rate: profile.hourly_rate || DEFAULT_HOURLY_RATE,
          approval_status: 'draft',
        });
      } catch (error) {
        console.error('Failed to save timer:', error);
      }
    }
    setTimerSeconds(0);
    setTimerDescription('');
    setTimerTaskId('');
    setShowTimerWidget(false);
  };

  const saveManualEntry = async () => {
    const hours = parseFloat(manualHours);
    if (!hours || hours <= 0 || !profile?.company_id) return;
    try {
      await api.createTimeEntry({
        company_id: profile.company_id,
        user_id: profile.id,
        project_id: timerProjectId || undefined,
        task_id: timerTaskId || undefined,
        hours,
        description: timerDescription,
        date: new Date().toISOString().split('T')[0],
        billable: true,
        hourly_rate: profile.hourly_rate || DEFAULT_HOURLY_RATE,
        approval_status: 'draft',
      });
      setManualHours('');
      setTimerDescription('');
      setTimerTaskId('');
      setShowTimerWidget(false);
    } catch (error) {
      console.error('Failed to save time entry:', error);
    }
  };

  const handleSearchSelect = (result: SearchResult) => {
    navigate(result.path);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'project': return <FolderKanban className="w-4 h-4 text-neutral-500" />;
      case 'client': return <Users className="w-4 h-4 text-neutral-700" />;
      case 'invoice': return <FileText className="w-4 h-4 text-neutral-700" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-page)' }}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Hidden on Settings page */}
      {!hideSidebar && (
        <aside className={`
          ${sidebarExpanded ? 'lg:w-64' : 'lg:w-20'} 
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          lg:translate-x-0
          w-64 text-white transition-all duration-300 flex flex-col fixed h-full z-50
        ` } style={{ backgroundColor: '#476E66' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            {(sidebarExpanded || sidebarOpen) && <img src="/billdora-logo.png" alt="Billdora" className="h-8" />}
            {/* Only show toggle button on desktop (lg+) for expand/collapse, on mobile use X to close */}
            <button 
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setSidebarExpanded(!sidebarExpanded);
                } else {
                  setSidebarOpen(false);
                }
              }} 
              className="p-2 hover:bg-white/20 rounded-lg lg:block hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Mobile close button */}
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="p-2 hover:bg-white/20 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 py-4 overflow-y-auto">
            {/* Main Nav Items */}
            {mainNavItems.filter(item => {
              if (!canViewFinancials && (item.path === '/invoicing' || item.path === '/sales')) return false;
              if (!isAdmin && item.path === '/resourcing') return false;
              return true;
            }).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-colors ${
                    isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {(sidebarExpanded || sidebarOpen) && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            ))}

            {/* Financials Section (Expandable) */}
            {isAdmin && (
              <div className="mt-2">
                <button
                  onClick={() => setFinancialsExpanded(!financialsExpanded)}
                  className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-colors w-[calc(100%-1rem)] ${
                    ['/financials', '/reports', '/receipts'].includes(location.pathname)
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <BarChart3 className="w-5 h-5 flex-shrink-0" />
                  {(sidebarExpanded || sidebarOpen) && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">Financials</span>
                      {financialsExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </>
                  )}
                </button>
                {financialsExpanded && (sidebarExpanded || sidebarOpen) && (
                  <div className="ml-4 mt-1">
                    {financialsSubItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-colors ${
                            isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
                          }`
                        }
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            {isAdmin && (
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors mb-2 ${
                    isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <Settings className="w-5 h-5" />
                {(sidebarExpanded || sidebarOpen) && <span className="text-sm font-medium">Settings</span>}
              </NavLink>
            )}
            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 w-full px-4 py-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              {(sidebarExpanded || sidebarOpen) && <span className="text-sm font-medium">Sign Out</span>}
            </button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <div className={`flex-1 ${hideSidebar ? '' : (sidebarExpanded ? 'lg:ml-64' : 'lg:ml-20')} transition-all duration-300`}>
        {/* Header */}
        <header className="bg-white sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center justify-between px-3 lg:px-5 py-2 lg:py-3">
            {/* Mobile menu button - Only show when sidebar is hidden (mobile/tablet portrait) */}
            {!hideSidebar && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-neutral-100 rounded-lg lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            
            {/* Spacer when no mobile menu button */}
            {hideSidebar && <div className="w-9 lg:hidden" />}

            {/* Search */}
            <div ref={searchRef} className="relative flex-1 max-w-md mx-2 lg:mx-0 lg:flex-none lg:w-96">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 lg:py-2.5 text-left bg-neutral-100/80 hover:bg-neutral-100 rounded-xl text-neutral-500 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">Search projects, clients...</span>
                <span className="text-sm sm:hidden">Search...</span>
                <kbd className="ml-auto text-xs bg-white/80 px-2 py-0.5 rounded-md hidden lg:inline font-medium">⌘K</kbd>
              </button>

              {searchOpen && (
                <div className="absolute top-0 left-0 w-full bg-white rounded-2xl overflow-hidden z-50" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                  <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-neutral-100">
                    <Search className="w-4 h-4 text-neutral-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-sm"
                    />
                    <button onClick={() => setSearchOpen(false)} className="p-1 hover:bg-neutral-100 rounded">
                      <X className="w-4 h-4 text-neutral-400" />
                    </button>
                  </div>
                  {!searchCache && searchQuery.trim() ? (
                    <div className="p-4 text-center text-neutral-500 text-sm">Loading...</div>
                  ) : filteredSearchResults.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto py-2">
                      {filteredSearchResults.map((result) => (
                        <button
                          key={`${result.type}-${result.id}`}
                          onClick={() => handleSearchSelect(result)}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-neutral-50"
                        >
                          {getResultIcon(result.type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">{result.title}</p>
                            {result.subtitle && <p className="text-xs text-neutral-500 truncate">{result.subtitle}</p>}
                          </div>
                          <span className="text-xs text-neutral-400 capitalize">{result.type}</span>
                        </button>
                      ))}
                    </div>
                  ) : debouncedSearchQuery && searchCache && (
                    <div className="p-4 text-center text-neutral-500 text-sm">No results found</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 lg:gap-3">
              {/* Quick Timer Button - hidden on small mobile */}
              {!showTimerWidget && (
                <button
                  onClick={() => setShowTimerWidget(true)}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-[#476E66]/10 text-neutral-600 rounded-lg hover:bg-[#3A5B54]/20 transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium hidden md:inline">Timer</span>
                </button>
              )}

              {/* Mini Timer Display */}
              {timerRunning && (
                <div className="flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 bg-neutral-100 text-emerald-700 rounded-lg">
                  <div className="w-2 h-2 bg-neutral-1000 rounded-full animate-pulse" />
                  <span className="text-xs lg:text-sm font-mono font-medium">{formatTimer(timerSeconds)}</span>
                </div>
              )}

              {/* Notifications */}
              <div ref={notificationsRef} className="relative">
                <button 
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <Bell className="w-5 h-5 text-neutral-600" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl z-50 overflow-hidden" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                    <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
                      <h3 className="font-semibold text-neutral-900 text-sm">Notifications</h3>
                      {unreadCount > 0 && (
                        <button 
                          onClick={handleMarkAllAsRead}
                          className="text-xs text-[#476E66] hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-neutral-500 text-sm">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div 
                            key={notif.id}
                            onClick={() => handleNotificationClick(notif)}
                            className={`p-3 border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${!notif.is_read ? 'bg-blue-50/50' : ''}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 ${!notif.is_read ? 'bg-[#476E66]' : 'bg-transparent'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-neutral-900 truncate">{notif.title}</p>
                                <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                <p className="text-xs text-neutral-400 mt-1">
                                  {notif.created_at ? new Date(notif.created_at).toLocaleDateString() : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => { navigate('/notifications'); setNotificationsOpen(false); }}
                      className="w-full p-2 text-center text-sm text-[#476E66] hover:bg-neutral-50 border-t border-neutral-100"
                    >
                      View all notifications
                    </button>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 px-1.5 lg:px-2 py-1 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-[#476E66]/20 flex items-center justify-center text-neutral-600 font-medium text-sm">
                    {profile?.full_name?.charAt(0) || 'U'}
                  </div>
                  {profile?.full_name && <span className="text-sm font-medium text-neutral-700 hidden lg:inline">{profile.full_name}</span>}
                  <ChevronDown className="w-4 h-4 text-neutral-400 hidden lg:inline" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl py-2 z-50" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                    <button
                      onClick={() => { navigate('/settings?tab=profile'); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                    >
                      <Users className="w-4 h-4" />
                      My Profile
                    </button>
                    {isAdmin && (
                    <button
                      onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    )}
                    <div className="my-1 border-t border-neutral-100"></div>
                    <button
                      onClick={() => { signOut(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-3 lg:p-5">
          <Outlet />
        </main>

        {/* Floating Timer Widget */}
        {showTimerWidget && (
          <div className="fixed bottom-4 right-4 lg:bottom-6 lg:right-6 bg-white rounded-2xl p-5 w-[calc(100vw-2rem)] sm:w-80 z-50" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-neutral-900">Timer</h4>
              <button onClick={() => setShowTimerWidget(false)} className="p-1 hover:bg-neutral-100 rounded">
                <X className="w-4 h-4 text-neutral-400" />
              </button>
            </div>

            <div className={`text-4xl font-mono font-bold text-center mb-4 ${timerRunning ? 'text-neutral-900' : 'text-neutral-900'}`}>
              {formatTimer(timerSeconds)}
            </div>

            <select
              value={timerProjectId}
              onChange={(e) => setTimerProjectId(e.target.value)}
              disabled={timerRunning}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm mb-3"
            >
              <option value="">No Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {timerProjectId && (
              <select
                value={timerTaskId}
                onChange={(e) => setTimerTaskId(e.target.value)}
                disabled={timerRunning}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm mb-3"
              >
                <option value="">No Task</option>
                {projectTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}

            <input
              type="text"
              placeholder="What are you working on?"
              value={timerDescription}
              onChange={(e) => setTimerDescription(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm mb-3"
            />

            {/* Manual Time Entry */}
            <div className="flex items-center gap-2 mb-4">
              <label className="text-xs text-neutral-500">Or enter hours:</label>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="0.00"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                disabled={timerRunning}
                className="w-20 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm text-center"
              />
              <button
                onClick={saveManualEntry}
                disabled={!manualHours || parseFloat(manualHours) <= 0}
                className="px-3 py-1.5 bg-[#476E66] text-white text-sm rounded-lg hover:bg-[#3A5B54] disabled:opacity-50"
              >
                Save
              </button>
            </div>

            <div className="border-t border-neutral-100 pt-3">
              <p className="text-xs text-neutral-400 text-center mb-2">Or use timer:</p>
              <div className="flex items-center justify-center gap-2">
                {!timerRunning ? (
                  <button onClick={startTimer} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54]">
                    <Play className="w-4 h-4" /> Start
                  </button>
                ) : (
                  <button onClick={pauseTimer} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600">
                    <Pause className="w-4 h-4" /> Pause
                  </button>
                )}
                <button
                  onClick={stopTimer}
                  disabled={timerSeconds < MIN_TIMER_SAVE_SECONDS}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50"
                >
                  <Square className="w-4 h-4" /> Stop
                </button>
              </div>
              {timerSeconds > 0 && timerSeconds < MIN_TIMER_SAVE_SECONDS && (
                <p className="text-xs text-neutral-500 text-center mt-2">Minimum 1 minute to save</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModalState.isOpen}
        onClose={hideUpgradeModal}
        limitType={upgradeModalState.limitType}
        currentCount={upgradeModalState.currentCount}
      />

      {/* Onboarding Modal for new users */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        userName={profile?.full_name?.split(' ')[0]}
        userId={profile?.id}
        onDismissed={() => setShowOnboarding(false)}
      />
    </div>
  );
}
