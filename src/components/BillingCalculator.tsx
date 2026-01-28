import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export type BillingMode = 'time_materials' | 'milestone' | 'percentage';

export interface Task {
  id: string;
  name: string;
  total_budget?: number;
  estimated_fees?: number;
  billed_percentage?: number;
  billed_amount?: number;
  billing_mode?: string;
}

export interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  hourly_rate?: number;
  user_id?: string;
  task_id?: string;
  profiles?: { full_name: string };
  tasks?: { name: string; total_budget?: number; estimated_fees?: number };
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category?: string;
  description?: string;
}

export interface BillingCalculatorProps {
  projectId: string;
  tasks: Task[];
  onCalculationChange: (result: BillingCalculation) => void;
  formatCurrency: (amount: number) => string;
  defaultHourlyRate?: number;
}

export interface BillingCalculation {
  billingMode: BillingMode;
  subtotal: number;
  selectedTasks: Map<string, { percentageToBill: number; amountToBill: number }>;
  selectedTimeEntries: Set<string>;
  selectedExpenses: Set<string>;
  timeEntries: TimeEntry[];
  expenses: Expense[];
  timeTotal: number;
  expenseTotal: number;
  totalHours: number;
  nteWarnings: string[];
  isValid: boolean;
  validationError?: string;
}

export function BillingCalculator({
  projectId,
  tasks,
  onCalculationChange,
  formatCurrency,
  defaultHourlyRate = 0,
}: BillingCalculatorProps) {
  const [billingMode, setBillingMode] = useState<BillingMode>('time_materials');
  const [selectedTasks, setSelectedTasks] = useState<Map<string, { percentageToBill: number }>>(new Map());
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<Set<string>>(new Set());
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Load time entries and expenses for T&M mode
  useEffect(() => {
    if (projectId && billingMode === 'time_materials') {
      loadTMData();
    }
  }, [projectId, billingMode]);

  async function loadTMData() {
    setLoading(true);
    try {
      const { data: timeData } = await supabase
        .from('time_entries')
        .select('*, profiles(full_name), tasks(name, total_budget, estimated_fees)')
        .eq('project_id', projectId)
        .eq('approval_status', 'approved')
        .eq('billable', true)
        .is('invoice_id', null);

      if (timeData) {
        setTimeEntries(timeData);
        setSelectedTimeEntries(new Set(timeData.map((t: any) => t.id)));
      }

      const { data: expenseData } = await supabase
        .from('expenses')
        .select('*')
        .eq('project_id', projectId)
        .eq('approval_status', 'approved')
        .eq('billable', true);

      if (expenseData) {
        setExpenses(expenseData);
        setSelectedExpenses(new Set(expenseData.map((e: any) => e.id)));
      }
    } catch (err) {
      console.error('Failed to load T&M data:', err);
    }
    setLoading(false);
  }

  // Calculate T&M totals
  const tmCalculation = useMemo(() => {
    const selectedTimeData = timeEntries.filter(t => selectedTimeEntries.has(t.id));
    const selectedExpenseData = expenses.filter(e => selectedExpenses.has(e.id));

    const timeTotal = selectedTimeData.reduce((sum, t) => {
      const rate = t.hourly_rate || defaultHourlyRate;
      return sum + ((t.hours || 0) * rate);
    }, 0);
    const expenseTotal = selectedExpenseData.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalHours = selectedTimeData.reduce((sum, t) => sum + (t.hours || 0), 0);

    // NTE warnings
    const taskBudgets = new Map<string, { name: string; budget: number; billed: number }>();
    selectedTimeData.forEach(t => {
      if (t.task_id && t.tasks) {
        const existing = taskBudgets.get(t.task_id) || {
          name: t.tasks.name,
          budget: t.tasks.total_budget || t.tasks.estimated_fees || 0,
          billed: 0,
        };
        existing.billed += (t.hours || 0) * (t.hourly_rate || defaultHourlyRate);
        taskBudgets.set(t.task_id, existing);
      }
    });

    const nteWarnings: string[] = [];
    taskBudgets.forEach((info) => {
      if (info.budget > 0 && info.billed > info.budget) {
        nteWarnings.push(`"${info.name}" exceeds budget by ${formatCurrency(info.billed - info.budget)}`);
      }
    });

    return { timeTotal, expenseTotal, totalHours, nteWarnings };
  }, [timeEntries, expenses, selectedTimeEntries, selectedExpenses, defaultHourlyRate, formatCurrency]);

  // Calculate task-based totals (milestone/percentage)
  const taskCalculation = useMemo(() => {
    let total = 0;
    const taskAmounts = new Map<string, { percentageToBill: number; amountToBill: number }>();

    selectedTasks.forEach((selection, taskId) => {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const totalBudget = task.total_budget || task.estimated_fees || 0;
        const remainingPct = 100 - (task.billed_percentage || 0);

        let pctToBill: number;
        let amtToBill: number;

        if (billingMode === 'milestone') {
          pctToBill = remainingPct;
          amtToBill = (totalBudget * remainingPct) / 100;
        } else {
          pctToBill = Math.min(selection.percentageToBill, remainingPct);
          amtToBill = (totalBudget * pctToBill) / 100;
        }

        total += amtToBill;
        taskAmounts.set(taskId, { percentageToBill: pctToBill, amountToBill: amtToBill });
      }
    });

    return { total, taskAmounts };
  }, [selectedTasks, tasks, billingMode]);

  // Calculate final subtotal
  const subtotal = useMemo(() => {
    if (billingMode === 'time_materials') {
      return tmCalculation.timeTotal + tmCalculation.expenseTotal;
    }
    return taskCalculation.total;
  }, [billingMode, tmCalculation, taskCalculation]);

  // Validation
  const validation = useMemo(() => {
    if (billingMode === 'time_materials') {
      if (selectedTimeEntries.size === 0 && selectedExpenses.size === 0) {
        return { isValid: false, error: 'Please select at least one time entry or expense' };
      }
    } else {
      if (selectedTasks.size === 0) {
        return { isValid: false, error: 'Please select at least one task' };
      }
      // Check billing mode compatibility
      const incompatible = tasks.find(t =>
        selectedTasks.has(t.id) &&
        t.billing_mode &&
        t.billing_mode !== 'unset' &&
        t.billing_mode !== billingMode
      );
      if (incompatible) {
        return { isValid: false, error: `Task "${incompatible.name}" is locked to ${incompatible.billing_mode} billing` };
      }
    }
    return { isValid: true };
  }, [billingMode, selectedTimeEntries, selectedExpenses, selectedTasks, tasks]);

  // Notify parent of changes
  useEffect(() => {
    onCalculationChange({
      billingMode,
      subtotal,
      selectedTasks: taskCalculation.taskAmounts,
      selectedTimeEntries,
      selectedExpenses,
      timeEntries,
      expenses,
      timeTotal: tmCalculation.timeTotal,
      expenseTotal: tmCalculation.expenseTotal,
      totalHours: tmCalculation.totalHours,
      nteWarnings: tmCalculation.nteWarnings,
      isValid: validation.isValid,
      validationError: validation.error,
    });
  }, [billingMode, subtotal, taskCalculation, selectedTimeEntries, selectedExpenses, timeEntries, expenses, tmCalculation, validation, onCalculationChange]);

  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Map(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      const task = tasks.find(t => t.id === taskId);
      const remainingPct = 100 - (task?.billed_percentage || 0);
      newSelected.set(taskId, { percentageToBill: Math.min(10, remainingPct) });
    }
    setSelectedTasks(newSelected);
  };

  const updateTaskPercentage = (taskId: string, pct: number) => {
    const newSelected = new Map(selectedTasks);
    const task = tasks.find(t => t.id === taskId);
    const remainingPct = 100 - (task?.billed_percentage || 0);
    newSelected.set(taskId, { percentageToBill: Math.min(pct, remainingPct) });
    setSelectedTasks(newSelected);
  };

  const formatCompact = (amount: number) => {
    if (amount % 1 === 0) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    }
    return formatCurrency(amount);
  };

  return (
    <div className="space-y-3">
      {/* Billing Mode Selection */}
      <div>
        <label className="block text-[10px] font-semibold text-neutral-600 mb-1.5 uppercase tracking-wide">Billing Method</label>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => { setBillingMode('time_materials'); setSelectedTasks(new Map()); }}
            className={`p-1.5 rounded-lg text-left transition-all border ${
              billingMode === 'time_materials'
                ? 'bg-[#476E66]/10 border-[#476E66]'
                : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <p className={`font-semibold text-xs ${billingMode === 'time_materials' ? 'text-[#476E66]' : 'text-neutral-900'}`}>Time & Materials</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">Hours + expenses</p>
          </button>
          <button
            type="button"
            onClick={() => { setBillingMode('milestone'); setSelectedTasks(new Map()); setSelectedTimeEntries(new Set()); setSelectedExpenses(new Set()); }}
            className={`p-1.5 rounded-lg text-left transition-all border ${
              billingMode === 'milestone'
                ? 'bg-[#476E66]/10 border-[#476E66]'
                : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <p className={`font-semibold text-xs ${billingMode === 'milestone' ? 'text-[#476E66]' : 'text-neutral-900'}`}>By Milestone</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">Bill full remaining</p>
          </button>
          <button
            type="button"
            onClick={() => { setBillingMode('percentage'); setSelectedTasks(new Map()); setSelectedTimeEntries(new Set()); setSelectedExpenses(new Set()); }}
            className={`p-1.5 rounded-lg text-left transition-all border ${
              billingMode === 'percentage'
                ? 'bg-[#476E66]/10 border-[#476E66]'
                : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <p className={`font-semibold text-xs ${billingMode === 'percentage' ? 'text-[#476E66]' : 'text-neutral-900'}`}>By Percentage</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">Bill % of budget</p>
          </button>
        </div>
      </div>

      {/* T&M Content */}
      {billingMode === 'time_materials' && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-4 text-neutral-500 text-sm">Loading...</div>
          ) : timeEntries.length === 0 && expenses.length === 0 ? (
            <div className="text-center py-4 text-neutral-500 text-sm border border-neutral-200 rounded-lg">
              No approved billable time or expenses found
            </div>
          ) : (
            <>
              {/* NTE Warnings */}
              {tmCalculation.nteWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-xs font-medium text-amber-800 mb-1">⚠️ Budget Exceeded</p>
                  {tmCalculation.nteWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              )}

              {/* Time Entries */}
              {timeEntries.length > 0 && (
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                  <div className="bg-neutral-50 px-2 py-1.5 border-b border-neutral-200 flex justify-between">
                    <span className="text-xs font-medium text-neutral-700">Time ({timeEntries.length})</span>
                    <span className="text-xs font-medium text-[#476E66]">{formatCurrency(tmCalculation.timeTotal)}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    {timeEntries.map((entry) => (
                      <label key={entry.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 cursor-pointer border-b border-neutral-100 last:border-0">
                        <input
                          type="checkbox"
                          checked={selectedTimeEntries.has(entry.id)}
                          onChange={() => {
                            const newSet = new Set(selectedTimeEntries);
                            if (newSet.has(entry.id)) newSet.delete(entry.id);
                            else newSet.add(entry.id);
                            setSelectedTimeEntries(newSet);
                          }}
                          className="w-3 h-3 text-[#476E66] rounded border-neutral-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-neutral-900 truncate">{entry.profiles?.full_name || 'Team'}</p>
                          <p className="text-[10px] text-neutral-500">{entry.tasks?.name || '-'} • {entry.hours}h @ ${entry.hourly_rate || defaultHourlyRate}/hr</p>
                        </div>
                        <span className="text-xs font-medium text-neutral-900">{formatCompact((entry.hours || 0) * (entry.hourly_rate || defaultHourlyRate))}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Expenses */}
              {expenses.length > 0 && (
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                  <div className="bg-neutral-50 px-2 py-1.5 border-b border-neutral-200 flex justify-between">
                    <span className="text-xs font-medium text-neutral-700">Expenses ({expenses.length})</span>
                    <span className="text-xs font-medium text-[#476E66]">{formatCurrency(tmCalculation.expenseTotal)}</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto">
                    {expenses.map((expense) => (
                      <label key={expense.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 cursor-pointer border-b border-neutral-100 last:border-0">
                        <input
                          type="checkbox"
                          checked={selectedExpenses.has(expense.id)}
                          onChange={() => {
                            const newSet = new Set(selectedExpenses);
                            if (newSet.has(expense.id)) newSet.delete(expense.id);
                            else newSet.add(expense.id);
                            setSelectedExpenses(newSet);
                          }}
                          className="w-3 h-3 text-[#476E66] rounded border-neutral-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-neutral-900 truncate">{expense.description || expense.category || 'Expense'}</p>
                          <p className="text-[10px] text-neutral-500">{new Date(expense.date).toLocaleDateString()}</p>
                        </div>
                        <span className="text-xs font-medium text-neutral-900">{formatCompact(expense.amount || 0)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Task Selection for Milestone/Percentage */}
      {(billingMode === 'milestone' || billingMode === 'percentage') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-neutral-600">Select Tasks</label>
            <button
              type="button"
              onClick={() => {
                if (selectedTasks.size === tasks.length) {
                  setSelectedTasks(new Map());
                } else {
                  const newSelected = new Map<string, { percentageToBill: number }>();
                  tasks.forEach(t => {
                    const remainingPct = 100 - (t.billed_percentage || 0);
                    if (remainingPct > 0) {
                      newSelected.set(t.id, { percentageToBill: Math.min(10, remainingPct) });
                    }
                  });
                  setSelectedTasks(newSelected);
                }
              }}
              className="text-xs text-[#476E66] hover:underline"
            >
              {selectedTasks.size === tasks.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="border border-neutral-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {tasks.map((task) => {
              const totalBudget = task.total_budget || task.estimated_fees || 0;
              const billedPct = task.billed_percentage || 0;
              const remainingPct = 100 - billedPct;
              const remainingAmt = (totalBudget * remainingPct) / 100;
              const isFullyBilled = remainingPct <= 0;
              const isSelected = selectedTasks.has(task.id);
              const taskMode = task.billing_mode || 'unset';
              const isModeLocked = taskMode !== 'unset';
              const isModeIncompatible = isModeLocked && taskMode !== billingMode;
              const isDisabled = isFullyBilled || isModeIncompatible;

              return (
                <label
                  key={task.id}
                  className={`flex items-center gap-2 px-2 py-1.5 border-b border-neutral-100 last:border-0 ${
                    isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-50 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => toggleTaskSelection(task.id)}
                    className="w-3 h-3 text-[#476E66] rounded border-neutral-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium text-neutral-900 truncate">{task.name}</p>
                      {isModeLocked && (
                        <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                          taskMode === 'milestone' ? 'bg-amber-100 text-amber-700' :
                          taskMode === 'percentage' ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {taskMode === 'milestone' ? 'MS' : taskMode === 'percentage' ? '%' : 'T&M'}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      {formatCompact(remainingAmt)} remaining ({remainingPct}%)
                    </p>
                  </div>
                  {billingMode === 'percentage' && isSelected && !isDisabled && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max={remainingPct}
                        value={selectedTasks.get(task.id)?.percentageToBill || 10}
                        onChange={(e) => updateTaskPercentage(task.id, parseFloat(e.target.value) || 0)}
                        className="w-12 h-6 px-1 text-xs text-center border border-neutral-200 rounded focus:ring-1 focus:ring-[#476E66]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs text-neutral-500">%</span>
                    </div>
                  )}
                  {billingMode === 'milestone' && (
                    <span className="text-xs font-medium text-neutral-900">{formatCompact(remainingAmt)}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-[#476E66] text-white rounded-lg p-2.5">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-white/70">
            {billingMode === 'time_materials' ? `Time (${tmCalculation.totalHours} hrs)` : 'Tasks'}
          </span>
          <span>{formatCompact(billingMode === 'time_materials' ? tmCalculation.timeTotal : taskCalculation.total)}</span>
        </div>
        {billingMode === 'time_materials' && (
          <div className="flex justify-between text-xs mb-1">
            <span className="text-white/70">Expenses</span>
            <span>{formatCompact(tmCalculation.expenseTotal)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold border-t border-white/20 pt-1.5 mt-1.5">
          <span>Subtotal</span>
          <span>{formatCompact(subtotal)}</span>
        </div>
      </div>

      {/* Validation Error */}
      {!validation.isValid && validation.error && (
        <p className="text-xs text-red-600">{validation.error}</p>
      )}
    </div>
  );
}
