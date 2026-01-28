import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { api, Project, Task, TimeEntry, Expense } from '../lib/api';
import { Plus, ChevronLeft, ChevronRight, Clock, Receipt, Trash2, X, Edit2, Play, Pause, Square, Copy, Paperclip, Upload, CheckCircle, XCircle, AlertCircle, Send, Save, Calendar, ChevronDown } from 'lucide-react';

type TimeTab = 'timesheet' | 'expenses' | 'approvals' | 'approved';
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
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  preset === p ? 'bg-[#476E66] text-white' : 'hover:bg-neutral-100 text-neutral-700'
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
}

interface SubmittedRow {
  id: string;
  project: Project | null;
  task: Task | null;
  entries: { [date: string]: TimeEntry };
}

export default function TimeExpensePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { canViewFinancials, canApprove } = usePermissions();
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

  // Computed: group saved draft entries by project/task (from timer or copy) - includes rejected entries
  // Uses allDraftEntries for row generation (persists across weeks) but timeEntries for current week values
  const savedDraftRows = useMemo(() => {
    const rows: SubmittedRow[] = [];
    const seen = new Set<string>();
    
    // First, create rows from all draft entries (regardless of week)
    allDraftEntries.forEach(entry => {
      const key = `${entry.project_id}-${entry.task_id || 'null'}`;
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
      const row = rows.find(r => r.id === `${entry.project_id}-${entry.task_id || 'null'}`);
      if (row) {
        row.entries[entry.date] = entry;
      }
    });
    
    return rows;
  }, [allDraftEntries, timeEntries, projects, tasks]);

  // Computed: group submitted entries by project/task (only pending and approved)
  const submittedRows = useMemo(() => {
    const rows: SubmittedRow[] = [];
    const seen = new Set<string>();
    
    timeEntries.forEach(entry => {
      // Only show pending and approved entries in the submitted section (not rejected)
      if (entry.approval_status !== 'pending' && entry.approval_status !== 'approved') return;
      const key = `${entry.project_id}-${entry.task_id || 'null'}`;
      if (!seen.has(key)) {
        seen.add(key);
        const project = projects.find(p => p.id === entry.project_id) || null;
        const task = entry.task_id ? tasks[entry.project_id]?.find(t => t.id === entry.task_id) || null : null;
        rows.push({ id: key, project, task, entries: {} });
      }
      const row = rows.find(r => r.id === `${entry.project_id}-${entry.task_id || 'null'}`);
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
      
      const [projectsData, entriesData, expensesData, allDraftData] = await Promise.all([
        api.getProjects(profile.company_id),
        api.getTimeEntries(profile.company_id, user.id, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]),
        api.getExpenses(profile.company_id, user.id),
        // Load all draft/rejected entries (no date filter) for persistent rows
        api.getTimeEntries(profile.company_id, user.id).then(entries => 
          entries.filter(e => e.approval_status === 'draft' || e.approval_status === 'rejected')
        ),
      ]);
      
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

      // Load tasks for each project
      const tasksMap: { [key: string]: Task[] } = {};
      for (const project of projectsData) {
        try {
          const projectTasks = await api.getTasks(project.id);
          tasksMap[project.id] = projectTasks;
        } catch (e) {
          tasksMap[project.id] = [];
        }
      }
      setTasks(tasksMap);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  const loadApprovedData = async () => {
    if (!profile?.company_id || !canApprove) return;
    const [approvedTime, approvedExp] = await Promise.all([
      api.getApprovedTimeEntries(profile.company_id, dateRange.startDate, dateRange.endDate),
      api.getApprovedExpenses(profile.company_id, dateRange.startDate, dateRange.endDate),
    ]);
    setApprovedTimeEntries(approvedTime);
    setApprovedExpenses(approvedExp);
  };

  useEffect(() => {
    if (canApprove) loadApprovedData();
  }, [dateRange, canApprove]);

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

  async function updateTimeEntry(projectId: string, taskId: string | null, date: string, hours: number) {
    if (!profile?.company_id || !user?.id) return;
    
    const existing = timeEntries.find(e => 
      e.project_id === projectId && 
      e.task_id === taskId && 
      e.date === date
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

  const addDraftRow = (projectId: string, taskId: string | null) => {
    const project = projects.find(p => p.id === projectId) || null;
    const task = taskId ? tasks[projectId]?.find(t => t.id === taskId) || null : null;
    const key = `${projectId}-${taskId || 'null'}`;
    
    // Check if row already exists in drafts, saved drafts (from timer), or submitted
    if (draftRows.some(r => r.id === key) || savedDraftRows.some(r => r.id === key) || submittedRows.some(r => r.id === key)) {
      alert('This project/task already has a row. Please use the existing row.');
      return;
    }
    
    setDraftRows([...draftRows, { id: key, project, task, projectId, taskId }]);
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
    <div className="space-y-1.5 sm:space-y-3 pb-16 sm:pb-20">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base sm:text-xl font-bold text-neutral-900">Time & Expense</h1>
        <button
          onClick={() => activeTab === 'timesheet' ? setShowTimeEntryModal(true) : setShowExpenseModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{activeTab === 'timesheet' ? 'Add Row' : 'Add Expense'}</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-0.5 sm:p-1 bg-neutral-100 rounded-lg overflow-x-auto">
        <button
          onClick={() => setActiveTab('timesheet')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'timesheet' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Timesheet</span><span className="sm:hidden">Time</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'expenses' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Expenses</span><span className="sm:hidden">Exp.</span>
        </button>
        {canApprove && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'approvals' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Approvals</span><span className="sm:hidden">Approve</span>
            {(pendingTimeEntries.length + pendingExpenses.length) > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                {pendingTimeEntries.length + pendingExpenses.length}
              </span>
            )}
          </button>
        )}
        {canApprove && (
          <button
            onClick={() => setActiveTab('approved')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'approved' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Approved History</span><span className="sm:hidden">History</span>
          </button>
        )}
      </div>

      {/* Timer - Ultra Compact for Mobile */}
      {activeTab === 'timesheet' && (
        <div className="bg-white rounded-lg border border-neutral-100 p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
          {/* Row 1: Timer + Buttons */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className={`text-xl sm:text-2xl font-mono font-bold ${timerRunning ? 'text-emerald-600' : 'text-neutral-900'}`}>
              {formatTimer(timerSeconds)}
            </div>
            <div className="flex items-center gap-1.5">
              {!timerRunning ? (
                <button onClick={startTimer} className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                  <Play className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={pauseTimer} className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">
                  <Pause className="w-4 h-4" />
                </button>
              )}
              <button onClick={stopTimer} disabled={timerSeconds === 0 || !timerProjectId} className="p-1.5 bg-red-400 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 transition-colors">
                <Square className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Row 2: Project + Task (side by side on mobile) */}
          <div className="flex gap-1.5 mb-1.5">
            <select
              value={timerProjectId}
              onChange={(e) => { setTimerProjectId(e.target.value); setTimerTaskId(''); }}
              className="flex-1 px-2 py-1 border border-neutral-200 rounded text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none bg-neutral-50"
              disabled={timerRunning}
            >
              <option value="">No Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={timerTaskId}
              onChange={(e) => setTimerTaskId(e.target.value)}
              className="flex-1 px-2 py-1 border border-neutral-200 rounded text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none bg-neutral-50"
              disabled={timerRunning || !timerProjectId}
            >
              <option value="">No Task</option>
              {timerProjectId && tasks[timerProjectId]?.filter(t => 
                !t.collaborator_company_id || t.collaborator_company_id === profile?.company_id
              ).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {/* Row 3: Description */}
          <input
            type="text"
            placeholder="What are you working on?"
            value={timerDescription}
            onChange={(e) => setTimerDescription(e.target.value)}
            className="w-full px-2 py-1 border border-neutral-200 rounded text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
          />
        </div>
      )}

      {/* Timesheet - Mobile Optimized */}
      {activeTab === 'timesheet' && (
        <div className="space-y-1.5 sm:space-y-3">
          {/* Draft Section */}
          <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-between p-1.5 sm:p-3 border-b border-neutral-100">
              <div className="px-2 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded-full text-xs font-medium">Draft</div>
              {/* Desktop: Week Navigation */}
              <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigateWeek(-1); }}
                  className="p-1.5 hover:bg-neutral-200 bg-neutral-100 rounded-lg cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-700" />
                </button>
                <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-neutral-900 select-none text-center">
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
                    return (
                    <tr key={`saved-${row.id}`} className={hasRejected ? "hover:bg-red-50/50 bg-red-50/30" : "hover:bg-green-50/50 bg-green-50/30"}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900">
                          {row.project?.name || 'Unknown Project'}
                          {row.task && <span className="text-neutral-600"> / {row.task.name}</span>}
                        </div>
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
                              className={`w-full h-10 text-center rounded-lg border-2 outline-none ${
                                isFutureDate 
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
                    <tr key={row.id} className="hover:bg-neutral-100/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900">
                          {row.project?.name || 'Unknown Project'}
                          {row.task && <span className="text-neutral-600"> / {row.task.name}</span>}
                        </div>
                      </td>
                      {weekDays.map((day, i) => {
                        const dateKey = formatDateKey(day);
                        const draftVal = getDraftValue(row.id, dateKey);
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isFutureDate = dateKey > todayStr;
                        return (
                          <td key={i} className="px-2 py-3">
                            <input
                              type="number"
                              min="0"
                              max="24"
                              step="0.5"
                              value={draftVal || ''}
                              placeholder=""
                              disabled={isFutureDate}
                              title={isFutureDate ? 'Cannot enter time for future dates' : ''}
                              className={`w-full h-10 text-center rounded-lg border-2 outline-none ${
                                isFutureDate 
                                  ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed' 
                                  : 'border-neutral-200 bg-neutral-100 focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66]'
                              }`}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setDraftValue(row.id, dateKey, val);
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-semibold text-neutral-900">
                        {getDraftRowTotal(row)}h
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
                  ))}
                  <tr>
                    <td colSpan={10} className="py-3">
                      <button 
                        onClick={() => setShowTimeEntryModal(true)}
                        className="text-[#476E66] hover:text-[#3A5B54] font-medium text-sm flex items-center gap-1"
                      >
                        <span className="text-lg">+</span> Add another project row
                      </button>
                    </td>
                  </tr>
                </tbody>
                {draftRows.length > 0 && (
                  <tfoot className="bg-neutral-100 border-t border-neutral-200">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-neutral-900">Draft Total</td>
                      {weekDays.map((day, i) => {
                        const dateKey = formatDateKey(day);
                        const dayTotal = draftRows.reduce((sum, row) => sum + (getDraftValue(row.id, dateKey) || 0), 0);
                        return (
                          <td key={i} className="px-2 py-3 text-center font-medium text-neutral-700">
                            {dayTotal > 0 ? `${dayTotal}h` : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-bold text-neutral-600 text-lg">
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
                    return (
                      <tr key={`saved-${row.id}`} className={hasRejected ? "bg-red-50/30" : "bg-green-50/30"}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-sm text-neutral-900">
                            {row.project?.name || 'Unknown Project'}
                            {row.task && <span className="text-neutral-600"> / {row.task.name}</span>}
                          </div>
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
                            className={`w-full h-11 text-center rounded-lg border-2 outline-none text-sm ${
                              isFutureDate 
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
                            className={`w-full h-11 text-center rounded-lg border-2 outline-none text-sm ${
                              isFutureDate 
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
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 sm:px-6 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
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
                        return (
                          <tr key={row.id} className="bg-neutral-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-neutral-600 text-xs">
                                {row.project?.name || 'Unknown'}
                                {row.task && <span className="text-neutral-500"> / {row.task.name}</span>}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                entry?.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
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
                    {submittedRows.map((row) => (
                      <tr key={row.id} className="bg-neutral-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-600">
                            {row.project?.name || 'Unknown Project'}
                            {row.task && <span className="text-neutral-500"> / {row.task.name}</span>}
                          </div>
                        </td>
                        {weekDays.map((day, i) => {
                          const dateKey = formatDateKey(day);
                          const entry = row.entries[dateKey];
                          return (
                            <td key={i} className="px-2 py-3">
                              <div className={`w-full h-10 flex items-center justify-center rounded-lg border-2 text-neutral-600 ${
                                entry?.approval_status === 'approved' ? 'border-emerald-300 bg-neutral-100' :
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
                    ))}
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
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          expense.approval_status === 'approved' ? 'bg-[#476E66]/10 text-[#476E66]' :
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      expense.approval_status === 'approved' ? 'bg-[#476E66]/10 text-[#476E66]' :
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
                                  {entry.task?.name || entry.description || '-'}
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
                              <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Task</th>
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
                                <td className="px-2 py-2.5 text-xs text-neutral-600">{entry.task?.name || entry.description || '-'}</td>
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
          {/* Date Range Picker */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900">Approved History</h2>
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onDateChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
            />
          </div>

          {/* Approved Time Entries - Grouped by Project then User */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-100">
              <h3 className="text-sm sm:text-base font-semibold text-neutral-900">Approved Time Entries</h3>
              <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
                Total: {approvedTimeEntries.reduce((sum, e) => sum + Number(e.hours), 0).toFixed(1)} hours
              </p>
            </div>
            {approvedTimeEntries.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No approved time entries for this period</div>
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
                    const userId = entry.user?.id || 'unknown';
                    const userName = entry.user?.full_name || entry.user?.email || 'Unknown User';
                    if (!groups[projectId].users[userId]) {
                      groups[projectId].users[userId] = { name: userName, entries: [] };
                    }
                    groups[projectId].users[userId].entries.push(entry);
                    return groups;
                  }, {} as Record<string, { name: string; users: Record<string, { name: string; entries: TimeEntry[] }> }>)
                ).map(([projectId, project]) => {
                  const projectTotalHours = Object.values(project.users).reduce(
                    (sum, user) => sum + user.entries.reduce((s, e) => s + Number(e.hours), 0), 0
                  );
                  
                  return (
                    <div key={projectId}>
                      {/* Project Header */}
                      <div className="bg-neutral-50 px-6 py-3 flex items-center justify-between">
                        <span className="font-semibold text-neutral-900">{project.name}</span>
                        <div className="text-sm">
                          <span className="text-neutral-500">Total: </span>
                          <span className="font-medium text-neutral-900">{projectTotalHours.toFixed(2)}h</span>
                        </div>
                      </div>
                      {/* Users under project */}
                      {Object.entries(project.users).map(([userId, user]) => {
                        const userTotalHours = user.entries.reduce((sum, e) => sum + Number(e.hours), 0);
                        return (
                          <div key={userId} className="border-l-4 border-emerald-200 ml-4">
                            {/* User Header */}
                            <div className="bg-emerald-50/50 px-6 py-2 flex items-center justify-between">
                              <span className="font-medium text-neutral-800">{user.name}</span>
                              <span className="text-sm font-medium text-emerald-600">{userTotalHours.toFixed(2)}h</span>
                            </div>
                            {/* Entries Table */}
                            <table className="w-full">
                              <thead className="bg-white border-b border-neutral-100">
                                <tr>
                                  <th className="text-left px-6 py-2 text-xs font-medium text-neutral-500 uppercase">Date</th>
                                  <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Task</th>
                                  <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Hours</th>
                                  <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500 uppercase">Approved By</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-50">
                                {user.entries.map(entry => (
                                  <tr key={entry.id} className="hover:bg-neutral-50">
                                    <td className="px-6 py-3 text-neutral-600">{entry.date ? new Date(entry.date + 'T00:00:00').toLocaleDateString() : '-'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{entry.task?.name || entry.description || '-'}</td>
                                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{Number(entry.hours).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-neutral-500 text-sm">
                                      {entry.approved_at ? new Date(entry.approved_at).toLocaleDateString() : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Approved Expenses - Grouped by Project then User */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-3 sm:px-4 py-3 border-b border-neutral-100">
              <h3 className="text-sm sm:text-base font-semibold text-neutral-900">Approved Expenses</h3>
              <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
                Total: {formatCurrency(approvedExpenses.reduce((sum, e) => sum + Number(e.amount), 0))}
              </p>
            </div>
            {approvedExpenses.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No approved expenses for this period</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {Object.entries(
                  approvedExpenses.reduce((groups, expense) => {
                    const projectId = expense.project?.id || 'unknown';
                    const projectName = expense.project?.name || 'Unknown Project';
                    if (!groups[projectId]) {
                      groups[projectId] = { name: projectName, users: {} };
                    }
                    const userId = expense.user?.id || 'unknown';
                    const userName = expense.user?.full_name || expense.user?.email || 'Unknown User';
                    if (!groups[projectId].users[userId]) {
                      groups[projectId].users[userId] = { name: userName, expenses: [] };
                    }
                    groups[projectId].users[userId].expenses.push(expense);
                    return groups;
                  }, {} as Record<string, { name: string; users: Record<string, { name: string; expenses: Expense[] }> }>)
                ).map(([projectId, project]) => {
                  const projectTotal = Object.values(project.users).reduce(
                    (sum, user) => sum + user.expenses.reduce((s, e) => s + Number(e.amount), 0), 0
                  );
                  
                  return (
                    <div key={projectId}>
                      <div className="bg-neutral-50 px-3 sm:px-4 py-2.5 flex items-center justify-between">
                        <span className="font-semibold text-sm text-neutral-900">{project.name}</span>
                        <div className="text-xs sm:text-sm">
                          <span className="text-neutral-500">Total: </span>
                          <span className="font-medium text-neutral-900">{formatCurrency(projectTotal)}</span>
                        </div>
                      </div>
                      {Object.entries(project.users).map(([userId, user]) => {
                        const userTotal = user.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
                        return (
                          <div key={userId} className="border-l-2 border-[#476E66]/20 ml-2 sm:ml-4">
                            <div className="bg-[#476E66]/5 px-3 sm:px-4 py-2 flex items-center justify-between">
                              <span className="font-medium text-sm text-neutral-900">{user.name}</span>
                              <span className="text-xs sm:text-sm font-medium text-[#476E66]">{formatCurrency(userTotal)}</span>
                            </div>
                            {/* Mobile Cards */}
                            <div className="block md:hidden divide-y divide-neutral-50">
                              {user.expenses.map(expense => (
                                <div key={expense.id} className="p-3">
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
                                    <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Date</th>
                                    <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Description</th>
                                    <th className="text-left px-2 py-2 text-xs font-medium text-neutral-600">Category</th>
                                    <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-50">
                                  {user.expenses.map(expense => (
                                    <tr key={expense.id} className="hover:bg-neutral-50/50">
                                      <td className="px-2 py-2.5 text-xs text-neutral-600">{expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                                      <td className="px-2 py-2.5 text-sm text-neutral-900">{expense.description}</td>
                                      <td className="px-2 py-2.5 text-xs text-neutral-600">{expense.category || '-'}</td>
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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

function AddTimeRowModal({ projects, tasks: initialTasks, existingDraftRows, existingSavedDraftRows, existingSubmittedRows, onClose, onAdd }: { 
  projects: Project[]; 
  tasks: { [projectId: string]: Task[] }; 
  existingDraftRows: DraftRow[];
  existingSavedDraftRows: SubmittedRow[];
  existingSubmittedRows: SubmittedRow[];
  onClose: () => void; 
  onAdd: (projectId: string, taskId: string | null) => void;
}) {
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Load tasks when project changes
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
    // Otherwise fetch from API
    setLoadingTasks(true);
    api.getTasks(projectId)
      .then(tasks => setAvailableTasks(tasks))
      .catch(() => setAvailableTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [projectId, initialTasks]);

  const rowKey = `${projectId}-${taskId || 'null'}`;
  const isRowExists = existingDraftRows.some(r => r.id === rowKey) || existingSavedDraftRows.some(r => r.id === rowKey) || existingSubmittedRows.some(r => r.id === rowKey);

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
              onChange={(e) => { setProjectId(e.target.value); setTaskId(''); }} 
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
              onChange={(e) => setTaskId(e.target.value)} 
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              disabled={!projectId || loadingTasks}
            >
              <option value="">{loadingTasks ? 'Loading tasks...' : 'No specific task'}</option>
              {availableTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {isRowExists && (
            <p className="text-sm text-neutral-900">This project/task combination already exists in your timesheet.</p>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">Cancel</button>
            <button 
              onClick={() => onAdd(projectId, taskId || null)} 
              disabled={!projectId || isRowExists}
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

function ExpenseModal({ expense, projects, companyId, userId, onClose, onSave }: { 
  expense: Expense | null;
  projects: Project[]; 
  companyId: string; 
  userId: string; 
  onClose: () => void; 
  onSave: () => void;
}) {
  const [description, setDescription] = useState(expense?.description || '');
  const [projectId, setProjectId] = useState(expense?.project_id || '');
  const [amount, setAmount] = useState(expense?.amount?.toString() || '');
  const [category, setCategory] = useState(expense?.category || '');
  const [date, setDate] = useState(expense?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [billable, setBillable] = useState(expense?.billable ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setReceiptPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;
    setError(null);
    setSaving(true);
    try {
      let receiptUrl = expense?.receipt_url;
      
      // Upload receipt if a new file is selected
      if (receiptFile) {
        receiptUrl = await api.uploadReceipt(receiptFile, companyId);
      }
      
      const data = {
        description,
        project_id: projectId || null,
        amount: parseFloat(amount),
        category: category || null,
        date,
        billable,
        receipt_url: receiptUrl,
        status: 'pending' as const,
      };
      if (expense) {
        await api.updateExpense(expense.id, data);
      } else {
        await api.createExpense({ ...data, company_id: companyId, user_id: userId });
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save expense:', err);
      setError(err?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">{expense ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Amount *</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none">
              <option value="">Select category</option>
              <option value="Travel">Travel</option>
              <option value="Meals">Meals</option>
              <option value="Software">Software</option>
              <option value="Equipment">Equipment</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="billable" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="rounded border-neutral-300 text-neutral-500 focus:ring-[#476E66]" />
            <label htmlFor="billable" className="text-sm text-neutral-700">Billable to client</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Attach Receipt</label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.pdf"
              className="hidden"
            />
            {receiptPreview ? (
              <div className="relative border border-neutral-200 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  {receiptPreview.startsWith('data:image') ? (
                    <img src={receiptPreview} alt="Receipt" className="w-16 h-16 object-cover rounded-lg" />
                  ) : (
                    <div className="w-16 h-16 bg-neutral-100 rounded-lg flex items-center justify-center">
                      <Paperclip className="w-6 h-6 text-neutral-500" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-700">{receiptFile?.name || 'Receipt attached'}</p>
                    <p className="text-xs text-neutral-500">{receiptFile ? `${(receiptFile.size / 1024).toFixed(1)} KB` : ''}</p>
                  </div>
                  <button type="button" onClick={removeReceipt} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-500 hover:text-neutral-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 border-2 border-dashed border-neutral-300 rounded-xl hover:border-neutral-900-400 hover:bg-[#3A5B54]-50 transition-colors flex items-center justify-center gap-2 text-neutral-600"
              >
                <Upload className="w-5 h-5" />
                <span>Click to upload receipt</span>
              </button>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} onClick={(e) => { e.preventDefault(); handleSubmit(e as any); }} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
