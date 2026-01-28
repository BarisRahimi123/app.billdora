import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, DollarSign, Building2, Car, Users, Phone, FileText, MoreHorizontal, TrendingDown, ChevronDown, ChevronRight, Shield, Plane, CreditCard, Monitor, Megaphone, Briefcase, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { companyExpensesApi, CompanyExpense } from '../lib/api';

const EXPENSE_CATEGORIES = [
  { value: 'software', label: 'Software & Subscriptions', icon: Monitor },
  { value: 'office', label: 'Office & Facilities', icon: Building2 },
  { value: 'marketing', label: 'Marketing & Advertising', icon: Megaphone },
  { value: 'professional', label: 'Professional Services', icon: Briefcase },
  { value: 'insurance', label: 'Insurance', icon: Shield },
  { value: 'travel', label: 'Travel & Entertainment', icon: Plane },
  { value: 'payroll', label: 'Payroll & HR', icon: Users },
  { value: 'banking', label: 'Banking & Financial', icon: CreditCard },
  { value: 'equipment', label: 'Equipment & Technology', icon: Monitor },
  { value: 'telecom', label: 'Phone & Internet', icon: Phone },
  { value: 'vehicles', label: 'Vehicles', icon: Car },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

const PRESET_EXPENSES: Record<string, { name: string; frequency: string }[]> = {
  software: [
    { name: 'Accounting Software', frequency: 'monthly' },
    { name: 'CRM Software', frequency: 'monthly' },
    { name: 'Project Management', frequency: 'monthly' },
    { name: 'Communication Tools', frequency: 'monthly' },
    { name: 'Video Conferencing', frequency: 'monthly' },
    { name: 'Design Tools', frequency: 'monthly' },
    { name: 'Cloud Storage', frequency: 'monthly' },
    { name: 'Email Marketing', frequency: 'monthly' },
    { name: 'HR Software', frequency: 'monthly' },
    { name: 'Website Hosting', frequency: 'monthly' },
    { name: 'Domain Registration', frequency: 'yearly' },
    { name: 'Security Software', frequency: 'yearly' },
  ],
  office: [
    { name: 'Office Rent', frequency: 'monthly' },
    { name: 'Electricity', frequency: 'monthly' },
    { name: 'Gas', frequency: 'monthly' },
    { name: 'Water', frequency: 'monthly' },
    { name: 'Internet', frequency: 'monthly' },
    { name: 'Cleaning', frequency: 'monthly' },
    { name: 'Office Supplies', frequency: 'monthly' },
    { name: 'Furniture', frequency: 'one-time' },
    { name: 'Maintenance', frequency: 'monthly' },
  ],
  marketing: [
    { name: 'Google Ads', frequency: 'monthly' },
    { name: 'Facebook Ads', frequency: 'monthly' },
    { name: 'LinkedIn Ads', frequency: 'monthly' },
    { name: 'SEO Services', frequency: 'monthly' },
    { name: 'Content Marketing', frequency: 'monthly' },
    { name: 'PR Services', frequency: 'monthly' },
    { name: 'Trade Shows', frequency: 'yearly' },
  ],
  professional: [
    { name: 'Legal Fees', frequency: 'monthly' },
    { name: 'Accounting', frequency: 'monthly' },
    { name: 'Consulting', frequency: 'monthly' },
    { name: 'Tax Preparation', frequency: 'yearly' },
    { name: 'Business Licenses', frequency: 'yearly' },
  ],
  insurance: [
    { name: 'General Liability', frequency: 'yearly' },
    { name: 'Professional Liability', frequency: 'yearly' },
    { name: 'Workers Compensation', frequency: 'yearly' },
    { name: 'Property Insurance', frequency: 'yearly' },
    { name: 'Cyber Insurance', frequency: 'yearly' },
  ],
  travel: [
    { name: 'Airfare', frequency: 'monthly' },
    { name: 'Hotels', frequency: 'monthly' },
    { name: 'Ground Transport', frequency: 'monthly' },
    { name: 'Business Meals', frequency: 'monthly' },
    { name: 'Conference Fees', frequency: 'yearly' },
  ],
  payroll: [
    { name: 'Payroll Processing', frequency: 'monthly' },
    { name: '401(k) Admin', frequency: 'monthly' },
    { name: 'Training', frequency: 'monthly' },
    { name: 'Recruiting', frequency: 'one-time' },
  ],
  banking: [
    { name: 'Bank Fees', frequency: 'monthly' },
    { name: 'Credit Card Processing', frequency: 'monthly' },
    { name: 'Loan Interest', frequency: 'monthly' },
  ],
  equipment: [
    { name: 'Computers', frequency: 'one-time' },
    { name: 'Monitors', frequency: 'one-time' },
    { name: 'Equipment Leases', frequency: 'monthly' },
  ],
  telecom: [
    { name: 'Phone Service', frequency: 'monthly' },
    { name: 'Mobile Plans', frequency: 'monthly' },
    { name: 'Internet', frequency: 'monthly' },
  ],
  vehicles: [
    { name: 'Vehicle Lease', frequency: 'monthly' },
    { name: 'Fuel', frequency: 'monthly' },
    { name: 'Insurance', frequency: 'monthly' },
    { name: 'Maintenance', frequency: 'monthly' },
  ],
  other: [
    { name: 'Shipping', frequency: 'monthly' },
    { name: 'Printing', frequency: 'monthly' },
    { name: 'Miscellaneous', frequency: 'monthly' },
  ],
};

export default function CompanyExpensesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'category' | 'details'>('category');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [newExpense, setNewExpense] = useState({ name: '', amount: '', frequency: 'monthly' });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    if (profile?.company_id) loadExpenses();
  }, [profile?.company_id]);

  async function loadExpenses() {
    if (!profile?.company_id) return;
    setLoading(true);
    const data = await companyExpensesApi.getExpenses(profile.company_id);
    setExpenses(data);
    // Auto-expand categories that have expenses
    setExpandedCategories(new Set(data.map(e => e.category)));
    setLoading(false);
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function openAddModal() {
    setShowAddModal(true);
    setAddStep('category');
    setSelectedCategory(null);
    setNewExpense({ name: '', amount: '', frequency: 'monthly' });
    setIsCustomMode(false);
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    setAddStep('details');
    setNewExpense({ name: '', amount: '', frequency: 'monthly' });
    setIsCustomMode(false);
  }

  function handlePresetSelect(value: string) {
    if (!selectedCategory) return;
    if (value === '__custom__') {
      setNewExpense({ name: '', amount: '', frequency: 'monthly' });
      setIsCustomMode(true);
    } else {
      const preset = PRESET_EXPENSES[selectedCategory]?.find(p => p.name === value);
      if (preset) {
        setNewExpense({ name: preset.name, amount: '', frequency: preset.frequency });
      }
    }
  }

  async function saveExpense() {
    if (!profile?.company_id || !selectedCategory || !newExpense.name || !newExpense.amount) return;
    await companyExpensesApi.createExpense({
      company_id: profile.company_id,
      name: newExpense.name,
      category: selectedCategory,
      amount: parseFloat(newExpense.amount),
      frequency: newExpense.frequency as any,
      is_recurring: newExpense.frequency !== 'one-time',
      is_active: true,
    });
    setShowAddModal(false);
    loadExpenses();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    await companyExpensesApi.deleteExpense(id);
    loadExpenses();
  }

  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const activeExpenses = expenses.filter(e => e.is_active);
  const totalMonthly = activeExpenses.reduce((sum, e) => sum + companyExpensesApi.getMonthlyAmount(e), 0);

  const expensesByCategory = EXPENSE_CATEGORIES.map(cat => ({
    ...cat,
    expenses: expenses.filter(e => e.category === cat.value),
    total: expenses.filter(e => e.category === cat.value && e.is_active).reduce((sum, e) => sum + companyExpensesApi.getMonthlyAmount(e), 0)
  }));

  // Filter to only show categories with expenses (unless showAllCategories is true)
  const visibleCategories = showAllCategories 
    ? expensesByCategory 
    : expensesByCategory.filter(cat => cat.expenses.length > 0);

  if (loading) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[#476E66] border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="h-screen bg-neutral-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-neutral-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">Company Expenses</h1>
              <p className="text-xs text-neutral-500">Track your recurring business costs</p>
            </div>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Monthly</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(totalMonthly)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Yearly</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(totalMonthly * 12)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Active</p>
                  <p className="text-xl font-bold text-neutral-900">{activeExpenses.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Expenses List */}
          {visibleCategories.length === 0 ? (
            /* Empty State */
            <div className="bg-white rounded-xl p-12 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">No expenses yet</h3>
              <p className="text-sm text-neutral-500 mb-6 max-w-sm mx-auto">
                Start tracking your business expenses to get insights into your spending
              </p>
              <button
                onClick={openAddModal}
                className="px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
              >
                Add Your First Expense
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Category Cards */}
              {visibleCategories.map(cat => {
                const Icon = cat.icon;
                const isExpanded = expandedCategories.has(cat.value);

                return (
                  <div key={cat.value} className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                    {/* Category Header */}
                    <div 
                      onClick={() => toggleCategory(cat.value)} 
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isExpanded ? 'bg-[#476E66]/10' : 'bg-neutral-100'}`}>
                          <Icon className={`w-4 h-4 ${isExpanded ? 'text-[#476E66]' : 'text-neutral-500'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">{cat.label}</p>
                          <p className="text-xs text-neutral-500">{cat.expenses.length} expense{cat.expenses.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-neutral-900">{formatCurrency(cat.total)}<span className="text-xs text-neutral-400 font-normal">/mo</span></span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-neutral-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-neutral-100">
                        <div className="divide-y divide-neutral-100">
                          {cat.expenses.map(exp => (
                            <div key={exp.id} className="px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors group">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-[#476E66]" />
                                <span className="text-sm text-neutral-900">{exp.name}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-sm font-medium text-neutral-900">{formatCurrency(exp.amount)}</span>
                                <span className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs text-neutral-600 capitalize">{exp.frequency}</span>
                                <button 
                                  onClick={() => handleDelete(exp.id)} 
                                  className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Quick Add Button */}
                        <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50/50">
                          <button 
                            onClick={() => { setSelectedCategory(cat.value); setAddStep('details'); setShowAddModal(true); }}
                            className="flex items-center gap-1.5 text-xs text-[#476E66] hover:text-[#3A5B54] font-medium transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add to {cat.label}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Show All Categories Toggle */}
              <button
                onClick={() => setShowAllCategories(!showAllCategories)}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                {showAllCategories ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Hide empty categories
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Show all categories ({EXPENSE_CATEGORIES.length - visibleCategories.length} empty)
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  {addStep === 'category' ? 'Add Expense' : EXPENSE_CATEGORIES.find(c => c.value === selectedCategory)?.label}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {addStep === 'category' ? 'Select a category' : 'Enter expense details'}
                </p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5">
              {addStep === 'category' ? (
                /* Category Selection */
                <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                  {EXPENSE_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const existingCount = expenses.filter(e => e.category === cat.value).length;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => selectCategory(cat.value)}
                        className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 hover:border-[#476E66] hover:bg-[#476E66]/5 transition-all text-left group"
                      >
                        <div className="w-9 h-9 bg-neutral-100 group-hover:bg-[#476E66]/10 rounded-lg flex items-center justify-center transition-colors">
                          <Icon className="w-4 h-4 text-neutral-500 group-hover:text-[#476E66]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{cat.label}</p>
                          {existingCount > 0 && (
                            <p className="text-xs text-neutral-400">{existingCount} existing</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Expense Details Form */
                <div className="space-y-4">
                  {/* Back Button */}
                  <button 
                    onClick={() => setAddStep('category')} 
                    className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
                  >
                    <ChevronRight className="w-3 h-3 rotate-180" />
                    Change category
                  </button>

                  {/* Expense Name */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Expense Name</label>
                    {isCustomMode ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter expense name..."
                          autoFocus
                          value={newExpense.name}
                          onChange={(e) => setNewExpense({...newExpense, name: e.target.value})}
                          className="flex-1 px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                        />
                        <button
                          onClick={() => { setIsCustomMode(false); setNewExpense({...newExpense, name: ''}); }}
                          className="px-3 py-2.5 text-sm text-neutral-500 hover:text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                        >
                          List
                        </button>
                      </div>
                    ) : (
                      <select
                        value={newExpense.name}
                        onChange={(e) => handlePresetSelect(e.target.value)}
                        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                      >
                        <option value="">Select an expense...</option>
                        {selectedCategory && PRESET_EXPENSES[selectedCategory]?.map(p => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                        <option value="__custom__">+ Add custom expense...</option>
                      </select>
                    )}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                        className="w-full pl-7 pr-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Frequency</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'monthly', label: 'Monthly' },
                        { value: 'yearly', label: 'Yearly' },
                        { value: 'one-time', label: 'One-time' },
                      ].map(freq => (
                        <button
                          key={freq.value}
                          onClick={() => setNewExpense({...newExpense, frequency: freq.value})}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            newExpense.frequency === freq.value
                              ? 'bg-[#476E66] text-white'
                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                          }`}
                        >
                          {freq.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {addStep === 'details' && (
              <div className="px-5 py-4 border-t border-neutral-100 flex gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveExpense}
                  disabled={!newExpense.name || !newExpense.amount}
                  className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Expense
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
