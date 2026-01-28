import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, Settings, Mail, Filter, FileText, Clock, ChevronRight, ChevronDown, FolderKanban, Receipt, Eye, Send, AlertTriangle, DollarSign, UserPlus, Rocket, TestTube, Smartphone, Sparkles, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationsApi } from '../lib/api';
import { NotificationService } from '../lib/notificationService';
import { sendLocalNotification, requestPushPermission, isPushNotificationsAvailable } from '../lib/pushNotifications';
import { useToast } from '../components/Toast';
import { getCachedData, setCachedData } from '../lib/dataCache';

interface Notification {
  id: string;
  company_id: string;
  user_id?: string;
  type: string;
  title: string;
  message?: string;
  reference_id?: string;
  reference_type?: string;
  is_read: boolean;
  created_at?: string;
}

interface NotificationSetting { inApp: boolean; email: boolean }

interface NotificationSettings {
  // Proposals
  proposal_viewed: NotificationSetting;
  proposal_signed: NotificationSetting;
  proposal_declined: NotificationSetting;
  // Invoices
  invoice_viewed: NotificationSetting;
  invoice_sent: NotificationSetting;
  invoice_paid: NotificationSetting;
  invoice_overdue: NotificationSetting;
  payment_received: NotificationSetting;
  // Projects
  project_created: NotificationSetting;
  project_completed: NotificationSetting;
  budget_warning: NotificationSetting;
  task_assigned: NotificationSetting;
  // Other
  new_client_added: NotificationSetting;
}

const defaultSettings: NotificationSettings = {
  // Proposals
  proposal_viewed: { inApp: true, email: false },
  proposal_signed: { inApp: true, email: true },
  proposal_declined: { inApp: true, email: true },
  // Invoices
  invoice_viewed: { inApp: true, email: false },
  invoice_sent: { inApp: true, email: false },
  invoice_paid: { inApp: true, email: true },
  invoice_overdue: { inApp: true, email: true },
  payment_received: { inApp: true, email: true },
  // Projects
  project_created: { inApp: true, email: false },
  project_completed: { inApp: true, email: false },
  budget_warning: { inApp: true, email: true },
  task_assigned: { inApp: true, email: false },
  // Other
  new_client_added: { inApp: true, email: false },
};

const settingsCategories = [
  {
    key: 'proposals',
    label: 'Proposals',
    icon: <FileText className="w-5 h-5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    items: [
      { key: 'proposal_viewed', label: 'Proposal Viewed', description: 'When a client views your proposal', icon: <Eye className="w-5 h-5 text-blue-500" /> },
      { key: 'proposal_signed', label: 'Proposal Signed', description: 'When a client accepts and signs a proposal', icon: <Check className="w-5 h-5 text-emerald-500" /> },
      { key: 'proposal_declined', label: 'Proposal Declined', description: 'When a client declines a proposal', icon: <FileText className="w-5 h-5 text-red-500" /> },
    ]
  },
  {
    key: 'invoices',
    label: 'Invoices',
    icon: <Receipt className="w-5 h-5" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    items: [
      { key: 'invoice_viewed', label: 'Invoice Viewed', description: 'When a client views an invoice', icon: <Eye className="w-5 h-5 text-blue-500" /> },
      { key: 'invoice_sent', label: 'Invoice Sent', description: 'When an invoice is sent to client', icon: <Send className="w-5 h-5 text-blue-500" /> },
      { key: 'invoice_paid', label: 'Invoice Paid', description: 'When an invoice is fully paid', icon: <Check className="w-5 h-5 text-emerald-500" /> },
      { key: 'invoice_overdue', label: 'Invoice Overdue', description: 'When an invoice becomes past due', icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
      { key: 'payment_received', label: 'Payment Received', description: 'When a partial or full payment is received', icon: <DollarSign className="w-5 h-5 text-emerald-500" /> },
    ]
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: <FolderKanban className="w-5 h-5" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    items: [
      { key: 'project_created', label: 'Project Created', description: 'When a proposal converts to a project', icon: <Rocket className="w-5 h-5 text-purple-500" /> },
      { key: 'project_completed', label: 'Project Completed', description: 'When a project is marked as complete', icon: <Check className="w-5 h-5 text-emerald-500" /> },
      { key: 'budget_warning', label: 'Budget Warning', description: 'When a project reaches 80% of budget', icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
      { key: 'task_assigned', label: 'Task Assigned', description: 'When a task is assigned to you', icon: <CheckCheck className="w-5 h-5 text-blue-500" /> },
    ]
  },
  {
    key: 'other',
    label: 'Other',
    icon: <Bell className="w-5 h-5" />,
    color: 'text-neutral-600',
    bgColor: 'bg-neutral-50',
    items: [
      { key: 'new_client_added', label: 'New Client Added', description: 'When a new client is added to your account', icon: <UserPlus className="w-5 h-5 text-blue-500" /> },
    ]
  },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // INSTANT LOADING: Start with false, render cached data immediately
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'proposals' | 'projects' | 'invoices' | 'collaborations' | 'settings'>('proposals');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['proposals', 'invoices', 'projects', 'other']));
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingPush, setSendingPush] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadCachedDataFirst();
    loadSettings();
  }, [profile?.company_id]);

  // Request push permission only once, in background, after page loads
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isPushNotificationsAvailable()) {
        requestPushPermission().catch(console.error);
      }
    }, 1000); // Delay permission request to not block page load
    return () => clearTimeout(timer);
  }, []);

  // CACHE-FIRST: Load cached data immediately, then refresh in background
  async function loadCachedDataFirst() {
    if (!profile?.company_id || loadingRef.current) return;
    loadingRef.current = true;
    
    try {
      // Try to load from cache first (instant)
      const { data: cached } = await getCachedData<Notification[]>('notifications');
      if (cached && cached.length > 0) {
        console.log('[NotificationsPage] Using cached data');
        setNotifications(cached);
      }
      
      // Fetch fresh data in background
      setRefreshing(true);
      const data = await notificationsApi.getNotifications(profile.company_id, undefined, 100);
      setNotifications(data);
      
      // Cache the fresh data
      await setCachedData('notifications', data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setRefreshing(false);
      loadingRef.current = false;
    }
  }

  async function loadNotifications() {
    if (!profile?.company_id) return;
    setRefreshing(true);
    try {
      const data = await notificationsApi.getNotifications(profile.company_id, undefined, 100);
      setNotifications(data);
      await setCachedData('notifications', data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
    setRefreshing(false);
  }

  function loadSettings() {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) {
      setSettings({ ...defaultSettings, ...JSON.parse(saved) });
    }
  }

  function saveSettings(newSettings: NotificationSettings) {
    setSettings(newSettings);
    localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
  }

  async function markAsRead(id: string) {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  async function markAllAsRead() {
    if (!profile?.company_id) return;
    try {
      await notificationsApi.markAllAsRead(profile.company_id);
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  function handleNotificationClick(notification: Notification) {
    markAsRead(notification.id);
    
    if (notification.reference_type === 'quote' && notification.reference_id) {
      // For signed/approved proposals, go to Sales page (read-only view makes more sense)
      // For other proposal notifications (viewed, sent), go to the editor
      if (notification.type?.includes('signed') || notification.type?.includes('approved')) {
        // Signed proposals - go to Sales page to view the approved quote
        navigate('/sales');
      } else if (notification.type?.includes('declined')) {
        // Declined proposals - go to Sales page
        navigate('/sales');
      } else {
        // Other proposal actions (viewed, sent) - can go to editor
        navigate(`/quotes/${notification.reference_id}/document`);
      }
    } else if (notification.reference_type === 'invoice' && notification.reference_id) {
      navigate(`/invoicing`);
    } else if (notification.reference_type === 'project' && notification.reference_id) {
      navigate(`/projects/${notification.reference_id}`);
    } else if (notification.reference_type === 'collaboration' && notification.reference_id) {
      // Collaboration invites - go to Sales page inbox tab
      navigate('/sales?tab=inbox');
    }
  }

  function getTimeAgo(date: string) {
    const now = new Date();
    const then = new Date(date);
    const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return then.toLocaleDateString();
  }

  function getNotificationIcon(type: string) {
    // Proposals
    if (type.includes('signed')) return <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Check className="w-5 h-5 text-emerald-600" /></div>;
    if (type.includes('declined')) return <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-red-600" /></div>;
    if (type.includes('proposal') && type.includes('viewed')) return <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><Eye className="w-5 h-5 text-blue-600" /></div>;
    if (type.includes('proposal')) return <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-blue-600" /></div>;
    
    // Invoices
    if (type.includes('paid') || type.includes('payment_received')) return <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><DollarSign className="w-5 h-5 text-emerald-600" /></div>;
    if (type.includes('overdue')) return <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>;
    if (type.includes('invoice')) return <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><Receipt className="w-5 h-5 text-purple-600" /></div>;
    
    // Projects
    if (type.includes('project_created')) return <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><Rocket className="w-5 h-5 text-purple-600" /></div>;
    if (type.includes('project_completed')) return <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><CheckCheck className="w-5 h-5 text-emerald-600" /></div>;
    if (type.includes('budget_warning')) return <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>;
    if (type.includes('task_assigned')) return <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><CheckCheck className="w-5 h-5 text-blue-600" /></div>;
    if (type.includes('project')) return <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><FolderKanban className="w-5 h-5 text-purple-600" /></div>;
    
    // Collaborations
    if (type.includes('collaboration')) return <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-teal-600" /></div>;
    
    // Other
    if (type.includes('client')) return <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><UserPlus className="w-5 h-5 text-blue-600" /></div>;
    
    // Default
    return <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0"><Bell className="w-5 h-5 text-neutral-600" /></div>;
  }

  const getCategoryNotifications = () => {
    let categoryNotifs = notifications;
    if (activeTab === 'proposals') categoryNotifs = notifications.filter(n => n.type?.includes('proposal'));
    else if (activeTab === 'projects') categoryNotifs = notifications.filter(n => n.type?.includes('project'));
    else if (activeTab === 'invoices') categoryNotifs = notifications.filter(n => n.type?.includes('invoice'));
    else if (activeTab === 'collaborations') categoryNotifs = notifications.filter(n => n.type?.includes('collaboration'));
    return filter === 'unread' ? categoryNotifs.filter(n => !n.is_read) : categoryNotifs;
  };
  const filteredNotifications = getCategoryNotifications();
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Test in-app notification function
  async function sendTestNotification() {
    if (!profile?.company_id) return;
    setSendingTest(true);
    try {
      await NotificationService.projectCreated(
        profile.company_id,
        'Sample Project',
        'John Smith'
      );
      // Reload notifications to show the new one
      await loadNotifications();
      showToast('Check your notifications below!', 'notification', '✅ Test Sent');
    } catch (error) {
      console.error('Failed to send test notification:', error);
      showToast('Could not send test notification', 'error', 'Error');
    }
    setSendingTest(false);
  }

  // Test push notification (local notification for simulator testing)
  async function sendTestPushNotification() {
    setSendingPush(true);
    try {
      await sendLocalNotification(
        '🎉 Proposal Signed!',
        'Great news! John Smith signed your proposal for "Website Redesign"',
        { type: 'proposal_signed', timestamp: Date.now() }
      );
      showToast('Lock your screen to see the push notification!', 'success', '📱 Push Sent');
    } catch (error: any) {
      console.error('Failed to send push notification:', error);
      showToast(error?.message || 'Failed to send push notification', 'error', 'Push Error');
    }
    setSendingPush(false);
  }

  // REMOVED: blocking loading spinner - now show content immediately

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Notifications</h1>
            <p className="text-neutral-500">Stay updated on proposals, invoices, and more</p>
          </div>
          {refreshing && (
            <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Test In-App Notification Button */}
          <button
            onClick={sendTestNotification}
            disabled={sendingTest}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#476E66] border border-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors disabled:opacity-50"
          >
            <TestTube className="w-3.5 h-3.5" />
            {sendingTest ? '...' : 'In-App'}
          </button>
          {/* Test Push Notification Button */}
          <button
            onClick={sendTestPushNotification}
            disabled={sendingPush}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#476E66]/90 transition-colors disabled:opacity-50"
          >
            <Smartphone className="w-3.5 h-3.5" />
            {sendingPush ? '...' : 'Push'}
          </button>
          {unreadCount > 0 && activeTab !== 'settings' && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('proposals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'proposals' ? 'bg-[#476E66] text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          Proposals
          {notifications.filter(n => n.type?.includes('proposal') && !n.is_read).length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {notifications.filter(n => n.type?.includes('proposal') && !n.is_read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'projects' ? 'bg-[#476E66] text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          Projects
          {notifications.filter(n => n.type?.includes('project') && !n.is_read).length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {notifications.filter(n => n.type?.includes('project') && !n.is_read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'invoices' ? 'bg-[#476E66] text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Invoices
          {notifications.filter(n => n.type?.includes('invoice') && !n.is_read).length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {notifications.filter(n => n.type?.includes('invoice') && !n.is_read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('collaborations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'collaborations' ? 'bg-[#476E66] text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Collaborations
          {notifications.filter(n => n.type?.includes('collaboration') && !n.is_read).length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {notifications.filter(n => n.type?.includes('collaboration') && !n.is_read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'settings' ? 'bg-[#476E66] text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>

      {activeTab !== 'settings' && (
        <>
          {/* Filter */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg w-fit">
            <Filter className="w-4 h-4 text-neutral-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}
              className="text-sm border-none bg-transparent focus:ring-0 text-neutral-700 font-medium cursor-pointer"
            >
              <option value="all">All notifications</option>
              <option value="unread">Unread only</option>
            </select>
          </div>

          {/* Notifications List */}
          <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-500">No notifications yet</p>
                <p className="text-sm text-neutral-400">You'll see updates about proposals and invoices here</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`flex items-center gap-4 p-4 cursor-pointer transition-colors hover:bg-neutral-50 ${
                      !notification.is_read ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium leading-snug ${!notification.is_read ? 'text-neutral-900' : 'text-neutral-700'}`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{notification.message}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-neutral-400 whitespace-nowrap">{getTimeAgo(notification.created_at)}</span>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-neutral-300 shrink-0 self-center" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
            <div className="p-6 border-b border-neutral-100">
              <h2 className="text-lg font-semibold text-neutral-900">Notification Preferences</h2>
              <p className="text-sm text-neutral-500 mt-1">Choose how you want to be notified for each event type</p>
            </div>
          </div>

          {settingsCategories.map((category) => (
            <div key={category.key} className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
              <button
                onClick={() => {
                  const newExpanded = new Set(expandedCategories);
                  if (newExpanded.has(category.key)) {
                    newExpanded.delete(category.key);
                  } else {
                    newExpanded.add(category.key);
                  }
                  setExpandedCategories(newExpanded);
                }}
                className="w-full flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${category.bgColor} flex items-center justify-center ${category.color}`}>
                    {category.icon}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-neutral-900">{category.label}</p>
                    <p className="text-sm text-neutral-500">{category.items.length} notification type{category.items.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {expandedCategories.has(category.key) ? (
                  <ChevronDown className="w-5 h-5 text-neutral-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-neutral-400" />
                )}
              </button>

              {expandedCategories.has(category.key) && (
                <div className="border-t border-neutral-100 divide-y divide-neutral-100">
                  {category.items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-5 pl-8">
                      <div className="flex items-center gap-4">
                        {item.icon}
                        <div>
                          <p className="font-medium text-neutral-900">{item.label}</p>
                          <p className="text-sm text-neutral-500">{item.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings[item.key as keyof NotificationSettings]?.inApp ?? true}
                            onChange={(e) => {
                              const newSettings = {
                                ...settings,
                                [item.key]: { ...settings[item.key as keyof NotificationSettings], inApp: e.target.checked }
                              };
                              saveSettings(newSettings);
                            }}
                            className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                          />
                          <Bell className="w-4 h-4 text-neutral-400" />
                          <span className="text-sm text-neutral-600">In-app</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings[item.key as keyof NotificationSettings]?.email ?? false}
                            onChange={(e) => {
                              const newSettings = {
                                ...settings,
                                [item.key]: { ...settings[item.key as keyof NotificationSettings], email: e.target.checked }
                              };
                              saveSettings(newSettings);
                            }}
                            className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                          />
                          <Mail className="w-4 h-4 text-neutral-400" />
                          <span className="text-sm text-neutral-600">Email</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
