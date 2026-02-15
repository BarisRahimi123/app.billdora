import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { api, Project, Task, TimeEntry, Expense } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Plus, ChevronLeft, ChevronRight, Clock, Receipt, Trash2, X, Edit2, Play, Pause, Square, Copy, Paperclip, CheckCircle, XCircle, AlertCircle, Send, Save, Calendar, ChevronDown, Download } from 'lucide-react';
import { ExpenseModal } from '../components/ExpenseModal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, ReferenceLine } from 'recharts';

type TimeTab = 'timesheet' | 'expenses' | 'approvals' | 'approved' | 'reports';
type ReportGroupBy = 'project' | 'user' | 'task' | 'day' | 'week';
type ReportView = 'detailed' | 'insights';
type DatePreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

// Date Range Picker Component
function DateRangePicker({
  startDate,
  endDate,
  onDateChange
}: {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyPreset = (p: DatePreset) => {
    const now = new Date();
    let start: Date, end: Date;

    switch (p) {
      case 'this_week':
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'last_week':
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay() - 7);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    setPreset(p);
    setCustomStart(startStr);
    setCustomEnd(endStr);
    onDateChange(startStr, endStr);
    setIsOpen(false);
  };

  const applyCustom = () => {
    setPreset('custom');
    onDateChange(customStart, customEnd);
    setIsOpen(false);
  };

  const presetLabels: Record<DatePreset, string> = {
    this_week: 'This Week',
    last_week: 'Last Week',
    this_month: 'This Month',
    last_month: 'Last Month',
    this_year: 'This Year',
    custom: 'Custom Range'
  };

  const formatDisplayDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
      >
        <Calendar className="w-4 h-4 text-neutral-500" />
        <span className="text-sm font-medium text-neutral-700">
          {formatDisplayDate(startDate)} - {formatDisplayDate(endDate)}
        </span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-neutral-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-neutral-100">
            <p className="text-xs font-medium text-neutral-500 uppercase px-2 py-1">Quick Select</p>
            {(['this_week', 'last_week', 'this_month', 'last_month', 'this_year'] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${preset === p ? 'bg-[#476E66] text-white' : 'hover:bg-neutral-100 text-neutral-700'
                  }`}
              >
                {presetLabels[p]}
              </button>
            ))}
          </div>
          <div className="p-3">
            <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Custom Range</p>
            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <button
              onClick={applyCustom}
              className="w-full px-3 py-2 bg-[#476E66] text-white text-sm font-medium rounded-lg hover:bg-[#3A5B54] transition-colors"
            >
              Apply Custom Range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface DraftRow {
  id: string;
  project: Project | null;
  task: Task | null;
  projectId: string;
  taskId: string | null;
  activity: string;
}

interface SubmittedRow {
  id: string;
  project: Project | null;
  task: Task | null;
  entries: { [date: string]: TimeEntry };
}

export default function TimeExpensePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { canViewFinancials, canApprove, canViewAllProjects } = usePermissions();
  const [activeTab, setActiveTab] = useState<TimeTab>('timesheet');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<{ [projectId: string]: Task[] }>({});
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [allDraftEntries, setAllDraftEntries] = useState<TimeEntry[]>([]); // All draft entries regardless of week
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pendingTimeEntries, setPendingTimeEntries] = useState<TimeEntry[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [approvedTimeEntries, setApprovedTimeEntries] = useState<TimeEntry[]>([]);
  const [approvedExpenses, setApprovedExpenses] = useState<Expense[]>([]);
  // Collapsible state for approved history sections
  const [expandedTimeProjects, setExpandedTimeProjects] = useState<Set<string>>(new Set());
  const [expandedTimeUsers, setExpandedTimeUsers] = useState<Set<string>>(new Set());
  const [expandedExpenseProjects, setExpandedExpenseProjects] = useState<Set<string>>(new Set());
  const [expandedExpenseUsers, setExpandedExpenseUsers] = useState<Set<string>>(new Set());
  // Reports tab state
  const [reportGroupBy, setReportGroupBy] = useState<ReportGroupBy>('project');
  const [reportEntries, setReportEntries] = useState<TimeEntry[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'approved' | 'pending' | 'draft'>('all');
  const [reportProjectFilter, setReportProjectFilter] = useState('all');
  const [reportUserFilter, setReportUserFilter] = useState('all');
  const [reportBillableFilter, setReportBillableFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [reportDateRange, setReportDateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
  });
  const [expandedReportGroups, setExpandedReportGroups] = useState<Set<string>>(new Set());
  const [reportView, setReportView] = useState<ReportView>('detailed');
  // Unified date range for approvals and approved tabs
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  });
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    return new Date(today.setDate(diff));
  });
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showTimeEntryModal, setShowTimeEntryModal] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [timerTaskId, setTimerTaskId] = useState('');
  const [timerDescription, setTimerDescription] = useState('');
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<Set<string>>(new Set());
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [draftValues, setDraftValues] = useState<{ [key: string]: number }>({});
  const [rejectedEdits, setRejectedEdits] = useState<{ [entryId: string]: number }>({});
  const [savingTimesheet, setSavingTimesheet] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => {
    // Start on today's day of the week
    const today = new Date();
    return today.getDay();
  });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportMenu]);

  // CSV Export helpers
  function splitName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return `"${value}"`;
  }

  function formatDateMDY(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportQuickBooksCSV() {
    if (approvedTimeEntries.length === 0) return;
    const headers = ['First Name', 'Last Name', 'Date', 'Hours', 'Job Name', 'Service Item', 'Billable', 'Notes'];
    const rows = approvedTimeEntries.map(entry => {
      const fullName = entry.user?.full_name || entry.user?.email || 'Unknown';
      const { firstName, lastName } = splitName(fullName);
      const serviceItem = entry.task?.name || entry.description || '';
      const notes = entry.description && entry.description !== (entry.task?.name || '') ? entry.description : '';
      return [
        escapeCSV(firstName),
        escapeCSV(lastName),
        formatDateMDY(entry.date),
        Number(entry.hours).toFixed(2),
        escapeCSV(entry.project?.name || ''),
        escapeCSV(serviceItem),
        entry.billable !== false ? 'Y' : 'N',
        escapeCSV(notes),
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    downloadCSV(csv, `timesheets_quickbooks_${dateRange.startDate}_${dateRange.endDate}.csv`);
    setShowExportMenu(false);
  }

  function exportDetailedCSV() {
    if (approvedTimeEntries.length === 0) return;
    const headers = ['Employee', 'Email', 'Date', 'Project', 'Task', 'Activity/Description', 'Hours', 'Hourly Rate', 'Total Amount', 'Billable', 'Approved Date'];
    const rows = approvedTimeEntries.map(entry => {
      const fullName = entry.user?.full_name || 'Unknown';
      const email = entry.user?.email || '';
      const rate = entry.hourly_rate || 0;
      const amount = Number(entry.hours) * rate;
      return [
        escapeCSV(fullName),
        escapeCSV(email),
        formatDateMDY(entry.date),
        escapeCSV(entry.project?.name || ''),
        escapeCSV(entry.task?.name || ''),
        escapeCSV(entry.description || ''),
        Number(entry.hours).toFixed(2),
        rate.toFixed(2),
        amount.toFixed(2),
        entry.billable !== false ? 'Yes' : 'No',
        entry.approved_at ? formatDateMDY(entry.approved_at.split('T')[0]) : '',
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    downloadCSV(csv, `timesheets_detailed_${dateRange.startDate}_${dateRange.endDate}.csv`);
    setShowExportMenu(false);
  }

  // Computed: group saved draft entries by project/task/activity (from timer or copy) - includes rejected entries
  // Uses allDraftEntries for row generation (persists across weeks) but timeEntries for current week values
  const savedDraftRows = useMemo(() => {
    const rows: SubmittedRow[] = [];
    const seen = new Set<string>();

    // First, create rows from all draft entries (regardless of week)
    allDraftEntries.forEach(entry => {
      const key = `${entry.project_id}-${entry.task_id || 'null'}-${(entry.description || '').trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        const project = projects.find(p => p.id === entry.project_id) || null;
        const task = entry.task_id ? tasks[entry.project_id]?.find(t => t.id === entry.task_id) || null : null;
        rows.push({ id: key, project, task, entries: {} });
      }
    });

    // Then, populate entries from current week's timeEntries
    timeEntries.forEach(entry => {
      if (entry.approval_status !== 'draft' && entry.approval_status !== 'rejected') return;
      const row = rows.find(r => r.id === `${entry.project_id}-${entry.task_id || 'null'}-${(entry.description || '').trim().toLowerCase()}`);
      if (row) {
        row.entries[entry.date] = entry;
      }
    });

    return rows;
  }, [allDraftEntries, timeEntries, projects, tasks]);

  // Computed: group submitted entries by project/task/activity (only pending and approved)
  const submittedRows = useMemo(() => {
    const rows: SubmittedRow[] = [];
    const seen = new Set<string>();

    timeEntries.forEach(entry => {
      // Only show pending and approved entries in the submitted section (not rejected)
      if (entry.approval_status !== 'pending' && entry.approval_status !== 'approved') return;
      const key = `${entry.project_id}-${entry.task_id || 'null'}-${(entry.description || '').trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        const project = projects.find(p => p.id === entry.project_id) || null;
        const task = entry.task_id ? tasks[entry.project_id]?.find(t => t.id === entry.task_id) || null : null;
        rows.push({ id: key, project, task, entries: {} });
      }
      const row = rows.find(r => r.id === `${entry.project_id}-${entry.task_id || 'null'}-${(entry.description || '').trim().toLowerCase()}`);
      if (row) {
        row.entries[entry.date] = entry;
      }
    });
    return rows;
  }, [timeEntries, projects, tasks]);

  // Filter pending entries by date range
  const filteredPendingTimeEntries = useMemo(() => {
    return pendingTimeEntries.filter(entry => {
      if (!entry.date) return true;
      return entry.date >= dateRange.startDate && entry.date <= dateRange.endDate;
    });
  }, [pendingTimeEntries, dateRange]);

  const filteredPendingExpenses = useMemo(() => {
    return pendingExpenses.filter(expense => {
      if (!expense.date) return true;
      return expense.date >= dateRange.startDate && expense.date <= dateRange.endDate;
    });
  }, [pendingExpenses, dateRange]);

  useEffect(() => {
    loadData();
  }, [profile?.company_id, user?.id, weekStart]);

  useEffect(() => {
    if (timerRunning) {
      timerInterval.current = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    } else if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    return () => { if (timerInterval.current) clearInterval(timerInterval.current); };
  }, [timerRunning]);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTimer = () => setTimerRunning(true);
  const pauseTimer = () => setTimerRunning(false);
  const stopTimer = async () => {
    setTimerRunning(false);
    if (!timerProjectId) {
      alert('Please select a project before stopping the timer.');
      return;
    }
    if (timerSeconds === 0) {
      alert('No time recorded to save.');
      return;
    }
    if (!profile?.company_id || !user?.id) {
      alert('Unable to save: User session not found. Please refresh the page.');
      return;
    }
    const hours = Math.max(0.25, Math.round((timerSeconds / 3600) * 4) / 4); // Round to nearest 0.25, min 0.25
    try {
      await api.createTimeEntry({
        company_id: profile.company_id,
        user_id: user.id,
        project_id: timerProjectId,
        task_id: timerTaskId || undefined,
        hours,
        description: timerDescription,
        date: new Date().toISOString().split('T')[0],
        billable: true,
        hourly_rate: profile.hourly_rate || 150,
        approval_status: 'draft',
      });
      setTimerSeconds(0);
      setTimerDescription('');
      setTimerProjectId('');
      setTimerTaskId('');
      await loadData();
    } catch (error: any) {
      console.error('Failed to save time:', error);
      alert(`Failed to save time entry: ${error?.message || 'Unknown error'}`);
    }
  };

  const copyPreviousWeek = async () => {
    if (!profile?.company_id || !user?.id) return;
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);
    try {
      const prevEntries = await api.getTimeEntries(profile.company_id, user.id, prevWeekStart.toISOString().split('T')[0], prevWeekEnd.toISOString().split('T')[0]);
      for (const entry of prevEntries) {
        const newDate = new Date(entry.date);
        newDate.setDate(newDate.getDate() + 7);
        await api.createTimeEntry({
          company_id: profile.company_id,
          user_id: user.id,
          project_id: entry.project_id,
          task_id: entry.task_id,
          hours: entry.hours,
          description: entry.description,
          date: newDate.toISOString().split('T')[0],
          billable: entry.billable,
          hourly_rate: entry.hourly_rate,
          approval_status: 'draft',
        });
      }
      loadData();
    } catch (error) {
      console.error('Failed to copy previous week:', error);
    }
  };

  async function loadData() {
    if (!profile?.company_id || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const [allProjectsData, entriesData, expensesData, allDraftData] = await Promise.all([
        api.getProjects(profile.company_id),
        api.getTimeEntries(profile.company_id, user.id, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]),
        api.getExpenses(profile.company_id, user.id),
        // Load all draft/rejected entries (no date filter) for persistent rows
        api.getTimeEntries(profile.company_id, user.id).then(entries =>
          entries.filter(e => e.approval_status === 'draft' || e.approval_status === 'rejected')
        ),
      ]);

      // For staff, only show assigned projects (team member or has tasks assigned)
      let projectsData = allProjectsData;
      if (!canViewAllProjects && user?.id) {
        const [staffProjects, assignedTasks] = await Promise.all([
          api.getStaffProjects(user.id).catch(() => []),
          supabase
            .from('tasks')
            .select('project_id')
            .eq('assigned_to', user.id)
            .then(({ data }) => data || [])
            .catch(() => []),
        ]);
        const assignedIds = new Set([
          ...(staffProjects || []).map((sp: any) => sp.project_id),
          ...(assignedTasks || []).map((t: any) => t.project_id).filter(Boolean),
        ]);
        projectsData = allProjectsData.filter(p => assignedIds.has(p.id));
      }

      setProjects(projectsData);
      setTimeEntries(entriesData);
      setAllDraftEntries(allDraftData);
      setExpenses(expensesData);

      // Load pending and approved data for managers/admins
      if (canApprove) {
        const [pendingTime, pendingExp] = await Promise.all([
          api.getPendingTimeEntries(profile.company_id),
          api.getPendingExpenses(profile.company_id),
        ]);
        setPendingTimeEntries(pendingTime);
        setPendingExpenses(pendingExp);

        // Load approved entries
        await loadApprovedData();
      }

      // Load tasks for all projects in parallel (N+1 fix)
      const taskResults = await Promise.allSettled(
        projectsData.map(project => api.getTasks(project.id).then(tasks => ({ projectId: project.id, tasks })))
      );
      const tasksMap: { [key: string]: Task[] } = {};
      taskResults.forEach(result => {
        if (result.status === 'fulfilled') tasksMap[result.value.projectId] = result.value.tasks;
      });
      setTasks(tasksMap);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  const loadApprovedData = async () => {
    if (!profile?.company_id || !canApprove) return;
    try {
      const [approvedTime, approvedExp] = await Promise.all([
        api.getApprovedTimeEntries(profile.company_id, dateRange.startDate, dateRange.endDate),
        api.getApprovedExpenses(profile.company_id, dateRange.startDate, dateRange.endDate),
      ]);
      setApprovedTimeEntries(approvedTime);
      setApprovedExpenses(approvedExp);
    } catch (err) {
      console.error('Failed to load approved data:', err);
    }
  };

  useEffect(() => {
    if (canApprove) loadApprovedData();
  }, [dateRange, canApprove]);

  // Reports data loading
  const loadReportData = async () => {
    if (!profile?.company_id || !canApprove) return;
    setReportLoading(true);
    try {
      let entries: TimeEntry[];
      if (reportStatusFilter === 'approved') {
        entries = await api.getApprovedTimeEntries(profile.company_id, reportDateRange.startDate, reportDateRange.endDate);
      } else {
        entries = await api.getTimeEntries(profile.company_id, undefined, reportDateRange.startDate, reportDateRange.endDate);
        if (reportStatusFilter !== 'all') {
          entries = entries.filter(e => e.approval_status === reportStatusFilter);
        }
        // Enrich with user data (getTimeEntries doesn't include user profiles)
        const userIds = [...new Set(entries.map(e => e.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
          const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
          entries = entries.map(e => ({ ...e, user: profileMap.get(e.user_id) || e.user || null }));
        }
      }
      setReportEntries(entries);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports' && canApprove) loadReportData();
  }, [activeTab, reportDateRange, reportStatusFilter, canApprove]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  }, [weekStart]);

  const navigateWeek = (direction: number) => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setWeekStart(newDate);
  };

  const navigateMobileDay = (direction: number) => {
    setMobileDayIndex(prev => {
      const next = prev + direction;
      if (next < 0) {
        // Go to previous week
        navigateWeek(-1);
        return 6;
      }
      if (next > 6) {
        // Go to next week
        navigateWeek(1);
        return 0;
      }
      return next;
    });
  };

  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatDateKey = (date: Date) => date.toISOString().split('T')[0];

  // Draft row helpers
  const getDraftValue = (rowId: string, dateKey: string) => {
    const key = `${rowId}-${dateKey}`;
    return draftValues[key];
  };

  const setDraftValue = (rowId: string, dateKey: string, value: number) => {
    const key = `${rowId}-${dateKey}`;
    setDraftValues(prev => ({ ...prev, [key]: value }));
  };

  const getDraftRowTotal = (row: DraftRow) => {
    let total = 0;
    weekDays.forEach(day => {
      const val = getDraftValue(row.id, formatDateKey(day));
      if (val) total += val;
    });
    return total;
  };

  const getSubmittedRowTotal = (row: SubmittedRow) => {
    return Object.values(row.entries).reduce((sum, entry) => sum + (entry?.hours || 0), 0);
  };

  const getTotalDraftHours = () => {
    return draftRows.reduce((sum, row) => sum + getDraftRowTotal(row), 0);
  };

  const getTotalSubmittedHours = () => {
    return submittedRows.reduce((sum, row) => sum + getSubmittedRowTotal(row), 0);
  };

  const hasUnsavedDrafts = Object.values(draftValues).some(v => v > 0);
  const hasSavedDrafts = savedDraftRows.length > 0;

  const submitTimesheet = async () => {
    if (!profile?.company_id || !user?.id || (!hasUnsavedDrafts && !hasSavedDrafts)) return;
    setSavingTimesheet(true);
    try {
      // Submit local draft values
      for (const row of draftRows) {
        for (const day of weekDays) {
          const dateKey = formatDateKey(day);
          const hours = getDraftValue(row.id, dateKey);
          if (hours && hours > 0) {
            await api.createTimeEntry({
              company_id: profile.company_id,
              user_id: user.id,
              project_id: row.projectId,
              task_id: row.taskId,
              description: row.activity || undefined,
              date: dateKey,
              hours,
              billable: true,
              hourly_rate: profile.hourly_rate || 150,
              approval_status: 'pending',
            });
          }
        }
      }
      // Submit saved draft entries (from timer or copy) - include any edited hours
      for (const row of savedDraftRows) {
        for (const [date, entry] of Object.entries(row.entries)) {
          const editedHours = rejectedEdits[entry.id];
          if (editedHours !== undefined) {
            await api.updateTimeEntry(entry.id, { hours: editedHours, approval_status: 'pending' });
          } else {
            await api.updateTimeEntry(entry.id, { approval_status: 'pending' });
          }
        }
      }
      setRejectedEdits({});
      setDraftValues({});
      await loadData();
    } catch (error) {
      console.error('Failed to submit timesheet:', error);
    } finally {
      setSavingTimesheet(false);
    }
  };

  async function updateTimeEntry(projectId: string, taskId: string | null, date: string, hours: number, description?: string) {
    if (!profile?.company_id || !user?.id) return;

    const existing = timeEntries.find(e =>
      e.project_id === projectId &&
      e.task_id === taskId &&
      e.date === date &&
      (e.description || '').trim().toLowerCase() === (description || '').trim().toLowerCase()
    );

    try {
      if (existing) {
        if (hours === 0) {
          await api.deleteTimeEntry(existing.id);
        } else {
          await api.updateTimeEntry(existing.id, { hours });
        }
      } else if (hours > 0) {
        await api.createTimeEntry({
          company_id: profile.company_id,
          user_id: user.id,
          project_id: projectId,
          task_id: taskId,
          description: description || undefined,
          date,
          hours,
          billable: true,
          hourly_rate: 150,
          approval_status: 'pending',
        });
      }
      loadData();
    } catch (error) {
      console.error('Failed to update time entry:', error);
    }
  }

  const addDraftRow = (projectId: string, taskId: string | null, activity: string) => {
    const project = projects.find(p => p.id === projectId) || null;
    const task = taskId ? tasks[projectId]?.find(t => t.id === taskId) || null : null;
    const key = `${projectId}-${taskId || 'null'}-${activity.trim().toLowerCase()}`;

    // Check if row already exists in drafts, saved drafts (from timer), or submitted
    if (draftRows.some(r => r.id === key) || savedDraftRows.some(r => r.id === key) || submittedRows.some(r => r.id === key)) {
      alert('This project/task/activity combination already exists in your timesheet.');
      return;
    }

    setDraftRows([...draftRows, { id: key, project, task, projectId, taskId, activity: activity.trim() }]);
    setShowTimeEntryModal(false);
  };

  const removeDraftRow = (row: DraftRow) => {
    // Remove from draft rows
    setDraftRows(draftRows.filter(r => r.id !== row.id));
    // Clear draft values for this row
    const newDraftValues = { ...draftValues };
    weekDays.forEach(day => {
      delete newDraftValues[`${row.id}-${formatDateKey(day)}`];
    });
    setDraftValues(newDraftValues);
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const deleteExpense = async (id: string) => {
    try {
      await api.deleteExpense(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete expense:', error);
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
        <p className="text-neutral-500">Unable to load time entries. Please log in again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 sm:pb-20">
      <div className="flex items-end justify-between gap-3 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-neutral-900 leading-tight">TIME & EXPENSE</h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#476E66] mt-1">Track billables</p>
        </div>
        <button
          onClick={() => activeTab === 'timesheet' ? setShowTimeEntryModal(true) : setShowExpenseModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-all shadow-lg shadow-[#476E66]/20 hover:shadow-xl hover:shadow-[#476E66]/30 hover:-translate-y-0.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{activeTab === 'timesheet' ? 'Add Row' : 'Add Expense'}</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-neutral-200 pb-0.5 overflow-x-auto">
        <button
          onClick={() => setActiveTab('timesheet')}
          className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'timesheet' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
        >
          Timesheet
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'expenses' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
        >
          Expenses
        </button>
        {canApprove && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'approvals' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
          >
            Approvals
            {(pendingTimeEntries.length + pendingExpenses.length) > 0 && (
              <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingTimeEntries.length + pendingExpenses.length}
              </span>
            )}
          </button>
        )}
        {canApprove && (
          <button
            onClick={() => setActiveTab('approved')}
            className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'approved' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
          >
            History
          </button>
        )}
        {canApprove && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'reports' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
          >
            Reports
          </button>
        )}
      </div>

      {/* Timer - Ultra Compact for Mobile */}
      {activeTab === 'timesheet' && (
        <div className="bg-white rounded-sm border border-neutral-200 p-3 shadow-sm mb-6">
          {/* Row 1: Timer + Buttons */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className={`text-3xl font-mono font-bold tracking-tight ${timerRunning ? 'text-[#476E66]' : 'text-neutral-900'}`}>
              {formatTimer(timerSeconds)}
            </div>
            <div className="flex items-center gap-2">
              {!timerRunning ? (
                <button onClick={startTimer} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm">
                  <Play className="w-5 h-5 fill-current" />
                </button>
              ) : (
                <button onClick={pauseTimer} className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-sm">
                  <Pause className="w-5 h-5 fill-current" />
                </button>
              )}
              <button
                onClick={stopTimer}
                disabled={timerSeconds === 0 || !timerProjectId}
                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Square className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>
          {/* Row 2: Project + Task (side by side on mobile) */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <select
                value={timerProjectId}
                onChange={(e) => { setTimerProjectId(e.target.value); setTimerTaskId(''); }}
                className="w-full pl-3 pr-8 py-2 border border-neutral-200 rounded-sm text-xs font-medium focus:ring-0 focus:border-neutral-900 outline-none bg-neutral-50 appearance-none transition-colors"
                disabled={timerRunning}
              >
                <option value="">Select Project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
            </div>
            <div className="relative flex-1">
              <select
                value={timerTaskId}
                onChange={(e) => setTimerTaskId(e.target.value)}
                className="w-full pl-3 pr-8 py-2 border border-neutral-200 rounded-sm text-xs font-medium focus:ring-0 focus:border-neutral-900 outline-none bg-neutral-50 appearance-none transition-colors"
                disabled={timerRunning || !timerProjectId}
              >
                <option value="">Select Task...</option>
                {timerProjectId && tasks[timerProjectId]?.filter(t =>
                  !t.collaborator_company_id || t.collaborator_company_id === profile?.company_id
                ).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
            </div>
          </div>
          {/* Row 3: Description */}
          <input
            type="text"
            placeholder="What are you working on?"
            value={timerDescription}
            onChange={(e) => setTimerDescription(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-sm text-xs font-medium focus:ring-0 focus:border-neutral-900 outline-none placeholder:text-neutral-400 transition-colors"
          />
        </div>
      )}

      {/* Timesheet - Mobile Optimized */}
      {activeTab === 'timesheet' && (
        <div className="space-y-4">
          {/* Draft Section */}
          <div className="bg-white rounded-sm border border-neutral-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-3 border-b border-neutral-200 bg-neutral-50">
              <div className="px-2 py-0.5 bg-neutral-900 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest">Draft</div>
              {/* Desktop: Week Navigation */}
              <div className="hidden md:flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateWeek(-1); }}
                  className="p-1 hover:bg-neutral-200 rounded-sm cursor-pointer transition-colors text-neutral-500 hover:text-neutral-900"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-bold text-neutral-900 select-none text-center uppercase tracking-wide px-2">
                  {formatDate(weekDays[0])} - {formatDate(weekDays[6])}, {weekDays[0].getFullYear()}
                </h3>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateWeek(1); }}
                  className="p-1.5 hover:bg-neutral-200 bg-neutral-100 rounded-lg cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-700" />
                </button>
              </div>
              {/* Mobile: Single Day Navigation - Compact */}
              <div className="flex md:hidden items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateMobileDay(-1); }}
                  className="p-1 hover:bg-neutral-200 bg-neutral-100 rounded cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-neutral-700" />
                </button>
                <div className="text-center px-2">
                  <span className="text-xs text-neutral-600">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekDays[mobileDayIndex].getDay()]}</span>
                  <span className="text-sm font-bold text-neutral-900 ml-1">{formatDate(weekDays[mobileDayIndex])}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateMobileDay(1); }}
                  className="p-1 hover:bg-neutral-200 bg-neutral-100 rounded cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-neutral-700" />
                </button>
              </div>
            </div>

            {/* Desktop View: Full Week */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    <th className="text-left px-2 sm:px-3 lg:px-4 py-2 text-xs font-medium text-neutral-600 w-32 sm:w-48 lg:w-64">Project / Task</th>
                    {weekDays.map((day, i) => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      const dateKey = formatDateKey(day);
                      const isFutureDate = dateKey > todayStr;
                      const isToday = dateKey === todayStr;
                      return (
                        <th key={i} className={`text-center px-1 py-2 text-xs font-medium w-14 sm:w-16 lg:w-20 ${isFutureDate ? 'text-neutral-300' : 'text-neutral-600'}`}>
                          <div className="text-xs">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][day.getDay()]}</div>
                          <div className={`text-base sm:text-lg font-semibold ${isToday ? 'text-[#476E66]' : isFutureDate ? 'text-neutral-300' : 'text-neutral-900'}`}>{day.getDate()}</div>
                        </th>
                      );
                    })}
                    <th className="text-center px-2 py-2 text-xs font-medium text-neutral-600 w-14 sm:w-16 lg:w-20">Total</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {draftRows.length === 0 && savedDraftRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-6">
                        <div className="space-y-2">
                          <p className="text-neutral-500 text-sm">No time entries for this week</p>
                          <button
                            onClick={() => setShowTimeEntryModal(true)}
                            className="px-4 py-2 border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors font-medium text-sm"
                          >
                            + Add Project Row
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Saved draft entries from timer/copy - includes rejected entries */}
                  {savedDraftRows.map((row) => {
                    const hasRejected = Object.values(row.entries).some(e => e.approval_status === 'rejected');
                    const rowDescription = Object.values(row.entries)[0]?.description || '';
                    return (
                      <tr key={`saved-${row.id}`} className={hasRejected ? "hover:bg-red-50/50 bg-red-50/30" : "hover:bg-green-50/50 bg-green-50/30"}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-900">
                            {row.project?.name || 'Unknown Project'}
                            {row.task && <span className="text-neutral-600"> / {row.task.name}</span>}
                          </div>
                          {rowDescription && rowDescription !== row.task?.name && (
                            <span className="text-[11px] font-medium text-neutral-500 italic">{rowDescription}</span>
                          )}
                          {hasRejected ? (
                            <span className="text-xs text-red-600 font-medium">⚠️ Rejected - Please revise and resubmit</span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">From Timer</span>
                          )}
                        </td>
                        {weekDays.map((day, i) => {
                          const dateKey = formatDateKey(day);
                          const entry = row.entries[dateKey];
                          const isRejected = entry?.approval_status === 'rejected';
                          const todayStr = new Date().toISOString().split('T')[0];
                          const isFutureDate = dateKey > todayStr;
                          return (
                            <td key={i} className="px-2 py-3">
                              <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                defaultValue={entry?.hours || ''}
                                disabled={isFutureDate}
                                className={`w-full h-10 text-center rounded-lg border-2 outline-none ${isFutureDate
                                  ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                                  : isRejected
                                    ? 'border-red-300 bg-red-50 focus:ring-2 focus:ring-red-400 focus:border-transparent'
                                    : 'border-green-300 bg-green-50 focus:ring-2 focus:ring-green-400 focus:border-transparent'
                                  }`}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  if (entry) {
                                    setRejectedEdits(prev => ({ ...prev, [entry.id]: val }));
                                  }
                                }}
                              />
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-semibold text-neutral-900">
                          {Object.values(row.entries).reduce((sum, e) => sum + (rejectedEdits[e.id] !== undefined ? rejectedEdits[e.id] : (e.hours || 0)), 0)}h
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={async () => {
                              for (const entry of Object.values(row.entries)) {
                                await api.deleteTimeEntry(entry.id);
                              }
                              await loadData();
                            }}
                            className="p-1.5 hover:bg-red-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Local draft rows */}
                  {draftRows.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-neutral-900">{row.project?.name || 'Unknown Project'}</span>
                          {row.task && <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide mt-0.5">{row.task.name}</span>}
                          {row.activity && row.activity !== row.task?.name && (
                            <span className="text-[11px] font-medium text-neutral-500 italic mt-0.5">{row.activity}</span>
                          )}
                        </div>
                      </td>
                      {weekDays.map((day, i) => {
                        const dateKey = formatDateKey(day);
                        const draftVal = getDraftValue(row.id, dateKey);
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isFutureDate = dateKey > todayStr;
                        return (
                          <td key={i} className="px-1 py-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="24"
                              step="0.5"
                              value={draftVal || ''}
                              placeholder="-"
                              disabled={isFutureDate}
                              title={isFutureDate ? 'Cannot enter time for future dates' : ''}
                              className={`w-12 h-9 text-center rounded-sm border-2 text-xs font-bold outline-none transition-colors placeholder:text-neutral-300 ${isFutureDate
                                ? 'border-neutral-100 bg-neutral-50 text-neutral-300 cursor-not-allowed'
                                : 'border-neutral-200 bg-white text-neutral-900 focus:border-[#476E66] focus:ring-0'
                                }`}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setDraftValue(row.id, dateKey, val);
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-bold text-sm text-neutral-900 font-mono">
                        {getDraftRowTotal(row)}h
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => removeDraftRow(row)}
                          className="p-1.5 hover:bg-neutral-100 text-neutral-400 hover:text-red-500 rounded-sm transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={10} className="py-2 px-4">
                      <button
                        onClick={() => setShowTimeEntryModal(true)}
                        className="text-[#476E66] hover:text-[#3A5B54] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 py-2"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add another project row
                      </button>
                    </td>
                  </tr>
                </tbody>
                {draftRows.length > 0 && (
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td className="px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Total Draft Hours</td>
                      {weekDays.map((day, i) => {
                        const dateKey = formatDateKey(day);
                        const dayTotal = draftRows.reduce((sum, row) => sum + (getDraftValue(row.id, dateKey) || 0), 0);
                        return (
                          <td key={i} className="px-1 py-3 text-center font-bold text-xs text-neutral-600 font-mono">
                            {dayTotal > 0 ? `${dayTotal}h` : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-bold text-neutral-900 text-sm font-mono">
                        {getTotalDraftHours()}h
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Mobile View: Single Day */}
            <div className="block md:hidden overflow-x-auto">
              <table className="w-full min-w-0">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Project / Task</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-neutral-600 w-24">Hours</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {draftRows.length === 0 && savedDraftRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-6">
                        <div className="space-y-2">
                          <p className="text-neutral-500 text-sm">No time entries for {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekDays[mobileDayIndex].getDay()]}</p>
                          <button
                            onClick={() => setShowTimeEntryModal(true)}
                            className="px-4 py-2 border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 transition-colors font-medium text-sm"
                          >
                            + Add Project Row
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Saved draft entries from timer/copy - includes rejected entries */}
                  {savedDraftRows.map((row) => {
                    const day = weekDays[mobileDayIndex];
                    const dateKey = formatDateKey(day);
                    const entry = row.entries[dateKey];
                    if (!entry) return null; // Only show rows with entries for this day
                    const isRejected = entry?.approval_status === 'rejected';
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isFutureDate = dateKey > todayStr;
                    const hasRejected = Object.values(row.entries).some(e => e.approval_status === 'rejected');
                    const mobileRowDescription = Object.values(row.entries)[0]?.description || '';
                    return (
                      <tr key={`saved-${row.id}`} className={hasRejected ? "bg-red-50/30" : "bg-green-50/30"}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-sm text-neutral-900">
                            {row.project?.name || 'Unknown Project'}
                            {row.task && <span className="text-neutral-600"> / {row.task.name}</span>}
                          </div>
                          {mobileRowDescription && mobileRowDescription !== row.task?.name && (
                            <span className="text-[11px] font-medium text-neutral-500 italic">{mobileRowDescription}</span>
                          )}
                          {hasRejected ? (
                            <span className="text-xs text-red-600 font-medium">⚠️ Rejected</span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">From Timer</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            defaultValue={entry?.hours || ''}
                            disabled={isFutureDate}
                            className={`w-full h-11 text-center rounded-lg border-2 outline-none text-sm ${isFutureDate
                              ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                              : isRejected
                                ? 'border-red-300 bg-red-50 focus:ring-2 focus:ring-red-400 focus:border-transparent'
                                : 'border-green-300 bg-green-50 focus:ring-2 focus:ring-green-400 focus:border-transparent'
                              }`}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              if (entry) {
                                setRejectedEdits(prev => ({ ...prev, [entry.id]: val }));
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={async () => {
                              await api.deleteTimeEntry(entry.id);
                              await loadData();
                            }}
                            className="p-1.5 hover:bg-red-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Local draft rows */}
                  {draftRows.map((row) => {
                    const day = weekDays[mobileDayIndex];
                    const dateKey = formatDateKey(day);
                    const draftVal = getDraftValue(row.id, dateKey);
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isFutureDate = dateKey > todayStr;
                    return (
                      <tr key={row.id} className="hover:bg-neutral-100/50">
                        <td className="px-3 py-3">
                          <div className="font-medium text-sm text-neutral-900">
                            {row.project?.name || 'Unknown Project'}
                            {row.task && <span className="text-neutral-600"> / {row.task.name}</span>}
                          </div>
                          {row.activity && row.activity !== row.task?.name && (
                            <span className="text-[11px] font-medium text-neutral-500 italic">{row.activity}</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value={draftVal || ''}
                            placeholder=""
                            disabled={isFutureDate}
                            title={isFutureDate ? 'Cannot enter time for future dates' : ''}
                            className={`w-full h-11 text-center rounded-lg border-2 outline-none text-sm ${isFutureDate
                              ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                              : 'border-neutral-200 bg-neutral-100 focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66]'
                              }`}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setDraftValue(row.id, dateKey, val);
                            }}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => removeDraftRow(row)}
                            className="p-1.5 hover:bg-red-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={3} className="py-3 px-3">
                      <button
                        onClick={() => setShowTimeEntryModal(true)}
                        className="text-[#476E66] hover:text-[#3A5B54] font-medium text-sm flex items-center gap-1"
                      >
                        <span className="text-lg">+</span> Add another project row
                      </button>
                    </td>
                  </tr>
                </tbody>
                {draftRows.length > 0 && (() => {
                  const day = weekDays[mobileDayIndex];
                  const dateKey = formatDateKey(day);
                  const dayTotal = draftRows.reduce((sum, row) => sum + (getDraftValue(row.id, dateKey) || 0), 0);
                  return dayTotal > 0 ? (
                    <tfoot className="bg-neutral-100 border-t border-neutral-200">
                      <tr>
                        <td className="px-3 py-3 font-semibold text-neutral-900 text-sm">Total for Day</td>
                        <td className="px-3 py-3 text-center font-bold text-neutral-900 text-base">{dayTotal}h</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  ) : null;
                })()}
              </table>
            </div>

            {/* Submit Button - Compact */}
            <div className="p-2 sm:p-4 border-t border-neutral-100 flex justify-center sm:justify-end">
              <button
                onClick={submitTimesheet}
                disabled={(!hasUnsavedDrafts && !hasSavedDrafts) || savingTimesheet}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 sm:px-6 py-2.5 border-2 border-[#476E66] text-[#476E66] bg-transparent rounded-lg hover:bg-[#476E66]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                <Send className="w-4 h-4" />
                {savingTimesheet ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          </div>

          {/* Submitted Section - Compact */}
          {submittedRows.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-100 overflow-hidden opacity-90">
              <div className="flex items-center justify-between p-1.5 sm:p-3 border-b border-neutral-100 bg-neutral-50">
                <div className="flex items-center gap-2">
                  <div className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Submitted</div>
                  <span className="text-neutral-500 text-xs hidden sm:inline">Pending approval</span>
                </div>
                {/* Mobile: Single Day Navigation for Submitted */}
                <div className="flex md:hidden items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateMobileDay(-1); }}
                    className="p-1 hover:bg-neutral-200 bg-neutral-100 rounded cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-neutral-700" />
                  </button>
                  <div className="text-center px-1">
                    <span className="text-xs text-neutral-600">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekDays[mobileDayIndex].getDay()]}</span>
                    <span className="text-sm font-bold text-neutral-900 ml-1">{formatDate(weekDays[mobileDayIndex])}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateMobileDay(1); }}
                    className="p-1 hover:bg-neutral-200 bg-neutral-100 rounded cursor-pointer transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-700" />
                  </button>
                </div>
              </div>

              {/* Mobile: Single Day View for Submitted */}
              <div className="md:hidden">
                <table className="w-full">
                  <thead className="bg-neutral-100 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 uppercase">Project / Task</th>
                      <th className="text-center px-2 py-2 text-xs font-medium text-neutral-500 uppercase w-16">Hours</th>
                      <th className="text-center px-2 py-2 text-xs font-medium text-neutral-500 uppercase w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(() => {
                      const day = weekDays[mobileDayIndex];
                      const dateKey = formatDateKey(day);
                      const rowsForDay = submittedRows.filter(row => row.entries[dateKey]?.hours);
                      if (rowsForDay.length === 0) {
                        return (
                          <tr>
                            <td colSpan={3} className="text-center py-4 text-neutral-500 text-xs">
                              No submitted entries for {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.getDay()]}
                            </td>
                          </tr>
                        );
                      }
                      return rowsForDay.map((row) => {
                        const entry = row.entries[dateKey];
                        const mobileSubmittedDesc = Object.values(row.entries)[0]?.description || '';
                        return (
                          <tr key={row.id} className="bg-neutral-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-neutral-600 text-xs">
                                {row.project?.name || 'Unknown'}
                                {row.task && <span className="text-neutral-500"> / {row.task.name}</span>}
                              </div>
                              {mobileSubmittedDesc && mobileSubmittedDesc !== row.task?.name && (
                                <span className="text-[10px] font-medium text-neutral-500 italic">{mobileSubmittedDesc}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${entry?.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                entry?.approval_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                {entry?.hours || 0}h
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              {entry?.approval_status === 'approved' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px]">Approved</span>}
                              {entry?.approval_status === 'rejected' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px]">Rejected</span>}
                              {entry?.approval_status === 'pending' && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px]">Pending</span>}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  {(() => {
                    const day = weekDays[mobileDayIndex];
                    const dateKey = formatDateKey(day);
                    const dayTotal = submittedRows.reduce((sum, row) => sum + (row.entries[dateKey]?.hours || 0), 0);
                    return dayTotal > 0 ? (
                      <tfoot className="bg-neutral-100 border-t border-neutral-200">
                        <tr>
                          <td className="px-3 py-2 font-medium text-neutral-600 text-xs">Day Total</td>
                          <td className="px-2 py-2 text-center font-bold text-neutral-700 text-sm">{dayTotal}h</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    ) : null;
                  })()}
                </table>
              </div>

              {/* Desktop: Full Week View for Submitted */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-100 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-64">Project / Task</th>
                      {weekDays.map((day, i) => (
                        <th key={i} className="text-center px-2 py-3 text-xs font-medium text-neutral-500 uppercase w-20">
                          <div>{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day.getDay()]}</div>
                          <div className="text-lg font-semibold text-neutral-600">{day.getDate()}</div>
                        </th>
                      ))}
                      <th className="text-center px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-20">Total</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {submittedRows.map((row) => {
                      const submittedDescription = Object.values(row.entries)[0]?.description || '';
                      return (
                      <tr key={row.id} className="bg-neutral-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-600">
                            {row.project?.name || 'Unknown Project'}
                            {row.task && <span className="text-neutral-500"> / {row.task.name}</span>}
                          </div>
                          {submittedDescription && submittedDescription !== row.task?.name && (
                            <span className="text-[11px] font-medium text-neutral-500 italic">{submittedDescription}</span>
                          )}
                        </td>
                        {weekDays.map((day, i) => {
                          const dateKey = formatDateKey(day);
                          const entry = row.entries[dateKey];
                          return (
                            <td key={i} className="px-2 py-3">
                              <div className={`w-full h-10 flex items-center justify-center rounded-lg border-2 text-neutral-600 ${entry?.approval_status === 'approved' ? 'border-emerald-300 bg-neutral-100' :
                                entry?.approval_status === 'rejected' ? 'border-red-300 bg-neutral-100' :
                                  entry ? 'border-amber-300 bg-neutral-100' : 'border-neutral-200 bg-neutral-100'
                                }`}>
                                {entry?.hours || '-'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-semibold text-neutral-600">
                          {getSubmittedRowTotal(row)}h
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const statuses = Object.values(row.entries).map(e => e?.approval_status);
                            const hasApproved = statuses.includes('approved');
                            const hasRejected = statuses.includes('rejected');
                            const hasPending = statuses.includes('pending');
                            if (hasRejected) return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Rejected</span>;
                            if (hasApproved && !hasPending) return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs">Approved</span>;
                            return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs">Pending</span>;
                          })()}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                  <tfoot className="bg-neutral-100 border-t border-neutral-200">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-neutral-600">Submitted Total</td>
                      {weekDays.map((day, i) => {
                        const dateKey = formatDateKey(day);
                        const dayTotal = submittedRows.reduce((sum, row) => sum + (row.entries[dateKey]?.hours || 0), 0);
                        return (
                          <td key={i} className="px-2 py-3 text-center font-medium text-neutral-500">
                            {dayTotal > 0 ? `${dayTotal}h` : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-bold text-neutral-600 text-lg">
                        {getTotalSubmittedHours()}h
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expenses */}
      {activeTab === 'expenses' && (
        <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Description</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Project</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Category</th>
                  {canViewFinancials && <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Amount</th>}
                  <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-neutral-500">
                      <p className="text-sm">No expenses recorded</p>
                      <button
                        onClick={() => setShowExpenseModal(true)}
                        className="mt-2 text-[#476E66] hover:text-[#3A5B54] font-medium text-sm"
                      >
                        Add your first expense
                      </button>
                    </td>
                  </tr>
                ) : (
                  expenses.map(expense => (
                    <tr key={expense.id} className="hover:bg-neutral-50/50">
                      <td className="px-3 py-2.5 text-xs text-neutral-600">{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                      <td className="px-3 py-2.5 text-sm font-medium text-neutral-900">{expense.description}</td>
                      <td className="px-3 py-2.5 text-xs text-neutral-600">{expense.project?.name || '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-neutral-600">{expense.category || '-'}</td>
                      {canViewFinancials && <td className="px-3 py-2.5 text-right text-sm font-medium text-neutral-900">{formatCurrency(expense.amount)}</td>}
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${expense.approval_status === 'approved' ? 'bg-[#476E66]/10 text-[#476E66]' :
                          expense.approval_status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                          {expense.approval_status || 'pending'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingExpense(expense); setShowExpenseModal(true); }}
                            className="p-1.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteExpense(expense.id)}
                            className="p-1.5 hover:bg-red-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="block md:hidden divide-y divide-neutral-50">
            {expenses.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                <p className="text-sm">No expenses recorded</p>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="mt-2 text-[#476E66] hover:text-[#3A5B54] font-medium text-sm"
                >
                  Add your first expense
                </button>
              </div>
            ) : (
              expenses.map(expense => (
                <div key={expense.id} className="p-3 hover:bg-neutral-50/50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-neutral-900 mb-1">{expense.description}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span>{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                        {expense.project?.name && (
                          <>
                            <span>•</span>
                            <span>{expense.project.name}</span>
                          </>
                        )}
                        {expense.category && (
                          <>
                            <span>•</span>
                            <span>{expense.category}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setEditingExpense(expense); setShowExpenseModal(true); }}
                        className="p-1.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteExpense(expense.id)}
                        className="p-1.5 hover:bg-red-100 text-neutral-400 hover:text-neutral-900 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {canViewFinancials && (
                      <div className="text-sm font-semibold text-neutral-900">{formatCurrency(expense.amount)}</div>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${expense.approval_status === 'approved' ? 'bg-[#476E66]/10 text-[#476E66]' :
                      expense.approval_status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                      {expense.approval_status || 'pending'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Approvals Tab */}
      {activeTab === 'approvals' && canApprove && (
        <div className="space-y-3 sm:space-y-4">
          {/* Date Range Picker */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900">Pending Approvals</h2>
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onDateChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
            />
          </div>

          {/* Pending Time Entries - Grouped by Project */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-semibold text-neutral-900">Pending Time Entries</h3>
              {selectedTimeEntries.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-neutral-500">{selectedTimeEntries.size} selected</span>
                  <button
                    onClick={async () => {
                      for (const id of selectedTimeEntries) {
                        await api.approveTimeEntry(id, user?.id || '');
                      }
                      setSelectedTimeEntries(new Set());
                      loadData();
                    }}
                    className="px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-xs sm:text-sm font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      for (const id of selectedTimeEntries) {
                        await api.rejectTimeEntry(id, user?.id || '');
                      }
                      setSelectedTimeEntries(new Set());
                      loadData();
                    }}
                    className="px-3 py-1.5 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 text-xs sm:text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
            {filteredPendingTimeEntries.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No pending time entries for this period</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {/* Group by project */}
                {Object.entries(
                  filteredPendingTimeEntries.reduce((groups, entry) => {
                    const projectId = entry.project?.id || 'unknown';
                    const projectName = entry.project?.name || 'Unknown Project';
                    if (!groups[projectId]) {
                      groups[projectId] = { name: projectName, entries: [] };
                    }
                    groups[projectId].entries.push(entry);
                    return groups;
                  }, {} as Record<string, { name: string; entries: TimeEntry[] }>)
                ).map(([projectId, group]) => {
                  const allSelected = group.entries.every(e => selectedTimeEntries.has(e.id));
                  const someSelected = group.entries.some(e => selectedTimeEntries.has(e.id));
                  const totalHours = group.entries.reduce((sum, e) => sum + Number(e.hours), 0);

                  return (
                    <div key={projectId}>
                      {/* Project Header */}
                      <div className="bg-neutral-50 px-3 sm:px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={(e) => {
                              const newSelected = new Set(selectedTimeEntries);
                              group.entries.forEach(entry => {
                                if (e.target.checked) {
                                  newSelected.add(entry.id);
                                } else {
                                  newSelected.delete(entry.id);
                                }
                              });
                              setSelectedTimeEntries(newSelected);
                            }}
                            className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                          />
                          <span className="font-semibold text-sm text-neutral-900">{group.name}</span>
                          <span className="text-xs text-neutral-500">({group.entries.length})</span>
                        </div>
                        <div className="text-xs sm:text-sm">
                          <span className="text-neutral-500">Total: </span>
                          <span className="font-medium text-neutral-900">{totalHours.toFixed(1)}h</span>
                        </div>
                      </div>
                      {/* Entries - Mobile Cards */}
                      <div className="block md:hidden divide-y divide-neutral-50">
                        {group.entries.map(entry => (
                          <div key={entry.id} className={`p-3 ${selectedTimeEntries.has(entry.id) ? 'bg-[#476E66]/5' : ''}`}>
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedTimeEntries.has(entry.id)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedTimeEntries);
                                  if (e.target.checked) {
                                    newSelected.add(entry.id);
                                  } else {
                                    newSelected.delete(entry.id);
                                  }
                                  setSelectedTimeEntries(newSelected);
                                }}
                                className="w-3.5 h-3.5 mt-0.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-neutral-900 mb-1">
                                  {entry.user?.full_name || entry.user?.email || '-'}
                                </div>
                                <div className="text-xs text-neutral-600 mb-1">
                                  {entry.task?.name && <span className="font-medium text-neutral-700">{entry.task.name}</span>}
                                  {entry.description && (
                                    <span className="text-neutral-400 italic">{entry.task?.name ? ' — ' : ''}{entry.description}</span>
                                  )}
                                  {!entry.task?.name && !entry.description && '-'}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                  <span>{entry.date ? new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                                  <span>•</span>
                                  <span className="font-medium text-[#476E66]">{Number(entry.hours).toFixed(1)}h</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Entries Table - Desktop */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-white border-b border-neutral-100">
                            <tr>
                              <th className="w-10 px-3 py-2"></th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Date</th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Submitted By</th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Task / Activity</th>
                              <th className="text-right px-2 py-2 text-xs font-medium text-neutral-600">Hours</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50">
                            {group.entries.map(entry => (
                              <tr key={entry.id} className={`hover:bg-neutral-50/50 ${selectedTimeEntries.has(entry.id) ? 'bg-[#476E66]/5' : ''}`}>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedTimeEntries.has(entry.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedTimeEntries);
                                      if (e.target.checked) {
                                        newSelected.add(entry.id);
                                      } else {
                                        newSelected.delete(entry.id);
                                      }
                                      setSelectedTimeEntries(newSelected);
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                                  />
                                </td>
                                <td className="px-2 py-2.5 text-xs text-neutral-600">{entry.date ? new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                                <td className="px-2 py-2.5 text-sm font-medium text-neutral-900">{entry.user?.full_name || entry.user?.email || '-'}</td>
                                <td className="px-2 py-2.5 text-xs text-neutral-600">
                                  <div>
                                    {entry.task?.name && <span className="font-medium text-neutral-700">{entry.task.name}</span>}
                                    {entry.description && (
                                      <span className="text-neutral-400 italic">{entry.task?.name ? ' — ' : ''}{entry.description}</span>
                                    )}
                                    {!entry.task?.name && !entry.description && '-'}
                                  </div>
                                </td>
                                <td className="px-2 py-2.5 text-right text-sm font-medium text-[#476E66]">{Number(entry.hours).toFixed(1)}h</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Expenses - Grouped by Project */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-semibold text-neutral-900">Pending Expenses</h3>
              {selectedExpenses.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-neutral-500">{selectedExpenses.size} selected</span>
                  <button
                    onClick={async () => {
                      for (const id of selectedExpenses) {
                        await api.approveExpense(id, user?.id || '');
                      }
                      setSelectedExpenses(new Set());
                      loadData();
                    }}
                    className="px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-xs sm:text-sm font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      for (const id of selectedExpenses) {
                        await api.rejectExpense(id, user?.id || '');
                      }
                      setSelectedExpenses(new Set());
                      loadData();
                    }}
                    className="px-3 py-1.5 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 text-xs sm:text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
            {filteredPendingExpenses.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No pending expenses for this period</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {Object.entries(
                  filteredPendingExpenses.reduce((groups, expense) => {
                    const projectId = expense.project?.id || 'unknown';
                    const projectName = expense.project?.name || 'Unknown Project';
                    if (!groups[projectId]) {
                      groups[projectId] = { name: projectName, expenses: [] };
                    }
                    groups[projectId].expenses.push(expense);
                    return groups;
                  }, {} as Record<string, { name: string; expenses: Expense[] }>)
                ).map(([projectId, group]) => {
                  const allSelected = group.expenses.every(e => selectedExpenses.has(e.id));
                  const someSelected = group.expenses.some(e => selectedExpenses.has(e.id));
                  const totalAmount = group.expenses.reduce((sum, e) => sum + Number(e.amount), 0);

                  return (
                    <div key={projectId}>
                      <div className="bg-neutral-50 px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={(e) => {
                              const newSelected = new Set(selectedExpenses);
                              group.expenses.forEach(expense => {
                                if (e.target.checked) {
                                  newSelected.add(expense.id);
                                } else {
                                  newSelected.delete(expense.id);
                                }
                              });
                              setSelectedExpenses(newSelected);
                            }}
                            className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                          />
                          <span className="font-semibold text-sm text-neutral-900">{group.name}</span>
                          <span className="text-xs text-neutral-500">({group.expenses.length})</span>
                        </div>
                        <div className="text-xs sm:text-sm">
                          <span className="text-neutral-500">Total: </span>
                          <span className="font-medium text-neutral-900">{formatCurrency(totalAmount)}</span>
                        </div>
                      </div>
                      {/* Mobile Cards */}
                      <div className="block md:hidden divide-y divide-neutral-50">
                        {group.expenses.map(expense => (
                          <div key={expense.id} className={`p-3 ${selectedExpenses.has(expense.id) ? 'bg-[#476E66]/5' : ''}`}>
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedExpenses.has(expense.id)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedExpenses);
                                  if (e.target.checked) {
                                    newSelected.add(expense.id);
                                  } else {
                                    newSelected.delete(expense.id);
                                  }
                                  setSelectedExpenses(newSelected);
                                }}
                                className="w-3.5 h-3.5 mt-0.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-neutral-900 mb-1">{expense.description}</div>
                                <div className="text-xs text-neutral-600 mb-1">{expense.user?.full_name || expense.user?.email || '-'}</div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 mb-2">
                                  <span>{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                                  {expense.category && (
                                    <>
                                      <span>•</span>
                                      <span>{expense.category}</span>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-semibold text-[#476E66]">{formatCurrency(expense.amount)}</div>
                                  {expense.receipt_url && (
                                    <a
                                      href={expense.receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-xs font-medium"
                                    >
                                      <Paperclip className="w-3 h-3" />
                                      Receipt
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-white border-b border-neutral-100">
                            <tr>
                              <th className="w-10 px-3 py-2"></th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Date</th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">By</th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Description</th>
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Category</th>
                              <th className="text-center px-2 py-2 text-xs font-medium text-neutral-600">Receipt</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50">
                            {group.expenses.map(expense => (
                              <tr key={expense.id} className={`hover:bg-neutral-50/50 ${selectedExpenses.has(expense.id) ? 'bg-[#476E66]/5' : ''}`}>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedExpenses.has(expense.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedExpenses);
                                      if (e.target.checked) {
                                        newSelected.add(expense.id);
                                      } else {
                                        newSelected.delete(expense.id);
                                      }
                                      setSelectedExpenses(newSelected);
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                                  />
                                </td>
                                <td className="px-2 py-2.5 text-xs text-neutral-600">{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                                <td className="px-2 py-2.5 text-sm font-medium text-neutral-900">{expense.user?.full_name || expense.user?.email || '-'}</td>
                                <td className="px-2 py-2.5 text-xs text-neutral-600">{expense.description}</td>
                                <td className="px-2 py-2.5 text-xs text-neutral-600">{expense.category || '-'}</td>
                                <td className="px-2 py-2.5 text-center">
                                  {expense.receipt_url ? (
                                    <a
                                      href={expense.receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-xs font-medium hover:bg-[#476E66]/20"
                                    >
                                      <Paperclip className="w-3 h-3" />
                                      View
                                    </a>
                                  ) : (
                                    <span className="text-neutral-400 text-xs">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right text-sm font-semibold text-[#476E66]">{formatCurrency(expense.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approved History Tab */}
      {activeTab === 'approved' && canApprove && (
        <div className="space-y-3 sm:space-y-4">
          {/* Date Range Picker + Export */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-900 uppercase tracking-widest">Approved History</h2>
            <div className="flex items-center gap-2">
              <DateRangePicker
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onDateChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
              />
              {/* Export Dropdown */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={approvedTimeEntries.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={approvedTimeEntries.length === 0 ? 'No approved entries to export' : 'Export to CSV'}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-neutral-200 shadow-lg z-50 overflow-hidden">
                    <button
                      onClick={exportQuickBooksCSV}
                      className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors border-b border-neutral-100"
                    >
                      <div className="text-sm font-medium text-neutral-900">QuickBooks CSV</div>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Import-ready for QuickBooks Time & Payroll</p>
                    </button>
                    <button
                      onClick={exportDetailedCSV}
                      className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors"
                    >
                      <div className="text-sm font-medium text-neutral-900">Detailed CSV</div>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Full details with rates & amounts</p>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Approved Time Entries - Collapsible by Project then User */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-4 py-4 border-b border-neutral-100">
              <h3 className="text-neutral-500 text-[10px] uppercase tracking-wider font-semibold">Approved Time Entries</h3>
              <p className="text-[10px] text-neutral-400 mt-1 font-mono">
                Total: <span className="text-neutral-700 font-medium">{approvedTimeEntries.reduce((sum, e) => sum + Number(e.hours), 0).toFixed(1)}h</span> across {
                  new Set(approvedTimeEntries.map(e => e.project?.id)).size
                } projects
              </p>
            </div>
            {approvedTimeEntries.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 text-sm">No approved time entries for this period</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {/* Group by project */}
                {Object.entries(
                  approvedTimeEntries.reduce((groups, entry) => {
                    const projectId = entry.project?.id || 'unknown';
                    const projectName = entry.project?.name || 'Unknown Project';
                    if (!groups[projectId]) {
                      groups[projectId] = { name: projectName, users: {} };
                    }
                    const oduserId = entry.user?.id || 'unknown';
                    const userName = entry.user?.full_name || entry.user?.email || 'Unknown User';
                    if (!groups[projectId].users[oduserId]) {
                      groups[projectId].users[oduserId] = { name: userName, entries: [] };
                    }
                    groups[projectId].users[oduserId].entries.push(entry);
                    return groups;
                  }, {} as Record<string, { name: string; users: Record<string, { name: string; entries: TimeEntry[] }> }>)
                ).map(([projectId, project]) => {
                  const projectTotalHours = Object.values(project.users).reduce(
                    (sum, user) => sum + user.entries.reduce((s, e) => s + Number(e.hours), 0), 0
                  );
                  const userCount = Object.keys(project.users).length;
                  const entryCount = Object.values(project.users).reduce((sum, u) => sum + u.entries.length, 0);
                  const isProjectExpanded = expandedTimeProjects.has(projectId);

                  return (
                    <div key={projectId}>
                      {/* Project Header - Clickable */}
                      <button
                        onClick={() => {
                          const next = new Set(expandedTimeProjects);
                          if (next.has(projectId)) {
                            next.delete(projectId);
                          } else {
                            next.add(projectId);
                          }
                          setExpandedTimeProjects(next);
                        }}
                        className="w-full bg-neutral-50 hover:bg-neutral-100 px-4 py-3 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isProjectExpanded ? '' : '-rotate-90'}`} />
                          <div className="text-left">
                            <span className="text-xs font-medium text-neutral-700">{project.name}</span>
                            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">{userCount} team member{userCount !== 1 ? 's' : ''} • {entryCount} entries</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full font-mono">{projectTotalHours.toFixed(1)}h</span>
                      </button>

                      {/* Users under project - Collapsible */}
                      {isProjectExpanded && (
                        <div className="border-l-2 border-[#476E66]/20 ml-4">
                          {Object.entries(project.users).map(([oduserId, user]) => {
                            const userTotalHours = user.entries.reduce((sum, e) => sum + Number(e.hours), 0);
                            const userKey = `${projectId}-${oduserId}`;
                            const isUserExpanded = expandedTimeUsers.has(userKey);

                            return (
                              <div key={oduserId}>
                                {/* User Header - Clickable */}
                                <button
                                  onClick={() => {
                                    const next = new Set(expandedTimeUsers);
                                    if (next.has(userKey)) {
                                      next.delete(userKey);
                                    } else {
                                      next.add(userKey);
                                    }
                                    setExpandedTimeUsers(next);
                                  }}
                                  className="w-full bg-emerald-50/50 hover:bg-emerald-50 px-4 py-2.5 flex items-center justify-between transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isUserExpanded ? '' : '-rotate-90'}`} />
                                    <span className="text-xs font-medium text-neutral-700">{user.name}</span>
                                    <span className="text-[10px] text-neutral-400 font-mono">({user.entries.length} entries)</span>
                                  </div>
                                  <span className="text-xs font-medium text-emerald-600 font-mono">{userTotalHours.toFixed(2)}h</span>
                                </button>

                                {/* Entries Table - Collapsible */}
                                {isUserExpanded && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-white border-b border-neutral-100">
                                        <tr>
                                          <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Date</th>
                                          <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Task / Activity</th>
                                          <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Hours</th>
                                          <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Approved</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-neutral-50">
                                        {user.entries.map(entry => (
                                          <tr key={entry.id} className="hover:bg-neutral-50">
                                            <td className="px-4 py-2.5 text-sm text-neutral-600">{entry.date ? new Date(entry.date + 'T00:00:00').toLocaleDateString() : '-'}</td>
                                            <td className="px-4 py-2.5 text-sm text-neutral-600">
                                              <div>
                                                {entry.task?.name && <span className="font-medium text-neutral-700">{entry.task.name}</span>}
                                                {entry.description && (
                                                  <span className="text-neutral-400 italic">{entry.task?.name ? ' — ' : ''}{entry.description}</span>
                                                )}
                                                {!entry.task?.name && !entry.description && '-'}
                                              </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-sm font-medium text-neutral-900">{Number(entry.hours).toFixed(2)}</td>
                                            <td className="px-4 py-2.5 text-xs text-neutral-500">
                                              {entry.approved_at ? new Date(entry.approved_at).toLocaleDateString() : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Approved Expenses - Collapsible by Project then User */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-4 py-4 border-b border-neutral-100">
              <h3 className="text-neutral-500 text-[10px] uppercase tracking-wider font-semibold">Approved Expenses</h3>
              <p className="text-[10px] text-neutral-400 mt-1 font-mono">
                Total: <span className="text-neutral-700 font-medium">{formatCurrency(approvedExpenses.reduce((sum, e) => sum + Number(e.amount), 0))}</span> across {
                  new Set(approvedExpenses.map(e => e.project?.id)).size
                } projects
              </p>
            </div>
            {approvedExpenses.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 text-sm">No approved expenses for this period</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {Object.entries(
                  approvedExpenses.reduce((groups, expense) => {
                    const projectId = expense.project?.id || 'unknown';
                    const projectName = expense.project?.name || 'Unknown Project';
                    if (!groups[projectId]) {
                      groups[projectId] = { name: projectName, users: {} };
                    }
                    const oduserId = expense.user?.id || 'unknown';
                    const userName = expense.user?.full_name || expense.user?.email || 'Unknown User';
                    if (!groups[projectId].users[oduserId]) {
                      groups[projectId].users[oduserId] = { name: userName, expenses: [] };
                    }
                    groups[projectId].users[oduserId].expenses.push(expense);
                    return groups;
                  }, {} as Record<string, { name: string; users: Record<string, { name: string; expenses: Expense[] }> }>)
                ).map(([projectId, project]) => {
                  const projectTotal = Object.values(project.users).reduce(
                    (sum, user) => sum + user.expenses.reduce((s, e) => s + Number(e.amount), 0), 0
                  );
                  const userCount = Object.keys(project.users).length;
                  const expenseCount = Object.values(project.users).reduce((sum, u) => sum + u.expenses.length, 0);
                  const isProjectExpanded = expandedExpenseProjects.has(projectId);

                  return (
                    <div key={projectId}>
                      {/* Project Header - Clickable */}
                      <button
                        onClick={() => {
                          const next = new Set(expandedExpenseProjects);
                          if (next.has(projectId)) {
                            next.delete(projectId);
                          } else {
                            next.add(projectId);
                          }
                          setExpandedExpenseProjects(next);
                        }}
                        className="w-full bg-neutral-50 hover:bg-neutral-100 px-4 py-3 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isProjectExpanded ? '' : '-rotate-90'}`} />
                          <div className="text-left">
                            <span className="text-xs font-medium text-neutral-700">{project.name}</span>
                            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">{userCount} team member{userCount !== 1 ? 's' : ''} • {expenseCount} expenses</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full font-mono">{formatCurrency(projectTotal)}</span>
                      </button>

                      {/* Users under project - Collapsible */}
                      {isProjectExpanded && (
                        <div className="border-l-2 border-[#476E66]/20 ml-4">
                          {Object.entries(project.users).map(([oduserId, user]) => {
                            const userTotal = user.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
                            const userKey = `expense-${projectId}-${oduserId}`;
                            const isUserExpanded = expandedExpenseUsers.has(userKey);

                            return (
                              <div key={oduserId}>
                                {/* User Header - Clickable */}
                                <button
                                  onClick={() => {
                                    const next = new Set(expandedExpenseUsers);
                                    if (next.has(userKey)) {
                                      next.delete(userKey);
                                    } else {
                                      next.add(userKey);
                                    }
                                    setExpandedExpenseUsers(next);
                                  }}
                                  className="w-full bg-[#476E66]/5 hover:bg-[#476E66]/10 px-4 py-2.5 flex items-center justify-between transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isUserExpanded ? '' : '-rotate-90'}`} />
                                    <span className="text-xs font-medium text-neutral-700">{user.name}</span>
                                    <span className="text-[10px] text-neutral-400 font-mono">({user.expenses.length} expenses)</span>
                                  </div>
                                  <span className="text-xs font-medium text-[#476E66] font-mono">{formatCurrency(userTotal)}</span>
                                </button>

                                {/* Expenses - Collapsible */}
                                {isUserExpanded && (
                                  <>
                                    {/* Mobile Cards */}
                                    <div className="block md:hidden divide-y divide-neutral-50">
                                      {user.expenses.map(expense => (
                                        <div key={expense.id} className="p-3 hover:bg-neutral-50">
                                          <div className="font-medium text-sm text-neutral-900 mb-1">{expense.description}</div>
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                                              <span>{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                                              {expense.category && (
                                                <>
                                                  <span>•</span>
                                                  <span>{expense.category}</span>
                                                </>
                                              )}
                                            </div>
                                            <div className="text-sm font-semibold text-[#476E66]">{formatCurrency(expense.amount)}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block overflow-x-auto">
                                      <table className="w-full">
                                        <thead className="bg-white border-b border-neutral-100">
                                          <tr>
                                            <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Date</th>
                                            <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Description</th>
                                            <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Category</th>
                                            <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-50">
                                          {user.expenses.map(expense => (
                                            <tr key={expense.id} className="hover:bg-neutral-50">
                                              <td className="px-4 py-2.5 text-sm text-neutral-600">{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                                              <td className="px-4 py-2.5 text-sm text-neutral-900">{expense.description}</td>
                                              <td className="px-4 py-2.5 text-xs text-neutral-600">{expense.category || '-'}</td>
                                              <td className="px-4 py-2.5 text-right text-sm font-semibold text-[#476E66]">{formatCurrency(expense.amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
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

      {/* Reports Tab */}
      {activeTab === 'reports' && canApprove && (() => {
        // Apply client-side filters
        const filtered = reportEntries.filter(e => {
          if (reportProjectFilter !== 'all' && e.project_id !== reportProjectFilter) return false;
          if (reportUserFilter !== 'all' && e.user_id !== reportUserFilter) return false;
          if (reportBillableFilter === 'yes' && !e.billable) return false;
          if (reportBillableFilter === 'no' && e.billable) return false;
          return true;
        });

        // Summary calculations
        const totalHours = filtered.reduce((sum, e) => sum + Number(e.hours || 0), 0);
        const billableEntries = filtered.filter(e => e.billable);
        const billableHours = billableEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
        const billableAmount = billableEntries.reduce((sum, e) => sum + Number(e.hours || 0) * Number(e.hourly_rate || 0), 0);
        const nonBillableHours = totalHours - billableHours;
        const teamMemberIds = new Set(filtered.map(e => e.user_id).filter(Boolean));

        // Unique projects and users for filter dropdowns
        const uniqueProjects = [...new Map(reportEntries.filter(e => e.project).map(e => [e.project_id, e.project!])).values()];
        const uniqueUsers = [...new Map(reportEntries.filter(e => e.user).map(e => [e.user_id, e.user!])).values()];

        // Grouping logic (for Detailed view)
        function getGroupKey(entry: TimeEntry): string {
          switch (reportGroupBy) {
            case 'project': return entry.project?.name || 'No Project';
            case 'user': return entry.user?.full_name || entry.user?.email || 'Unknown User';
            case 'task': return entry.task?.name || entry.description || 'No Task';
            case 'day': return entry.date || 'No Date';
            case 'week': {
              if (!entry.date) return 'No Date';
              const d = new Date(entry.date + 'T00:00:00');
              const day = d.getDay();
              const diff = d.getDate() - day + (day === 0 ? -6 : 1);
              const weekStart = new Date(d.setDate(diff));
              return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }
            default: return 'Other';
          }
        }

        const groupedMap = new Map<string, TimeEntry[]>();
        filtered.forEach(entry => {
          const key = getGroupKey(entry);
          if (!groupedMap.has(key)) groupedMap.set(key, []);
          groupedMap.get(key)!.push(entry);
        });

        const groups = [...groupedMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        // CSV Export
        function exportReportCSV() {
          const headers = ['Date', 'User', 'Project', 'Task', 'Activity/Description', 'Hours', 'Rate', 'Amount', 'Billable', 'Status'];
          const rows = filtered.map(e => [
            e.date || '',
            e.user?.full_name || e.user?.email || '',
            e.project?.name || '',
            e.task?.name || '',
            e.description || '',
            Number(e.hours || 0).toFixed(2),
            Number(e.hourly_rate || 0).toFixed(2),
            (Number(e.hours || 0) * Number(e.hourly_rate || 0)).toFixed(2),
            e.billable ? 'Yes' : 'No',
            e.approval_status || 'draft',
          ]);
          const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `time-report-${reportDateRange.startDate}-to-${reportDateRange.endDate}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }

        // ---- Team Insights Data Computations ----

        // Hours trend over time (aggregate by day)
        const trendMap = new Map<string, { date: string; billable: number; nonBillable: number }>();
        filtered.forEach(e => {
          const d = e.date || 'unknown';
          if (!trendMap.has(d)) trendMap.set(d, { date: d, billable: 0, nonBillable: 0 });
          const row = trendMap.get(d)!;
          const hrs = Number(e.hours || 0);
          if (e.billable) row.billable += hrs; else row.nonBillable += hrs;
        });
        const trendData = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({
          date: r.date !== 'unknown' ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?',
          billable: Math.round(r.billable * 10) / 10,
          nonBillable: Math.round(r.nonBillable * 10) / 10,
        }));

        // Staff utilization data
        const userMap = new Map<string, { name: string; billable: number; nonBillable: number; revenue: number }>();
        filtered.forEach(e => {
          const uid = e.user_id || 'unknown';
          if (!userMap.has(uid)) userMap.set(uid, { name: e.user?.full_name || e.user?.email || 'Unknown', billable: 0, nonBillable: 0, revenue: 0 });
          const row = userMap.get(uid)!;
          const hrs = Number(e.hours || 0);
          if (e.billable) {
            row.billable += hrs;
            row.revenue += hrs * Number(e.hourly_rate || 0);
          } else {
            row.nonBillable += hrs;
          }
        });
        const utilizationData = [...userMap.values()]
          .map(u => ({
            name: u.name.length > 18 ? u.name.slice(0, 16) + '..' : u.name,
            fullName: u.name,
            billable: Math.round(u.billable * 10) / 10,
            nonBillable: Math.round(u.nonBillable * 10) / 10,
            total: Math.round((u.billable + u.nonBillable) * 10) / 10,
            utilization: u.billable + u.nonBillable > 0 ? Math.round((u.billable / (u.billable + u.nonBillable)) * 100) : 0,
            revenue: Math.round(u.revenue * 100) / 100,
          }))
          .sort((a, b) => b.total - a.total);

        // Budget vs Actual per project
        const projectBudgetMap = new Map<string, { name: string; estimated: number; actual: number; taskIds: Set<string> }>();
        filtered.forEach(e => {
          if (!e.project_id || !e.project) return;
          if (!projectBudgetMap.has(e.project_id)) projectBudgetMap.set(e.project_id, { name: e.project.name, estimated: 0, actual: 0, taskIds: new Set() });
          const row = projectBudgetMap.get(e.project_id)!;
          row.actual += Number(e.hours || 0);
          // Add estimated hours from unique tasks
          if (e.task_id && e.task?.estimated_hours && !row.taskIds.has(e.task_id)) {
            row.taskIds.add(e.task_id);
            row.estimated += Number(e.task.estimated_hours);
          }
        });
        const budgetData = [...projectBudgetMap.values()]
          .filter(p => p.estimated > 0)
          .map(p => ({
            name: p.name.length > 20 ? p.name.slice(0, 18) + '..' : p.name,
            fullName: p.name,
            estimated: Math.round(p.estimated * 10) / 10,
            actual: Math.round(p.actual * 10) / 10,
            isOver: p.actual > p.estimated,
          }))
          .sort((a, b) => b.actual - a.actual);

        // Overspend alerts (per task)
        const taskSpendMap = new Map<string, { taskName: string; projectName: string; estimated: number; actual: number; users: Map<string, { name: string; hours: number }> }>();
        filtered.forEach(e => {
          if (!e.task_id || !e.task?.estimated_hours) return;
          if (!taskSpendMap.has(e.task_id)) taskSpendMap.set(e.task_id, {
            taskName: e.task.name,
            projectName: e.project?.name || '-',
            estimated: Number(e.task.estimated_hours),
            actual: 0,
            users: new Map(),
          });
          const row = taskSpendMap.get(e.task_id)!;
          row.actual += Number(e.hours || 0);
          const uid = e.user_id || 'unknown';
          if (!row.users.has(uid)) row.users.set(uid, { name: e.user?.full_name || e.user?.email || 'Unknown', hours: 0 });
          row.users.get(uid)!.hours += Number(e.hours || 0);
        });
        const overspendAlerts = [...taskSpendMap.values()]
          .filter(t => t.actual > t.estimated)
          .map(t => ({
            taskName: t.taskName,
            projectName: t.projectName,
            estimated: Math.round(t.estimated * 10) / 10,
            actual: Math.round(t.actual * 10) / 10,
            overPercent: Math.round(((t.actual - t.estimated) / t.estimated) * 100),
            topUser: [...t.users.values()].sort((a, b) => b.hours - a.hours)[0],
          }))
          .sort((a, b) => b.overPercent - a.overPercent)
          .slice(0, 10);

        // Top contributors by revenue
        const topContributors = [...userMap.values()]
          .filter(u => u.revenue > 0)
          .map(u => ({
            name: u.name.length > 18 ? u.name.slice(0, 16) + '..' : u.name,
            fullName: u.name,
            revenue: Math.round(u.revenue * 100) / 100,
            hours: Math.round(u.billable * 10) / 10,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);

        // Donut chart data
        const billablePct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;
        const donutData = [
          { name: 'Billable', value: Math.round(billableHours * 10) / 10 },
          { name: 'Non-Billable', value: Math.round(nonBillableHours * 10) / 10 },
        ];
        const DONUT_COLORS = ['#476E66', '#E8A87C'];

        // Chart color palette
        const CHART_COLORS = {
          billable: '#476E66',
          billableLight: '#6BA39A',
          nonBillable: '#E8A87C',
          nonBillableLight: '#F2CDB0',
          estimated: '#94A3B8',
          overBudget: '#E76F51',
          accent: '#476E66',
        };

        // Chart tooltip style
        const tooltipStyle = { contentStyle: { fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', background: '#fff' } };

        return (
          <div className="space-y-4">
            {/* Controls Bar */}
            <div className="bg-white rounded-sm border border-neutral-200 p-4 shadow-sm">
              <div className="flex flex-col gap-3">
                {/* Row 1: Title + View Toggle + Date Range + Export */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-medium text-neutral-900 uppercase tracking-widest">Time Reports</h2>
                    {/* View Toggle */}
                    <div className="flex bg-neutral-100 rounded p-0.5">
                      <button
                        onClick={() => setReportView('detailed')}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${reportView === 'detailed' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                      >
                        Detailed
                      </button>
                      <button
                        onClick={() => setReportView('insights')}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${reportView === 'insights' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                      >
                        Team Insights
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DateRangePicker
                      startDate={reportDateRange.startDate}
                      endDate={reportDateRange.endDate}
                      onDateChange={(start, end) => setReportDateRange({ startDate: start, endDate: end })}
                    />
                    <button
                      onClick={exportReportCSV}
                      disabled={filtered.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#476E66] text-white rounded hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                    >
                      <Download size={12} />
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Row 2: Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Group By (only for Detailed view) */}
                  {reportView === 'detailed' && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-neutral-500 uppercase">Group by</span>
                        <select
                          value={reportGroupBy}
                          onChange={(e) => { setReportGroupBy(e.target.value as ReportGroupBy); setExpandedReportGroups(new Set()); }}
                          className="px-2 py-1 text-xs border border-neutral-200 rounded bg-white focus:ring-1 focus:ring-[#476E66] outline-none"
                        >
                          <option value="project">Project</option>
                          <option value="user">User</option>
                          <option value="task">Task</option>
                          <option value="day">Day</option>
                          <option value="week">Week</option>
                        </select>
                      </div>
                      <div className="w-px h-4 bg-neutral-200" />
                    </>
                  )}

                  {/* Project Filter */}
                  <select
                    value={reportProjectFilter}
                    onChange={(e) => setReportProjectFilter(e.target.value)}
                    className="px-2 py-1 text-xs border border-neutral-200 rounded bg-white focus:ring-1 focus:ring-[#476E66] outline-none"
                  >
                    <option value="all">All Projects</option>
                    {uniqueProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {/* User Filter */}
                  <select
                    value={reportUserFilter}
                    onChange={(e) => setReportUserFilter(e.target.value)}
                    className="px-2 py-1 text-xs border border-neutral-200 rounded bg-white focus:ring-1 focus:ring-[#476E66] outline-none"
                  >
                    <option value="all">All Users</option>
                    {uniqueUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>

                  {/* Billable Filter */}
                  <select
                    value={reportBillableFilter}
                    onChange={(e) => setReportBillableFilter(e.target.value as 'all' | 'yes' | 'no')}
                    className="px-2 py-1 text-xs border border-neutral-200 rounded bg-white focus:ring-1 focus:ring-[#476E66] outline-none"
                  >
                    <option value="all">All Billable</option>
                    <option value="yes">Billable Only</option>
                    <option value="no">Non-Billable Only</option>
                  </select>

                  {/* Status Filter */}
                  <select
                    value={reportStatusFilter}
                    onChange={(e) => setReportStatusFilter(e.target.value as 'all' | 'approved' | 'pending' | 'draft')}
                    className="px-2 py-1 text-xs border border-neutral-200 rounded bg-white focus:ring-1 focus:ring-[#476E66] outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-sm border border-neutral-200 p-3 shadow-sm">
                <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Total Hours</p>
                <p className="text-xl font-bold text-neutral-900">{totalHours.toFixed(1)}<span className="text-sm font-normal text-neutral-400">h</span></p>
              </div>
              <div className="bg-white rounded-sm border border-neutral-200 p-3 shadow-sm">
                <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Billable Hours</p>
                <p className="text-xl font-bold text-[#476E66]">{billableHours.toFixed(1)}<span className="text-sm font-normal text-neutral-400">h</span></p>
              </div>
              <div className="bg-white rounded-sm border border-neutral-200 p-3 shadow-sm">
                <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Billable Amount</p>
                <p className="text-xl font-bold text-neutral-900">${billableAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white rounded-sm border border-neutral-200 p-3 shadow-sm">
                <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Team Members</p>
                <p className="text-xl font-bold text-neutral-900">{teamMemberIds.size}</p>
              </div>
            </div>

            {/* ============ DETAILED VIEW ============ */}
            {reportView === 'detailed' && (
              <div className="bg-white rounded-sm border border-neutral-200 shadow-sm overflow-hidden">
                {reportLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-neutral-300 border-t-[#476E66] rounded-full animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                    <Clock size={32} className="mb-2 opacity-40" />
                    <p className="text-sm">No time entries found for the selected filters.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {groups.map(([groupName, entries]) => {
                      const isExpanded = expandedReportGroups.has(groupName);
                      const groupHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
                      const groupBillable = entries.filter(e => e.billable).reduce((s, e) => s + Number(e.hours || 0) * Number(e.hourly_rate || 0), 0);
                      return (
                        <div key={groupName}>
                          <button
                            onClick={() => {
                              const next = new Set(expandedReportGroups);
                              if (isExpanded) next.delete(groupName); else next.add(groupName);
                              setExpandedReportGroups(next);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronDown size={14} className={`text-neutral-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                              <span className="text-sm font-medium text-neutral-900">{groupName}</span>
                              <span className="text-[10px] font-medium text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-neutral-500">{groupHours.toFixed(1)}h</span>
                              {groupBillable > 0 && (
                                <span className="text-[#476E66] font-medium">${groupBillable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              )}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead className="bg-neutral-50 border-y border-neutral-100">
                                  <tr>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase">Date</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase">User</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase">Project</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase">Task / Activity</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase text-right">Hours</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase text-right">Rate</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase text-right">Amount</th>
                                    <th className="px-4 py-1.5 text-[10px] font-medium text-neutral-500 uppercase text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-50">
                                  {entries.map(entry => {
                                    const amt = Number(entry.hours || 0) * Number(entry.hourly_rate || 0);
                                    return (
                                      <tr key={entry.id} className="hover:bg-neutral-50/50">
                                        <td className="px-4 py-2 text-xs text-neutral-600">
                                          {entry.date ? new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-neutral-700 font-medium">{entry.user?.full_name || entry.user?.email || '-'}</td>
                                        <td className="px-4 py-2 text-xs text-neutral-600">{entry.project?.name || '-'}</td>
                                        <td className="px-4 py-2 text-xs text-neutral-600">
                                          <div>
                                            {entry.task?.name && <span className="font-medium text-neutral-700">{entry.task.name}</span>}
                                            {entry.description && (
                                              <span className="text-neutral-400 italic">{entry.task?.name ? ' — ' : ''}{entry.description}</span>
                                            )}
                                            {!entry.task?.name && !entry.description && '-'}
                                          </div>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-right font-medium text-neutral-900">{Number(entry.hours).toFixed(1)}h</td>
                                        <td className="px-4 py-2 text-xs text-right text-neutral-500">
                                          {entry.billable && entry.hourly_rate ? `$${Number(entry.hourly_rate).toFixed(0)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-right font-medium text-neutral-900">
                                          {entry.billable && amt > 0 ? `$${amt.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          {entry.approval_status === 'approved' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px]">Approved</span>}
                                          {entry.approval_status === 'pending' && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px]">Pending</span>}
                                          {entry.approval_status === 'draft' && <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded-full text-[10px]">Draft</span>}
                                          {entry.approval_status === 'rejected' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px]">Rejected</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-neutral-50/50">
                                    <td colSpan={4} className="px-4 py-2 text-xs font-medium text-neutral-500 text-right">Subtotal</td>
                                    <td className="px-4 py-2 text-xs text-right font-bold text-neutral-900">{groupHours.toFixed(1)}h</td>
                                    <td className="px-4 py-2"></td>
                                    <td className="px-4 py-2 text-xs text-right font-bold text-neutral-900">
                                      {groupBillable > 0 ? `$${groupBillable.toFixed(2)}` : '-'}
                                    </td>
                                    <td></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-t border-neutral-200">
                      <span className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Grand Total</span>
                      <div className="flex items-center gap-6 text-xs">
                        <span className="font-bold text-neutral-900">{totalHours.toFixed(1)}h</span>
                        <span className="font-bold text-[#476E66]">${billableAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============ TEAM INSIGHTS VIEW ============ */}
            {reportView === 'insights' && (
              <>
                {reportLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-neutral-300 border-t-[#476E66] rounded-full animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="bg-white rounded-sm border border-neutral-200 shadow-sm flex flex-col items-center justify-center py-12 text-neutral-400">
                    <Clock size={32} className="mb-2 opacity-40" />
                    <p className="text-sm">No time entries found for the selected filters.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Hours Trend Over Time */}
                    <div className="bg-white rounded-sm border border-neutral-200 p-4 shadow-sm">
                      <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-4">Hours Trend</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <defs>
                              <linearGradient id="gradBillable" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CHART_COLORS.billable} stopOpacity={0.7} />
                                <stop offset="100%" stopColor={CHART_COLORS.billable} stopOpacity={0.1} />
                              </linearGradient>
                              <linearGradient id="gradNonBillable" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CHART_COLORS.nonBillable} stopOpacity={0.6} />
                                <stop offset="100%" stopColor={CHART_COLORS.nonBillable} stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} tickLine={false} axisLine={{ stroke: '#e5e5e5' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickLine={false} axisLine={false} unit="h" />
                            <Tooltip {...tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Area type="monotone" dataKey="billable" name="Billable" stackId="1" stroke={CHART_COLORS.billable} strokeWidth={2} fill="url(#gradBillable)" />
                            <Area type="monotone" dataKey="nonBillable" name="Non-Billable" stackId="1" stroke={CHART_COLORS.nonBillable} strokeWidth={2} fill="url(#gradNonBillable)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Row: Staff Utilization + Billable Split Donut */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Staff Utilization */}
                      <div className="lg:col-span-2 bg-white rounded-sm border border-neutral-200 p-4 shadow-sm">
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-4">Staff Utilization</h3>
                        {utilizationData.length === 0 ? (
                          <p className="text-xs text-neutral-400 py-8 text-center">No user data available.</p>
                        ) : (
                          <div style={{ height: Math.max(200, utilizationData.length * 44) }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={utilizationData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#737373' }} tickLine={false} axisLine={false} unit="h" />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#525252' }} tickLine={false} axisLine={false} width={120} />
                                <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [`${value}h`, name]} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="billable" name="Billable" stackId="a" fill={CHART_COLORS.billable} radius={[0, 0, 0, 0]} />
                                <Bar dataKey="nonBillable" name="Non-Billable" stackId="a" fill={CHART_COLORS.nonBillable} radius={[0, 4, 4, 0]}
                                  label={({ x, y, width, height, index }: { x: number; y: number; width: number; height: number; index: number }) => {
                                    const item = utilizationData[index];
                                    if (!item) return null;
                                    return (
                                      <text x={x + width + 6} y={y + height / 2} textAnchor="start" dominantBaseline="middle" fontSize={10} fill={item.utilization >= 80 ? CHART_COLORS.billable : item.utilization >= 50 ? '#D4A017' : CHART_COLORS.overBudget} fontWeight={600}>
                                        {item.utilization}%
                                      </text>
                                    );
                                  }}
                                />
                                {utilizationData.length > 0 && (
                                  <ReferenceLine x={Math.max(...utilizationData.map(u => u.total)) * 0.8} stroke={CHART_COLORS.billableLight} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: '80% target', position: 'top', fontSize: 9, fill: CHART_COLORS.billableLight }} />
                                )}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>

                      {/* Billable vs Non-Billable Donut */}
                      <div className="bg-white rounded-sm border border-neutral-200 p-4 shadow-sm flex flex-col items-center">
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-4 self-start">Billable Split</h3>
                        <div className="h-52 w-full relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={donutData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                              >
                                {donutData.map((_entry, index) => (
                                  <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [`${value}h`, name]} />
                            </PieChart>
                          </ResponsiveContainer>
                          {/* Center label */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <span className="text-2xl font-bold text-neutral-900">{billablePct}%</span>
                              <br />
                              <span className="text-[10px] text-neutral-400 uppercase">billable</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS.billable }} />
                            <span className="text-neutral-600">Billable {billableHours.toFixed(1)}h</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS.nonBillable }} />
                            <span className="text-neutral-600">Non-Bill {nonBillableHours.toFixed(1)}h</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Budget vs Actual per Project */}
                    {budgetData.length > 0 && (
                      <div className="bg-white rounded-sm border border-neutral-200 p-4 shadow-sm">
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-4">Budget vs Actual Hours (by Project)</h3>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={budgetData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} tickLine={false} axisLine={{ stroke: '#e5e5e5' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickLine={false} axisLine={false} unit="h" />
                              <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [`${value}h`, name]} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="estimated" name="Estimated" fill={CHART_COLORS.estimated} radius={[4, 4, 0, 0]} />
                              <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]}>
                                {budgetData.map((entry, index) => (
                                  <Cell key={`actual-${index}`} fill={entry.isOver ? CHART_COLORS.overBudget : CHART_COLORS.billable} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Row: Overspend Alerts + Top Contributors */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Overspend Alerts */}
                      <div className="bg-white rounded-sm border border-neutral-200 p-4 shadow-sm">
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-3">Overspend Alerts</h3>
                        {overspendAlerts.length === 0 ? (
                          <div className="flex flex-col items-center py-6 text-neutral-400">
                            <CheckCircle size={24} className="mb-1.5 opacity-40" />
                            <p className="text-xs">All tasks are within budget.</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {overspendAlerts.map((alert, i) => (
                              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg border border-orange-100 bg-orange-50/40">
                                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: CHART_COLORS.overBudget }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-neutral-900 truncate">{alert.taskName}</p>
                                  <p className="text-[10px] text-neutral-500">{alert.projectName}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-neutral-500">Est: {alert.estimated}h</span>
                                    <span className="text-[10px] text-neutral-500">Actual: {alert.actual}h</span>
                                    <span className="text-[10px] font-bold" style={{ color: CHART_COLORS.overBudget }}>+{alert.overPercent}% over</span>
                                  </div>
                                  {alert.topUser && (
                                    <p className="text-[10px] text-neutral-400 mt-0.5">Top: {alert.topUser.name} ({alert.topUser.hours.toFixed(1)}h)</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Top Contributors by Revenue */}
                      <div className="bg-white rounded-sm border border-neutral-200 p-4 shadow-sm">
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-3">Top Contributors by Revenue</h3>
                        {topContributors.length === 0 ? (
                          <div className="flex flex-col items-center py-6 text-neutral-400">
                            <Clock size={24} className="mb-1.5 opacity-40" />
                            <p className="text-xs">No billable entries found.</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {topContributors.map((c, i) => {
                              const maxRevenue = topContributors[0]?.revenue || 1;
                              const barWidth = Math.max(8, (c.revenue / maxRevenue) * 100);
                              return (
                                <div key={i} className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-neutral-400 w-5 text-right">{i + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-xs font-medium text-neutral-700 truncate" title={c.fullName}>{c.fullName}</span>
                                      <span className="text-xs font-bold text-[#476E66] flex-shrink-0 ml-2">${c.revenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="w-full bg-neutral-100 rounded-full h-2">
                                      <div className="h-2 rounded-full transition-all" style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${CHART_COLORS.billable}, ${CHART_COLORS.billableLight})` }} />
                                    </div>
                                    <span className="text-[10px] text-neutral-400">{c.hours}h billable</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Add Time Entry Row Modal */}
      {showTimeEntryModal && (
        <AddTimeRowModal
          projects={projects}
          tasks={tasks}
          existingDraftRows={draftRows}
          existingSavedDraftRows={savedDraftRows}
          existingSubmittedRows={submittedRows}
          onClose={() => setShowTimeEntryModal(false)}
          onAdd={addDraftRow}
        />
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <ExpenseModal
          expense={editingExpense}
          projects={projects}
          companyId={profile?.company_id || ''}
          userId={user?.id || ''}
          onClose={() => { setShowExpenseModal(false); setEditingExpense(null); }}
          onSave={() => { loadData(); setShowExpenseModal(false); setEditingExpense(null); }}
        />
      )}
    </div>
  );
}

// Flatten hierarchical tasks for dropdown display with indentation
function flattenTasksForDropdown(tasks: Task[], depth = 0): Array<Task & { depth: number }> {
  const result: Array<Task & { depth: number }> = [];
  for (const task of tasks) {
    result.push({ ...task, depth });
    if (task.children?.length) {
      result.push(...flattenTasksForDropdown(task.children, depth + 1));
    }
  }
  return result;
}

function AddTimeRowModal({ projects, tasks: initialTasks, existingDraftRows, existingSavedDraftRows, existingSubmittedRows, onClose, onAdd }: {
  projects: Project[];
  tasks: { [projectId: string]: Task[] };
  existingDraftRows: DraftRow[];
  existingSavedDraftRows: SubmittedRow[];
  existingSubmittedRows: SubmittedRow[];
  onClose: () => void;
  onAdd: (projectId: string, taskId: string | null, activity: string) => void;
}) {
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [activity, setActivity] = useState('');
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Load tasks when project changes (use hierarchical method)
  useEffect(() => {
    if (!projectId) {
      setAvailableTasks([]);
      return;
    }
    // First try from initial tasks
    if (initialTasks[projectId] && initialTasks[projectId].length > 0) {
      setAvailableTasks(initialTasks[projectId]);
      return;
    }
    // Otherwise fetch from API with hierarchical structure
    setLoadingTasks(true);
    api.getTasksWithChildren(projectId)
      .then(tasks => setAvailableTasks(tasks))
      .catch(() => setAvailableTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [projectId, initialTasks]);

  // Auto-populate activity when a task is selected
  useEffect(() => {
    if (taskId) {
      const flatTasks = flattenTasksForDropdown(availableTasks);
      const selectedTask = flatTasks.find(t => t.id === taskId);
      if (selectedTask) setActivity(selectedTask.name);
    }
  }, [taskId, availableTasks]);

  const rowKey = `${projectId}-${taskId || 'null'}-${activity.trim().toLowerCase()}`;
  const isRowExists = existingDraftRows.some(r => r.id === rowKey) || existingSavedDraftRows.some(r => r.id === rowKey) || existingSubmittedRows.some(r => r.id === rowKey);
  const isActivityRequired = !taskId;
  const canAdd = projectId && (!isActivityRequired || activity.trim().length > 0) && !isRowExists;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Add Time Entry Row</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Project *</label>
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setTaskId(''); setActivity(''); }}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
            >
              <option value="">Select a project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Task (optional)</label>
            <select
              value={taskId}
              onChange={(e) => { setTaskId(e.target.value); if (!e.target.value) setActivity(''); }}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              disabled={!projectId || loadingTasks}
            >
              <option value="">{loadingTasks ? 'Loading tasks...' : 'No specific task'}</option>
              {flattenTasksForDropdown(availableTasks).map(t => (
                <option key={t.id} value={t.id}>
                  {'\u00A0\u00A0'.repeat(t.depth)}{t.depth > 0 ? '-- ' : ''}{t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Activity / Description {isActivityRequired ? '*' : ''}
            </label>
            <input
              type="text"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder={taskId ? 'Override task name or add detail...' : 'e.g., Drafting, Surveying, Site Visit...'}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              disabled={!projectId}
            />
            {!taskId && (
              <p className="text-xs text-neutral-500 mt-1">
                Describe the work activity. This allows multiple rows per project.
              </p>
            )}
          </div>
          {isRowExists && (
            <p className="text-sm text-red-600">This project/task/activity combination already exists in your timesheet.</p>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">Cancel</button>
            <button
              onClick={() => onAdd(projectId, taskId || null, activity.trim())}
              disabled={!canAdd}
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
            >
              Add Row
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


