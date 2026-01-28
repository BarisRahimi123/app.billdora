import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, DollarSign, Building2, Car, Users, Phone, FileText, MoreHorizontal, TrendingDown, ChevronDown, ChevronRight, Shield, Plane, CreditCard, Monitor, Megaphone, Briefcase, Check } from 'lucide-react';
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
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
  const [loading, setLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newExpense, setNewExpense] = useState({ name: '', amount: '', frequency: 'monthly' });
  const [isCustomMode, setIsCustomMode] = useState(false);

  useEffect(() => {
    if (profile?.company_id) loadExpenses();
  }, [profile?.company_id]);

  async function loadExpenses() {
    if (!profile?.company_id) return;
    setLoading(true);
    const data = await companyExpensesApi.getExpenses(profile.company_id);
    setExpenses(data);
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

  function startAdding(category: string) {
    setAddingTo(category);
    setNewExpense({ name: '', amount: '', frequency: 'monthly' });
    setIsCustomMode(false);
  }

  function handlePresetSelect(value: string, category: string) {
    if (value === '__custom__') {
      setNewExpense({ name: '', amount: '', frequency: 'monthly' });
      setIsCustomMode(true);
    } else {
      const preset = PRESET_EXPENSES[category]?.find(p => p.name === value);
      if (preset) {
        setNewExpense({ name: preset.name, amount: '', frequency: preset.frequency });
      }
    }
  }

  async function saveNew(category: string) {
    if (!profile?.company_id || !newExpense.name || !newExpense.amount) return;
    await companyExpensesApi.createExpense({
      company_id: profile.company_id,
      name: newExpense.name,
      category,
      amount: parseFloat(newExpense.amount),
      frequency: newExpense.frequency as any,
      is_recurring: newExpense.frequency !== 'one-time',
      is_active: true,
    });
    setAddingTo(null);
    loadExpenses();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete?')) return;
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

  if (loading) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[#476E66] border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="h-screen bg-neutral-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-neutral-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-2 flex items-center gap-2 h-10">
            <button onClick={() => navigate(-1)} className="text-neutral-500 hover:text-neutral-900"><X className="w-4 h-4" /></button>
          <h1 className="text-sm font-semibold text-neutral-400">Company Expenses</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-2 py-1.5 pb-16">
        {/* Summary - Ultra Compact */}
        <div className="flex gap-1 mb-1.5">
          <div className="flex-1 bg-white rounded px-2 py-1 flex items-center gap-1.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <TrendingDown className="w-3 h-3 text-[#476E66]" />
            <div>
              <span className="text-[8px] text-neutral-500 block leading-tight">Monthly</span>
              <span className="text-[11px] font-bold text-neutral-900">{formatCurrency(totalMonthly)}</span>
            </div>
          </div>
          <div className="flex-1 bg-white rounded px-2 py-1 flex items-center gap-1.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <DollarSign className="w-3 h-3 text-[#476E66]" />
            <div>
              <span className="text-[8px] text-neutral-500 block leading-tight">Yearly</span>
              <span className="text-[11px] font-bold text-neutral-900">{formatCurrency(totalMonthly * 12)}</span>
            </div>
          </div>
          <div className="bg-white rounded px-2 py-1 flex items-center gap-1.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <FileText className="w-3 h-3 text-[#476E66]" />
            <div>
              <span className="text-[8px] text-neutral-500 block leading-tight">Active</span>
              <span className="text-[11px] font-bold text-neutral-900">{activeExpenses.length}</span>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-0.5">
          {expensesByCategory.map(cat => {
            const Icon = cat.icon;
            const isExpanded = expandedCategories.has(cat.value);
            const isAdding = addingTo === cat.value;
            const hasExpenses = cat.expenses.length > 0;

            return (
              <div key={cat.value} className="bg-white rounded-md overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div onClick={() => toggleCategory(cat.value)} className={`px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50/50 transition-colors ${isExpanded ? 'py-1.5' : 'py-1'}`}>
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-neutral-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-neutral-400 flex-shrink-0" />}
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isExpanded ? 'bg-[#476E66]/10' : 'bg-neutral-100'}`}><Icon className={`w-2.5 h-2.5 ${isExpanded ? 'text-[#476E66]' : 'text-neutral-400'}`} /></div>
                    <p className={`text-[11px] font-medium truncate leading-tight ${isExpanded ? 'text-neutral-900' : hasExpenses ? 'text-neutral-700' : 'text-neutral-400'}`}>{cat.label}</p>
                    {!isExpanded && <span className={`text-[9px] ml-auto ${hasExpenses ? 'text-neutral-500' : 'text-neutral-300'}`}>{cat.expenses.length} items{cat.total > 0 && ` • ${formatCurrency(cat.total)}/mo`}</span>}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-neutral-100 overflow-x-auto">
                    <table className="w-full min-w-[400px]">
                      <thead className="bg-neutral-50 border-b border-neutral-100">
                        <tr>
                          <th className="text-left px-2 py-0.5 text-[8px] font-medium text-neutral-500 uppercase">Expense</th>
                          <th className="text-left px-1.5 py-0.5 text-[8px] font-medium text-neutral-500 uppercase w-20">Amount</th>
                          <th className="text-left px-1.5 py-0.5 text-[8px] font-medium text-neutral-500 uppercase w-16">Freq</th>
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {cat.expenses.map(exp => (
                          <tr key={exp.id} className="hover:bg-neutral-50/50">
                            <td className="px-2 py-1 text-[11px] font-medium text-neutral-900">{exp.name}</td>
                            <td className="px-1.5 py-1 text-[11px] text-neutral-900">{formatCurrency(exp.amount)}</td>
                            <td className="px-1.5 py-1"><span className="px-1 py-0.5 bg-neutral-100 rounded text-[8px] capitalize">{exp.frequency}</span></td>
                            <td className="px-1 py-1">
                              <button onClick={() => handleDelete(exp.id)} className="text-neutral-400 hover:text-red-500 transition-colors"><Trash2 className="w-2.5 h-2.5" /></button>
                            </td>
                          </tr>
                        ))}

                        {/* Inline Add Row */}
                        {isAdding ? (
                          <tr className="bg-neutral-50/50">
                            <td className="px-2 py-1">
                              {isCustomMode ? (
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="Type name..."
                                    autoFocus
                                    value={newExpense.name}
                                    onChange={(e) => setNewExpense({...newExpense, name: e.target.value})}
                                    className="flex-1 px-1 py-0.5 border border-neutral-200 rounded text-[10px] focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66]"
                                  />
                                  <button
                                    onClick={() => { setIsCustomMode(false); setNewExpense({...newExpense, name: ''}); }}
                                    className="text-[8px] text-neutral-500 hover:text-neutral-700 px-0.5"
                                  >List</button>
                                </div>
                              ) : (
                                <select
                                  value={newExpense.name}
                                  onChange={(e) => handlePresetSelect(e.target.value, cat.value)}
                                  className="w-full px-1 py-0.5 border border-neutral-200 rounded text-[10px] bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66]"
                                >
                                  <option value="">Select...</option>
                                  {PRESET_EXPENSES[cat.value]?.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                                  <option value="__custom__">+ Custom...</option>
                                </select>
                              )}
                            </td>
                            <td className="px-1.5 py-1">
                              <input
                                type="number"
                                placeholder="$0"
                                value={newExpense.amount}
                                onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                                className="w-12 px-1 py-0.5 border border-neutral-200 rounded text-[10px] focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66]"
                              />
                            </td>
                            <td className="px-1.5 py-1">
                              <select
                                value={newExpense.frequency}
                                onChange={(e) => setNewExpense({...newExpense, frequency: e.target.value})}
                                className="px-1 py-0.5 border border-neutral-200 rounded text-[10px] bg-white focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66]"
                              >
                                <option value="monthly">Mo</option>
                                <option value="yearly">Yr</option>
                                <option value="weekly">Wk</option>
                                <option value="one-time">1x</option>
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <div className="flex gap-0.5">
                                <button onClick={() => saveNew(cat.value)} disabled={!newExpense.name || !newExpense.amount} className="p-0.5 bg-[#476E66] text-white rounded disabled:opacity-50 hover:bg-[#3A5B54] transition-colors"><Check className="w-2 h-2" /></button>
                                <button onClick={() => setAddingTo(null)} className="p-0.5 text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-2 h-2" /></button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-2 py-1">
                              <button onClick={() => startAdding(cat.value)} className="flex items-center gap-0.5 text-[10px] text-[#476E66] hover:text-[#3a5b54] transition-colors font-medium">
                                <Plus className="w-2.5 h-2.5" /> Add expense
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
