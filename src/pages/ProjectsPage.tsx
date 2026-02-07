import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useFeatureGating } from '../hooks/useFeatureGating';
import { api, Project, Task, Client, TimeEntry, Invoice, Expense, ProjectTeamMember, settingsApi, FieldValue, StatusCode, CostCenter, projectCollaboratorsApi } from '../lib/api';
import { TEAM_MEMBERS_BATCH_LIMIT } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { NotificationService } from '../lib/notificationService';
import {
  Plus, Search, Filter, Download, ChevronLeft, ArrowLeft, Copy,
  FolderKanban, Clock, DollarSign, Users, FileText, CheckSquare, X, Trash2, Edit2,
  MoreVertical, ChevronDown, ChevronRight, RefreshCw, Check, ExternalLink, Info, Settings, UserPlus,
  List, LayoutGrid, Columns3, Loader2, User, Calendar, CheckCircle2, Building2, Star, Activity, Tag, Flag
} from 'lucide-react';
import { FieldError } from '../components/ErrorBoundary';
import { validateEmail } from '../lib/validation';
import { ExpenseModal } from '../components/ExpenseModal';
import { ProjectComments } from '../components/ProjectComments';
import { ProjectCollaborators } from '../components/ProjectCollaborators';
import { PendingProjectInvitations } from '../components/PendingProjectInvitations';

type TaskSubTab = 'overview' | 'editor' | 'schedule' | 'allocations' | 'checklist';

type DetailTab = 'vitals' | 'client' | 'tasks' | 'team' | 'financials' | 'billing' | 'details';

const PROJECT_CATEGORIES = [
  { value: 'A', label: 'Architectural', color: 'bg-neutral-400' },
  { value: 'C', label: 'Civil', color: 'bg-neutral-400' },
  { value: 'M', label: 'Mechanical', color: 'bg-neutral-400' },
  { value: 'E', label: 'Electrical', color: 'bg-neutral-400' },
  { value: 'P', label: 'Plumbing', color: 'bg-neutral-400' },
  { value: 'S', label: 'Structural', color: 'bg-neutral-400' },
  { value: 'I', label: 'Interior', color: 'bg-neutral-400' },
  { value: 'L', label: 'Landscape', color: 'bg-neutral-400' },
  { value: 'O', label: 'Other', color: 'bg-neutral-400' },
];

const DEFAULT_COLUMNS = ['project', 'client', 'budget', 'status', 'invoiced', 'collected', 'billing_status'];
const ALL_COLUMNS = [
  { key: 'project', label: 'Project', group: 'Basic' },
  { key: 'client', label: 'Client', group: 'Basic' },
  { key: 'team', label: 'Team', group: 'Basic' },
  { key: 'budget', label: 'Budget', group: 'Financial' },
  { key: 'status', label: 'Status', group: 'Basic' },
  { key: 'category', label: 'Category', group: 'Basic' },
  { key: 'start_date', label: 'Start Date', group: 'Dates' },
  { key: 'end_date', label: 'End Date', group: 'Dates' },
  // Billing columns
  { key: 'invoiced', label: 'Invoiced', group: 'Billing' },
  { key: 'collected', label: 'Collected', group: 'Billing' },
  { key: 'remaining', label: 'Remaining', group: 'Billing' },
  { key: 'billing_status', label: 'Billing Status', group: 'Billing' },
  { key: 'draft_invoices', label: 'Draft Invoices', group: 'Billing' },
  { key: 'open_invoices', label: 'Open Invoices', group: 'Billing' },
];

function getCategoryInfo(category?: string) {
  return PROJECT_CATEGORIES.find(c => c.value === category) || PROJECT_CATEGORIES.find(c => c.value === 'O')!;
}

export default function ProjectsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { profile, user, loading: authLoading } = useAuth();
  const { canCreate, canEdit, canDelete, canViewFinancials, isAdmin } = usePermissions();
  const { checkAndProceed } = useFeatureGating();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [projectSource, setProjectSource] = useState<'my' | 'shared'>('my');
  const [clients, setClients] = useState<Client[]>([]);
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('vitals');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<{ id: string; full_name?: string; avatar_url?: string; email?: string; role?: string }[]>([]);
  const [showAddTeamMemberModal, setShowAddTeamMemberModal] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [projectTeamsMap, setProjectTeamsMap] = useState<Record<string, { id: string; full_name?: string; avatar_url?: string }[]>>({});
  const [viewingBillingInvoice, setViewingBillingInvoice] = useState<Invoice | null>(null);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [invoiceProjectIds, setInvoiceProjectIds] = useState<Record<string, string[]>>({});
  const [viewMode, setViewMode] = useState<'list' | 'client'>('list');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('projectsVisibleColumns');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [showProjectActionsMenu, setShowProjectActionsMenu] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('projectsExpandedClients');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [billingFilter, setBillingFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

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

  // Set project priority
  const setProjectPriority = async (projectId: string, newPriority: number | null) => {
    if (!profile?.company_id) return;

    const myProject = projects.find(p => p.id === projectId);
    const sharedProject = sharedProjects.find(p => p.id === projectId);
    const project = myProject || sharedProject;

    if (!project) return;

    const currentPriority = project.priority;

    // Optimistic update
    if (myProject) {
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, priority: newPriority } : p
      ));
    }
    if (sharedProject) {
      setSharedProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, priority: newPriority } : p
      ));
    }
    setOpenPriorityDropdown(null);

    try {
      await supabase
        .from('projects')
        .update({ priority: newPriority })
        .eq('id', projectId);
    } catch (err: any) {
      console.error('Failed to set project priority:', err);
      // Revert on failure
      if (myProject) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, priority: currentPriority } : p
        ));
      }
      if (sharedProject) {
        setSharedProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, priority: currentPriority } : p
        ));
      }
    }
  };

  // Priority dropdown component
  const PriorityDropdown = ({
    id,
    currentPriority,
    onSelect,
    type
  }: {
    id: string;
    currentPriority: number | null | undefined;
    onSelect: (priority: number | null) => void;
    type: 'project' | 'client';
  }) => {
    const dropdownId = `${type}-${id}`;
    const isOpen = openPriorityDropdown === dropdownId;

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenPriorityDropdown(isOpen ? null : dropdownId);
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
                onClick={() => onSelect(num)}
                className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-neutral-50 flex items-center gap-2 ${currentPriority === num ? 'bg-neutral-50 font-medium' : ''
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
                  onClick={() => onSelect(null)}
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

  const toggleClientExpanded = (clientName: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientName)) newExpanded.delete(clientName);
    else newExpanded.add(clientName);
    setExpandedClients(newExpanded);
    localStorage.setItem('projectsExpandedClients', JSON.stringify([...newExpanded]));
  };

  useEffect(() => {
    loadData();
  }, [profile?.company_id]);

  useEffect(() => {
    if (projectId) {
      // Look in both own projects and shared projects
      const myProject = projects.find(p => p.id === projectId);
      const sharedProject = sharedProjects.find(p => p.id === projectId);
      const project = myProject || sharedProject;
      
      if (project) {
        setSelectedProject(project);
        loadProjectDetails(projectId);
        // Auto-switch to shared view if needed
        if (!myProject && sharedProject) {
          setProjectSource('shared');
        }
      }
    } else {
      setSelectedProject(null);
    }
  }, [projectId, projects, sharedProjects]);

  async function loadData() {
    if (!profile?.company_id) {
      setLoading(false);
      setProjects([]);
      setClients([]);
      return;
    }

    const companyId = profile.company_id;
    setLoading(true);
    console.log('[ProjectsPage] Loading data...');
    const startTime = Date.now();

    try {
      // Load projects, clients, and invoices in PARALLEL
      const [projectsData, clientsData, invoicesData] = await Promise.all([
        api.getProjects(companyId).catch(err => { console.error('Failed to load projects:', err); return []; }),
        api.getClients(companyId).catch(err => { console.error('Failed to load clients:', err); return []; }),
        api.getInvoices(companyId).catch(err => { console.error('Failed to load invoices:', err); return []; }),
      ]);

      console.log('[ProjectsPage] Initial data loaded in', Date.now() - startTime, 'ms');

      setProjects(projectsData || []);
      setClients(clientsData || []);
      setAllInvoices(invoicesData || []);

      // Load shared projects (projects shared with me)
      if (user?.email) {
        try {
          const sharedCollabs = await projectCollaboratorsApi.getSharedProjects(user.email, user.id);
          const sharedProjectList = sharedCollabs
            .map(collab => collab.project as Project)
            .filter(Boolean);
          setSharedProjects(sharedProjectList);
        } catch (err) {
          console.error('[ProjectsPage] Failed to load shared projects:', err);
        }
      }

      // Load invoice line item project associations (Manual Join for robustness)
      const invIds = (invoicesData || []).map(i => i.id);
      const invProjMap: Record<string, string[]> = {};

      if (invIds.length > 0) {
        // 1. Get line items with task_ids
        const { data: lineItems } = await supabase
          .from('invoice_line_items')
          .select('invoice_id, task_id')
          .in('invoice_id', invIds);

        if (lineItems && lineItems.length > 0) {
          const taskIds = Array.from(new Set(lineItems.map((i: any) => i.task_id).filter(Boolean)));

          if (taskIds.length > 0) {
            // 2. Get tasks with project_ids
            const { data: tasks } = await supabase
              .from('tasks')
              .select('id, project_id')
              .in('id', taskIds);

            const taskProjectMap = (tasks || []).reduce((acc: any, t: any) => {
              acc[t.id] = t.project_id;
              return acc;
            }, {} as Record<string, string>);

            lineItems.forEach((item: any) => {
              const projectId = taskProjectMap[item.task_id];
              if (projectId) {
                if (!invProjMap[item.invoice_id]) invProjMap[item.invoice_id] = [];
                if (!invProjMap[item.invoice_id].includes(projectId)) {
                  invProjMap[item.invoice_id].push(projectId);
                }
              }
            });
          }
        }
      }
      setInvoiceProjectIds(invProjMap);

      // Load team members for first batch of projects in parallel (avoids N+1 query problem)
      // Note: This is a frontend optimization. Ideally, backend should include team_members in project response
      const teamsMap: Record<string, { id: string; full_name?: string; avatar_url?: string }[]> = {};
      const projectsToLoadTeams = (projectsData || []).slice(0, TEAM_MEMBERS_BATCH_LIMIT);

      if (projectsToLoadTeams.length > 0) {
        const teamPromises = projectsToLoadTeams.map(p =>
          api.getProjectTeamMembers(p.id)
            .then(team => ({
              projectId: p.id,
              team: (team || []).map(m => ({
                id: m.staff_member_id,
                full_name: m.profile?.full_name,
                avatar_url: m.profile?.avatar_url
              }))
            }))
            .catch(err => {
              console.warn(`Failed to load team for project ${p.id}:`, err);
              return { projectId: p.id, team: [] };
            })
        );
        const teams = await Promise.all(teamPromises);
        teams.forEach(({ projectId, team }) => { teamsMap[projectId] = team; });
      }
      setProjectTeamsMap(teamsMap);

      console.log('[ProjectsPage] All data loaded in', Date.now() - startTime, 'ms');
    } catch (error) {
      console.error('[ProjectsPage] Failed to load data:', error);
      setProjects([]);
      setClients([]);
    }

    setLoading(false);
  }

  async function loadProjectDetails(id: string) {
    try {
      const tasksData = await api.getTasks(id);
      setTasks(tasksData || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setTasks([]);
    }

    try {
      const teamData = await api.getProjectTeamMembers(id);
      setTeamMembers(teamData || []);
    } catch (error) {
      console.error('Failed to load team members:', error);
      setTeamMembers([]);
    }

    if (profile?.company_id) {
      try {
        const profilesData = await api.getCompanyProfiles(profile.company_id);
        setCompanyProfiles(profilesData || []);
      } catch (error) {
        console.error('Failed to load company profiles:', error);
        setCompanyProfiles([]);
      }

      try {
        const entriesData = await api.getTimeEntries(profile.company_id);
        setTimeEntries((entriesData || []).filter(e => e.project_id === id));
      } catch (error) {
        console.error('Failed to load time entries:', error);
        setTimeEntries([]);
      }

      try {
        const invoicesData = await api.getInvoices(profile.company_id);
        setInvoices((invoicesData || []).filter(i => i.project_id === id));
      } catch (error) {
        console.error('Failed to load invoices:', error);
        setInvoices([]);
      }

      try {
        const expensesData = await api.getExpenses(profile.company_id);
        setExpenses((expensesData || []).filter(e => e.project_id === id));
      } catch (error) {
        console.error('Failed to load expenses:', error);
        setExpenses([]);
      }
    } else {
      setTimeEntries([]);
      setInvoices([]);
      setExpenses([]);
      setCompanyProfiles([]);
    }
  }

  // Compute billing stats for each project - MUST be defined before filteredProjects
  const projectBillingStats = useMemo(() => {
    const stats: Record<string, {
      invoiced: number;
      collected: number;
      remaining: number;
      billingStatus: string;
      draftCount: number;
      draftAmount: number;
      openCount: number;
    }> = {};

    projects.forEach(project => {
      const projectInvoices = allInvoices.filter(inv =>
        inv.project_id === project.id ||
        (invoiceProjectIds[inv.id] || []).includes(project.id)
      );
      const budget = project.budget || 0;
      const invoiced = projectInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      const collected = projectInvoices
        .filter(inv => (inv.status || '').toLowerCase() === 'paid')
        .reduce((sum, inv) => sum + Number(inv.amount_paid || inv.total || 0), 0);
      const draftCount = projectInvoices.filter(inv => (inv.status || '').toLowerCase() === 'draft').length;
      const draftAmount = projectInvoices
        .filter(inv => (inv.status || '').toLowerCase() === 'draft')
        .reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      const openCount = projectInvoices.filter(inv => ['sent', 'overdue'].includes((inv.status || '').toLowerCase())).length;
      const isProjectCompleted = project.status === 'completed';

      // Determine billing status
      let billingStatus = 'Not Billed';

      // Priority 1: If project is completed and has invoices that are all paid, show "Paid & Closed"
      if (isProjectCompleted && projectInvoices.length > 0 && draftCount === 0 && openCount === 0) {
        billingStatus = 'Paid & Closed';
      }
      // Priority 2: If project is completed but still has outstanding invoices
      else if (isProjectCompleted && openCount > 0) {
        billingStatus = 'Closed - Outstanding';
      }
      // Priority 3: If project is completed with no invoices (imported as completed)
      else if (isProjectCompleted && projectInvoices.length === 0 && budget > 0) {
        billingStatus = 'Paid & Closed';
      }
      // Normal billing status logic for active projects
      else if (projectInvoices.length === 0) {
        billingStatus = 'Not Billed';
      } else if (draftCount > 0 && openCount === 0 && collected === 0) {
        billingStatus = 'Draft';
      } else if (openCount > 0) {
        billingStatus = 'Open';
      } else if (collected >= invoiced && invoiced > 0) {
        billingStatus = 'Paid';
      } else if (collected > 0 && collected < invoiced) {
        billingStatus = 'Partial';
      }

      // Remaining = $0 if: project completed, OR fully collected, OR invoiced >= budget
      const isFullyCollected = collected >= budget && budget > 0;
      const isFullyInvoiced = invoiced >= budget && budget > 0;
      const remainingAmount = (isProjectCompleted || isFullyCollected || isFullyInvoiced)
        ? 0
        : Math.max(0, budget - collected);

      stats[project.id] = {
        invoiced,
        collected,
        remaining: remainingAmount,
        billingStatus,
        draftCount,
        draftAmount,
        openCount,
      };
    });

    return stats;
  }, [projects, allInvoices, invoiceProjectIds]);

  const filteredProjects = useMemo(() => {
    const baseProjects = projectSource === 'my' ? projects : sharedProjects;
    return baseProjects.filter(p => {
      // Search filter
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      // Status filter
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      // Client filter
      if (clientFilter !== 'all' && p.client_id !== clientFilter) return false;
      // Category filter
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      // Billing status filter
      if (billingFilter !== 'all') {
        const billingStatus = projectBillingStats[p.id]?.billingStatus || 'Not Billed';
        if (billingFilter === 'not_billed' && billingStatus !== 'Not Billed') return false;
        if (billingFilter === 'draft' && billingStatus !== 'Draft') return false;
        if (billingFilter === 'open' && billingStatus !== 'Open') return false;
        if (billingFilter === 'paid' && !billingStatus.includes('Paid')) return false;
        if (billingFilter === 'partial' && billingStatus !== 'Partial') return false;
        if (billingFilter === 'partial' && billingStatus !== 'Partial') return false;
      }

      // Active Only filter
      if (showActiveOnly && p.status === 'completed') return false;

      return true;
    }).sort((a, b) => {
      // Sort by priority first (1 > 2 > 3 > null)
      const aPriority = a.priority || 999;
      const bPriority = b.priority || 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Then by name
      return a.name.localeCompare(b.name);
    });
  }, [projects, sharedProjects, projectSource, searchTerm, statusFilter, clientFilter, categoryFilter, billingFilter, projectBillingStats, showActiveOnly]);

  // Count active filters
  const activeFilterCount = [statusFilter, clientFilter, billingFilter, categoryFilter].filter(f => f !== 'all').length;

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'not_started': return 'text-neutral-500';
      case 'active': return 'text-emerald-600';
      case 'on_hold': return 'text-amber-600';
      case 'completed': return 'text-neutral-400';
      default: return 'text-neutral-500';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const calculateProjectStats = () => {
    const totalHours = timeEntries.reduce((sum, e) => sum + Number(e.hours), 0);
    const billableHours = timeEntries.filter(e => e.billable).reduce((sum, e) => sum + Number(e.hours), 0);
    const paidInvoices = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
    const retainerPaid = Number(selectedProject?.retainer_amount_paid || 0);
    const billedAmount = paidInvoices + retainerPaid;
    const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total), 0);

    return { totalHours, billableHours, billedAmount, totalInvoiced };
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.deleteTask(taskId);
      if (projectId) loadProjectDetails(projectId);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  // Only block for auth loading, NOT data loading (prevents iOS resume spinner)
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile?.company_id) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500">Unable to load projects. Please log in again.</p>
      </div>
    );
  }

  // Project Detail View
  if (selectedProject) {
    const stats = calculateProjectStats();

    return (
      <div className="space-y-3 sm:space-y-4">
        {/* Header - Compact for mobile */}
        {/* Header - Compact for mobile */}
        <div className="flex items-center gap-2 sm:gap-4 border-b border-neutral-200 pb-4">
          <button onClick={() => navigate('/projects')} className="p-2 hover:bg-neutral-100 rounded-sm flex-shrink-0 text-neutral-500 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-neutral-900 uppercase tracking-wide truncate">{selectedProject.name}</h1>
              <span className={`text-[10px] font-medium uppercase tracking-wider ${getStatusColor(selectedProject.status)}`}>
                {selectedProject.status?.replace('_', ' ') || 'active'}
              </span>
            </div>
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest truncate">{selectedProject.client?.name || clients.find(c => c.id === selectedProject.client_id)?.name || 'No client'}</p>
          </div>
          {canEdit('projects') && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowProjectActionsMenu(!showProjectActionsMenu)}
                className="p-2 border border-neutral-200 rounded-sm hover:bg-neutral-50 transition-colors text-neutral-600"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {showProjectActionsMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-sm py-1 z-20 border border-neutral-200 shadow-xl">
                  <button
                    onClick={async () => {
                      const newProject = await api.createProject({
                        company_id: selectedProject.company_id,
                        client_id: selectedProject.client_id,
                        name: `${selectedProject.name} (Copy)`,
                        description: selectedProject.description,
                        budget: selectedProject.budget,
                        status: 'not_started'
                      });
                      if (newProject) {
                        const projectTasks = tasks.filter(t => t.project_id === selectedProject.id);
                        for (const task of projectTasks) {
                          await api.createTask({
                            company_id: task.company_id,
                            project_id: newProject.id,
                            name: task.name,
                            description: task.description,
                            estimated_hours: task.estimated_hours,
                            status: 'not_started'
                          });
                        }
                        navigate(`/projects/${newProject.id}`);
                        loadData();
                      }
                      setShowProjectActionsMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-neutral-700 hover:bg-neutral-50"
                  >
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </button>
                  <hr className="my-1 border-neutral-100" />
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to delete this project? This will also delete all associated tasks, time entries, and invoices. This action cannot be undone.')) return;
                      try {
                        await api.deleteProject(selectedProject.id);
                        navigate('/projects');
                        loadData();
                      } catch (error) {
                        console.error('Failed to delete project:', error);
                        alert('Failed to delete project. It may have related records.');
                      }
                      setShowProjectActionsMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-neutral-900 hover:bg-neutral-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs - Compact horizontally scrollable on mobile */}
        {/* Tabs - Compact horizontally scrollable on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 p-1 bg-neutral-100 rounded-sm w-max sm:w-fit">
            {(['vitals', 'client', 'details', 'tasks', 'financials', 'billing'] as DetailTab[]).filter(tab => {
              if (!canViewFinancials && (tab === 'financials' || tab === 'billing')) return false;
              return true;
            }).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === tab ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Stats - Only show on Vitals tab */}
        {/* Quick Stats - Only show on Vitals tab */}
        {activeTab === 'vitals' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Hours Card */}
            <div
              className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all cursor-pointer"
              style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
              onClick={() => setActiveTab('tasks')}
            >
              <div className="flex flex-col h-full justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total Hours</span>
                  <Clock className="w-3.5 h-3.5 text-neutral-300" />
                </div>
                <div>
                  <span className="text-3xl font-light tracking-tight text-neutral-900">
                    {stats.totalHours}
                  </span>
                  <div className="mt-2 text-xs text-neutral-400 font-medium">
                    Recorded Time
                  </div>
                </div>
              </div>
            </div>

            {/* Budget Card */}
            {canViewFinancials && (
              <div
                className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all cursor-pointer"
                style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
                onClick={() => setActiveTab('billing')}
              >
                <div className="flex flex-col h-full justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Budget</span>
                    <DollarSign className="w-3.5 h-3.5 text-neutral-300" />
                  </div>
                  <div>
                    <span className="text-3xl font-light tracking-tight text-neutral-900 truncate">
                      {formatCurrency(selectedProject.budget)}
                    </span>
                    <div className="mt-2 text-xs text-neutral-400 font-medium">
                      Project Allocation
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tasks Card */}
            <div
              className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all cursor-pointer"
              style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
              onClick={() => setActiveTab('tasks')}
            >
              <div className="flex flex-col h-full justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tasks</span>
                  <CheckSquare className="w-3.5 h-3.5 text-neutral-300" />
                </div>
                <div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-light tracking-tight text-neutral-900">
                      {tasks.filter(t => t.status === 'completed').length}
                    </span>
                    <span className="text-sm text-neutral-300 font-light mb-1.5">
                      / {tasks.length}
                    </span>
                  </div>

                  {tasks.length > 0 && (
                    <div className="mt-3 w-full h-0.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-900 rounded-full transition-all duration-300"
                        style={{ width: `${(tasks.filter(t => t.status === 'completed').length / tasks.length) * 100}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-2 text-xs text-neutral-400 font-medium">
                    Completion Rate
                  </div>
                </div>
              </div>
            </div>

            {/* Invoiced Card */}
            {canViewFinancials && (
              <div
                className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all cursor-pointer"
                style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
                onClick={() => setActiveTab('billing')}
              >
                <div className="flex flex-col h-full justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Invoiced</span>
                    <FileText className="w-3.5 h-3.5 text-neutral-300" />
                  </div>
                  <div>
                    <span className="text-3xl font-light tracking-tight text-neutral-900 truncate">
                      {formatCurrency(stats.totalInvoiced)}
                    </span>
                    <div className="mt-2 text-xs text-neutral-400 font-medium">
                      Total Billed
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content */}
        <div className="bg-white rounded-sm border border-neutral-200 p-4 sm:p-6 shadow-sm">
          {activeTab === 'vitals' && (
            <ProjectVitalsTab
              project={selectedProject}
              clients={clients}
              onSave={async (updates) => {
                await api.updateProject(selectedProject.id, updates);
                if (projectId) loadProjectDetails(projectId);
              }}
              canViewFinancials={canViewFinancials}
              formatCurrency={formatCurrency}
              companyId={profile?.company_id || ''}
              projectCompanyId={selectedProject.company_id}
            />
          )}

          {activeTab === 'client' && (
            <ClientTabContent
              client={clients.find(c => c.id === selectedProject.client_id) || selectedProject.client}
              onClientUpdate={async (updatedClient) => {
                await api.updateClient(updatedClient.id, updatedClient);
                loadData();
                if (projectId) loadProjectDetails(projectId);
              }}
              canViewFinancials={canViewFinancials}
              isAdmin={isAdmin}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksTabContent
              tasks={tasks}
              timeEntries={timeEntries}
              projectId={selectedProject.id}
              companyId={profile?.company_id || ''}
              onTasksChange={() => { if (projectId) loadProjectDetails(projectId); }}
              onEditTask={(task) => { setEditingTask(task); setShowTaskModal(true); }}
              onAddTask={() => { setEditingTask(null); setShowTaskModal(true); }}
              canViewFinancials={canViewFinancials}
            />
          )}

          {activeTab === 'team' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Team Members</h3>
                <button
                  onClick={() => setShowAddTeamMemberModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add Member
                </button>
              </div>
              {teamMembers.length === 0 ? (
                <div className="text-center py-16 bg-neutral-50 rounded-sm border border-neutral-100">
                  <Users className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                  <p className="text-neutral-900 font-bold mb-1">No team members assigned</p>
                  <p className="text-xs text-neutral-500 max-w-xs mx-auto">Add team members to track their contributions and assignments.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {teamMembers.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-sm hover:border-neutral-300 transition-colors">
                      <div className="flex items-center gap-4">
                        {member.profile?.avatar_url ? (
                          <img src={member.profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-neutral-100" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-500 font-bold text-xs">
                            {member.profile?.full_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-neutral-900 text-sm">{member.profile?.full_name || 'Unknown'}</p>
                          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mt-0.5">{member.role || member.profile?.role || 'Team Member'}</p>
                        </div>
                        {member.is_lead && (
                          <span className="px-2 py-0.5 bg-neutral-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-sm">Lead</span>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm('Remove this team member from the project?')) {
                            await api.removeProjectTeamMember(member.id);
                            loadProjectDetails(selectedProject!.id);
                          }
                        }}
                        className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'financials' && (
            <div className="space-y-6">
              {/* Financial Summary KPIs - Compact & Modern */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-4 bg-neutral-50 rounded-sm border border-neutral-200 cursor-pointer hover:border-neutral-300 transition-all" onClick={() => setActiveTab('billing')}>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Budget</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(selectedProject.budget)}</p>
                </div>
                <div className="p-4 bg-neutral-50 rounded-sm border border-neutral-200 cursor-pointer hover:border-neutral-300 transition-all" onClick={() => setActiveTab('tasks')}>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Labor Cost</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(stats.billableHours * 150)}</p>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide mt-1">{stats.billableHours}h @ $150/hr</p>
                </div>
                <div className="p-4 bg-neutral-50 rounded-sm border border-neutral-200 cursor-pointer hover:border-neutral-300 transition-all" onClick={() => navigate('/time-expense')}>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Expenses</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(expenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</p>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide mt-1">{expenses.length} EXPENSE{expenses.length !== 1 ? 'S' : ''}</p>
                </div>
                <div className="p-4 bg-neutral-50 rounded-sm border border-neutral-200 cursor-pointer hover:border-neutral-300 transition-all" onClick={() => setActiveTab('billing')}>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Invoiced</p>
                  <p className="text-xl font-bold text-[#476E66]">{formatCurrency(stats.totalInvoiced)}</p>
                </div>
                <div className="p-4 bg-neutral-50 rounded-sm border border-neutral-200 col-span-2 sm:col-span-1 cursor-pointer hover:border-neutral-300 transition-all" onClick={() => setActiveTab('billing')}>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Collected</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(stats.billedAmount)}</p>
                </div>
              </div>

              {/* Time Entries - Compact List */}
              <div>
                <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Time Entries</h4>
                {timeEntries.length === 0 ? (
                  <div className="text-center py-12 bg-neutral-50 rounded-sm border border-neutral-100">
                    <Clock className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
                    <p className="text-xs text-neutral-400 font-medium">No time entries recorded</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-sm border border-neutral-200 overflow-hidden">
                    <div className="divide-y divide-neutral-100">
                      {timeEntries.slice(0, 5).map(entry => (
                        <div key={entry.id} className="flex items-center justify-between p-3 hover:bg-neutral-50 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-neutral-900 truncate">{entry.description || 'Time entry'}</p>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mt-0.5">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-4">
                            <p className="text-sm font-bold text-neutral-900">{entry.hours}h</p>
                            <span className={`text-xs ${entry.billable ? 'text-[#476E66]' : 'text-neutral-400'}`}>
                              {entry.billable ? 'Billable' : 'Non-billable'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {timeEntries.length > 5 && (
                      <div className="px-3 py-2 bg-neutral-50 border-t border-neutral-100 text-center">
                        <p className="text-xs text-neutral-500">+ {timeEntries.length - 5} more entries</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Expenses - Compact List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-neutral-900">Expenses</h4>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#476E66] hover:bg-[#476E66]/10 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
                {expenses.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">No expenses for this project</p>
                ) : (
                  <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <div className="divide-y divide-neutral-50">
                      {expenses.slice(0, 5).map(expense => (
                        <div key={expense.id} className="flex items-center justify-between p-2.5 hover:bg-neutral-50/50 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-neutral-900 truncate" style={{ fontSize: '13px' }}>{expense.description || 'Expense'}</p>
                            <p className="text-xs text-neutral-400">
                              {new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {expense.category && <span className="ml-1.5">• {expense.category}</span>}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-sm font-semibold text-neutral-900">{formatCurrency(expense.amount)}</p>
                            <span className={`text-xs ${expense.billable ? 'text-[#476E66]' : 'text-neutral-400'}`}>
                              {expense.billable ? 'Billable' : 'Non-billable'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {expenses.length > 5 && (
                      <div className="px-3 py-2 bg-neutral-50 border-t border-neutral-100 text-center">
                        <p className="text-xs text-neutral-500">+ {expenses.length - 5} more expenses</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              {viewingBillingInvoice ? (
                <InlineBillingInvoiceView
                  invoice={viewingBillingInvoice}
                  project={selectedProject}
                  tasks={tasks}
                  timeEntries={timeEntries}
                  expenses={expenses}
                  companyId={profile?.company_id || ''}
                  onBack={() => setViewingBillingInvoice(null)}
                  onUpdate={() => {
                    if (projectId) loadProjectDetails(projectId);
                    setViewingBillingInvoice(null);
                  }}
                  formatCurrency={formatCurrency}
                />
              ) : (
                <>
                  {/* Billing Progress Hero Card */}
                  {(() => {
                    const projectBudget = selectedProject.budget || 0;
                    const tasksBudgetTotal = tasks.reduce((sum, t) => sum + (t.total_budget || t.estimated_fees || 0), 0);
                    const totalBudget = projectBudget > 0 ? projectBudget : tasksBudgetTotal;
                    const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
                    const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.total || 0), 0);
                    const totalPending = invoices.filter(inv => inv.status === 'sent').reduce((sum, inv) => sum + (inv.total || 0), 0);
                    const remainingToBill = Math.max(0, totalBudget - totalInvoiced);
                    const billedPercentage = totalBudget > 0 ? Math.min(100, (totalInvoiced / totalBudget) * 100) : 0;
                    const paidPercentage = totalBudget > 0 ? Math.min(100, (totalPaid / totalBudget) * 100) : 0;
                    const pendingPercentage = totalBudget > 0 ? Math.min(100, (totalPending / totalBudget) * 100) : 0;

                    return (
                      <div className="bg-white rounded-sm border border-neutral-200 p-6 shadow-sm">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-8">
                          {/* Progress Circle */}
                          <div className="flex items-center gap-6">
                            <div className="relative w-28 h-28 flex-shrink-0">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="50%" cy="50%" r="45%" fill="none" stroke="#F5F5F5" strokeWidth="6" />
                                {/* Paid segment */}
                                <circle
                                  cx="50%" cy="50%" r="45%" fill="none" stroke="#10B981" strokeWidth="6"
                                  strokeDasharray={`${paidPercentage * 2.83} 283`}
                                  strokeLinecap="round"
                                />
                                {/* Pending segment */}
                                <circle
                                  cx="50%" cy="50%" r="45%" fill="none" stroke="#476E66" strokeWidth="6"
                                  strokeDasharray={`${pendingPercentage * 2.83} 283`}
                                  strokeDashoffset={`${-paidPercentage * 2.83}`}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold text-neutral-900">{billedPercentage.toFixed(0)}%</span>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Invoiced</span>
                              </div>
                            </div>
                            <div className="lg:hidden">
                              <p className="text-xl font-bold text-neutral-900">{formatCurrency(totalInvoiced)}</p>
                              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">of {formatCurrency(totalBudget)} budget</p>
                            </div>
                          </div>

                          {/* Metrics Grid */}
                          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="bg-neutral-50 rounded-sm p-4 border border-neutral-100">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-neutral-400"></div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Budget</span>
                              </div>
                              <p className="text-lg font-bold text-neutral-900">{formatCurrency(totalBudget)}</p>
                            </div>
                            <div className="bg-neutral-50 rounded-sm p-4 border border-neutral-100">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#476E66]"></div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Invoiced</span>
                              </div>
                              <p className="text-lg font-bold text-[#476E66]">{formatCurrency(totalInvoiced)}</p>
                            </div>
                            <div className="bg-neutral-50 rounded-sm p-4 border border-neutral-100">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Collected</span>
                              </div>
                              <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
                            </div>
                            <div className="bg-neutral-50 rounded-sm p-4 border border-neutral-100">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Remaining</span>
                              </div>
                              <p className={`text-lg font-bold ${remainingToBill > 0 ? 'text-amber-600' : 'text-neutral-400'}`}>
                                {formatCurrency(remainingToBill)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Billable Tasks Section */}
                  {tasks.length > 0 && (
                    <div className="bg-white rounded-sm border border-neutral-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                        <div>
                          <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Billable Tasks</h3>
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mt-0.5">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {tasks.map(task => {
                          const taskBudget = task.total_budget || task.estimated_fees || 0;
                          const billedPct = task.billed_percentage || 0;
                          const billedAmt = task.billed_amount || (taskBudget * billedPct / 100);
                          const remainingAmt = Math.max(0, taskBudget - billedAmt);

                          return (
                            <div key={task.id} className="px-6 py-4 hover:bg-neutral-50 transition-colors">
                              <div className="flex items-start justify-between gap-6">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-neutral-900 truncate">{task.name}</p>
                                  <div className="flex items-center gap-4 mt-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                                    <span>Budget: <span className="text-neutral-900">{formatCurrency(taskBudget)}</span></span>
                                    <span>Billed: <span className="text-[#476E66]">{formatCurrency(billedAmt)}</span></span>
                                    <span className="hidden sm:inline">Remaining: <span className="text-amber-600">{formatCurrency(remainingAmt)}</span></span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${billedPct >= 100 ? 'bg-emerald-100 text-emerald-700' :
                                    billedPct > 0 ? 'bg-[#476E66]/10 text-[#476E66]' :
                                      'bg-neutral-100 text-neutral-500'
                                    }`}>
                                    {billedPct}% billed
                                  </span>
                                </div>
                              </div>
                              {/* Mini progress bar */}
                              <div className="mt-3 h-1 bg-neutral-100 rounded-sm overflow-hidden">
                                <div
                                  className="h-full bg-[#476E66] rounded-sm transition-all duration-300"
                                  style={{ width: `${Math.min(100, billedPct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Invoice History Section */}
                  <div className="bg-white rounded-sm border border-neutral-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Invoices</h3>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mt-0.5">
                          {invoices.length === 0 ? 'No invoices created' : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowInvoiceModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Create Invoice</span>
                        <span className="sm:hidden">New</span>
                      </button>
                    </div>

                    {invoices.length === 0 ? (
                      <div className="px-4 py-16 text-center">
                        <div className="w-12 h-12 bg-neutral-50 rounded-sm border border-neutral-100 flex items-center justify-center mx-auto mb-4">
                          <FileText className="w-6 h-6 text-neutral-300" />
                        </div>
                        <h4 className="text-[11px] font-bold text-neutral-900 uppercase tracking-widest mb-1">No invoices yet</h4>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide max-w-xs mx-auto mb-6">
                          Create your first invoice to start billing for this project
                        </p>
                        <button
                          onClick={() => setShowInvoiceModal(true)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create Invoice
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-100">
                        {invoices.map(invoice => (
                          <div
                            key={invoice.id}
                            className="flex items-center gap-4 px-6 py-4 hover:bg-neutral-50 transition-colors cursor-pointer group"
                            onClick={() => setViewingBillingInvoice(invoice)}
                          >
                            {/* Invoice Icon */}
                            <div className={`w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 ${invoice.status === 'paid' ? 'bg-emerald-100' :
                              invoice.status === 'sent' ? 'bg-blue-100' : 'bg-neutral-100'
                              }`}>
                              <FileText className={`w-4 h-4 ${invoice.status === 'paid' ? 'text-emerald-600' :
                                invoice.status === 'sent' ? 'text-blue-600' : 'text-neutral-500'
                                }`} />
                            </div>

                            {/* Invoice Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-neutral-900">{invoice.invoice_number}</p>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mt-0.5">
                                {new Date(invoice.created_at || '').toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>

                            {/* Amount & Status */}
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-neutral-900">{formatCurrency(invoice.total)}</p>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                invoice.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                                  'bg-neutral-100 text-neutral-600'
                                }`}>
                                {invoice.status || 'draft'}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (confirm('Delete this invoice?')) {
                                    try {
                                      await api.deleteInvoice(invoice.id);
                                      if (projectId) loadProjectDetails(projectId);
                                    } catch (err) {
                                      console.error('Failed to delete invoice:', err);
                                      alert('Failed to delete invoice');
                                    }
                                  }
                                }}
                                className="p-2 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 rounded-sm transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-900 transition-colors" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'details' && (
            <ProjectDetailsTab
              project={selectedProject}
              companyId={profile?.company_id || ''}
              onUpdate={async (updates) => {
                try {
                  await api.updateProject(selectedProject.id, updates);
                  loadData();
                  if (projectId) loadProjectDetails(projectId);
                } catch (error) {
                  console.error('Failed to update project:', error);
                }
              }}
            />
          )}
        </div>

        {/* Task Modal */}
        {showTaskModal && (
          <TaskModal
            task={editingTask}
            projectId={selectedProject.id}
            companyId={profile?.company_id || ''}
            teamMembers={companyProfiles.map(p => ({ staff_member_id: p.id, profile: p }))}
            companyProfiles={companyProfiles}
            onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
            onSave={() => { if (projectId) loadProjectDetails(projectId); setShowTaskModal(false); setEditingTask(null); }}
            onDelete={async (taskId) => { await deleteTask(taskId); setShowTaskModal(false); setEditingTask(null); }}
            canViewFinancials={canViewFinancials}
          />
        )}

        {/* Inline Invoice Modal */}
        {showInvoiceModal && selectedProject && (
          <ProjectInvoiceModal
            project={selectedProject}
            tasks={tasks}
            timeEntries={timeEntries}
            expenses={expenses}
            invoices={invoices}
            companyId={profile?.company_id || ''}
            clientId={selectedProject.client_id || ''}
            defaultHourlyRate={profile?.hourly_rate || 150}
            onClose={() => setShowInvoiceModal(false)}
            onSave={async (invoiceId) => {
              if (projectId) await loadProjectDetails(projectId);
              setShowInvoiceModal(false);
            }}
          />
        )}

        {/* Expense Modal */}
        {showExpenseModal && selectedProject && (
          <ExpenseModal
            expense={null}
            projects={projects}
            companyId={profile?.company_id || ''}
            userId={profile?.id || ''}
            defaultProjectId={selectedProject.id}
            onClose={() => setShowExpenseModal(false)}
            onSave={() => {
              if (projectId) loadProjectDetails(projectId);
              setShowExpenseModal(false);
            }}
          />
        )}

        {/* Add Team Member Modal */}
        {showAddTeamMemberModal && selectedProject && (
          <AddTeamMemberModal
            projectId={selectedProject.id}
            companyId={profile?.company_id || ''}
            existingMemberIds={teamMembers.map(m => m.staff_member_id)}
            companyProfiles={companyProfiles}
            onClose={() => setShowAddTeamMemberModal(false)}
            onSave={() => {
              loadProjectDetails(selectedProject.id);
              setShowAddTeamMemberModal(false);
            }}
          />
        )}

        {/* Project Edit Modal */}
        {showProjectModal && (
          <ProjectModal
            project={editingProject}
            clients={clients}
            companyId={profile?.company_id || ''}
            onClose={() => { setShowProjectModal(false); setEditingProject(null); }}
            onSave={() => { loadData(); setShowProjectModal(false); setEditingProject(null); }}
          />
        )}
      </div>
    );
  }

  // Projects List View
  return (
    <div className="space-y-6">
      {/* Pending Project Invitations */}
      <PendingProjectInvitations onAccept={loadData} />

      <div className="flex items-end justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-light tracking-tight text-neutral-900 leading-tight">PROJECTS</h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#476E66] mt-1">Manage deliverables</p>
        </div>
        {canCreate('projects') && (
          <button
            onClick={() => {
              checkAndProceed('projects', projects.length, () => {
                setEditingProject(null);
                setShowProjectModal(true);
              });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-md hover:bg-[#3A5B54] transition-all shadow-lg shadow-[#476E66]/20 hover:shadow-xl hover:shadow-[#476E66]/30 hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Project</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {/* View Mode Toggle - My Projects vs Shared */}
      {sharedProjects.length > 0 && (
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg w-fit">
          <button
            onClick={() => setProjectSource('my')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${projectSource === 'my'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            My Projects ({projects.length})
          </button>
          <button
            onClick={() => setProjectSource('shared')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${projectSource === 'shared'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            Shared with Me ({sharedProjects.length})
          </button>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-neutral-900 transition-colors" />
          <input
            type="text"
            placeholder="Search projects by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white rounded-sm border border-neutral-200 focus:border-neutral-900 focus:ring-0 outline-none transition-colors placeholder:text-neutral-400 font-medium"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100 rounded-sm border border-neutral-200">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-sm transition-all ${viewMode === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('client')}
              className={`p-2 rounded-sm transition-all ${viewMode === 'client' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50'}`}
              title="Client View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          {/* Filters Dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowFiltersDropdown(!showFiltersDropdown); setShowColumnsDropdown(false); setShowActionsMenu(false); }}
              className={`hidden sm:flex items-center gap-2 px-4 py-2.5 border rounded-sm transition-all group ${activeFilterCount > 0 ? 'bg-[#476E66]/10 border-[#476E66]/30 hover:bg-[#476E66]/20' : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'}`}
            >
              <Filter className={`w-4 h-4 ${activeFilterCount > 0 ? 'text-[#476E66]' : 'text-neutral-400 group-hover:text-neutral-600'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${activeFilterCount > 0 ? 'text-[#476E66]' : 'text-neutral-600 group-hover:text-neutral-900'}`}>Filters</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-[#476E66] text-white rounded-full">{activeFilterCount}</span>
              )}
            </button>
            {showFiltersDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFiltersDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-sm border border-neutral-200 z-50 py-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-neutral-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#476E66]">Filter Projects</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Narrow down your project list</p>
                  </div>
                  <div className="px-4 py-3 space-y-4">
                    {/* Client Filter - Most important, show first */}
                    <div className="relative">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Client</label>
                      <button
                        type="button"
                        onClick={() => setShowClientDropdown(!showClientDropdown)}
                        className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66] focus:ring-1 focus:ring-[#476E66] text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {clientFilter === 'all'
                            ? 'All Clients'
                            : clients.find(c => c.id === clientFilter)?.name || 'Select Client'}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                      </button>
                      {showClientDropdown && (
                        <>
                          <div className="fixed inset-0 z-50" onClick={() => setShowClientDropdown(false)} />
                          <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-sm border border-neutral-200 z-[60] shadow-lg max-h-64 overflow-y-auto">
                            <div
                              onClick={() => {
                                setClientFilter('all');
                                setShowClientDropdown(false);
                              }}
                              className={`px-3 py-2 text-[11px] cursor-pointer hover:bg-neutral-50 flex items-center gap-2 ${clientFilter === 'all' ? 'bg-[#476E66]/5 text-[#476E66] font-medium' : ''}`}
                            >
                              <span className="w-4" />
                              <span>All Clients</span>
                            </div>
                            {sortedClients.filter(c => c.priority).length > 0 && (
                              <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border-y border-amber-100">
                                Priority
                              </div>
                            )}
                            {sortedClients.map((client) => {
                              const priorityClients = sortedClients.filter(c => c.priority);
                              const isLastPriority = client.priority && priorityClients.indexOf(client) === priorityClients.length - 1;
                              return (
                                <div
                                  key={client.id}
                                  onClick={() => {
                                    setClientFilter(client.id);
                                    setShowClientDropdown(false);
                                    // Reset other filters when selecting a client
                                    setStatusFilter('all');
                                    setBillingFilter('all');
                                    setCategoryFilter('all');
                                  }}
                                  className={`px-3 py-2 text-[11px] cursor-pointer hover:bg-neutral-50 flex items-center gap-2 ${clientFilter === client.id ? 'bg-[#476E66]/5 text-[#476E66] font-medium' : ''} ${isLastPriority ? 'border-b border-neutral-100' : ''}`}
                                >
                                  <PriorityDropdown
                                    id={client.id}
                                    currentPriority={client.priority}
                                    onSelect={(priority) => setClientPriority(client.id, priority)}
                                    type="client"
                                  />
                                  <span className="truncate">{client.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    {/* Status Filter */}
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Project Status</label>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66] focus:ring-1 focus:ring-[#476E66]"
                      >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                      </select>
                    </div>
                    {/* Billing Status Filter */}
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Billing Status</label>
                      <select
                        value={billingFilter}
                        onChange={(e) => setBillingFilter(e.target.value)}
                        className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66] focus:ring-1 focus:ring-[#476E66]"
                      >
                        <option value="all">All Billing</option>
                        <option value="not_billed">Not Billed</option>
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="partial">Partial Payment</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                    {/* Category Filter */}
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 block">Category</label>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 text-[11px] border border-neutral-200 rounded-sm bg-white focus:outline-none focus:border-[#476E66] focus:ring-1 focus:ring-[#476E66]"
                      >
                        <option value="all">All Categories</option>
                        {PROJECT_CATEGORIES.map(cat => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <div className="px-4 py-2 border-t border-neutral-100">
                      <button
                        onClick={() => {
                          setStatusFilter('all');
                          setClientFilter('all');
                          setBillingFilter('all');
                          setCategoryFilter('all');
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


          {/* Active Only Toggle */}
          <button
            onClick={() => setShowActiveOnly(!showActiveOnly)}
            className={`hidden sm:flex items-center gap-2 px-4 py-2.5 border rounded-sm transition-all group ${showActiveOnly
              ? 'bg-[#476E66]/10 border-[#476E66] text-[#476E66]'
              : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${showActiveOnly ? 'text-[#476E66]' : 'text-neutral-400 group-hover:text-neutral-600'}`} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Active Only</span>
          </button>

          {/* Columns Dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowColumnsDropdown(!showColumnsDropdown); setShowActionsMenu(false); setShowFiltersDropdown(false); }}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 hover:border-neutral-300 rounded-sm hover:bg-neutral-50 transition-all group"
            >
              <Columns3 className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 group-hover:text-neutral-900">Columns</span>
            </button>
            {showColumnsDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColumnsDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-sm border border-neutral-200 z-50 py-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-neutral-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#476E66]">Customize Columns</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Select which columns to display</p>
                  </div>
                  <div className="px-4 py-2 max-h-72 overflow-y-auto">
                    {['Basic', 'Financial', 'Billing', 'Dates'].map(group => {
                      const groupCols = ALL_COLUMNS.filter(col => col.group === group);
                      if (groupCols.length === 0) return null;
                      return (
                        <div key={group} className="mb-3">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-2">{group}</p>
                          <div className="space-y-1">
                            {groupCols.map(col => (
                              <label key={col.key} className="flex items-center gap-3 py-1 cursor-pointer group">
                                <div className="relative flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={visibleColumns.includes(col.key)}
                                    onChange={(e) => {
                                      const newCols = e.target.checked
                                        ? [...visibleColumns, col.key]
                                        : visibleColumns.filter(c => c !== col.key);
                                      setVisibleColumns(newCols);
                                      localStorage.setItem('projectsVisibleColumns', JSON.stringify(newCols));
                                    }}
                                    className="peer appearance-none w-3.5 h-3.5 border border-neutral-300 rounded-sm bg-white checked:bg-neutral-900 checked:border-neutral-900 transition-colors"
                                  />
                                  <Check className="w-2.5 h-2.5 text-white absolute left-0.5 top-0.5 opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                </div>
                                <span className="text-[11px] font-medium text-neutral-500 group-hover:text-neutral-900 transition-colors">{col.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2 border-t border-neutral-100">
                    <button
                      onClick={() => {
                        setVisibleColumns(DEFAULT_COLUMNS);
                        localStorage.setItem('projectsVisibleColumns', JSON.stringify(DEFAULT_COLUMNS));
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

          <div className="relative">
            <button
              onClick={() => { setShowActionsMenu(!showActionsMenu); setShowColumnsDropdown(false); setShowFiltersDropdown(false); }}
              className="flex items-center justify-center w-10 h-[42px] bg-white border border-neutral-200 rounded-sm hover:bg-neutral-50 hover:border-neutral-300 transition-all text-neutral-500 hover:text-neutral-900"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showActionsMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-sm border border-neutral-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    const csv = ['Project,Client,Status,Budget,Category,Start Date,End Date'];
                    filteredProjects.forEach(p => {
                      const clientName = p.client?.name || clients.find(c => c.id === p.client_id)?.name || '';
                      csv.push(`"${p.name}","${clientName}","${p.status || ''}","${p.budget || ''}","${getCategoryInfo(p.category).label}","${p.start_date || ''}","${p.end_date || ''}"`);
                    });
                    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'projects.csv';
                    a.click();
                    setShowActionsMenu(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
                <button
                  onClick={() => {
                    window.print();
                    setShowActionsMenu(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                >
                  <FileText className="w-3.5 h-3.5" /> Print Project List
                </button>
                <hr className="my-1 border-neutral-100" />
                <button
                  onClick={() => {
                    loadData();
                    setShowActionsMenu(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
                </button>
                <hr className="my-1 border-neutral-100" />
                <div className="px-4 py-2 max-h-80 overflow-y-auto">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#476E66] mb-3">Visible Columns</p>
                  {['Basic', 'Financial', 'Billing', 'Dates'].map(group => {
                    const groupCols = ALL_COLUMNS.filter(col => col.group === group);
                    if (groupCols.length === 0) return null;
                    return (
                      <div key={group} className="mb-3">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-2">{group}</p>
                        <div className="space-y-1">
                          {groupCols.map(col => (
                            <label key={col.key} className="flex items-center gap-3 py-1 cursor-pointer group">
                              <div className="relative flex items-center">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.includes(col.key)}
                                  onChange={(e) => {
                                    const newCols = e.target.checked
                                      ? [...visibleColumns, col.key]
                                      : visibleColumns.filter(c => c !== col.key);
                                    setVisibleColumns(newCols);
                                    localStorage.setItem('projectsVisibleColumns', JSON.stringify(newCols));
                                  }}
                                  className="peer appearance-none w-3.5 h-3.5 border border-neutral-300 rounded-sm bg-white checked:bg-neutral-900 checked:border-neutral-900 transition-colors"
                                />
                                <Check className="w-2.5 h-2.5 text-white absolute left-0.5 top-0.5 opacity-0 peer-checked:opacity-100 pointer-events-none" />
                              </div>
                              <span className="text-[11px] font-medium text-neutral-500 group-hover:text-neutral-900 transition-colors uppercase tracking-wide">{col.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedProjects.size > 0 && (
                  <>
                    <hr className="my-1 border-neutral-100" />
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete ${selectedProjects.size} selected project(s)?`)) return;
                        for (const id of selectedProjects) {
                          await api.deleteProject(id);
                        }
                        setSelectedProjects(new Set());
                        loadData();
                        setShowActionsMenu(false);
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedProjects.size})
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Quick Filters */}
      <div className="flex sm:hidden gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        <button
          onClick={() => setStatusFilter(statusFilter === 'all' ? 'all' : 'all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${statusFilter === 'all' && clientFilter === 'all' && billingFilter === 'all'
            ? 'bg-neutral-900 text-white'
            : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
          style={{ ...(statusFilter === 'all' && clientFilter === 'all' && billingFilter === 'all' ? {} : {}) }}
        >
          All ({projects.length})
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${statusFilter === 'active'
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
        >
          Active ({projects.filter(p => p.status === 'active').length})
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${statusFilter === 'in_progress'
            ? 'bg-blue-100 text-blue-700 border border-blue-200'
            : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
        >
          In Progress ({projects.filter(p => p.status === 'in_progress').length})
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${statusFilter === 'completed'
            ? 'bg-neutral-200 text-neutral-700 border border-neutral-300'
            : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
        >
          Completed ({projects.filter(p => p.status === 'completed').length})
        </button>
        <button
          onClick={() => setBillingFilter(billingFilter === 'not_billed' ? 'all' : 'not_billed')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${billingFilter === 'not_billed'
            ? 'bg-amber-100 text-amber-700 border border-amber-200'
            : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
        >
          Unbilled
        </button>
      </div>

      {/* Projects Table */}
      {viewMode === 'list' ? (
        <div className="bg-white border-t border-b border-neutral-100 shadow-sm sm:border sm:rounded-sm overflow-visible">
          {/* Mobile Card View */}
          <div className="block lg:hidden divide-y divide-neutral-100 overflow-visible">
            {filteredProjects.map((project) => {
              const catInfo = getCategoryInfo(project.category);
              const clientName = project.client?.name || clients.find(c => c.id === project.client_id)?.name || '-';

              return (
                <div
                  key={project.id}
                  className={`p-4 cursor-pointer active:bg-neutral-50 transition-colors overflow-visible ${selectedProjects.has(project.id) ? 'bg-[#476E66]/5' : ''}`}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(project.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedProjects);
                          if (e.target.checked) newSelected.add(project.id);
                          else newSelected.delete(project.id);
                          setSelectedProjects(newSelected);
                        }}
                        className="w-4 h-4 rounded-sm border-neutral-300 text-[#476E66] focus:ring-0 mt-1"
                      />
                    </div>


                    <div className="mt-1">
                      <PriorityDropdown
                        id={project.id}
                        currentPriority={project.priority}
                        onSelect={(priority) => setProjectPriority(project.id, priority)}
                        type="project"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-light text-sm text-neutral-900 truncate group-hover:font-bold transition-all">{project.name}</h3>
                      <p className="text-[11px] font-medium text-neutral-500 truncate mt-0.5 uppercase tracking-wide">{clientName}</p>

                      {/* Meta Info */}
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <span className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest ${project.status === 'active' ? 'text-emerald-600' :
                          project.status === 'completed' ? 'text-neutral-400' :
                            'text-amber-600'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${project.status === 'active' ? 'bg-emerald-500' :
                            project.status === 'completed' ? 'bg-neutral-300' :
                              'bg-amber-500'
                            }`} />
                          {project.status?.replace('_', ' ') || 'active'}
                        </span>
                        {canViewFinancials && project.budget > 0 && (
                          <span className="text-[11px] font-medium text-neutral-600">{formatCurrency(project.budget)}</span>
                        )}
                        {project.start_date && (
                          <span className="text-[10px] text-neutral-400">{new Date(project.start_date).toLocaleDateString()}</span>
                        )}
                        {/* Billing Status Badge */}
                        {(() => {
                          const billingStatus = projectBillingStats[project.id]?.billingStatus;
                          if (!billingStatus || billingStatus === 'Not Billed') return null;
                          const statusStyles: Record<string, string> = {
                            'Draft': 'bg-amber-50 text-amber-700',
                            'Open': 'bg-blue-50 text-blue-700',
                            'Partial': 'bg-orange-50 text-orange-700',
                            'Paid': 'bg-emerald-50 text-emerald-700',
                            'Paid & Closed': 'bg-neutral-200 text-neutral-700',
                            'Closed - Outstanding': 'bg-red-50 text-red-700',
                          };
                          return (
                            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest ${statusStyles[billingStatus]}`}>
                              {billingStatus}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setRowMenuOpen(rowMenuOpen === project.id ? null : project.id)}
                        className="p-1 hover:bg-neutral-100 rounded-sm flex-shrink-0 text-neutral-400 hover:text-neutral-900"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {rowMenuOpen === project.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-sm border border-neutral-200 z-20 py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => { navigate(`/projects/${project.id}`); setRowMenuOpen(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 text-left"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View Details
                          </button>
                          {canEdit('projects') && (
                            <button
                              onClick={() => { setEditingProject(project); setShowProjectModal(true); setRowMenuOpen(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 text-left"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit Project
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <table className="w-full hidden lg:table">
            <thead className="bg-white border-b border-neutral-200">
              <tr>
                <th className="w-10 px-4 py-3">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedProjects.size === filteredProjects.length && filteredProjects.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjects(new Set(filteredProjects.map(p => p.id)));
                        } else {
                          setSelectedProjects(new Set());
                        }
                      }}
                      className="peer appearance-none w-3.5 h-3.5 border border-neutral-300 rounded-sm bg-white checked:bg-neutral-900 checked:border-neutral-900 transition-colors cursor-pointer"
                    />
                    <Check className="w-2.5 h-2.5 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 peer-checked:opacity-100 pointer-events-none" />
                  </div>
                </th>
                {visibleColumns.includes('project') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Project</th>}
                {visibleColumns.includes('client') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Client</th>}
                {visibleColumns.includes('team') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Team</th>}
                {visibleColumns.includes('budget') && canViewFinancials && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Budget</th>}
                {visibleColumns.includes('status') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Status</th>}
                {visibleColumns.includes('category') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Category</th>}
                {visibleColumns.includes('start_date') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Start Date</th>}
                {visibleColumns.includes('end_date') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">End Date</th>}
                {visibleColumns.includes('invoiced') && canViewFinancials && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Invoiced</th>}
                {visibleColumns.includes('collected') && canViewFinancials && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Collected</th>}
                {visibleColumns.includes('remaining') && canViewFinancials && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Remaining</th>}
                {visibleColumns.includes('billing_status') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Billing Status</th>}
                {visibleColumns.includes('draft_invoices') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Draft Invoices</th>}
                {visibleColumns.includes('open_invoices') && <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Open Invoices</th>}
                <th className="w-16 text-right px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredProjects.map((project) => {
                const catInfo = getCategoryInfo(project.category);
                return (
                  <tr
                    key={project.id}
                    className={`hover:bg-neutral-50/80 transition-colors cursor-pointer group ${selectedProjects.has(project.id) ? 'bg-[#476E66]/5' : ''}`}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedProjects.has(project.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedProjects);
                            if (e.target.checked) {
                              newSelected.add(project.id);
                            } else {
                              newSelected.delete(project.id);
                            }
                            setSelectedProjects(newSelected);
                          }}
                          className="peer appearance-none w-3.5 h-3.5 border border-neutral-300 rounded-sm bg-white checked:bg-neutral-900 checked:border-neutral-900 transition-colors cursor-pointer"
                        />
                        <Check className="w-2.5 h-2.5 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 peer-checked:opacity-100 pointer-events-none" />
                      </div>
                    </td>
                    {visibleColumns.includes('project') && (
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <PriorityDropdown
                            id={project.id}
                            currentPriority={project.priority}
                            onSelect={(priority) => setProjectPriority(project.id, priority)}
                            type="project"
                          />
                          <div className="min-w-0">
                            <p className="font-light text-sm text-neutral-900 truncate group-hover:font-bold group-hover:text-[#476E66] transition-all">{project.name}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('client') && (
                      <td className="px-4 py-4 text-[11px] font-medium text-neutral-600 uppercase tracking-wider">
                        {project.client?.name || clients.find(c => c.id === project.client_id)?.name || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('team') && (
                      <td className="px-4 py-4">
                        <div className="flex -space-x-2">
                          {(projectTeamsMap[project.id] || []).slice(0, 3).map((member, idx) => (
                            member.avatar_url ? (
                              <img key={idx} src={member.avatar_url} alt="" className="w-6 h-6 rounded-full border-2 border-white object-cover shadow-sm" title={member.full_name} />
                            ) : (
                              <div key={idx} className="w-6 h-6 rounded-full border-2 border-white bg-neutral-100 flex items-center justify-center text-[9px] font-bold text-neutral-600 shadow-sm" title={member.full_name}>
                                {member.full_name?.charAt(0) || '?'}
                              </div>
                            )
                          ))}
                          {(projectTeamsMap[project.id]?.length || 0) > 3 && (
                            <div className="w-6 h-6 rounded-full border-2 border-white bg-neutral-900 flex items-center justify-center text-[9px] font-bold text-white shadow-sm">
                              +{(projectTeamsMap[project.id]?.length || 0) - 3}
                            </div>
                          )}
                          {!projectTeamsMap[project.id]?.length && <span className="text-neutral-300 text-xs">-</span>}
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('budget') && canViewFinancials && <td className="px-4 py-4 font-mono text-sm text-neutral-900">{formatCurrency(project.budget)}</td>}
                    {visibleColumns.includes('status') && (
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest ${project.status === 'active' ? 'text-emerald-600' :
                          project.status === 'completed' ? 'text-neutral-400' :
                            'text-amber-600'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${project.status === 'active' ? 'bg-emerald-500' :
                            project.status === 'completed' ? 'bg-neutral-300' :
                              'bg-amber-500'
                            }`} />
                          {project.status?.replace('_', ' ') || 'active'}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes('category') && (
                      <td className="px-4 py-4">
                        <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">{catInfo.label}</span>
                      </td>
                    )}
                    {visibleColumns.includes('start_date') && (
                      <td className="px-4 py-4 text-[11px] font-mono text-neutral-500">
                        {project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('end_date') && (
                      <td className="px-4 py-4 text-[11px] font-mono text-neutral-500">
                        {project.end_date ? new Date(project.end_date).toLocaleDateString() : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('invoiced') && canViewFinancials && (
                      <td className="px-4 py-4 font-mono text-sm text-neutral-900">
                        {formatCurrency(projectBillingStats[project.id]?.invoiced || 0)}
                      </td>
                    )}
                    {visibleColumns.includes('collected') && canViewFinancials && (
                      <td className="px-4 py-4 font-mono text-sm text-emerald-600">
                        {formatCurrency(projectBillingStats[project.id]?.collected || 0)}
                      </td>
                    )}
                    {visibleColumns.includes('remaining') && canViewFinancials && (
                      <td className="px-4 py-4 font-mono text-sm text-neutral-500">
                        {formatCurrency(projectBillingStats[project.id]?.remaining || 0)}
                      </td>
                    )}
                    {visibleColumns.includes('billing_status') && (
                      <td className="px-4 py-4">
                        {(() => {
                          const status = projectBillingStats[project.id]?.billingStatus || 'Not Billed';
                          const statusStyles: Record<string, string> = {
                            'Not Billed': 'bg-neutral-100 text-neutral-600',
                            'Draft': 'bg-amber-50 text-amber-700',
                            'Open': 'bg-blue-50 text-blue-700',
                            'Partial': 'bg-orange-50 text-orange-700',
                            'Paid': 'bg-emerald-50 text-emerald-700',
                            'Paid & Closed': 'bg-neutral-200 text-neutral-700',
                            'Closed - Outstanding': 'bg-red-50 text-red-700',
                          };
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-widest ${statusStyles[status] || statusStyles['Not Billed']}`}>
                              {status}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {visibleColumns.includes('draft_invoices') && (
                      <td className="px-4 py-4 font-mono text-sm text-amber-700">
                        {projectBillingStats[project.id]?.draftAmount > 0 ? (
                          formatCurrency(projectBillingStats[project.id]?.draftAmount)
                        ) : (
                          <span className="text-neutral-300">-</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes('open_invoices') && (
                      <td className="px-4 py-4 text-center">
                        {projectBillingStats[project.id]?.openCount > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                            {projectBillingStats[project.id]?.openCount}
                          </span>
                        ) : (
                          <span className="text-neutral-300">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setRowMenuOpen(rowMenuOpen === project.id ? null : project.id)}
                        className="p-1.5 hover:bg-neutral-100 rounded-sm text-neutral-400 hover:text-neutral-900 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {rowMenuOpen === project.id && (
                        <div className="absolute right-4 top-full mt-1 w-48 bg-white rounded-sm border border-neutral-200 z-20 py-1 shadow-lg animate-in fade-in zoom-in-95 duration-100">
                          <button
                            onClick={() => { navigate(`/projects/${project.id}`); setRowMenuOpen(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 text-left"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View Details
                          </button>
                          {canEdit('projects') && (
                            <button
                              onClick={() => { setEditingProject(project); setShowProjectModal(true); setRowMenuOpen(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 text-left"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit Project
                            </button>
                          )}
                          {canEdit('projects') && (
                            <button
                              onClick={async () => {
                                const newProject = await api.createProject({
                                  company_id: project.company_id,
                                  client_id: project.client_id,
                                  name: `${project.name} (Copy)`,
                                  description: project.description,
                                  budget: project.budget,
                                  status: 'not_started'
                                });
                                if (newProject) {
                                  loadData();
                                }
                                setRowMenuOpen(null);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 text-left"
                            >
                              <Copy className="w-3.5 h-3.5" /> Duplicate Project
                            </button>
                          )}
                          {canDelete('projects') && (
                            <>
                              <hr className="my-1 border-neutral-100" />
                              <button
                                onClick={async () => {
                                  if (!confirm('Delete this project?')) return;
                                  await api.deleteProject(project.id);
                                  loadData();
                                  setRowMenuOpen(null);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 hover:text-red-700 text-left"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete Project
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredProjects.length === 0 && (
            <div className="text-center py-20 bg-neutral-50/30">
              <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-6 h-6 text-neutral-400" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide mb-1">No Projects Found</h3>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto mb-6">Create your first project to start tracking your work.</p>
              {canCreate('projects') && (
                <button
                  onClick={() => setShowProjectModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Project
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Client-Grouped View */
        <div className="space-y-4">
          {(() => {
            const grouped: Record<string, Project[]> = {};
            filteredProjects.forEach(p => {
              const clientName = p.client?.name || clients.find(c => c.id === p.client_id)?.name || 'Unassigned';
              if (!grouped[clientName]) grouped[clientName] = [];
              grouped[clientName].push(p);
            });
            const sortedClients = Object.keys(grouped).sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));
            return sortedClients.map(clientName => (
              <div key={clientName} className="bg-white rounded-sm border border-neutral-200 overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleClientExpanded(clientName)}
                  className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50/50 hover:bg-neutral-50 transition-colors border-l-4 border-l-transparent hover:border-l-neutral-300 group"
                >
                  <div className="flex items-center gap-3">
                    {expandedClients.has(clientName) ? <ChevronDown className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600" /> : <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600" />}
                    <span className="font-bold text-sm text-neutral-900 uppercase tracking-widest">{clientName}</span>
                    <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{grouped[clientName].length}</span>
                  </div>
                </button>
                {expandedClients.has(clientName) && (
                  <div className="divide-y divide-neutral-100 border-t border-neutral-100">
                    {grouped[clientName].map(project => {
                      const catInfo = getCategoryInfo(project.category);
                      return (
                        <div
                          key={project.id}
                          onClick={() => navigate(`/projects/${project.id}`)}
                          className="flex items-center gap-4 px-6 py-3 hover:bg-neutral-50 cursor-pointer group transition-colors"
                        >
                          <div className="mr-1">
                            <PriorityDropdown
                              id={project.id}
                              currentPriority={project.priority}
                              onSelect={(priority) => setProjectPriority(project.id, priority)}
                              type="project"
                            />
                          </div>
                          <div className="flex-1">
                            <p className="font-light text-sm text-neutral-900 group-hover:font-bold group-hover:text-[#476E66] transition-all">{project.name}</p>
                          </div>
                          <div className="w-32 flex-shrink-0 flex items-center">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest ${project.status === 'active' ? 'text-emerald-600' :
                              project.status === 'completed' ? 'text-neutral-400' :
                                'text-amber-600'
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${project.status === 'active' ? 'bg-emerald-500' :
                                project.status === 'completed' ? 'bg-neutral-300' :
                                  'bg-amber-500'
                                }`} />
                              {project.status?.replace('_', ' ') || 'active'}
                            </span>
                          </div>
                          {canViewFinancials && (
                            <div className="w-24 flex-shrink-0 text-right">
                              <span className="font-mono text-[11px] text-neutral-900">{formatCurrency(project.budget)}</span>
                            </div>
                          )}
                          <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ));
          })()}
          {filteredProjects.length === 0 && (
            <div className="text-center py-12 text-neutral-500 bg-white rounded-sm border border-neutral-200">No projects found</div>
          )}
        </div>
      )
      }

      {/* Project Modal */}
      {
        showProjectModal && (
          <ProjectModal
            project={editingProject}
            clients={clients}
            companyId={profile?.company_id || ''}
            onClose={() => { setShowProjectModal(false); setEditingProject(null); }}
            onSave={() => { loadData(); setShowProjectModal(false); setEditingProject(null); }}
          />
        )
      }
    </div >
  );
}

function ProjectModal({ project, clients, companyId, onClose, onSave }: {
  project: Project | null;
  clients: Client[];
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(project?.name || '');
  const [clientId, setClientId] = useState(project?.client_id || '');
  const [description, setDescription] = useState(project?.description || '');
  const [budget, setBudget] = useState(project?.budget?.toString() || '');
  const [startDate, setStartDate] = useState(project?.start_date?.split('T')[0] || '');
  const [endDate, setEndDate] = useState(project?.end_date?.split('T')[0] || '');
  const [status, setStatus] = useState(project?.status || 'active');
  const [category, setCategory] = useState(project?.category || 'O');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Project name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Project name must be at least 2 characters';
    } else if (name.trim().length > 100) {
      errors.name = 'Project name must be less than 100 characters';
    }

    if (budget && (isNaN(parseFloat(budget)) || parseFloat(budget) < 0)) {
      errors.budget = 'Budget must be a positive number';
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errors.endDate = 'End date must be after start date';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setError(null);
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        client_id: clientId || null,
        description: description || null,
        budget: parseFloat(budget) || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        category,
      };
      if (project) {
        await api.updateProject(project.id, data);
      } else {
        await api.createProject({ ...data, company_id: companyId });
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save project:', err);
      setError(err?.message || 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">{project ? 'Edit Project' : 'Create Project'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setFieldErrors(prev => ({ ...prev, name: '' })); }}
              className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none ${fieldErrors.name ? 'border-red-300' : 'border-neutral-200'}`}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Budget ($)</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => { setBudget(e.target.value); setFieldErrors(prev => ({ ...prev, budget: '' })); }}
                className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none ${fieldErrors.budget ? 'border-red-300' : 'border-neutral-200'}`}
              />
              <FieldError message={fieldErrors.budget} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="not_started">Not Started</option>
                <option value="active">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
              {PROJECT_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label} ({cat.value})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} onClick={(e) => { e.preventDefault(); handleSubmit(e as any); }} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : project ? 'Update' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskModal({ task, projectId, companyId, teamMembers, companyProfiles, onClose, onSave, onDelete, canViewFinancials = true }: {
  task: Task | null;
  projectId: string;
  companyId: string;
  teamMembers: { staff_member_id: string; profile?: { id?: string; full_name?: string; avatar_url?: string } }[];
  companyProfiles: { id: string; full_name?: string; avatar_url?: string; email?: string; role?: string }[];
  onClose: () => void;
  onSave: () => void;
  onDelete?: (taskId: string) => void;
  canViewFinancials?: boolean;
}) {
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || 'not_started');
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || '');
  const [estimatedHours, setEstimatedHours] = useState(task?.estimated_hours?.toString() || '');
  const [estimatedFees, setEstimatedFees] = useState(task?.estimated_fees?.toString() || '');
  const [actualFees, setActualFees] = useState(task?.actual_fees?.toString() || '');
  const [dueDate, setDueDate] = useState(task?.due_date?.split('T')[0] || '');
  const [startDate, setStartDate] = useState(task?.start_date?.split('T')[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setError(null);
    setSaving(true);
    try {
      const data = {
        name,
        description: description || null,
        status,
        priority,
        assigned_to: assignedTo || null,
        estimated_hours: parseFloat(estimatedHours) || null,
        estimated_fees: parseFloat(estimatedFees) || null,
        actual_fees: parseFloat(actualFees) || null,
        due_date: dueDate || null,
        start_date: startDate || null,
      };

      // Track if this is a new assignment
      const wasAssigned = task?.assigned_to;
      const isNewAssignment = !wasAssigned && assignedTo;
      const isReassignment = wasAssigned && assignedTo && wasAssigned !== assignedTo;

      let savedTaskId: string | undefined;
      if (task) {
        await api.updateTask(task.id, data);
        savedTaskId = task.id;
      } else {
        const result = await api.createTask({ ...data, project_id: projectId, company_id: companyId });
        savedTaskId = result?.id;
      }

      // Send notification for task assignment
      if ((isNewAssignment || isReassignment) && assignedTo && companyId && savedTaskId) {
        try {
          await NotificationService.taskAssigned(
            companyId,
            name,
            'Project', // Generic project name - task modal doesn't have project details
            assignedTo,
            savedTaskId
          );
        } catch (notifErr) {
          console.warn('Failed to send task assignment notification:', notifErr);
        }
      }

      onSave();
    } catch (err: any) {
      console.error('Failed to save task:', err);
      setError(err?.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-elevated)' }}>
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-neutral-900">{task ? 'Edit Task' : 'Create Task'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} id="task-form" className="px-4 py-3 space-y-2.5">
            {error && (
              <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                {error}
              </div>
            )}

            {/* Task Name */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Task Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                required
                placeholder="e.g. Design homepage mockup"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none resize-none"
                placeholder="Task details..."
              />
            </div>

            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none bg-white"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none bg-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Assignee
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                disabled={!canViewFinancials}
                className={`w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none ${!canViewFinancials ? 'bg-neutral-100 cursor-not-allowed opacity-60' : 'bg-white'
                  }`}
              >
                <option value="">Unassigned</option>
                {companyProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date & Due Date */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                />
              </div>
            </div>

            {/* Time & Budget */}
            {canViewFinancials && (
              <div className="border-t border-neutral-100 pt-2.5 mt-2">
                <h4 className="text-xs font-semibold text-neutral-900 mb-2">
                  Time & Budget
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Estimated Hours
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">
                        Est. Fees ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={estimatedFees}
                        onChange={(e) => setEstimatedFees(e.target.value)}
                        className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">
                        Actual Fees ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={actualFees}
                        onChange={(e) => setActualFees(e.target.value)}
                        className="w-full h-10 px-3 text-sm border border-neutral-300 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Fixed Footer */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-neutral-100 bg-neutral-50 flex-shrink-0">
          {task && onDelete && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Are you sure you want to delete this task?')) {
                  onDelete(task.id);
                }
              }}
              className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-xs font-medium flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-1.5 border border-neutral-200 bg-white rounded-lg hover:bg-neutral-50 transition-colors text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="task-form"
            disabled={saving}
            className="flex-1 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50 text-xs font-medium"
          >
            {saving ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Project Vitals Tab Component
function ProjectVitalsTab({ project, clients, onSave, canViewFinancials, formatCurrency, companyId, projectCompanyId }: {
  project: Project;
  clients: Client[];
  onSave: (updates: Partial<Project>) => Promise<void>;
  canViewFinancials: boolean;
  formatCurrency: (amount?: number) => string;
  companyId: string;
  projectCompanyId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<Project>>({});

  const startEdit = () => {
    setEditing(true);
    setEditData({
      name: project.name,
      description: project.description,
      budget: project.budget,
      start_date: project.start_date,
      end_date: project.end_date,
      status: project.status,
      client_id: project.client_id,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(editData);
      setEditing(false);
      alert('Project saved successfully!');
    } catch (err) {
      console.error('Failed to save project:', err);
      alert('Failed to save project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Project Details</h3>
        {editing ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-[10px] font-bold text-neutral-600 hover:bg-neutral-100 rounded-sm uppercase tracking-widest border border-transparent hover:border-neutral-200 transaction-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[10px] font-bold bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] disabled:opacity-50 uppercase tracking-widest">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        ) : (
          <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-neutral-600 hover:bg-neutral-100 rounded-sm uppercase tracking-widest border border-neutral-200">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Project Name</label>
              <input
                type="text"
                value={editData.name || ''}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Client</label>
              <select
                value={editData.client_id || ''}
                onChange={(e) => setEditData({ ...editData, client_id: e.target.value })}
                className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors"
              >
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Description</label>
            <textarea
              value={editData.description || ''}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {canViewFinancials && (
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Budget</label>
                <input
                  type="number"
                  value={editData.budget || ''}
                  onChange={(e) => setEditData({ ...editData, budget: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors"
                />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Status</label>
              <select
                value={editData.status || 'active'}
                onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors"
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Start Date</label>
              <input
                type="date"
                value={editData.start_date || ''}
                onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">End Date</label>
              <input
                type="date"
                value={editData.end_date || ''}
                onChange={(e) => setEditData({ ...editData, end_date: e.target.value })}
                className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-sm bg-neutral-50 focus:ring-0 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">


          {project.description && (
            <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-100">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Project Description</p>
              <p className="text-sm text-neutral-600 leading-relaxed font-light">{project.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Collaborators Section */}
      <div className="mt-8 pt-6 border-t border-neutral-100">
        <ProjectCollaborators
          projectId={project.id}
          projectName={project.name}
          companyId={companyId}
          clients={clients}
        />
      </div>

      {/* Comments Section */}
      <div className="mt-8 pt-6 border-t border-neutral-100">
        <ProjectComments projectId={project.id} companyId={projectCompanyId || companyId} />
      </div>
    </div >
  );
}

// Client Tab Component
function ClientTabContent({ client, onClientUpdate, canViewFinancials = true, isAdmin = false }: {
  client?: Client;
  onClientUpdate: (client: Client) => Promise<void>;
  canViewFinancials?: boolean;
  isAdmin?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);

  if (!client) {
    return (
      <div className="text-center py-16 bg-neutral-50 rounded-sm border border-neutral-100">
        <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
        <p className="text-neutral-500 font-medium">No client assigned to this project</p>
      </div>
    );
  }

  const startEdit = () => {
    setEditing(true);
    setEditData({
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      city: client.city,
      state: client.state,
      zip: client.zip,
      website: client.website,
      primary_contact_name: client.primary_contact_name,
      primary_contact_title: client.primary_contact_title,
      primary_contact_email: client.primary_contact_email,
      primary_contact_phone: client.primary_contact_phone,
      billing_contact_name: client.billing_contact_name,
      billing_contact_title: client.billing_contact_title,
      billing_contact_email: client.billing_contact_email,
      billing_contact_phone: client.billing_contact_phone
    });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await onClientUpdate({ ...client, ...editData });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Edit Menu */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Client Information</h3>
        {canViewFinancials && (editing ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-[10px] uppercase font-bold text-neutral-600 hover:bg-neutral-100 rounded-sm tracking-widest transition-colors">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-[10px] uppercase font-bold bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] disabled:opacity-50 tracking-widest transition-colors">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        ) : (
          <div className="relative">
            <button onClick={() => setOpenMenu(!openMenu)} className="p-2 hover:bg-neutral-100 rounded-sm transition-colors text-neutral-500 hover:text-neutral-900">
              <MoreVertical className="w-4 h-4" />
            </button>
            {openMenu && (
              <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-sm py-1 z-10 border border-neutral-200 shadow-xl">
                <button onClick={() => { startEdit(); setOpenMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] uppercase font-bold text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Company Information */}
      <div className="pb-6 border-b border-neutral-100">
        <h4 className="text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-4">Company Information</h4>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Company Name</label>
                <input type="text" value={editData.name || ''} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 uppercase tracking-wide" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Website</label>
                <input type="text" value={editData.website || ''} onChange={(e) => setEditData({ ...editData, website: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Email</label>
                <input type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Phone</label>
                <input type="tel" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Address</label>
              <input type="text" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">City</label>
                <input type="text" value={editData.city || ''} onChange={(e) => setEditData({ ...editData, city: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">State</label>
                <input type="text" value={editData.state || ''} onChange={(e) => setEditData({ ...editData, state: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">ZIP</label>
                <input type="text" value={editData.zip || ''} onChange={(e) => setEditData({ ...editData, zip: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Company Name</p>
              <p className="text-sm font-bold text-neutral-900">{client.name || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Website</p>
              <p className="text-sm font-bold text-neutral-900 truncate">{client.website ? <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-[#476E66] hover:underline">{client.website}</a> : '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Email</p>
              <p className="text-sm font-bold text-neutral-900 truncate">{client.email || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Phone</p>
              <p className="text-sm font-bold text-neutral-900">{client.phone || '-'}</p>
            </div>
            <div className="col-span-full">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Address</p>
              <p className="text-sm font-bold text-neutral-900">
                {client.address ? `${client.address}${client.city ? `, ${client.city}` : ''}${client.state ? `, ${client.state}` : ''} ${client.zip || ''}`.trim() : '-'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contacts Section - Clean Layout (Admin only) */}
      {isAdmin && (
        <div>
          <h4 className="text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-4">Contacts</h4>
          {editing ? (
            <div className="space-y-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:space-y-0">
              {/* Primary Contact Edit */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-700">Primary Contact</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Name</label>
                    <input type="text" value={editData.primary_contact_name || ''} onChange={(e) => setEditData({ ...editData, primary_contact_name: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Title</label>
                    <input type="text" value={editData.primary_contact_title || ''} onChange={(e) => setEditData({ ...editData, primary_contact_title: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Email</label>
                    <input type="email" value={editData.primary_contact_email || ''} onChange={(e) => setEditData({ ...editData, primary_contact_email: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Phone</label>
                    <input type="tel" value={editData.primary_contact_phone || ''} onChange={(e) => setEditData({ ...editData, primary_contact_phone: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                </div>
              </div>
              {/* Billing Contact Edit */}
              <div className="space-y-4 pt-6 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-6 border-neutral-100">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-700">Billing Contact</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Name</label>
                    <input type="text" value={editData.billing_contact_name || ''} onChange={(e) => setEditData({ ...editData, billing_contact_name: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Title</label>
                    <input type="text" value={editData.billing_contact_title || ''} onChange={(e) => setEditData({ ...editData, billing_contact_title: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Email</label>
                    <input type="email" value={editData.billing_contact_email || ''} onChange={(e) => setEditData({ ...editData, billing_contact_email: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-1.5">Phone</label>
                    <input type="tel" value={editData.billing_contact_phone || ''} onChange={(e) => setEditData({ ...editData, billing_contact_phone: e.target.value })} className="w-full px-3 py-2 text-[13px] rounded-sm bg-neutral-50 border border-neutral-200 outline-none focus:ring-0 focus:border-neutral-900 tracking-wide" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:space-y-0">
              {/* Primary Contact View */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-700">Primary Contact</span>
                </div>
                <div className="space-y-2 pl-5">
                  <p className="text-sm font-bold text-neutral-900">{client.primary_contact_name || '-'}</p>
                  {client.primary_contact_title && <p className="text-[10px] text-neutral-500 uppercase tracking-wide font-medium">{client.primary_contact_title}</p>}
                  <p className="text-xs text-neutral-600 font-medium">{client.primary_contact_email || '-'}</p>
                  <p className="text-xs text-neutral-600 font-medium">{client.primary_contact_phone || '-'}</p>
                </div>
              </div>
              {/* Billing Contact View */}
              <div className="pt-6 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-6 border-neutral-100">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-700">Billing Contact</span>
                </div>
                <div className="space-y-2 pl-5">
                  <p className="text-sm font-bold text-neutral-900">{client.billing_contact_name || '-'}</p>
                  {client.billing_contact_title && <p className="text-[10px] text-neutral-500 uppercase tracking-wide font-medium">{client.billing_contact_title}</p>}
                  <p className="text-xs text-neutral-600 font-medium">{client.billing_contact_email || '-'}</p>
                  <p className="text-xs text-neutral-600 font-medium">{client.billing_contact_phone || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tasks Tab Component - Clean Unified Design
function TasksTabContent({ tasks, timeEntries = [], projectId, companyId, onTasksChange, onEditTask, onAddTask, canViewFinancials = true }: {
  tasks: Task[];
  timeEntries?: TimeEntry[];
  projectId: string;
  companyId: string;
  onTasksChange: () => void;
  onEditTask: (task: Task) => void;
  onAddTask: () => void;
  canViewFinancials?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_started' | 'in_progress' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string; avatar_url?: string }[]>([]);

  useEffect(() => {
    async function loadTeam() {
      try {
        const profiles = await api.getCompanyProfiles(companyId);
        setTeamMembers(profiles?.map((p: any) => ({ id: p.id, full_name: p.full_name || "Unknown", avatar_url: p.avatar_url })) || []);
      } catch (e) { console.error("Load team failed:", e); }
    }
    loadTeam();
  }, [companyId]);

  // Stats
  const stats = {
    total: tasks.length,
    notStarted: tasks.filter(t => t.status === 'not_started' || !t.status).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  };
  const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  // Filtered tasks
  const filteredTasks = tasks.filter(task => {
    if (statusFilter !== 'all' && task.status !== statusFilter) {
      if (statusFilter === 'not_started' && task.status) return false;
      if (statusFilter !== 'not_started' && task.status !== statusFilter) return false;
    }
    if (searchTerm && !task.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return;
    try {
      await api.createTask({ name: quickAddName.trim(), project_id: projectId, company_id: companyId, status: 'not_started' });
      setQuickAddName('');
      onTasksChange();
    } catch (error) {
      console.error('Failed to add task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.deleteTask(taskId);
      onTasksChange();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
    setMenuOpen(null);
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api.updateTask(taskId, {
        status: newStatus,
        completion_percentage: newStatus === 'completed' ? 100 : (newStatus === 'in_progress' ? 50 : 0)
      });
      onTasksChange();
    } catch (err) { console.error(err); }
  };

  const toggleExpand = (taskId: string) => {
    const newSet = new Set(expandedTasks);
    if (newSet.has(taskId)) newSet.delete(taskId);
    else newSet.add(taskId);
    setExpandedTasks(newSet);
  };

  return (
    <div className="space-y-4">
      {/* Header with Stats & Actions */}
      {/* Header with Stats & Actions */}
      <div className="pb-6 border-b border-neutral-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          {/* Progress Summary */}
          <div className="flex items-center gap-6">
            {/* Progress Circle */}
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#F5F5F5" strokeWidth="4" />
                <circle
                  cx="32" cy="32" r="28" fill="none" stroke="#476E66" strokeWidth="4"
                  strokeDasharray={`${progressPercent * 1.76} 176`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-neutral-900">{progressPercent}%</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Total Progress</p>
              <p className="text-xl font-bold text-neutral-900">{stats.completed} <span className="text-sm text-neutral-400 font-bold uppercase">OF {stats.total} COMPLETE</span></p>
              <p className="text-[10px] font-bold text-[#476E66] uppercase tracking-wide mt-1">{stats.inProgress} IN PROGRESS</p>
            </div>
          </div>

          {/* Add Task Button */}
          <button
            onClick={onAddTask}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors text-[10px] font-bold uppercase tracking-widest"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
        </div>
      </div>

      {/* Filter Pills & Search */}
      {/* Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-sm">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-1.5 rounded-sm text-[10px] uppercase font-bold tracking-widest transition-all ${statusFilter === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            All <span className="ml-1 opacity-60">{stats.total}</span>
          </button>
          <button
            onClick={() => setStatusFilter('not_started')}
            className={`px-4 py-1.5 rounded-sm text-[10px] uppercase font-bold tracking-widest transition-all ${statusFilter === 'not_started' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            To Do <span className="ml-1 opacity-60">{stats.notStarted}</span>
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`px-4 py-1.5 rounded-sm text-[10px] uppercase font-bold tracking-widest transition-all ${statusFilter === 'in_progress' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            In Progress <span className="ml-1 opacity-60">{stats.inProgress}</span>
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-4 py-1.5 rounded-sm text-[10px] uppercase font-bold tracking-widest transition-all ${statusFilter === 'completed' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            Done <span className="ml-1 opacity-60">{stats.completed}</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-[12px] font-medium border border-neutral-200 rounded-sm focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors"
          />
        </div>
      </div>

      {/* Tasks List */}
      {/* Tasks List */}
      <div className="border-t border-b border-neutral-100 sm:border-0">
        {filteredTasks.length === 0 && !quickAddName ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 bg-neutral-50 rounded-sm border border-neutral-100 flex items-center justify-center mx-auto mb-4">
              <CheckSquare className="w-6 h-6 text-neutral-300" />
            </div>
            <h3 className="text-[11px] font-bold text-neutral-900 uppercase tracking-widest mb-1">
              {statusFilter === 'all' ? 'No tasks found' : `No ${statusFilter.replace('_', ' ')} tasks`}
            </h3>
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-6">
              {statusFilter === 'all' ? 'Create your first task to get started' : 'Tasks will appear here when their status matches'}
            </p>
            {statusFilter === 'all' && (
              <button
                onClick={onAddTask}
                className="px-6 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors text-[10px] font-bold uppercase tracking-widest"
              >
                Create Task
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredTasks.map(task => {
              const assignee = teamMembers.find(m => m.id === task.assigned_to);
              const isCompleted = task.status === 'completed';
              const taskTimeEntries = timeEntries.filter(te => te.task_id === task.id);
              const isExpanded = expandedTasks.has(task.id);

              return (
                <div key={task.id}>
                  <div className={`flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 transition-colors group ${isCompleted ? 'opacity-60' : ''}`}>
                    {/* Completion Toggle */}
                    <button
                      onClick={() => handleStatusChange(task.id, isCompleted ? 'not_started' : 'completed')}
                      className={`flex items-center justify-center w-5 h-5 rounded-sm border transition-all flex-shrink-0 ${isCompleted ? 'border-[#476E66] bg-[#476E66]' : 'border-neutral-300 hover:border-[#476E66]'
                        }`}
                    >
                      {isCompleted && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </button>

                    {/* Task Info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEditTask(task)}>
                      <p className={`text-sm font-bold ${isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
                        {task.name}
                      </p>
                      {task.description && (
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide truncate mt-0.5">{task.description}</p>
                      )}
                    </div>

                    {/* Time Entries Badge */}
                    {taskTimeEntries.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                        className="flex items-center gap-1.5 px-2 py-1 bg-neutral-100 hover:bg-neutral-200 rounded-sm text-[10px] font-bold text-neutral-600 transition-colors uppercase tracking-wide"
                      >
                        <Clock className="w-3 h-3" />
                        {taskTimeEntries.length}
                      </button>
                    )}

                    {/* Assignee */}
                    <div className="hidden sm:flex items-center gap-2 w-28">
                      {assignee ? (
                        <>
                          {assignee.avatar_url ? (
                            <img src={assignee.avatar_url} alt="" className="w-6 h-6 rounded-full border border-neutral-100" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-500">
                              {assignee.full_name?.charAt(0) || '?'}
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wide truncate">{assignee.full_name}</span>
                        </>
                      ) : (
                        <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wide">Unassigned</span>
                      )}
                    </div>

                    {/* Status Dropdown */}
                    <select
                      value={task.status || 'not_started'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleStatusChange(task.id, e.target.value)}
                      className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-sm border-0 cursor-pointer transition-colors ${task.status === 'completed' ? 'bg-neutral-100 text-neutral-500' :
                        task.status === 'in_progress' ? 'bg-[#476E66]/10 text-[#476E66]' :
                          'bg-neutral-100 text-neutral-900'
                        }`}
                    >
                      <option value="not_started">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Done</option>
                    </select>

                    {/* Hours */}
                    <span className="hidden sm:block text-[10px] font-bold text-neutral-400 uppercase tracking-wide w-12 text-right">
                      {task.estimated_hours ? `${task.estimated_hours}h` : '-'}
                    </span>

                    {/* Actions Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === task.id ? null : task.id); }}
                        className="p-1.5 hover:bg-neutral-100 rounded-sm transition-colors opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-900"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === task.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white rounded-sm py-1 z-20 min-w-[140px] border border-neutral-200 shadow-xl">
                          <button
                            onClick={() => { onEditTask(task); setMenuOpen(null); }}
                            className="w-full px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 flex items-center gap-2 transition-colors text-neutral-700"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="w-full px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 text-neutral-900 flex items-center gap-2 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <ChevronRight
                      className="w-4 h-4 text-neutral-300 cursor-pointer hidden sm:block hover:text-neutral-900"
                      onClick={() => onEditTask(task)}
                    />
                  </div>

                  {/* Expanded Time Entries */}
                  {isExpanded && taskTimeEntries.length > 0 && (
                    <div className="bg-neutral-50 border-t border-b border-neutral-100 px-6 py-4">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Work Logs</p>
                      <div className="space-y-2">
                        {taskTimeEntries.map(entry => (
                          <div key={entry.id} className="flex items-center gap-4 text-xs bg-white p-3 rounded-sm border border-neutral-200">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide w-24">{new Date(entry.date).toLocaleDateString()}</span>
                            <span className="font-bold text-neutral-900 w-12">{entry.hours}h</span>
                            <span className="text-neutral-600 font-medium flex-1 truncate">{entry.description || 'No description'}</span>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">{entry.user?.full_name || 'Unknown'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Quick Add Row */}
            <div className="flex items-center gap-4 px-4 py-3 bg-neutral-50/50">
              <div className="w-5 h-5 rounded-sm border-2 border-dashed border-neutral-300 flex items-center justify-center">
                <Plus className="w-3 h-3 text-neutral-400" />
              </div>
              <input
                type="text"
                placeholder="Add a task..."
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                className="flex-1 bg-transparent text-sm font-medium border-none outline-none placeholder:text-neutral-400"
              />
              {quickAddName && (
                <button
                  onClick={handleQuickAdd}
                  className="px-3 py-1 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors"
                >
                  Add
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Legacy Tasks Tab Component kept for reference - remove later
function TasksTabContentLegacy({ tasks, timeEntries = [], projectId, companyId, onTasksChange, onEditTask, onAddTask, canViewFinancials = true }: {
  tasks: Task[];
  timeEntries?: TimeEntry[];
  projectId: string;
  companyId: string;
  onTasksChange: () => void;
  onEditTask: (task: Task) => void;
  onAddTask: () => void;
  canViewFinancials?: boolean;
}) {
  const [subTab, setSubTab] = useState<TaskSubTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValues, setEditValues] = useState<Record<string, Record<string, string>>>({});
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState('');

  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string; avatar_url?: string; is_active?: boolean }[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const [parentTaskId, setParentTaskId] = useState<string | null>(null);

  useEffect(() => {
    async function loadTeam() {
      try {
        const profiles = await api.getCompanyProfiles(companyId);
        setTeamMembers(profiles?.map((p: any) => ({ id: p.id, full_name: p.full_name || "Unknown", avatar_url: p.avatar_url, is_active: true })) || []);
      } catch (e) { console.error("Load team failed:", e); }
    }
    loadTeam();
  }, [companyId]);

  const filteredTeamMembers = includeInactive ? teamMembers : teamMembers.filter(m => m.is_active !== false);
  const taskStats = { total: tasks.length, completed: tasks.filter(t => t.status === "completed").length, inProgress: tasks.filter(t => t.status === "in_progress").length, notStarted: tasks.filter(t => t.status === "not_started").length, totalHours: tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0) };
  const filteredTasks = tasks.filter(task => {
    if (hideCompleted && task.status === 'completed') return false;
    if (searchTerm && !task.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned' && task.assigned_to) return false;
      if (assigneeFilter !== 'unassigned' && task.assigned_to !== assigneeFilter) return false;
    }
    return true;
  });

  const toggleExpand = (taskId: string) => {
    const newSet = new Set(expandedTasks);
    if (newSet.has(taskId)) newSet.delete(taskId);
    else newSet.add(taskId);
    setExpandedTasks(newSet);
  };

  const startEditing = (taskId: string, field: string, currentValue: string) => {
    setEditingCell({ taskId, field });
    setEditValues(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: currentValue }
    }));
  };

  const handleEditChange = (taskId: string, field: string, value: string) => {
    setEditValues(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value }
    }));
  };

  const saveEdit = async (taskId: string, field: string) => {
    const value = editValues[taskId]?.[field];
    if (value === undefined) return;
    try {
      const updateData: Record<string, any> = {};
      if (field === 'fees') updateData.estimated_fees = parseFloat(value) || 0;
      else if (field === 'hours') updateData.estimated_hours = parseFloat(value) || 0;
      else if (field === 'due_date') updateData.due_date = value || null;
      else if (field === 'percent') updateData.completion_percentage = parseInt(value) || 0;
      await api.updateTask(taskId, updateData);
      onTasksChange();
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setEditingCell(null);
  };

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return;
    try {
      await api.createTask({ name: quickAddName.trim(), project_id: projectId, company_id: companyId, status: 'not_started' });
      setQuickAddName('');
      onTasksChange();
    } catch (error) {
      console.error('Failed to add task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.deleteTask(taskId);
      onTasksChange();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
    setMenuOpen(null);
  };

  // Simplified sub-tabs - Schedule, Allocations, Checklist hidden for now
  const subTabs: { key: TaskSubTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'editor', label: 'Editor' },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center border-b border-neutral-200 overflow-x-auto">
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${subTab === tab.key ? 'border-[#476E66] text-[#476E66]' : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Sub-tab - Consistent Design System */}
      {subTab === 'overview' && (
        <div className="space-y-3 sm:space-y-4">
          {/* Stats Card - 4 stats on top, progress bar below */}
          <div className="p-3 bg-neutral-50 rounded-lg space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* Stats Row - Reordered: To Do, In Progress, Done, Total */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-neutral-500">To Do:</span>
                <span className="text-base font-semibold text-neutral-900">{taskStats.notStarted}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-neutral-500">In Progress:</span>
                <span className="text-base font-semibold text-neutral-900">{taskStats.inProgress}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-neutral-500">Done:</span>
                <span className="text-base font-semibold text-[#476E66]">{taskStats.completed}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-neutral-500">Total:</span>
                <span className="text-base font-semibold text-neutral-900">{taskStats.total}</span>
              </div>
            </div>
            {/* Progress Bar - Full width below */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-500">Progress:</span>
              <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#476E66] rounded-full transition-all" style={{ width: `${taskStats.total > 0 ? (taskStats.completed / taskStats.total) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-semibold text-neutral-900">{taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0}%</span>
            </div>
          </div>

          {/* Tasks List with completion toggle */}
          <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-3 sm:px-4 py-2.5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900">Tasks</span>
              <button onClick={onAddTask} className="text-xs text-[#476E66] hover:text-[#3A5B54] font-medium flex items-center gap-1 transition-colors">
                <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Task</span><span className="sm:hidden">Add</span>
              </button>
            </div>
            {filteredTasks.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-neutral-500">No tasks yet. Click "Add Task" to create one.</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredTasks.map(task => {
                  const assignee = teamMembers.find(m => m.id === task.assigned_to);
                  const isCompleted = task.status === 'completed';
                  const taskTimeEntries = timeEntries.filter(te => te.task_id === task.id);
                  const isExpanded = expandedTasks.has(task.id);
                  return (
                    <div key={task.id}>
                      {/* Mobile Layout */}
                      <div className={`block sm:hidden p-3 ${isCompleted ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await api.updateTask(task.id, {
                                  status: isCompleted ? 'not_started' : 'completed',
                                  completion_percentage: isCompleted ? 0 : 100
                                });
                                onTasksChange();
                              } catch (err) { console.error(err); }
                            }}
                            className="flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all mt-0.5 flex-shrink-0"
                            style={{
                              borderColor: isCompleted ? '#476E66' : '#d1d5db',
                              backgroundColor: isCompleted ? '#476E66' : 'transparent'
                            }}
                          >
                            {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </button>
                          <div className="flex-1 min-w-0" onClick={() => onEditTask(task)}>
                            <p className={`text-sm font-medium leading-5 ${isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`} style={{ fontSize: '14px', fontWeight: '500', lineHeight: '20px' }}>{task.name}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${task.status === 'completed' ? 'bg-[#476E66]/10 text-[#476E66]' :
                                task.status === 'in_progress' ? 'bg-neutral-100 text-neutral-700' :
                                  'bg-neutral-100 text-neutral-500'
                                }`}>
                                {task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                              </span>
                              {taskTimeEntries.length > 0 && (
                                <span className="text-xs text-neutral-500 flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" /> {taskTimeEntries.length}
                                </span>
                              )}
                              {assignee && (
                                <span className="text-xs text-neutral-500 truncate max-w-[100px]">{assignee.full_name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className={`hidden sm:flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors ${isCompleted ? 'opacity-60' : ''}`}>
                        {/* Completion Toggle */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await api.updateTask(task.id, {
                                status: isCompleted ? 'not_started' : 'completed',
                                completion_percentage: isCompleted ? 0 : 100
                              });
                              onTasksChange();
                            } catch (err) { console.error(err); }
                          }}
                          className="flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0"
                          style={{
                            borderColor: isCompleted ? '#476E66' : '#d1d5db',
                            backgroundColor: isCompleted ? '#476E66' : 'transparent'
                          }}
                        >
                          {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </button>

                        {/* Task Info */}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEditTask(task)}>
                          <p className={`text-sm font-medium leading-5 ${isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`} style={{ fontSize: '14px', fontWeight: '500', lineHeight: '20px' }}>{task.name}</p>
                          {task.description && <p className="text-xs text-neutral-500 line-clamp-1">{task.description}</p>}
                        </div>

                        {/* Time Entries Badge */}
                        {taskTimeEntries.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                            className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 rounded text-xs text-neutral-600 transition-colors"
                            title="View work logs"
                          >
                            <Clock className="w-3 h-3" />
                            {taskTimeEntries.length}
                          </button>
                        )}

                        {/* Status Badge */}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${task.status === 'completed' ? 'bg-[#476E66]/10 text-[#476E66]' :
                          task.status === 'in_progress' ? 'bg-neutral-100 text-neutral-700' :
                            'bg-neutral-100 text-neutral-500'
                          }`}>
                          {task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                        </span>

                        {/* Assignee */}
                        {assignee ? (
                          <div className="flex items-center gap-1.5 w-32">
                            {assignee.avatar_url ? (
                              <img src={assignee.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-[#476E66]/20 flex items-center justify-center text-xs font-medium text-[#476E66]">
                                {assignee.full_name?.charAt(0) || '?'}
                              </div>
                            )}
                            <span className="text-xs text-neutral-600 truncate">{assignee.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400 w-32">Unassigned</span>
                        )}

                        {/* Hours */}
                        <span className="text-xs font-medium text-neutral-600 w-16 text-right">
                          {task.estimated_hours ? `${task.estimated_hours}h` : '-'}
                        </span>

                        {/* Arrow */}
                        <ChevronRight className="w-4 h-4 text-neutral-300 cursor-pointer" onClick={() => onEditTask(task)} />
                      </div>

                      {/* Expanded Time Entries */}
                      {isExpanded && taskTimeEntries.length > 0 && (
                        <div className="bg-neutral-50 border-t border-neutral-100 px-4 py-2.5 ml-9">
                          <p className="text-xs font-semibold text-neutral-700 mb-2">Work Logs</p>
                          <div className="space-y-1.5">
                            {taskTimeEntries.map(entry => (
                              <div key={entry.id} className="flex items-start gap-2.5 text-xs">
                                <span className="text-neutral-500 w-20 flex-shrink-0">{new Date(entry.date).toLocaleDateString()}</span>
                                <span className="text-neutral-900 font-semibold w-10 flex-shrink-0">{entry.hours}h</span>
                                <span className="text-neutral-700 flex-1">{entry.description || 'No description'}</span>
                                <span className="text-neutral-500">{entry.user?.full_name || 'Unknown'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Sub-tab */}
      {subTab === 'schedule' && (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 font-medium">Task Schedule</div>
          <div className="divide-y divide-neutral-100">
            {tasks.filter(t => t.due_date).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()).map(task => (
              <div key={task.id} className="px-4 py-3 flex items-center justify-between">
                <div><p className="text-sm font-medium text-neutral-900 leading-5" style={{ fontSize: '14px', fontWeight: '500', lineHeight: '20px' }}>{task.name}</p><p className="text-xs text-neutral-500">{task.estimated_hours || 0}h estimated</p></div>
                <div className="text-right">
                  <p className={`font-medium ${new Date(task.due_date!) < new Date() && task.status !== 'completed' ? 'text-neutral-900' : 'text-neutral-900'}`}>{new Date(task.due_date!).toLocaleDateString()}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : task.status === 'in_progress' ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-neutral-100 text-neutral-600'}`}>{task.status?.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
            {tasks.filter(t => t.due_date).length === 0 && <div className="px-4 py-8 text-center text-neutral-500">No tasks with due dates</div>}
          </div>
        </div>
      )}

      {/* Allocations Sub-tab */}
      {subTab === 'allocations' && (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 font-medium">Team Allocations</div>
          <div className="divide-y divide-neutral-100">
            {filteredTeamMembers.length > 0 ? filteredTeamMembers.map(member => {
              const assignedTasks = tasks.filter(t => t.assigned_to === member.id);
              const totalHours = assignedTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
              return (
                <div key={member.id} className="px-4 py-3 flex items-center justify-between">
                  <div><p className="font-medium text-neutral-900">{member.full_name}</p><p className="text-sm text-neutral-500">{assignedTasks.length} tasks assigned</p></div>
                  <div className="text-right"><p className="font-medium text-neutral-900">{totalHours}h</p><p className="text-sm text-neutral-500">allocated</p></div>
                </div>
              );
            }) : <div className="px-4 py-8 text-center text-neutral-500">No team members assigned to this project</div>}
          </div>
        </div>
      )}

      {/* Checklist Items Sub-tab */}
      {subTab === 'checklist' && (
        <div className="space-y-4">
          {tasks.map(task => (
            <div key={task.id} className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-900 leading-5" style={{ fontSize: '14px', fontWeight: '500', lineHeight: '20px' }}>{task.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : task.status === 'in_progress' ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-neutral-100 text-neutral-600'}`}>{task.status?.replace('_', ' ')}</span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={task.status === 'completed'} readOnly className="w-4 h-4 rounded border-neutral-300 text-neutral-500" />
                  <span className={task.status === 'completed' ? 'line-through text-neutral-400' : ''}>{task.description || 'No description'}</span>
                </div>
                {task.due_date && <p className="text-sm text-neutral-500 mt-2 ml-7">Due: {new Date(task.due_date).toLocaleDateString()}</p>}
              </div>
            </div>
          ))}
          {tasks.length === 0 && <div className="text-center py-8 text-neutral-500">No tasks to show</div>}
        </div>
      )}

      {/* Editor Sub-tab - Optimized & Modern with Horizontal Scroll */}
      {subTab === 'editor' && (<>
        {/* Compact Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onAddTask} className="flex items-center gap-1 px-3 py-1.5 bg-[#476E66] text-white text-xs font-medium rounded-lg hover:bg-[#3A5B54] transition-colors">
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Task</span><span className="sm:hidden">Add</span>
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 pr-3 py-1.5 w-32 sm:w-40 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" />
            </div>
            <label className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]" />
              Hide Done
            </label>
          </div>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            {filteredTeamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>

        {/* Scroll hint for mobile */}
        <p className="text-xs text-neutral-400 sm:hidden">← Swipe to see more columns →</p>

        {/* Task Table - Compact & Modern with Horizontal Scroll */}
        <div className="bg-white rounded-lg overflow-x-auto" style={{ boxShadow: 'var(--shadow-card)' }}>
          <table className="w-full min-w-[600px]">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="w-10 px-2"></th>
                <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 min-w-[180px]">Task</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 w-28">Assignee</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500 w-16">Hours</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 w-24">Due Date</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filteredTasks.map((task) => {
                const assignee = teamMembers.find(m => m.id === task.assigned_to);
                const isCompleted = task.status === 'completed';
                return (
                  <tr key={task.id} className={`hover:bg-neutral-50/50 transition-colors ${isCompleted ? 'opacity-60' : ''}`}>
                    {/* Completion Toggle */}
                    <td className="px-2 py-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await api.updateTask(task.id, {
                              status: isCompleted ? 'not_started' : 'completed',
                              completion_percentage: isCompleted ? 0 : 100
                            });
                            onTasksChange();
                          } catch (err) { console.error(err); }
                        }}
                        className="flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0"
                        style={{
                          borderColor: isCompleted ? '#476E66' : '#d1d5db',
                          backgroundColor: isCompleted ? '#476E66' : 'transparent'
                        }}
                      >
                        {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </button>
                    </td>
                    {/* Task Name */}
                    <td className="px-3 py-2 cursor-pointer" onClick={() => onEditTask(task)}>
                      <p className={`font-medium leading-5 ${isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`} style={{ fontSize: '13px', fontWeight: '500', lineHeight: '18px' }}>{task.name}</p>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2">
                      <select
                        value={task.status || 'not_started'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          try {
                            const newStatus = e.target.value;
                            await api.updateTask(task.id, {
                              status: newStatus,
                              completion_percentage: newStatus === 'completed' ? 100 : (newStatus === 'in_progress' ? 50 : 0)
                            });
                            onTasksChange();
                          } catch (err) { console.error(err); }
                        }}
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border-0 cursor-pointer ${task.status === 'completed' ? 'bg-[#476E66]/10 text-[#476E66]' :
                          task.status === 'in_progress' ? 'bg-neutral-100 text-neutral-700' :
                            'bg-neutral-100 text-neutral-500'
                          }`}
                      >
                        <option value="not_started">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Done</option>
                      </select>
                    </td>
                    {/* Assignee */}
                    <td className="px-3 py-2">
                      <select
                        value={task.assigned_to || ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          try {
                            const newAssignedTo = e.target.value || null;
                            const wasAssigned = task.assigned_to;
                            const isNewAssignment = !wasAssigned && newAssignedTo;
                            const isReassignment = wasAssigned && newAssignedTo && wasAssigned !== newAssignedTo;

                            await api.updateTask(task.id, { assigned_to: newAssignedTo });

                            // Send notification for task assignment
                            if ((isNewAssignment || isReassignment) && newAssignedTo && companyId) {
                              NotificationService.taskAssigned(
                                companyId,
                                task.name,
                                'Project', // Generic name - TasksTabContent doesn't have full project details
                                newAssignedTo,
                                task.id
                              ).catch(console.warn);
                            }

                            onTasksChange();
                          } catch (err) { console.error(err); }
                        }}
                        className="w-full px-2 py-1 text-xs border border-neutral-200 rounded-lg bg-white cursor-pointer focus:ring-1 focus:ring-[#476E66] outline-none"
                      >
                        <option value="">—</option>
                        {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </td>
                    {/* Hours */}
                    <td className="px-3 py-2 text-right">
                      {editingCell?.taskId === task.id && editingCell?.field === 'hours' ? (
                        <input
                          type="number"
                          value={editValues[task.id]?.hours ?? task.estimated_hours?.toString() ?? '0'}
                          onChange={(e) => handleEditChange(task.id, 'hours', e.target.value)}
                          onBlur={() => saveEdit(task.id, 'hours')}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(task.id, 'hours')}
                          className="w-14 px-2 py-0.5 text-right text-xs border border-neutral-300 rounded-lg outline-none focus:ring-1 focus:ring-[#476E66]"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onClick={(e) => { e.stopPropagation(); startEditing(task.id, 'hours', task.estimated_hours?.toString() || '0'); }}
                          className="cursor-pointer hover:bg-neutral-100 px-2 py-0.5 rounded-lg inline-block text-xs text-neutral-600"
                        >
                          {task.estimated_hours ? `${task.estimated_hours}h` : '-'}
                        </span>
                      )}
                    </td>
                    {/* Due Date */}
                    <td className="px-3 py-2">
                      {editingCell?.taskId === task.id && editingCell?.field === 'due_date' ? (
                        <input
                          type="date"
                          value={editValues[task.id]?.due_date ?? task.due_date?.split('T')[0] ?? ''}
                          onChange={(e) => handleEditChange(task.id, 'due_date', e.target.value)}
                          onBlur={() => saveEdit(task.id, 'due_date')}
                          className="px-2 py-0.5 text-xs border border-neutral-300 rounded-lg outline-none focus:ring-1 focus:ring-[#476E66]"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onClick={(e) => { e.stopPropagation(); startEditing(task.id, 'due_date', task.due_date?.split('T')[0] || ''); }}
                          className="cursor-pointer hover:bg-neutral-100 px-2 py-0.5 rounded-lg inline-block text-xs text-neutral-600 whitespace-nowrap"
                        >
                          {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                        </span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="px-1 py-2 relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === task.id ? null : task.id); }}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-neutral-400" />
                      </button>
                      {menuOpen === task.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg py-1 z-20 min-w-[100px]" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                          <button onClick={() => { onEditTask(task); setMenuOpen(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50 flex items-center gap-1.5 transition-colors">
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          <button onClick={() => handleDeleteTask(task.id)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50 text-red-600 flex items-center gap-1.5 transition-colors">
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Quick Add Row */}
              <tr className="bg-neutral-50/30">
                <td className="px-2 py-2"><Plus className="w-4 h-4 text-neutral-300" /></td>
                <td className="px-3 py-2" colSpan={6}>
                  <input
                    type="text"
                    placeholder="Add new task..."
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                    className="w-full text-xs bg-transparent border-none outline-none placeholder:text-neutral-400"
                    style={{ fontSize: '13px' }}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {filteredTasks.length === 0 && !quickAddName && (
          <div className="text-center py-6 text-neutral-500">
            <p className="text-sm">No tasks yet.</p>
            <button onClick={onAddTask} className="text-[#476E66] hover:text-[#3A5B54] text-sm font-medium mt-1">Create your first task</button>
          </div>
        )}
      </>)}
    </div>
  );
}

function TaskTableRow({ task, editingCell, editValues, onStartEditing, onEditChange, onSaveEdit, menuOpen, setMenuOpen, onEdit, onDelete, onAddSubTask, teamMembers, onAssignmentChange, onStatusChange, onUnitChange, canViewFinancials = true }: {
  task: Task; editingCell: { taskId: string; field: string } | null; editValues: Record<string, Record<string, string>>; onStartEditing: (taskId: string, field: string, value: string) => void; onEditChange: (taskId: string, field: string, value: string) => void; onSaveEdit: (taskId: string, field: string) => void; menuOpen: string | null; setMenuOpen: (id: string | null) => void; onEdit: () => void; onDelete: () => void; onAddSubTask: () => void; teamMembers: { id: string; full_name: string; avatar_url?: string; is_active?: boolean }[]; onAssignmentChange: (taskId: string, userId: string) => void; onStatusChange: (taskId: string, status: string) => void; onUnitChange: (taskId: string, unit: 'hours' | 'unit') => void; canViewFinancials?: boolean;
}) {
  const isEditing = (field: string) => editingCell?.taskId === task.id && editingCell?.field === field;
  const getValue = (field: string, defaultValue: string) => editValues[task.id]?.[field] ?? defaultValue;
  const formatCurrency = (val?: number) => val ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00';
  const estimate = (task.estimated_hours || 0) * 150; // Default rate $150/hr
  const isCompleted = task.status === 'completed';

  return (
    <tr className={`hover:bg-neutral-100/30 group ${isCompleted ? 'opacity-60' : ''}`}>
      {/* Completion Radio Button */}
      <td className="px-2 py-2">
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, isCompleted ? 'not_started' : 'completed'); }}
          className="flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all duration-200 hover:scale-110"
          style={{
            borderColor: isCompleted ? '#10b981' : '#d1d5db',
            backgroundColor: isCompleted ? '#10b981' : 'transparent'
          }}
        >
          {isCompleted && (
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          )}
        </button>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-neutral-300" />
          <span className={`text-sm font-medium leading-5 ${isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`} style={{ fontSize: '14px', fontWeight: '500', lineHeight: '20px' }}>{task.name}</span>
        </div>
      </td>
      {canViewFinancials && (
        <td className="px-4 py-2 text-right">
          {isEditing('fees') ? (
            <input type="number" value={getValue('fees', task.estimated_fees?.toString() || '0')} onChange={(e) => onEditChange(task.id, 'fees', e.target.value)} onBlur={() => onSaveEdit(task.id, 'fees')} onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(task.id, 'fees')} className="w-full px-2 py-1 text-right text-sm border border-neutral-300 rounded outline-none" autoFocus />
          ) : (
            <span onClick={() => onStartEditing(task.id, 'fees', task.estimated_fees?.toString() || '0')} className="cursor-pointer hover:bg-neutral-100 px-2 py-1 rounded inline-block">{formatCurrency(task.estimated_fees)}</span>
          )}
        </td>
      )}
      <td className="px-4 py-2 text-right">
        {isEditing('hours') ? (
          <input type="number" value={getValue('hours', task.estimated_hours?.toString() || '0')} onChange={(e) => onEditChange(task.id, 'hours', e.target.value)} onBlur={() => onSaveEdit(task.id, 'hours')} onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(task.id, 'hours')} className="w-full px-2 py-1 text-right text-sm border border-neutral-300 rounded outline-none" autoFocus />
        ) : (
          <span onClick={() => onStartEditing(task.id, 'hours', task.estimated_hours?.toString() || '0')} className="cursor-pointer hover:bg-neutral-100 px-2 py-1 rounded inline-block">{task.estimated_hours || '0'}</span>
        )}
      </td>
      <td className="px-4 py-2 text-center">
        <select
          value={task.billing_unit || 'hours'}
          onChange={(e) => onUnitChange(task.id, e.target.value as 'hours' | 'unit')}
          className="px-2 py-1 text-sm border border-neutral-200 rounded bg-white hover:border-neutral-300 focus:border-neutral-500 focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer"
        >
          <option value="hours">Hours</option>
          <option value="unit">Unit</option>
        </select>
      </td>
      <td className="px-4 py-2">
        {isEditing('due_date') ? (
          <input type="date" value={getValue('due_date', task.due_date?.split('T')[0] || '')} onChange={(e) => onEditChange(task.id, 'due_date', e.target.value)} onBlur={() => onSaveEdit(task.id, 'due_date')} className="px-2 py-1 text-sm border border-neutral-300 rounded outline-none" autoFocus />
        ) : (
          <span onClick={() => onStartEditing(task.id, 'due_date', task.due_date?.split('T')[0] || '')} className="cursor-pointer hover:bg-neutral-100 px-2 py-1 rounded inline-block text-neutral-600">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</span>
        )}
      </td>
      <td className="px-4 py-2">
        {(() => {
          const assignee = teamMembers.find(m => m.id === task.assigned_to);
          return (
            <div className="relative group">
              <div className="flex items-center gap-2">
                {assignee ? (
                  <>
                    {assignee.avatar_url ? (
                      <img src={assignee.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[#476E66]/20 flex items-center justify-center text-xs font-medium text-neutral-900-700">
                        {assignee.full_name?.charAt(0) || '?'}
                      </div>
                    )}
                    <span className="text-sm text-neutral-700 truncate max-w-[80px]">{assignee.full_name}</span>
                  </>
                ) : (
                  <span className="text-sm text-neutral-400">Unassigned</span>
                )}
              </div>
              <select
                className={`absolute inset-0 w-full ${canViewFinancials ? 'opacity-0 cursor-pointer' : 'opacity-0 pointer-events-none'}`}
                value={task.assigned_to || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onAssignmentChange(task.id, e.target.value)}
                disabled={!canViewFinancials}
              >
                <option value="">Unassigned</option>
                {teamMembers.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
              </select>
            </div>
          );
        })()}
      </td>
      {canViewFinancials && <td className="px-4 py-2 text-right text-neutral-600">{formatCurrency(estimate)}</td>}
      <td className="px-4 py-2 text-right">
        {isEditing('percent') ? (
          <input type="number" min="0" max="100" value={getValue('percent', (task.completion_percentage || 0).toString())} onChange={(e) => onEditChange(task.id, 'percent', e.target.value)} onBlur={() => onSaveEdit(task.id, 'percent')} onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(task.id, 'percent')} className="w-16 px-2 py-1 text-right text-sm border border-neutral-300 rounded outline-none" autoFocus />
        ) : (
          <div className="flex items-center justify-end gap-2">
            <div className="w-12 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-1000 rounded-full transition-all"
                style={{ width: `${task.completion_percentage || 0}%` }}
              />
            </div>
            <span onClick={() => onStartEditing(task.id, 'percent', (task.completion_percentage || 0).toString())} className="cursor-pointer hover:bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-medium text-neutral-600 min-w-[32px] text-right">{task.completion_percentage || 0}%</span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 relative">
        <button onClick={() => setMenuOpen(menuOpen === task.id ? null : task.id)} className="p-1.5 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-600">
          <MoreVertical className="w-4 h-4" />
        </button>
        {menuOpen === task.id && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 z-20 min-w-[140px]">
            <button onClick={onEdit} className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2"><Edit2 className="w-4 h-4" /> Edit</button>
            <button onClick={onAddSubTask} className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Sub-task</button>
            <button onClick={onDelete} className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 text-neutral-900 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
          </div>
        )}
      </td>
    </tr>
  );
}

// Inline Invoice Creation Modal for Projects
function ProjectInvoiceModal({ project, tasks, timeEntries, expenses, invoices, companyId, clientId, defaultHourlyRate, onClose, onSave }: {
  project: Project;
  tasks: Task[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  invoices: Invoice[];
  companyId: string;
  clientId: string;
  defaultHourlyRate: number;
  onClose: () => void;
  onSave: (invoiceId?: string) => void;
}) {
  const navigate = useNavigate();
  const [billingType, setBillingType] = useState<'time_materials' | 'milestone' | 'percentage'>('time_materials');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [taskPercentages, setTaskPercentages] = useState<Map<string, number>>(new Map());
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<Set<string>>(new Set());
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [includeAllocatedFees, setIncludeAllocatedFees] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [saving, setSaving] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate project invoice status
  const projectInvoiceStatus = useMemo(() => {
    const projectBudget = project.budget || 0;
    const tasksBudgetTotal = tasks.reduce((sum, t) => sum + (t.total_budget || t.estimated_fees || 0), 0);
    const totalBudget = projectBudget > 0 ? projectBudget : tasksBudgetTotal;
    const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const remainingToBill = Math.max(0, totalBudget - totalInvoiced);
    const isFullyInvoiced = totalBudget > 0 && totalInvoiced >= totalBudget;
    const isOverInvoiced = totalBudget > 0 && totalInvoiced > totalBudget;
    return { totalBudget, totalInvoiced, remainingToBill, isFullyInvoiced, isOverInvoiced };
  }, [project.budget, tasks, invoices]);

  const unbilledTimeEntries = timeEntries.filter(e => e.billable && !e.invoice_id);
  const unbilledExpenses = expenses.filter(e => e.billable && e.status !== 'invoiced');

  // Helper to get rate for a time entry
  const getEntryRate = (entry: TimeEntry) => entry.hourly_rate || defaultHourlyRate;
  const getEntryTotal = (entry: TimeEntry) => Number(entry.hours) * getEntryRate(entry);

  // Calculate task fees total with useMemo for proper reactivity
  const taskFeesTotal = useMemo(() => {
    if (billingType === 'milestone') {
      // Bill full remaining amount for selected tasks
      return tasks
        .filter(t => selectedTasks.has(t.id))
        .reduce((sum, t) => {
          const totalBudget = t.total_budget || t.estimated_fees || 0;
          const billedPct = t.billed_percentage || 0;
          const remainingAmt = (totalBudget * (100 - billedPct)) / 100;
          return sum + remainingAmt;
        }, 0);
    } else if (billingType === 'percentage') {
      // Bill specified percentage for selected tasks
      return tasks
        .filter(t => selectedTasks.has(t.id))
        .reduce((sum, t) => {
          const totalBudget = t.total_budget || t.estimated_fees || 0;
          const billedPct = t.billed_percentage || 0;
          const remainingPct = 100 - billedPct;
          const pctToBill = Math.min(taskPercentages.get(t.id) || 10, remainingPct);
          return sum + (totalBudget * pctToBill) / 100;
        }, 0);
    } else {
      // Standard item-based billing - use remaining amount
      return tasks
        .filter(t => selectedTasks.has(t.id))
        .reduce((sum, t) => {
          const totalBudget = t.total_budget || t.estimated_fees || 0;
          const billedPct = t.billed_percentage || 0;
          const remainingAmt = (totalBudget * (100 - billedPct)) / 100;
          return sum + remainingAmt;
        }, 0);
    }
  }, [billingType, selectedTasks, taskPercentages, tasks]);

  const timeEntriesTotal = unbilledTimeEntries
    .filter(e => selectedTimeEntries.has(e.id))
    .reduce((sum, e) => sum + getEntryTotal(e), 0);

  const expensesTotal = unbilledExpenses
    .filter(e => selectedExpenses.has(e.id))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const allocatedFeesTotal = includeAllocatedFees ? (project.budget || 0) : 0;

  const subtotal = taskFeesTotal + timeEntriesTotal + expensesTotal + allocatedFeesTotal + (parseFloat(customAmount) || 0);
  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const toggleTask = (taskId: string) => {
    const newSet = new Set(selectedTasks);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
      // Set default percentage for percentage billing (always set it)
      if (billingType === 'percentage') {
        const task = tasks.find(t => t.id === taskId);
        const remainingPct = 100 - (task?.billed_percentage || 0);
        const newPcts = new Map(taskPercentages);
        newPcts.set(taskId, Math.min(10, remainingPct));
        setTaskPercentages(newPcts);
      }
    }
    setSelectedTasks(newSet);
  };

  const updateTaskPercentage = (taskId: string, pct: number) => {
    const task = tasks.find(t => t.id === taskId);
    const remainingPct = 100 - (task?.billed_percentage || 0);
    const validPct = Math.max(0, Math.min(pct, remainingPct));
    const newPcts = new Map(taskPercentages);
    newPcts.set(taskId, validPct);
    setTaskPercentages(newPcts);
  };

  const toggleTimeEntry = (entryId: string) => {
    const newSet = new Set(selectedTimeEntries);
    if (newSet.has(entryId)) newSet.delete(entryId);
    else newSet.add(entryId);
    setSelectedTimeEntries(newSet);
  };

  const selectAllTasks = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set());
    } else {
      const newSet = new Set(tasks.map(t => t.id));
      setSelectedTasks(newSet);
      // Set default percentages for percentage billing
      if (billingType === 'percentage') {
        const newPcts = new Map(taskPercentages);
        tasks.forEach(t => {
          if (!newPcts.has(t.id)) {
            const remainingPct = 100 - (t.billed_percentage || 0);
            newPcts.set(t.id, Math.min(10, remainingPct));
          }
        });
        setTaskPercentages(newPcts);
      }
    }
  };

  const selectAllTimeEntries = () => {
    if (selectedTimeEntries.size === unbilledTimeEntries.length) {
      setSelectedTimeEntries(new Set());
    } else {
      setSelectedTimeEntries(new Set(unbilledTimeEntries.map(e => e.id)));
    }
  };

  const toggleExpense = (expenseId: string) => {
    const newSet = new Set(selectedExpenses);
    if (newSet.has(expenseId)) newSet.delete(expenseId);
    else newSet.add(expenseId);
    setSelectedExpenses(newSet);
  };

  const selectAllExpenses = () => {
    if (selectedExpenses.size === unbilledExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(unbilledExpenses.map(e => e.id)));
    }
  };

  const handleSubmit = async () => {
    if (total <= 0) {
      setError('Please select items or enter an amount');
      return;
    }

    // Validate billing mode compatibility for selected tasks
    if (billingType === 'milestone' || billingType === 'percentage') {
      const incompatibleTasks = tasks.filter(t =>
        selectedTasks.has(t.id) &&
        t.billing_mode &&
        t.billing_mode !== 'unset' &&
        t.billing_mode !== billingType
      );
      if (incompatibleTasks.length > 0) {
        setError(`Cannot bill: Task "${incompatibleTasks[0].name}" is set to ${incompatibleTasks[0].billing_mode} billing mode`);
        return;
      }
    }

    setError(null);
    setSaving(true);
    try {
      if (billingType === 'milestone' || billingType === 'percentage') {
        // Create invoice with task billing tracking
        const taskBillings = Array.from(selectedTasks).map(taskId => {
          const task = tasks.find(t => t.id === taskId)!;
          const totalBudget = task.total_budget || task.estimated_fees || 0;
          const billedPct = task.billed_percentage || 0;
          const remainingPct = 100 - billedPct;

          let percentageToBill: number;
          let amountToBill: number;

          if (billingType === 'milestone') {
            percentageToBill = remainingPct;
            amountToBill = (totalBudget * remainingPct) / 100;
          } else {
            percentageToBill = Math.min(taskPercentages.get(taskId) || 0, remainingPct);
            amountToBill = (totalBudget * percentageToBill) / 100;
          }

          return {
            taskId,
            billingType,
            percentageToBill,
            amountToBill,
            totalBudget,
            previousBilledPercentage: billedPct,
            previousBilledAmount: task.billed_amount || 0,
          };
        });

        const newInvoice = await api.createInvoiceWithTaskBilling({
          company_id: companyId,
          client_id: clientId,
          project_id: project.id,
          invoice_number: `INV-${Date.now().toString().slice(-6)}`,
          subtotal,
          tax_amount: taxAmount,
          total,
          due_date: dueDate || null,
          status: 'draft',
          calculator_type: billingType,
        }, taskBillings);

        // Link selected time entries to the invoice
        if (selectedTimeEntries.size > 0) {
          for (const entryId of selectedTimeEntries) {
            const entry = unbilledTimeEntries.find(e => e.id === entryId);
            if (entry) {
              await supabase.from('time_entries').update({ invoice_id: newInvoice.id }).eq('id', entryId);
              // Create line item for time entry
              await supabase.from('invoice_line_items').insert({
                invoice_id: newInvoice.id,
                description: entry.description || 'Time Entry',
                quantity: Number(entry.hours),
                unit_price: getEntryRate(entry),
                amount: getEntryTotal(entry),
                unit: 'hr',
              });
            }
          }
        }

        // Link selected expenses to the invoice
        if (selectedExpenses.size > 0) {
          for (const expenseId of selectedExpenses) {
            const expense = unbilledExpenses.find(e => e.id === expenseId);
            if (expense) {
              await supabase.from('expenses').update({ invoice_id: newInvoice.id, status: 'invoiced' }).eq('id', expenseId);
              // Create line item for expense
              await supabase.from('invoice_line_items').insert({
                invoice_id: newInvoice.id,
                description: `${expense.description} - ${expense.category || 'Expense'}`,
                quantity: 1,
                unit_price: expense.amount,
                amount: expense.amount,
                unit: 'unit',
              });
            }
          }
        }

        setCreatedInvoiceId(newInvoice.id);
      } else {
        // Standard invoice creation
        const invoiceData = {
          company_id: companyId,
          client_id: clientId,
          project_id: project.id,
          invoice_number: `INV-${Date.now().toString().slice(-6)}`,
          subtotal,
          tax_amount: taxAmount,
          total,
          due_date: dueDate || null,
          status: 'draft' as const,
        };
        const newInvoice = await api.createInvoice(invoiceData);

        // Link selected time entries to the invoice
        if (selectedTimeEntries.size > 0) {
          for (const entryId of selectedTimeEntries) {
            const entry = unbilledTimeEntries.find(e => e.id === entryId);
            if (entry) {
              await supabase.from('time_entries').update({ invoice_id: newInvoice.id }).eq('id', entryId);
              // Create line item for time entry
              await supabase.from('invoice_line_items').insert({
                invoice_id: newInvoice.id,
                description: entry.description || 'Time Entry',
                quantity: Number(entry.hours),
                unit_price: getEntryRate(entry),
                amount: getEntryTotal(entry),
                unit: 'hr',
              });
            }
          }
        }

        // Link selected expenses to the invoice
        if (selectedExpenses.size > 0) {
          for (const expenseId of selectedExpenses) {
            const expense = unbilledExpenses.find(e => e.id === expenseId);
            if (expense) {
              await supabase.from('expenses').update({ invoice_id: newInvoice.id, status: 'invoiced' }).eq('id', expenseId);
              // Create line item for expense
              await supabase.from('invoice_line_items').insert({
                invoice_id: newInvoice.id,
                description: `${expense.description} - ${expense.category || 'Expense'}`,
                quantity: 1,
                unit_price: expense.amount,
                amount: expense.amount,
                unit: 'unit',
              });
            }
          }
        }

        setCreatedInvoiceId(newInvoice.id);
      }
    } catch (err: any) {
      console.error('Failed to create invoice:', err);
      setError(err?.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // Success state
  if (createdInvoiceId) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-sm p-5 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-1.5">Invoice Created!</h2>
          <p className="text-sm text-neutral-500 mb-5">Your invoice for {formatCurrency(total)} has been created as a draft.</p>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(createdInvoiceId)}
              className="flex-1 px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Stay Here
            </button>
            <button
              onClick={() => navigate('/invoicing')}
              className="flex-1 px-4 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors flex items-center justify-center gap-1.5 font-medium"
            >
              <ExternalLink className="w-4 h-4" /> View Invoice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-neutral-900">Create Invoice</h2>
            <p className="text-xs text-neutral-500 truncate mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-lg flex-shrink-0 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs mb-3">{error}</div>
          )}

          {/* Over-billing Warning */}
          {projectInvoiceStatus.isFullyInvoiced && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Project Fully Invoiced</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This project has been invoiced {formatCurrency(projectInvoiceStatus.totalInvoiced)} against a budget of {formatCurrency(projectInvoiceStatus.totalBudget)}.
                    Creating another invoice may result in over-billing.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {/* Billing Type Selector - Compact & Modern */}
            <div>
              <label className="block text-[10px] font-semibold text-neutral-600 mb-1.5 uppercase tracking-wide">Billing Method</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => { setBillingType('time_materials'); setSelectedTasks(new Set()); }}
                  className={`p-1.5 rounded-lg text-left transition-all border ${billingType === 'time_materials'
                    ? 'bg-[#476E66]/10 border-[#476E66]'
                    : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                >
                  <p className={`font-semibold text-xs ${billingType === 'time_materials' ? 'text-[#476E66]' : 'text-neutral-900'}`}>Time & Materials</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Hours + expenses</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setBillingType('milestone'); setSelectedTasks(new Set()); }}
                  className={`p-1.5 rounded-lg text-left transition-all border ${billingType === 'milestone'
                    ? 'bg-[#476E66]/10 border-[#476E66]'
                    : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                >
                  <p className={`font-semibold text-xs ${billingType === 'milestone' ? 'text-[#476E66]' : 'text-neutral-900'}`}>By Milestone</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Bill full remaining</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setBillingType('percentage'); setSelectedTasks(new Set()); }}
                  className={`p-1.5 rounded-lg text-left transition-all border ${billingType === 'percentage'
                    ? 'bg-[#476E66]/10 border-[#476E66]'
                    : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                >
                  <p className={`font-semibold text-xs ${billingType === 'percentage' ? 'text-[#476E66]' : 'text-neutral-900'}`}>By Percentage</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Bill % of budget</p>
                </button>
              </div>
            </div>

            {/* Allocated Project Fees - Modern Card */}
            {billingType === 'time_materials' && project.budget && project.budget > 0 && (
              <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAllocatedFees}
                    onChange={(e) => setIncludeAllocatedFees(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66] flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs text-neutral-900">Project Budget (Fixed Fee)</p>
                    <p className="text-[10px] text-neutral-400">Allocated project budget</p>
                  </div>
                  <span className="font-semibold text-xs text-neutral-900 flex-shrink-0">{formatCurrency(project.budget)}</span>
                </label>
              </div>
            )}

            {/* Tasks - Only show for Milestone and Percentage modes */}
            {(billingType === 'milestone' || billingType === 'percentage') && tasks.length > 0 && (() => {
              const availableTasks = tasks.filter(t => {
                const billedPct = t.billed_percentage || 0;
                const remainingPct = 100 - billedPct;
                const isFullyBilled = remainingPct <= 0;
                const taskMode = t.billing_mode || 'unset';
                const isModeLocked = taskMode !== 'unset';
                const isModeIncompatible = isModeLocked && taskMode !== billingType;
                return !isFullyBilled && !isModeIncompatible;
              });
              const allTasksFullyBilled = tasks.every(t => (100 - (t.billed_percentage || 0)) <= 0);

              if (availableTasks.length === 0) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <CheckCircle2 className="w-5 h-5 text-amber-600" />
                    </div>
                    <p className="text-sm font-semibold text-amber-800">
                      {allTasksFullyBilled ? 'All Tasks Fully Billed' : 'No Billable Tasks Available'}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      {allTasksFullyBilled
                        ? 'All tasks in this project have been 100% billed. Add new tasks or use additional charges below.'
                        : 'Tasks are locked to a different billing mode. Switch modes or add new tasks.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-center justify-between px-2.5 py-2 bg-neutral-50">
                    <div className="flex items-center gap-2">
                      {billingType === 'milestone' && (
                        <input
                          type="checkbox"
                          checked={selectedTasks.size === availableTasks.length && availableTasks.length > 0}
                          onChange={selectAllTasks}
                          className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                        />
                      )}
                      <span className="font-semibold text-xs text-neutral-900">Tasks ({availableTasks.length} available)</span>
                    </div>
                    <span className="text-[10px] font-semibold text-neutral-500">{formatCurrency(taskFeesTotal)} selected</span>
                  </div>
                  <div className="divide-y divide-neutral-50 max-h-60 overflow-y-auto">
                    {tasks.map(task => {
                      const totalBudget = task.total_budget || task.estimated_fees || 0;
                      const billedPct = task.billed_percentage || 0;
                      const remainingPct = 100 - billedPct;
                      const remainingAmt = (totalBudget * remainingPct) / 100;
                      const isFullyBilled = remainingPct <= 0;
                      const isSelected = selectedTasks.has(task.id);
                      const taskMode = task.billing_mode || 'unset';
                      const isModeLocked = taskMode !== 'unset';
                      const isModeIncompatible = isModeLocked && taskMode !== billingType;
                      const isDisabled = isFullyBilled || isModeIncompatible;

                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 transition-colors ${isDisabled ? 'bg-neutral-50 opacity-50' : 'hover:bg-neutral-50/50'} ${billingType === 'milestone' ? 'cursor-pointer' : ''}`}
                          onClick={billingType === 'milestone' && !isDisabled ? () => toggleTask(task.id) : undefined}
                          title={isModeIncompatible ? `Task locked to ${taskMode} billing` : undefined}
                        >
                          {billingType === 'milestone' && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabled}
                              onChange={() => toggleTask(task.id)}
                              className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66] flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-semibold text-neutral-900 truncate">{task.name}</p>
                              {isModeLocked && (
                                <span className={`text-[9px] px-1 py-0.5 rounded-full font-semibold ${taskMode === 'time' ? 'bg-[#476E66]/10 text-[#476E66]' :
                                  taskMode === 'percentage' ? 'bg-purple-100 text-purple-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                  {taskMode === 'time' ? 'T&M' : taskMode === 'percentage' ? '%' : 'MS'}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-neutral-500">
                              {task.estimated_hours || 0}h estimated
                              {billedPct > 0 && (
                                <span className="ml-1">• {billedPct}% billed</span>
                              )}
                            </p>
                          </div>

                          {/* Milestone: show remaining amount */}
                          {billingType === 'milestone' && (
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-xs text-neutral-900">{formatCurrency(remainingAmt)}</p>
                              <p className="text-[10px] text-neutral-500">{remainingPct}% left</p>
                            </div>
                          )}

                          {/* Percentage: show percentage input always visible */}
                          {billingType === 'percentage' && (
                            <div className="flex items-center gap-3">
                              <div className="text-right text-xs">
                                <p className="text-neutral-400">Prior</p>
                                <p className="font-medium text-neutral-600">{formatCurrency((totalBudget * billedPct) / 100)}</p>
                                <p className="text-neutral-400">{billedPct}%</p>
                              </div>
                              {!isDisabled && (
                                <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const current = taskPercentages.get(task.id) || 0;
                                      if (current > 5) updateTaskPercentage(task.id, current - 5);
                                    }}
                                    className="w-7 h-7 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 rounded"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={taskPercentages.get(task.id) || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      if (val >= 0 && val <= remainingPct) {
                                        updateTaskPercentage(task.id, val);
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={(e) => e.target.select()}
                                    className="w-12 px-1 py-1 text-sm border-0 bg-white rounded text-center font-medium"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const current = taskPercentages.get(task.id) || 0;
                                      if (current + 5 <= remainingPct) updateTaskPercentage(task.id, current + 5);
                                    }}
                                    className="w-7 h-7 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 rounded"
                                  >
                                    +
                                  </button>
                                  <span className="text-xs text-neutral-500 ml-1">%</span>
                                </div>
                              )}
                              <div className="text-right min-w-[70px] text-xs">
                                <p className="text-neutral-400">Current</p>
                                <p className="font-medium text-green-600">{formatCurrency((totalBudget * (taskPercentages.get(task.id) || 0)) / 100)}</p>
                                <p className="text-green-600">{taskPercentages.get(task.id) || 0}%</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Unbilled Time Entries */}
            {billingType === 'time_materials' && unbilledTimeEntries.length > 0 && (
              <div className="bg-white rounded-sm border border-neutral-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTimeEntries.size === unbilledTimeEntries.length && unbilledTimeEntries.length > 0}
                      onChange={selectAllTimeEntries}
                      className="w-4 h-4 rounded-sm border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                    />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Time Entries ({unbilledTimeEntries.length})</span>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">{formatCurrency(timeEntriesTotal)} selected</span>
                </div>
                <div className="divide-y divide-neutral-50 max-h-48 overflow-y-auto">
                  {unbilledTimeEntries.map(entry => {
                    const rate = getEntryRate(entry);
                    const entryTotal = getEntryTotal(entry);
                    const rateSource = entry.hourly_rate ? 'entry' : 'default';
                    return (
                      <label key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedTimeEntries.has(entry.id)}
                          onChange={() => toggleTimeEntry(entry.id)}
                          className="w-4 h-4 rounded-sm border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {entry.task?.name && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-sm font-bold uppercase tracking-wide">{entry.task.name}</span>
                            )}
                            <p className="text-xs font-bold text-neutral-900 truncate">{entry.description || 'Time entry'}</p>
                          </div>
                          <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide">
                            {new Date(entry.date).toLocaleDateString()} • {entry.hours}h @ ${rate}/hr
                            {rateSource === 'entry' && <span className="ml-1 text-neutral-400">(custom)</span>}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-neutral-900">{formatCurrency(entryTotal)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unbilled Expenses */}
            {billingType === 'time_materials' && unbilledExpenses.length > 0 && (
              <div className="bg-white rounded-sm border border-neutral-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedExpenses.size === unbilledExpenses.length && unbilledExpenses.length > 0}
                      onChange={selectAllExpenses}
                      className="w-4 h-4 rounded-sm border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                    />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Expenses ({unbilledExpenses.length})</span>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">{formatCurrency(expensesTotal)} selected</span>
                </div>
                <div className="divide-y divide-neutral-50 max-h-48 overflow-y-auto">
                  {unbilledExpenses.map(expense => (
                    <label key={expense.id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedExpenses.has(expense.id)}
                        onChange={() => toggleExpense(expense.id)}
                        className="w-4 h-4 rounded-sm border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-900 truncate mb-0.5">{expense.description}</p>
                        <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide">
                          {new Date(expense.date).toLocaleDateString()}
                          {expense.category && <span className="ml-1">• {expense.category}</span>}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-neutral-900">{formatCurrency(expense.amount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Amount & Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5 uppercase tracking-widest">Additional Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-10 pl-7 pr-3 text-sm font-medium rounded-sm border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5 uppercase tracking-widest">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-medium rounded-sm border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none transition-colors uppercase tracking-wide"
                />
              </div>
            </div>

            {/* Billing Summary for Percentage Type */}
            {billingType === 'percentage' && selectedTasks.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-1.5">
                <h4 className="font-semibold text-xs text-blue-900 mb-1">Billing Summary</h4>
                <div className="flex justify-between text-xs">
                  <span className="text-blue-700">Prior Billed (Total)</span>
                  <span className="font-semibold text-blue-900">
                    {formatCurrency(tasks.filter(t => selectedTasks.has(t.id)).reduce((sum, t) => {
                      const totalBudget = t.total_budget || t.estimated_fees || 0;
                      const billedPct = t.billed_percentage || 0;
                      return sum + (totalBudget * billedPct) / 100;
                    }, 0))}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-green-700">Current Invoice</span>
                  <span className="font-semibold text-green-700">{formatCurrency(taskFeesTotal)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1.5 border-t border-blue-200">
                  <span className="text-blue-700">After This Invoice</span>
                  <span className="font-semibold text-blue-900">
                    {formatCurrency(tasks.filter(t => selectedTasks.has(t.id)).reduce((sum, t) => {
                      const totalBudget = t.total_budget || t.estimated_fees || 0;
                      const billedPct = t.billed_percentage || 0;
                      const currentPct = taskPercentages.get(t.id) || 0;
                      return sum + (totalBudget * (billedPct + currentPct)) / 100;
                    }, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="border-t border-neutral-100 px-6 py-4 flex-shrink-0 bg-neutral-50/30">
          {/* Total Summary */}
          <div className="bg-[#476E66] text-white rounded-sm p-4 space-y-2 mb-4 shadow-sm">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
              <span className="text-white/70">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-white/70">Tax</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/20 uppercase tracking-widest">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 bg-white rounded-sm hover:bg-neutral-50 transition-colors text-neutral-600 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || total <= 0}
              className="flex-1 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Add Team Member Modal
function AddTeamMemberModal({ projectId, companyId, existingMemberIds, companyProfiles, onClose, onSave }: {
  projectId: string;
  companyId: string;
  existingMemberIds: string[];
  companyProfiles: { id: string; full_name?: string; avatar_url?: string; email?: string; role?: string }[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState('Team Member');
  const [isLead, setIsLead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableProfiles = companyProfiles.filter(p => !existingMemberIds.includes(p.id));

  const handleSubmit = async () => {
    if (!selectedUserId) {
      setError('Please select a team member');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addProjectTeamMember(projectId, selectedUserId, companyId, role, isLead);
      onSave();
    } catch (err: any) {
      console.error('Failed to add team member:', err);
      setError(err?.message || 'Failed to add team member. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-neutral-900">Add Team Member</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Select Team Member</label>
            <select
              value={selectedUserId}
              onChange={(e) => { setSelectedUserId(e.target.value); setError(null); }}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
            >
              <option value="">Choose a team member...</option>
              {availableProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email} {profile.role && `(${profile.role})`}
                </option>
              ))}
            </select>
            {availableProfiles.length === 0 && (
              <p className="text-sm text-neutral-500 mt-1">All team members are already assigned to this project</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Project Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Developer, Designer, Project Manager"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isLead}
              onChange={(e) => setIsLead(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
            />
            <span className="text-sm text-neutral-700">Project Lead</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !selectedUserId}
              className="flex-1 px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Inline Billing Invoice View - Shows invoice details within the billing tab
function InlineBillingInvoiceView({
  invoice,
  project,
  tasks,
  timeEntries,
  expenses,
  companyId,
  onBack,
  onUpdate,
  formatCurrency
}: {
  invoice: Invoice;
  project: Project | null;
  tasks: Task[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  companyId: string;
  onBack: () => void;
  onUpdate: () => void;
  formatCurrency: (amount?: number) => string;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'preview' | 'detail' | 'time' | 'expenses'>('preview');
  const [calculatorType, setCalculatorType] = useState(invoice.calculator_type || 'time_material');
  const [lineItems, setLineItems] = useState<{ id: string; description: string; quantity: number; rate: number; amount: number; unit?: string; taskId?: string; taskBudget?: number; billedPct?: number; priorBilledPct?: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number || '');
  const [terms, setTerms] = useState('Net 30');
  const [status, setStatus] = useState(invoice.status || 'draft');
  const [sentDate, setSentDate] = useState(invoice.sent_date || '');
  const [dueDate, setDueDate] = useState(invoice.due_date || '');
  const [notes, setNotes] = useState('');

  // Calculate due date based on sent date and terms
  const calculateDueDate = (sent: string, termValue: string) => {
    if (!sent) return '';
    const sentDateObj = new Date(sent);
    let daysToAdd = 30;
    if (termValue === 'Due on Receipt') daysToAdd = 0;
    else if (termValue === 'Net 15') daysToAdd = 15;
    else if (termValue === 'Net 30' || termValue === '1% 10 Net 30' || termValue === '2% 10 Net 30') daysToAdd = 30;
    else if (termValue === 'Net 45') daysToAdd = 45;
    else if (termValue === 'Net 60') daysToAdd = 60;
    sentDateObj.setDate(sentDateObj.getDate() + daysToAdd);
    return sentDateObj.toISOString().split('T')[0];
  };

  // Update due date when sent date or terms change
  useEffect(() => {
    if (sentDate && terms) {
      const calculatedDue = calculateDueDate(sentDate, terms);
      setDueDate(calculatedDue);
    }
  }, [sentDate, terms]);

  useEffect(() => {
    // Load line items - first try from invoice_line_items table, then fallback to tasks
    async function loadLineItems() {
      try {
        // First, try to load saved line items from invoice_line_items table
        const { data: savedLineItems } = await supabase
          .from('invoice_line_items')
          .select('id, description, quantity, unit_price, amount, billing_type, billed_percentage, task_id, unit')
          .eq('invoice_id', invoice.id);

        if (savedLineItems && savedLineItems.length > 0) {
          // Get task budgets
          let taskBudgetMap: Record<string, number> = {};
          if (invoice.project_id) {
            const { data: taskData } = await supabase
              .from('tasks')
              .select('id, total_budget, estimated_fees')
              .eq('project_id', invoice.project_id);
            if (taskData) {
              taskBudgetMap = Object.fromEntries(taskData.map(t => [t.id, t.total_budget || t.estimated_fees || 0]));
            }
          }

          // Get prior billing from invoices created BEFORE this one
          const priorBilledMap: Record<string, number> = {};
          if (invoice.project_id && invoice.created_at) {
            const { data: priorLineItems } = await supabase
              .from('invoice_line_items')
              .select('task_id, billed_percentage, invoice_id, invoices!inner(created_at, project_id)')
              .eq('invoices.project_id', invoice.project_id)
              .lt('invoices.created_at', invoice.created_at)
              .not('task_id', 'is', null);

            if (priorLineItems) {
              priorLineItems.forEach((item: any) => {
                if (item.task_id && item.billed_percentage) {
                  priorBilledMap[item.task_id] = (priorBilledMap[item.task_id] || 0) + Number(item.billed_percentage);
                }
              });
            }
          }

          // Use the saved line items with correct prior billing
          const items = savedLineItems.map(item => {
            const taskBudget = item.task_id ? taskBudgetMap[item.task_id] || item.amount : item.amount;
            const currentPct = item.billed_percentage || (taskBudget > 0 ? (item.amount / taskBudget) * 100 : 0);
            const priorPct = item.task_id ? (priorBilledMap[item.task_id] || 0) : 0;
            return {
              id: item.id,
              description: item.description || 'Service',
              quantity: item.quantity || 1,
              rate: item.unit_price || item.amount || 0,
              amount: item.amount || 0,
              unit: item.unit || 'unit',
              taskId: item.task_id,
              taskBudget: taskBudget,
              billedPct: Math.round(currentPct),
              priorBilledPct: Math.round(priorPct)
            };
          });
          setLineItems(items);
          return;
        }

        // Fallback: load from tasks if no saved line items
        if (tasks.length > 0) {
          if (calculatorType === 'milestone' || calculatorType === 'percentage') {
            // For milestone/percentage, show tasks with their billed amounts
            const items = tasks.map(task => {
              const totalBudget = task.total_budget || task.estimated_fees || 0;
              const billedPct = task.billed_percentage || 0;
              const billedAmt = (totalBudget * billedPct) / 100;
              return {
                id: task.id,
                description: task.name,
                quantity: 1,
                rate: billedAmt,
                amount: billedAmt,
                billedPct: billedPct,
                budget: totalBudget
              };
            }).filter(item => item.amount > 0); // Only show tasks that have been billed
            setLineItems(items.length > 0 ? items : [{
              id: '1',
              description: project?.name ? `Services for ${project.name}` : 'Professional Services',
              quantity: 1,
              rate: invoice.subtotal || 0,
              amount: invoice.subtotal || 0
            }]);
          } else {
            // For time_material/fixed_fee, show full task amounts
            const items = tasks.map(task => {
              const isHourBased = task.billing_unit !== 'unit';
              return {
                id: task.id,
                description: task.name,
                quantity: isHourBased ? task.estimated_hours || 1 : 1,
                rate: isHourBased ? (task.estimated_fees ? (task.estimated_fees / (task.estimated_hours || 1)) : 0) : (task.estimated_fees || 0),
                amount: task.estimated_fees || 0,
                unit: isHourBased ? 'hr' : 'unit'
              };
            });
            setLineItems(items);
          }
        } else {
          setLineItems([{
            id: '1',
            description: project?.name ? `Services for ${project.name}` : 'Professional Services',
            quantity: 1,
            rate: invoice.subtotal || 0,
            amount: invoice.subtotal || 0
          }]);
        }
      } catch (err) {
        console.error('Failed to load line items:', err);
        setLineItems([{
          id: '1',
          description: project?.name ? `Services for ${project.name}` : 'Professional Services',
          quantity: 1,
          rate: invoice.subtotal || 0,
          amount: invoice.subtotal || 0
        }]);
      }
    }
    loadLineItems();
  }, [tasks, project, invoice, calculatorType]);

  // Invoice totals are FIXED - set when created, never recalculated by calculator changes
  const subtotal = invoice.subtotal || 0;
  const taxAmount = invoice.tax_amount || 0;
  const total = invoice.total || 0;

  const timeTotal = timeEntries.reduce((sum, e) => sum + (Number(e.hours) * 150), 0);
  const expensesTotal = expenses.filter(e => e.billable).reduce((sum, e) => sum + (e.amount || 0), 0);

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const updateLineItem = (id: string, field: string, value: any) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'rate') {
          updated.amount = updated.quantity * updated.rate;
        }
        return updated;
      }
      return item;
    }));
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateInvoice(invoice.id, {
        invoice_number: invoiceNumber,
        subtotal,
        total: subtotal + taxAmount,
        due_date: dueDate || null,
        sent_date: sentDate || null,
        status,
      });
      onUpdate();
      alert('Invoice saved successfully!');
    } catch (err) {
      console.error('Failed to save invoice:', err);
      alert('Failed to save invoice. Please try again.');
    }
    setSaving(false);
  };

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'draft': return 'bg-neutral-100 text-neutral-700';
      case 'sent': return 'bg-[#476E66]/10 text-[#476E66]';
      case 'paid': return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between p-1">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-neutral-100 rounded-sm text-neutral-400 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-xl font-bold text-neutral-900 tracking-tight">{invoice.invoice_number}</h3>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">{project?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-widest ${getStatusColor(status)}`}>
            {status}
          </span>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-sm w-fit">
        {[
          { id: 'preview', label: 'Preview' },
          { id: 'detail', label: 'Detail' },
          { id: 'time', label: `Time (${formatCurrency(timeTotal)})` },
          { id: 'expenses', label: `Exp. (${formatCurrency(expensesTotal)})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Preview Tab */}
      {activeSubTab === 'preview' && (
        <div className="bg-neutral-50 rounded-sm border border-neutral-200 p-6">
          {/* Calculator Controls */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <select
              value={calculatorType}
              onChange={(e) => setCalculatorType(e.target.value)}
              className="px-4 py-2 rounded-sm border border-neutral-200 bg-white text-[10px] font-bold uppercase tracking-widest min-w-[160px] outline-none cursor-pointer transition-colors focus:border-[#476E66]"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px', paddingRight: '32px' }}
            >
              <option value="time_material">TIME & MATERIAL</option>
              <option value="fixed_fee">FIXED FEE</option>
              <option value="milestone">MILESTONE</option>
              <option value="percentage">PERCENTAGE</option>
              <option value="summary">SUMMARY ONLY</option>
            </select>
            <button className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-sm transition-colors">Edit</button>
            <button className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-sm transition-colors">Refresh</button>
            <button className="hidden sm:inline-flex px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-sm transition-colors">Snapshot</button>
          </div>

          {/* Full-width Invoice Preview Card */}
          <div className="bg-white rounded-sm shadow-sm p-8 sm:p-12 overflow-x-auto min-h-[600px] border border-neutral-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-8 mb-12">
              <div>
                <div className="w-16 h-16 bg-[#476E66] rounded-sm flex items-center justify-center text-white font-bold text-2xl mb-4 shadow-sm">P</div>
                <div className="text-sm text-neutral-600 space-y-0.5">
                  <p className="font-bold text-neutral-900 text-base mb-1">Your Company</p>
                  <p>123 Business Ave</p>
                  <p>City, State 12345</p>
                </div>
              </div>
              <div className="text-left sm:text-right w-full sm:w-auto">
                <h2 className="text-3xl font-bold text-neutral-900 tracking-widest mb-6">INVOICE</h2>
                <div className="space-y-2 text-sm text-neutral-900">
                  <p className="flex items-center justify-start sm:justify-end gap-4"><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-24 text-left">Invoice Date:</span> {new Date(invoice.created_at || '').toLocaleDateString()}</p>
                  <p className="flex items-center justify-start sm:justify-end gap-4"><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-24 text-left">Total Amount:</span> <span className="font-bold">{formatCurrency(total)}</span></p>
                  <p className="flex items-center justify-start sm:justify-end gap-4"><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-24 text-left">Number:</span> {invoiceNumber}</p>
                  <p className="flex items-center justify-start sm:justify-end gap-4"><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-24 text-left">Terms:</span> {terms}</p>
                  <p className="flex items-center justify-start sm:justify-end gap-4"><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-24 text-left">Project:</span> <span className="truncate max-w-[200px]">{project?.name}</span></p>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-12">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Bill To</p>
              <p className="text-xl font-bold text-neutral-900 mb-1">{invoice.client?.name || project?.client?.name}</p>
              <div className="text-sm text-neutral-600 space-y-0.5">
                {(invoice.client?.address || project?.client?.address) && <p>{invoice.client?.address || project?.client?.address}</p>}
                {(invoice.client?.city || invoice.client?.state || invoice.client?.zip || project?.client?.city || project?.client?.state || project?.client?.zip) && (
                  <p>
                    {[invoice.client?.city || project?.client?.city, invoice.client?.state || project?.client?.state, invoice.client?.zip || project?.client?.zip].filter(Boolean).join(', ')}
                  </p>
                )}
                {(invoice.client?.phone || project?.client?.phone) && <p>{invoice.client?.phone || project?.client?.phone}</p>}
                {(invoice.client?.website || project?.client?.website) && <p>{invoice.client?.website || project?.client?.website}</p>}
              </div>
            </div>

            {/* Calculator-based Content */}
            <div className="border-t border-b border-neutral-100 py-8 mb-8">
              {calculatorType === 'summary' ? (
                /* Summary Only - Just project name and total */
                <div className="text-center py-6">
                  <p className="text-xl font-bold text-neutral-900 mb-2">
                    Professional Services for {project?.name || 'Project'}
                  </p>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Period: {new Date(invoice.created_at || '').toLocaleDateString()}</p>
                </div>
              ) : calculatorType === 'milestone' ? (
                /* Milestone Calculator - Use lineItems with correct prior/current billing */
                <>
                  <h4 className="text-[10px] font-bold text-neutral-900 uppercase tracking-widest mb-6">Milestone Billing</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="text-left border-b border-neutral-200">
                          <th className="pb-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Task</th>
                          <th className="pb-4 text-center w-24 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Prior</th>
                          <th className="pb-4 text-center w-24 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Current</th>
                          <th className="pb-4 text-right w-32 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Budget</th>
                          <th className="pb-4 text-right w-32 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {lineItems.filter(item => item.taskId).map(item => {
                          const budget = item.taskBudget || item.amount;
                          const priorAmt = (budget * (item.priorBilledPct || 0)) / 100;
                          const currentAmt = item.amount;
                          return (
                            <tr key={item.id}>
                              <td className="py-2 sm:py-3 text-xs sm:text-sm">{item.description}</td>
                              <td className="py-2 sm:py-3 text-center">
                                <div className="text-xs">
                                  <span className="inline-flex items-center justify-center w-12 sm:w-14 h-5 bg-neutral-100 rounded font-medium text-neutral-600 text-xs">
                                    {item.priorBilledPct || 0}%
                                  </span>
                                  <p className="text-neutral-500 mt-0.5">{formatCurrency(priorAmt)}</p>
                                </div>
                              </td>
                              <td className="py-2 sm:py-3 text-center">
                                <div className="text-xs">
                                  <span className="inline-flex items-center justify-center w-12 sm:w-14 h-5 bg-green-100 rounded font-medium text-green-700 text-xs">
                                    {item.billedPct || 0}%
                                  </span>
                                  <p className="text-green-600 mt-0.5">{formatCurrency(currentAmt)}</p>
                                </div>
                              </td>
                              <td className="py-2 sm:py-3 text-right text-neutral-500 text-xs sm:text-sm">{formatCurrency(budget)}</td>
                              <td className="py-2 sm:py-3 text-right font-medium text-xs sm:text-sm">{formatCurrency(currentAmt)}</td>
                            </tr>
                          );
                        })}
                        {/* Show non-task line items (time entries etc) */}
                        {lineItems.filter(item => !item.taskId).map(item => (
                          <tr key={item.id}>
                            <td className="py-2 sm:py-3 text-xs sm:text-sm">{item.description}</td>
                            <td className="py-2 sm:py-3 text-center text-neutral-400 text-xs">-</td>
                            <td className="py-2 sm:py-3 text-center text-neutral-400 text-xs">-</td>
                            <td className="py-2 sm:py-3 text-right text-neutral-400 text-xs sm:text-sm">-</td>
                            <td className="py-2 sm:py-3 text-right font-medium text-xs sm:text-sm">{formatCurrency(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Billing Summary */}
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-neutral-100 bg-blue-50 rounded-lg p-3 sm:p-4">
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div>
                        <p className="text-neutral-500 mb-1">Prior Billed</p>
                        <p className="font-medium text-neutral-700">
                          {formatCurrency(lineItems.filter(i => i.taskId).reduce((sum, i) => sum + ((i.taskBudget || i.amount) * (i.priorBilledPct || 0)) / 100, 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-green-600 mb-1">This Invoice</p>
                        <p className="font-medium text-green-700">{formatCurrency(subtotal)}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500 mb-1">Total After</p>
                        <p className="font-medium text-neutral-900">
                          {formatCurrency(lineItems.filter(i => i.taskId).reduce((sum, i) => {
                            const budget = i.taskBudget || i.amount;
                            return sum + (budget * ((i.priorBilledPct || 0) + (i.billedPct || 0))) / 100;
                          }, 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : calculatorType === 'percentage' ? (
                /* Percentage Calculator - Use lineItems with correct prior/current billing */
                <>
                  <h4 className="font-semibold text-neutral-900 mb-2 sm:mb-3 lg:mb-4 text-sm sm:text-base lg:text-lg">Percentage Billing</h4>
                  <div className="overflow-x-auto -mx-3 sm:-mx-5 lg:-mx-8 px-3 sm:px-5 lg:px-8">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="text-left text-neutral-500 text-xs sm:text-sm border-b border-neutral-200">
                          <th className="pb-2 sm:pb-3 font-medium">Task</th>
                          <th className="pb-2 sm:pb-3 font-medium text-center w-20 sm:w-24">Prior</th>
                          <th className="pb-2 sm:pb-3 font-medium text-center w-20 sm:w-24">Current</th>
                          <th className="pb-2 sm:pb-3 font-medium text-right w-24 sm:w-28">Budget</th>
                          <th className="pb-2 sm:pb-3 font-medium text-right w-24 sm:w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {lineItems.filter(item => item.taskId).map(item => {
                          const budget = item.taskBudget || item.amount;
                          const priorAmt = (budget * (item.priorBilledPct || 0)) / 100;
                          const currentAmt = item.amount;
                          return (
                            <tr key={item.id}>
                              <td className="py-2 sm:py-3 text-xs sm:text-sm">{item.description}</td>
                              <td className="py-2 sm:py-3 text-center">
                                <div className="text-xs">
                                  <span className="inline-flex items-center justify-center w-12 sm:w-14 h-5 bg-neutral-100 rounded font-medium text-neutral-600 text-xs">
                                    {item.priorBilledPct || 0}%
                                  </span>
                                  <p className="text-neutral-500 mt-0.5">{formatCurrency(priorAmt)}</p>
                                </div>
                              </td>
                              <td className="py-2 sm:py-3 text-center">
                                <div className="text-xs">
                                  <span className="inline-flex items-center justify-center w-12 sm:w-14 h-5 bg-green-100 rounded font-medium text-green-700 text-xs">
                                    {item.billedPct || 0}%
                                  </span>
                                  <p className="text-green-600 mt-0.5">{formatCurrency(currentAmt)}</p>
                                </div>
                              </td>
                              <td className="py-2 sm:py-3 text-right text-neutral-500 text-xs sm:text-sm">{formatCurrency(budget)}</td>
                              <td className="py-2 sm:py-3 text-right font-medium text-xs sm:text-sm">{formatCurrency(currentAmt)}</td>
                            </tr>
                          );
                        })}
                        {/* Show non-task line items (time entries etc) */}
                        {lineItems.filter(item => !item.taskId).map(item => (
                          <tr key={item.id}>
                            <td className="py-2 sm:py-3 text-xs sm:text-sm">{item.description}</td>
                            <td className="py-2 sm:py-3 text-center text-neutral-400 text-xs">-</td>
                            <td className="py-2 sm:py-3 text-center text-neutral-400 text-xs">-</td>
                            <td className="py-2 sm:py-3 text-right text-neutral-400 text-xs sm:text-sm">-</td>
                            <td className="py-2 sm:py-3 text-right font-medium text-xs sm:text-sm">{formatCurrency(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Billing Summary */}
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-neutral-100 bg-blue-50 rounded-lg p-3 sm:p-4">
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div>
                        <p className="text-neutral-500 mb-1">Prior Billed</p>
                        <p className="font-medium text-neutral-700">
                          {formatCurrency(lineItems.filter(i => i.taskId).reduce((sum, i) => sum + ((i.taskBudget || i.amount) * (i.priorBilledPct || 0)) / 100, 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-green-600 mb-1">This Invoice</p>
                        <p className="font-medium text-green-700">{formatCurrency(subtotal)}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500 mb-1">Total After</p>
                        <p className="font-medium text-neutral-900">
                          {formatCurrency(lineItems.filter(i => i.taskId).reduce((sum, i) => {
                            const budget = i.taskBudget || i.amount;
                            return sum + (budget * ((i.priorBilledPct || 0) + (i.billedPct || 0))) / 100;
                          }, 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : calculatorType === 'time_material' ? (
                /* Time & Material - Detailed breakdown with hours */
                <>
                  <h4 className="font-semibold text-neutral-900 mb-2 sm:mb-3 lg:mb-4 text-sm sm:text-base lg:text-lg">Time & Material Details</h4>
                  <div className="overflow-x-auto -mx-3 sm:-mx-5 lg:-mx-8 px-3 sm:px-5 lg:px-8">
                    <table className="w-full min-w-[450px]">
                      <thead>
                        <tr className="text-left text-neutral-500 text-xs sm:text-sm border-b border-neutral-200">
                          <th className="pb-2 sm:pb-3 font-medium">Description</th>
                          <th className="pb-2 sm:pb-3 font-medium text-center w-20 sm:w-24">Hours</th>
                          <th className="pb-2 sm:pb-3 font-medium text-right w-24 sm:w-32">Rate</th>
                          <th className="pb-2 sm:pb-3 font-medium text-right w-24 sm:w-32">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {lineItems.map(item => (
                          <tr key={item.id}>
                            <td className="py-2 sm:py-3 text-xs sm:text-sm">{item.description || 'Service'}</td>
                            <td className="py-2 sm:py-3 text-center text-xs sm:text-sm">{item.quantity}{item.unit === 'hr' ? 'h' : ''}</td>
                            <td className="py-2 sm:py-3 text-right text-xs sm:text-sm">{formatCurrency(item.rate)}{item.unit === 'hr' ? '/hr' : '/unit'}</td>
                            <td className="py-2 sm:py-3 text-right font-medium text-xs sm:text-sm">{formatCurrency(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {timeEntries.length > 0 && (
                    <div className="mt-3 sm:mt-4 lg:mt-6 pt-3 sm:pt-4 border-t border-neutral-100">
                      <p className="text-xs sm:text-sm text-neutral-500 mb-2 font-medium">Time Entries Included:</p>
                      <div className="text-xs sm:text-sm text-neutral-600 space-y-1 max-h-32 overflow-y-auto">
                        {timeEntries.map((entry) => (
                          <p key={entry.id} className="flex justify-between">
                            <span>• {entry.description || 'Time entry'} ({new Date(entry.date).toLocaleDateString()})</span>
                            <span className="font-medium">{Number(entry.hours).toFixed(1)}h</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Fixed Fee - Simple line items without hourly breakdown */
                <>
                  <h4 className="font-semibold text-neutral-900 mb-2 sm:mb-3 lg:mb-4 text-sm sm:text-base lg:text-lg">Fixed Fee Invoice</h4>
                  <div className="overflow-x-auto -mx-3 sm:-mx-5 lg:-mx-8 px-3 sm:px-5 lg:px-8">
                    <table className="w-full min-w-[300px]">
                      <thead>
                        <tr className="text-left text-neutral-500 text-xs sm:text-sm border-b border-neutral-200">
                          <th className="pb-2 sm:pb-3 font-medium">Description</th>
                          <th className="pb-2 sm:pb-3 font-medium text-right w-32 sm:w-40">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {lineItems.map(item => (
                          <tr key={item.id}>
                            <td className="py-2 sm:py-3 text-xs sm:text-sm">{item.description || 'Service'}</td>
                            <td className="py-2 sm:py-3 text-right font-medium text-xs sm:text-sm">{formatCurrency(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Totals Section - Mobile Optimized */}
            <div className="flex justify-end">
              <div className="w-full sm:w-80 lg:w-72">
                <div className="flex justify-between py-1.5 sm:py-2 text-neutral-600 text-xs sm:text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between py-1.5 sm:py-2 text-neutral-600 text-xs sm:text-sm">
                    <span>Tax</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 sm:py-2.5 text-sm sm:text-base font-bold border-t-2 border-neutral-900 mt-1.5 sm:mt-2">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Expenses Section if billable - Mobile Optimized */}
            {expenses.filter(e => e.billable).length > 0 && calculatorType !== 'summary' && (
              <div className="mt-3 sm:mt-4 lg:mt-6 pt-3 sm:pt-4 lg:pt-6 border-t border-neutral-200">
                <h4 className="font-semibold text-neutral-900 mb-2 sm:mb-3 text-sm sm:text-base">Billable Expenses</h4>
                <div className="text-xs sm:text-sm space-y-2">
                  {expenses.filter(e => e.billable).map(exp => (
                    <div key={exp.id} className="flex justify-between">
                      <span>{exp.description} - {exp.category || 'Expense'}</span>
                      <span className="font-medium">{formatCurrency(exp.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Tab - Vertical Mobile Optimized */}
      {activeSubTab === 'detail' && (
        <div className="space-y-2.5">
          {/* Client & Total Header - Compact */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium text-neutral-600">{invoice.client?.name || project?.client?.name}</p>
            <p className="text-sm font-bold text-neutral-900">{formatCurrency(total)}</p>
          </div>

          {/* Line Items Table - Extra Compact to Fit Mobile */}
          <div className="border border-neutral-100 rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    <th className="text-left px-1.5 py-1.5 text-xs font-medium text-neutral-600">Description</th>
                    <th className="text-center px-1 py-1.5 text-xs font-medium text-neutral-600 w-11">Qty</th>
                    <th className="text-right px-1 py-1.5 text-xs font-medium text-neutral-600 w-12">Rate</th>
                    <th className="text-right px-1 py-1.5 text-xs font-medium text-neutral-600 w-16">Amt</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(item => (
                    <tr key={item.id} className="border-b border-neutral-50 last:border-0">
                      <td className="px-1.5 py-1">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          className="w-full px-1 py-0.5 border border-neutral-200 rounded text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-1 py-0.5 border border-neutral-200 rounded text-center text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full px-1 py-0.5 border border-neutral-200 rounded text-right text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 text-right font-medium text-xs">{formatCurrency(item.amount)}</td>
                      <td className="px-0.5 py-1">
                        <button
                          onClick={() => removeLineItem(item.id)}
                          className="p-0.5 text-neutral-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Line Item Button - Inside table card */}
            <div className="px-2 py-2 border-t border-neutral-100 bg-neutral-50">
              <button
                onClick={addLineItem}
                className="flex items-center gap-1 px-2 py-1 text-xs text-[#476E66] hover:bg-[#476E66]/5 rounded transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Line Item
              </button>
            </div>

            {/* Totals - Inside table card */}
            <div className="px-2 py-2 border-t border-neutral-100">
              <div className="flex justify-between py-1 text-xs">
                <span className="text-neutral-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm font-bold border-t-2 border-neutral-900 mt-1">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Invoice Details - Compact Grid Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Invoice Info */}
            <div className="space-y-1.5 border border-neutral-100 rounded-sm p-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">Invoice #</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">Period</label>
                <select className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none">
                  <option value="current">Current Invoice</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">PO Number</label>
                <input
                  type="text"
                  placeholder="Enter PO #"
                  className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">Terms</label>
                <select
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                >
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                  <option value="1% 10 Net 30">1% 10 Net 30</option>
                  <option value="2% 10 Net 30">2% 10 Net 30</option>
                </select>
              </div>
            </div>

            {/* Status & Dates */}
            <div className="space-y-1.5 border border-neutral-100 rounded-sm p-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">Sent Date</label>
                <input
                  type="date"
                  value={sentDate}
                  onChange={(e) => setSentDate(e.target.value)}
                  className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-0.5">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2 py-1 border border-neutral-200 rounded text-xs bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                />
              </div>

              {/* Status Timeline - Ultra Compact */}
              <div className="space-y-1 pt-1.5 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className={`w-1 h-1 rounded-full ${invoice.created_at ? 'bg-[#476E66]' : 'bg-neutral-300'}`}></div>
                    <span className="text-xs text-neutral-600">Draft</span>
                  </div>
                  <span className="text-xs text-neutral-400">{invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className={`w-1 h-1 rounded-full ${sentDate ? 'bg-[#476E66]' : 'bg-neutral-300'}`}></div>
                    <span className="text-xs text-neutral-600">Sent</span>
                  </div>
                  <span className="text-xs text-neutral-400">{sentDate ? new Date(sentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className={`w-1 h-1 rounded-full ${status === 'paid' ? 'bg-emerald-500' : 'bg-neutral-300'}`}></div>
                    <span className="text-xs text-neutral-600">Paid</span>
                  </div>
                  <span className="text-xs text-neutral-400">{status === 'paid' ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Options & Save - Full Width */}
          <div className="space-y-2 border border-neutral-100 rounded-sm p-3">
            <label className="block text-xs font-medium text-neutral-600">Payment Options</label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" defaultChecked className="w-3 h-3 rounded border-neutral-300 text-[#476E66] focus:ring-1 focus:ring-[#476E66]" />
                <span>Bank</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" className="w-3 h-3 rounded border-neutral-300 text-[#476E66] focus:ring-1 focus:ring-[#476E66]" />
                <span>Card</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" className="w-3 h-3 rounded border-neutral-300 text-[#476E66] focus:ring-1 focus:ring-[#476E66]" />
                <span>Check</span>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-1.5 bg-[#476E66] text-white rounded-lg text-xs font-medium hover:bg-[#3A5B54] disabled:opacity-50 transition-colors"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Time Tab - Compact & Modern */}
      {activeSubTab === 'time' && (
        <div className="border border-neutral-100 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-600">Date</th>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-600">Description</th>
                  <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-600 w-14">Hours</th>
                  <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-600 w-16">Amount</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-8 text-center text-neutral-400 text-xs">
                      No time entries
                    </td>
                  </tr>
                ) : (
                  timeEntries.map(entry => (
                    <tr key={entry.id} className="border-b border-neutral-50 last:border-0">
                      <td className="px-2 py-2 text-xs">
                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-2 py-2 text-xs">{entry.description || '-'}</td>
                      <td className="px-2 py-2 text-xs text-right font-medium">{Number(entry.hours).toFixed(1)}h</td>
                      <td className="px-2 py-2 text-xs text-right font-medium">{formatCurrency(Number(entry.hours) * 150)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {timeEntries.length > 0 && (
                <tfoot className="bg-neutral-50 border-t-2 border-neutral-200">
                  <tr>
                    <td colSpan={2} className="px-2 py-2 font-semibold text-xs">Total</td>
                    <td className="px-2 py-2 text-right font-semibold text-xs">
                      {timeEntries.reduce((sum, e) => sum + Number(e.hours), 0).toFixed(1)}h
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-xs">{formatCurrency(timeTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Expenses Tab - Compact & Modern */}
      {activeSubTab === 'expenses' && (
        <div className="border border-neutral-100 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-600">Date</th>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-600">Description</th>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-600 w-20">Category</th>
                  <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-600 w-16">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.filter(e => e.billable).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-8 text-center text-neutral-400 text-xs">
                      No billable expenses
                    </td>
                  </tr>
                ) : (
                  expenses.filter(e => e.billable).map(expense => (
                    <tr key={expense.id} className="border-b border-neutral-50 last:border-0">
                      <td className="px-2 py-2 text-xs">
                        {new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-2 py-2 text-xs">{expense.description || '-'}</td>
                      <td className="px-2 py-2 text-xs">{expense.category || '-'}</td>
                      <td className="px-2 py-2 text-xs text-right font-medium">{formatCurrency(expense.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {expenses.filter(e => e.billable).length > 0 && (
                <tfoot className="bg-neutral-50 border-t-2 border-neutral-200">
                  <tr>
                    <td colSpan={3} className="px-2 py-2 font-semibold text-xs">Total</td>
                    <td className="px-2 py-2 text-right font-semibold text-xs">{formatCurrency(expensesTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// Project Details Tab Component - Refined UI
function ProjectDetailsTab({
  project,
  companyId,
  onUpdate
}: {
  project: Project;
  companyId: string;
  onUpdate: (updates: Partial<Project>) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    status: project.status || 'active',
    category: project.category || 'O',
    start_date: project.start_date || '',
    due_date: project.due_date || '',
    status_notes: project.status_notes || '',
  });

  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setFormData({
      status: project.status || 'active',
      category: project.category || 'O',
      start_date: project.start_date || '',
      due_date: project.due_date || '',
      status_notes: project.status_notes || '',
    });
    setHasChanges(false);
  }, [project]);

  function updateField(field: string, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cleanedData = {
        ...formData,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        status_notes: formData.status_notes || null,
      };
      await onUpdate(cleanedData);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    }
    setSaving(false);
  }

  const STATUS_OPTIONS = [
    { value: 'not_started', label: 'Not Started', color: 'bg-neutral-100 text-neutral-600', activeColor: 'bg-neutral-600 text-white' },
    { value: 'active', label: 'Active', color: 'bg-emerald-50 text-emerald-600', activeColor: 'bg-emerald-500 text-white' },
    { value: 'on_hold', label: 'On Hold', color: 'bg-amber-50 text-amber-600', activeColor: 'bg-amber-500 text-white' },
    { value: 'completed', label: 'Completed', color: 'bg-blue-50 text-blue-600', activeColor: 'bg-blue-500 text-white' },
  ];

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (

    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Status Card */}
        <div
          className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all"
          style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Project Status</span>
            <Activity className="w-3.5 h-3.5 text-neutral-300" />
          </div>
          <select
            value={formData.status}
            onChange={(e) => updateField('status', e.target.value)}
            className="w-full bg-transparent text-xl font-light text-neutral-900 border-0 outline-none cursor-pointer appearance-none p-0 focus:ring-0"
            style={{ backgroundImage: 'none' }}
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="mt-2 text-xs text-neutral-400 font-medium flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${formData.status === 'active' ? 'bg-emerald-500' :
              formData.status === 'on_hold' ? 'bg-amber-500' :
                formData.status === 'completed' ? 'bg-neutral-400' :
                  'bg-neutral-300'
              }`} />
            Current State
          </div>
        </div>

        {/* Category Card */}
        <div
          className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all"
          style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Category</span>
            <Tag className="w-3.5 h-3.5 text-neutral-300" />
          </div>
          <select
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value)}
            className="w-full bg-transparent text-xl font-light text-neutral-900 border-0 outline-none cursor-pointer appearance-none p-0 focus:ring-0"
            style={{ backgroundImage: 'none' }}
          >
            <option value="">Select Category...</option>
            {PROJECT_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <div className="mt-2 text-xs text-neutral-400 font-medium">
            Project Type
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Start Date Card */}
        <div
          className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all"
          style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Start Date</span>
            <Calendar className="w-3.5 h-3.5 text-neutral-300" />
          </div>
          <input
            type="date"
            value={formData.start_date}
            onChange={(e) => updateField('start_date', e.target.value)}
            className="w-full bg-transparent text-xl font-light text-neutral-900 border-0 outline-none cursor-pointer p-0 focus:ring-0"
            style={{ colorScheme: 'light' }}
          />
          <div className="mt-2 text-xs text-neutral-400 font-medium">
            Project Kickoff
          </div>
        </div>

        {/* Due Date Card */}
        <div
          className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all"
          style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Due Date</span>
            <Flag className="w-3.5 h-3.5 text-neutral-300" />
          </div>
          <input
            type="date"
            value={formData.due_date}
            onChange={(e) => updateField('due_date', e.target.value)}
            className="w-full bg-transparent text-xl font-light text-neutral-900 border-0 outline-none cursor-pointer p-0 focus:ring-0"
            style={{ colorScheme: 'light' }}
          />
          <div className="mt-2 text-xs text-neutral-400 font-medium">
            Expected Completion
          </div>
        </div>
      </div>

      {/* Notes Card */}
      <div
        className="bg-white rounded-2xl p-6 border border-neutral-100/60 hover:border-neutral-200 transition-all"
        style={{ boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Project Notes</span>
          <FileText className="w-3.5 h-3.5 text-neutral-300" />
        </div>
        <textarea
          value={formData.status_notes}
          onChange={(e) => updateField('status_notes', e.target.value)}
          rows={4}
          className="w-full bg-transparent text-sm text-neutral-600 leading-relaxed border-0 outline-none resize-none p-0 focus:ring-0 placeholder:text-neutral-300"
          placeholder="Add any notes about this project..."
        />
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex items-center justify-between p-4 bg-[#476E66]/5 rounded-xl border border-[#476E66]/20 animate-in fade-in slide-in-from-bottom-2">
          <p className="text-[11px] font-bold text-[#476E66] uppercase tracking-wide">You have unsaved changes</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 transition-colors shadow-lg shadow-[#476E66]/20"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}


