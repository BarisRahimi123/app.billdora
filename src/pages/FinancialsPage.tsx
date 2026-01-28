import { useEffect, useState, useMemo, useRef } from 'react';
import { DollarSign, TrendingUp, TrendingDown, FileText, Calendar, AlertCircle, Users, Wallet, ArrowUpRight, ArrowDownRight, Plus, Upload, X, Check, Link2, Edit2, Trash2, Building2, CreditCard, RefreshCw, ChevronDown, ChevronRight, Search, Filter, Download, Printer, BarChart3, PieChart, ClipboardList, Landmark } from 'lucide-react';
import BankStatementsPage from './BankStatementsPage';
import { useAuth } from '../contexts/AuthContext';
import { api, Invoice, Expense, companyExpensesApi } from '../lib/api';
import { supabase } from '../lib/supabase';

interface PayrollData {
  totalMonthly: number;
  employeeCount: number;
}

interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
  payroll: number;
  profit: number;
}

interface BankAccount {
  id: string;
  company_id: string;
  account_name: string;
  bank_name?: string;
  account_number?: string;
  account_type: string;
  balance: number;
  is_active: boolean;
  created_at?: string;
}

interface BankTransaction {
  id: string;
  company_id: string;
  statement_id?: string;
  transaction_date: string;
  description: string;
  amount: number;
  type: string;
  matched_expense_id?: string;
  matched_invoice_id?: string;
  matched_type?: string;
  match_status: string;
}

interface PlatformTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  source: 'invoice' | 'expense' | 'company_expense';
  status?: string;
}

type FinancialTab = 'pnl' | 'bank' | 'transactions' | 'reports' | 'taxreports';

export default function FinancialsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FinancialTab>('pnl');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [companyExpenses, setCompanyExpenses] = useState<any[]>([]);
  const [payrollData, setPayrollData] = useState<PayrollData>({ totalMonthly: 0, employeeCount: 0 });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (profile?.company_id) loadData();
  }, [profile?.company_id]);

  async function loadData() {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const [invoicesData, expensesData, compExpData] = await Promise.all([
        api.getInvoices(profile.company_id),
        api.getExpenses(profile.company_id),
        companyExpensesApi.getExpenses(profile.company_id),
      ]);
      setInvoices(invoicesData);
      setExpenses(expensesData);
      setCompanyExpenses(compExpData);

      // Load bank accounts
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      if (accounts) setBankAccounts(accounts);

      // Load bank transactions
      const { data: transactions } = await supabase
        .from('bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });
      if (transactions) setBankTransactions(transactions);

      // Get payroll data from profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('salary, salary_type')
        .eq('company_id', profile.company_id)
        .eq('is_active', true);

      let monthlyPayroll = 0;
      if (profiles) {
        profiles.forEach(p => {
          if (p.salary) {
            if (p.salary_type === 'hourly') {
              monthlyPayroll += p.salary * 160;
            } else if (p.salary_type === 'annual') {
              monthlyPayroll += p.salary / 12;
            } else {
              monthlyPayroll += p.salary;
            }
          }
        });
        setPayrollData({ totalMonthly: monthlyPayroll, employeeCount: profiles.length });
      }

      // Calculate monthly P&L for last 12 months
      const now = new Date();
      const months: MonthlyData[] = [];
      for (let i = 11; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthStr = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        const monthRevenue = invoicesData
          .filter(inv => inv.status === 'paid' && new Date(inv.created_at) >= monthDate && new Date(inv.created_at) <= monthEnd)
          .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

        const monthExpenses = expensesData
          .filter(exp => new Date(exp.date) >= monthDate && new Date(exp.date) <= monthEnd)
          .reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

        const monthCompExp = compExpData
          .filter((exp: any) => new Date(exp.date) >= monthDate && new Date(exp.date) <= monthEnd)
          .reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);

        const totalExp = monthExpenses + monthCompExp;

        months.push({
          month: monthStr,
          revenue: monthRevenue,
          expenses: totalExp,
          payroll: monthlyPayroll,
          profit: monthRevenue - totalExp - monthlyPayroll
        });
      }
      setMonthlyData(months);

    } catch (error) {
      console.error('Failed to load financial data:', error);
    } finally {
      setLoading(false);
    }
  }

  // All platform transactions combined
  const platformTransactions = useMemo((): PlatformTransaction[] => {
    const txns: PlatformTransaction[] = [];
    
    // Paid invoices as income
    invoices.filter(inv => inv.status === 'paid').forEach(inv => {
      txns.push({
        id: inv.id,
        date: inv.created_at || '',
        description: `Invoice #${inv.invoice_number} - Payment`,
        amount: Number(inv.total || 0),
        type: 'income',
        source: 'invoice',
        status: inv.status
      });
    });

    // Project expenses
    expenses.forEach(exp => {
      txns.push({
        id: exp.id,
        date: exp.date,
        description: exp.description || exp.category || 'Project Expense',
        amount: Number(exp.amount || 0),
        type: 'expense',
        source: 'expense',
        status: exp.status
      });
    });

    // Company expenses
    companyExpenses.forEach((exp: any) => {
      txns.push({
        id: exp.id,
        date: exp.date,
        description: exp.description || exp.category || 'Company Expense',
        amount: Number(exp.amount || 0),
        type: 'expense',
        source: 'company_expense'
      });
    });

    return txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, expenses, companyExpenses]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalRevenue = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0) +
                          companyExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
    const arOutstanding = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue')
                                   .reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const bankBalance = bankAccounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
    
    return {
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses - (payrollData.totalMonthly * 12),
      arOutstanding,
      bankBalance,
      unmatchedCount: bankTransactions.filter(t => t.match_status === 'unmatched').length
    };
  }, [invoices, expenses, companyExpenses, bankAccounts, bankTransactions, payrollData]);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-neutral-200 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-neutral-200 rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3 max-w-7xl mx-auto space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm sm:text-base font-bold text-neutral-900">Financials</h1>
          <p className="text-[10px] text-neutral-500">Profit & Loss, Bank Accounts, Reconciliation</p>
        </div>
        <button
          onClick={() => { setEditingAccount(null); setShowAccountModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-xs font-medium"
        >
          <Plus className="w-3 h-3" />
          <span className="hidden sm:inline">Add Bank Account</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Summary Metrics Row - Ultra Compact */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
        <div className="bg-white rounded-lg p-1 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-0.5 mb-0.5">
            <div className="w-3.5 h-3.5 rounded bg-[#476E66]/10 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-2 h-2 text-[#476E66]" />
            </div>
            <p className="text-[8px] text-neutral-500 leading-none truncate">Revenue</p>
          </div>
          <p className="text-[11px] font-bold text-neutral-900 truncate">{formatCurrency(summary.totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-lg p-1 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-0.5 mb-0.5">
            <div className="w-3.5 h-3.5 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-2 h-2 text-red-600" />
            </div>
            <p className="text-[8px] text-neutral-500 leading-none truncate">Expenses</p>
          </div>
          <p className="text-[11px] font-bold text-neutral-900 truncate">{formatCurrency(summary.totalExpenses)}</p>
        </div>
        <div className="bg-white rounded-lg p-1 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-0.5 mb-0.5">
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${summary.netProfit >= 0 ? 'bg-[#476E66]/10' : 'bg-red-50'}`}>
              <TrendingUp className={`w-2 h-2 ${summary.netProfit >= 0 ? 'text-[#476E66]' : 'text-red-600'}`} />
            </div>
            <p className="text-[8px] text-neutral-500 leading-none truncate">Profit</p>
          </div>
          <p className={`text-[11px] font-bold truncate ${summary.netProfit >= 0 ? 'text-[#476E66]' : 'text-red-600'}`}>
            {formatCurrency(summary.netProfit)}
          </p>
        </div>
        <div className="bg-white rounded-lg p-1 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-0.5 mb-0.5">
            <div className="w-3.5 h-3.5 rounded bg-amber-50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-2 h-2 text-amber-600" />
            </div>
            <p className="text-[8px] text-neutral-500 leading-none truncate">AR</p>
          </div>
          <p className="text-[11px] font-bold text-amber-600 truncate">{formatCurrency(summary.arOutstanding)}</p>
        </div>
        <div className="bg-white rounded-lg p-1 overflow-hidden col-span-3 sm:col-span-1" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-0.5 mb-0.5">
            <div className="w-3.5 h-3.5 rounded bg-[#476E66]/10 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-2 h-2 text-[#476E66]" />
            </div>
            <p className="text-[8px] text-neutral-500 leading-none truncate">Bank</p>
          </div>
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-bold text-[#476E66] truncate">{formatCurrency(summary.bankBalance)}</p>
            {summary.unmatchedCount > 0 && (
              <span className="text-[8px] text-amber-600">({summary.unmatchedCount})</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs - Compact */}
      <div className="flex gap-0.5 p-0.5 bg-neutral-100 rounded-lg overflow-x-auto scrollbar-hide">
        {[
          { key: 'pnl', label: 'P&L', fullLabel: 'Profit & Loss' },
          { key: 'bank', label: 'Bank', fullLabel: 'Bank & Receipts' },
          { key: 'transactions', label: 'Trans', fullLabel: 'Transactions' },
          { key: 'reports', label: 'Reports', fullLabel: 'Reports' },
          { key: 'taxreports', label: 'Tax', fullLabel: 'Tax Reports' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as FinancialTab)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span className="sm:hidden">{tab.label}</span>
            <span className="hidden sm:inline">{tab.fullLabel}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'pnl' && (
        <ProfitLossTab monthlyData={monthlyData} payrollData={payrollData} formatCurrency={formatCurrency} />
      )}

      {activeTab === 'bank' && (
        <BankStatementsPage />
      )}

      {activeTab === 'transactions' && (
        <TransactionsTab 
          transactions={platformTransactions}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          formatCurrency={formatCurrency}
        />
      )}

      {activeTab === 'reports' && (
        <ReportsTab 
          monthlyData={monthlyData}
          invoices={invoices}
          expenses={expenses}
          companyExpenses={companyExpenses}
          payrollData={payrollData}
          summary={summary}
          formatCurrency={formatCurrency}
        />
      )}

      {activeTab === 'taxreports' && (
        <TaxReportsTab 
          invoices={invoices}
          expenses={expenses}
          companyExpenses={companyExpenses}
          payrollData={payrollData}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Bank Account Modal */}
      {showAccountModal && (
        <BankAccountModal
          account={editingAccount}
          companyId={profile?.company_id || ''}
          onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
          onSave={() => { setShowAccountModal(false); setEditingAccount(null); loadData(); }}
        />
      )}
    </div>
  );
}

// P&L Tab - Table View
function ProfitLossTab({ monthlyData, payrollData, formatCurrency }: {
  monthlyData: MonthlyData[];
  payrollData: PayrollData;
  formatCurrency: (n: number) => string;
}) {
  const totals = useMemo(() => ({
    revenue: monthlyData.reduce((s, m) => s + m.revenue, 0),
    expenses: monthlyData.reduce((s, m) => s + m.expenses, 0),
    payroll: payrollData.totalMonthly * 12,
    profit: monthlyData.reduce((s, m) => s + m.profit, 0)
  }), [monthlyData, payrollData]);

  return (
    <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="px-2.5 py-1.5 border-b border-neutral-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-neutral-900">Profit & Loss Statement</h3>
        <span className="text-[9px] text-neutral-500">Last 12 months</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-100">
            <tr>
              <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Month</th>
              <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Revenue</th>
              <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Expenses</th>
              <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide hidden sm:table-cell">Payroll</th>
              <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Net Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {monthlyData.map((month, idx) => (
              <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                <td className="px-2 py-1.5 text-xs font-medium text-neutral-900">{month.month}</td>
                <td className="px-2 py-1.5 text-right text-xs text-[#476E66]">{formatCurrency(month.revenue)}</td>
                <td className="px-2 py-1.5 text-right text-xs text-red-600">{formatCurrency(month.expenses)}</td>
                <td className="px-2 py-1.5 text-right text-xs text-amber-600 hidden sm:table-cell">{formatCurrency(month.payroll)}</td>
                <td className={`px-2 py-1.5 text-right text-xs font-semibold ${month.profit >= 0 ? 'text-[#476E66]' : 'text-red-600'}`}>
                  {formatCurrency(month.profit)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-100 border-t-2 border-neutral-200">
            <tr className="font-bold">
              <td className="px-2 py-2 text-xs text-neutral-900">Total (YTD)</td>
              <td className="px-2 py-2 text-right text-xs text-[#476E66]">{formatCurrency(totals.revenue)}</td>
              <td className="px-2 py-2 text-right text-xs text-red-600">{formatCurrency(totals.expenses)}</td>
              <td className="px-2 py-2 text-right text-xs text-amber-600 hidden sm:table-cell">{formatCurrency(totals.payroll)}</td>
              <td className={`px-2 py-2 text-right text-xs ${totals.profit >= 0 ? 'text-[#476E66]' : 'text-red-600'}`}>
                {formatCurrency(totals.profit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Bank Accounts Tab
function BankAccountsTab({ accounts, onEdit, onRefresh, formatCurrency, companyId }: {
  accounts: BankAccount[];
  onEdit: (acc: BankAccount) => void;
  onRefresh: () => void;
  formatCurrency: (n: number) => string;
  companyId: string;
}) {
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bank account?')) return;
    await supabase.from('bank_accounts').delete().eq('id', id);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="px-2.5 py-1.5 border-b border-neutral-100">
        <h3 className="text-xs font-semibold text-neutral-900">Bank Accounts</h3>
      </div>
      {accounts.length === 0 ? (
        <div className="p-6 text-center">
          <Building2 className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <h3 className="text-xs font-semibold text-neutral-900 mb-0.5">No bank accounts</h3>
          <p className="text-[10px] text-neutral-500">Add a bank account to start reconciling transactions</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-neutral-50 border-b border-neutral-100">
            <tr>
              <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Account</th>
              <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide hidden md:table-cell">Bank</th>
              <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide hidden sm:table-cell">Account #</th>
              <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Type</th>
              <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Balance</th>
              <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {accounts.map(acc => (
              <tr key={acc.id} className="hover:bg-neutral-50 transition-colors">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5 text-[#476E66]" />
                    </div>
                    <span className="text-xs font-medium text-neutral-900">{acc.account_name}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-xs text-neutral-600 hidden md:table-cell">{acc.bank_name || '-'}</td>
                <td className="px-2 py-1.5 text-xs text-neutral-600 font-mono hidden sm:table-cell">
                  {acc.account_number ? `****${acc.account_number.slice(-4)}` : '-'}
                </td>
                <td className="px-2 py-1.5">
                  <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] capitalize">
                    {acc.account_type}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-xs font-semibold text-[#476E66]">
                  {formatCurrency(acc.balance)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={() => onEdit(acc)} className="p-0.5 hover:bg-neutral-100 rounded text-neutral-500 hover:text-neutral-700">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(acc.id)} className="p-0.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// Reconciliation Tab - Two Column View
function ReconciliationTab({ bankTransactions, platformTransactions, onRefresh, formatCurrency, companyId }: {
  bankTransactions: BankTransaction[];
  platformTransactions: PlatformTransaction[];
  onRefresh: () => void;
  formatCurrency: (n: number) => string;
  companyId: string;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedBankTxn, setSelectedBankTxn] = useState<string | null>(null);

  const unmatchedBank = bankTransactions.filter(t => t.match_status === 'unmatched');
  const matchedBank = bankTransactions.filter(t => t.match_status === 'matched');
  const unmatchedPlatform = platformTransactions.filter(pt => 
    !bankTransactions.some(bt => 
      (bt.matched_expense_id === pt.id || bt.matched_invoice_id === pt.id) && bt.match_status === 'matched'
    )
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    
    setUploading(true);
    try {
      // For CSV files, parse and create transactions
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('memo'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));
        const debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
        const creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('deposit'));

        // First create a bank statement record
        const { data: statement, error: stmtError } = await supabase
          .from('bank_statements')
          .insert({
            company_id: companyId,
            file_name: file.name,
            original_filename: file.name,
            account_name: 'Imported Account',
            status: 'processed'
          })
          .select()
          .single();

        if (stmtError) throw stmtError;

        const transactions = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
          if (cols.length < 3) continue;

          let amount = 0;
          let type = 'debit';
          
          if (amountIdx >= 0) {
            amount = parseFloat(cols[amountIdx]?.replace(/[$,]/g, '') || '0');
            type = amount < 0 ? 'debit' : 'credit';
            amount = Math.abs(amount);
          } else {
            const debit = parseFloat(cols[debitIdx]?.replace(/[$,]/g, '') || '0');
            const credit = parseFloat(cols[creditIdx]?.replace(/[$,]/g, '') || '0');
            if (debit > 0) { amount = debit; type = 'debit'; }
            else if (credit > 0) { amount = credit; type = 'credit'; }
          }

          if (amount > 0) {
            transactions.push({
              company_id: companyId,
              statement_id: statement.id,
              transaction_date: cols[dateIdx] || new Date().toISOString().split('T')[0],
              description: cols[descIdx] || 'Bank Transaction',
              amount,
              type,
              match_status: 'unmatched'
            });
          }
        }

        if (transactions.length > 0) {
          await supabase.from('bank_transactions').insert(transactions);
        }
        
        alert(`Imported ${transactions.length} transactions`);
        onRefresh();
      } else {
        alert('Please upload a CSV file. PDF parsing coming soon.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to import transactions');
    } finally {
      setUploading(false);
      setShowUpload(false);
    }
  };

  const handleMatch = async (bankTxnId: string, platformTxn: PlatformTransaction) => {
    const matchField = platformTxn.source === 'invoice' ? 'matched_invoice_id' : 'matched_expense_id';
    await supabase
      .from('bank_transactions')
      .update({ 
        [matchField]: platformTxn.id,
        matched_type: platformTxn.source,
        match_status: 'matched'
      })
      .eq('id', bankTxnId);
    
    setSelectedBankTxn(null);
    onRefresh();
  };

  const handleUnmatch = async (bankTxnId: string) => {
    await supabase
      .from('bank_transactions')
      .update({ 
        matched_expense_id: null,
        matched_invoice_id: null,
        matched_type: null,
        match_status: 'unmatched'
      })
      .eq('id', bankTxnId);
    onRefresh();
  };

  return (
    <div className="space-y-3">
      {/* Upload Section - Compact */}
      <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Import Bank Statement</h3>
            <p className="text-[10px] text-neutral-500">Upload CSV or PDF to reconcile</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-xs font-medium disabled:opacity-50"
          >
            <Upload className="w-3 h-3" />
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        
        {/* Stats Cards - Brand Colors */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-amber-50/50 rounded-lg border border-amber-100">
            <p className="text-base font-bold text-amber-700">{unmatchedBank.length}</p>
            <p className="text-[9px] text-amber-600 leading-tight">Unmatched Bank</p>
          </div>
          <div className="p-2 bg-[#476E66]/5 rounded-lg border border-[#476E66]/20">
            <p className="text-base font-bold text-[#476E66]">{matchedBank.length}</p>
            <p className="text-[9px] text-[#476E66] leading-tight">Matched</p>
          </div>
          <div className="p-2 bg-neutral-50 rounded-lg border border-neutral-200">
            <p className="text-base font-bold text-neutral-700">{unmatchedPlatform.length}</p>
            <p className="text-[9px] text-neutral-500 leading-tight">Unmatched Platform</p>
          </div>
        </div>
      </div>

      {/* Two-Column Reconciliation View - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Bank Transactions Column */}
        <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="px-3 py-2 border-b border-neutral-100 bg-[#476E66]/5">
            <h3 className="text-xs font-semibold text-[#476E66]">Bank Transactions</h3>
            <p className="text-[9px] text-neutral-500">From uploaded statements</p>
          </div>
          <div className="max-h-[350px] overflow-y-auto">
            {bankTransactions.length === 0 ? (
              <div className="p-6 text-center text-neutral-500">
                <p className="text-xs">No bank transactions imported yet</p>
                <p className="text-[10px] mt-1">Upload a bank statement to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {bankTransactions.map(txn => (
                  <div 
                    key={txn.id} 
                    className={`px-3 py-2 hover:bg-neutral-50 cursor-pointer transition-colors ${
                      selectedBankTxn === txn.id ? 'bg-[#476E66]/10 border-l-2 border-[#476E66]' : ''
                    } ${txn.match_status === 'matched' ? 'bg-[#476E66]/5' : ''}`}
                    onClick={() => setSelectedBankTxn(selectedBankTxn === txn.id ? null : txn.id)}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-neutral-900 truncate flex-1">
                        {txn.description}
                      </span>
                      <span className={`text-xs font-semibold ml-2 ${txn.type === 'credit' ? 'text-[#476E66]' : 'text-red-600'}`}>
                        {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500">{new Date(txn.transaction_date).toLocaleDateString()}</span>
                      {txn.match_status === 'matched' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[10px] flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" /> Matched
                          </span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleUnmatch(txn.id); }}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Unmatch
                          </button>
                        </div>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px]">
                          Unmatched
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Platform Transactions Column */}
        <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="px-3 py-2 border-b border-neutral-100 bg-neutral-50">
            <h3 className="text-xs font-semibold text-neutral-900">Platform Transactions</h3>
            <p className="text-[9px] text-neutral-500">Invoices & Expenses from Billdora</p>
          </div>
          <div className="max-h-[350px] overflow-y-auto">
            {platformTransactions.length === 0 ? (
              <div className="p-6 text-center text-neutral-500">
                <p className="text-xs">No transactions in platform yet</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {platformTransactions.map(txn => {
                  const isMatched = bankTransactions.some(bt => 
                    (bt.matched_expense_id === txn.id || bt.matched_invoice_id === txn.id) && bt.match_status === 'matched'
                  );
                  return (
                    <div 
                      key={txn.id} 
                      className={`px-3 py-2 hover:bg-neutral-50 transition-colors ${isMatched ? 'bg-[#476E66]/5' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-neutral-900 truncate flex-1">
                          {txn.description}
                        </span>
                        <span className={`text-xs font-semibold ml-2 ${txn.type === 'income' ? 'text-[#476E66]' : 'text-red-600'}`}>
                          {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-neutral-500">{new Date(txn.date).toLocaleDateString()}</span>
                          <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                            txn.source === 'invoice' ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {txn.source === 'invoice' ? 'Invoice' : 'Expense'}
                          </span>
                        </div>
                        {isMatched ? (
                          <span className="px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[10px] flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" /> Matched
                          </span>
                        ) : selectedBankTxn ? (
                          <button
                            onClick={() => handleMatch(selectedBankTxn, txn)}
                            className="px-2 py-1 bg-[#476E66] text-white rounded text-[10px] hover:bg-[#3A5B54] flex items-center gap-0.5"
                          >
                            <Link2 className="w-2.5 h-2.5" /> Match
                          </button>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[10px]">
                            Select bank txn
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedBankTxn && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#476E66] text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 text-xs">
          <span>Select a platform transaction to match</span>
          <button onClick={() => setSelectedBankTxn(null)} className="px-3 py-1 bg-white/20 rounded hover:bg-white/30">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// Transactions Tab - Full Ledger - Optimized
function TransactionsTab({ transactions, searchTerm, setSearchTerm, formatCurrency }: {
  transactions: PlatformTransaction[];
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  formatCurrency: (n: number) => string;
}) {
  const filtered = transactions.filter(t => 
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to format date safely
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* Header - Compact */}
      <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-neutral-900">All Transactions</h3>
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-2 py-1 w-28 border border-neutral-200 rounded-lg text-[10px] focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
          />
        </div>
      </div>
      {/* Table with horizontal scroll */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead className="bg-neutral-50 border-b border-neutral-100">
            <tr>
              <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Date</th>
              <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Description</th>
              <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Type</th>
              <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide hidden sm:table-cell">Source</th>
              <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {filtered.map(txn => (
              <tr key={txn.id} className="hover:bg-neutral-50 transition-colors">
                <td className="px-2 py-1.5 text-[10px] text-neutral-500 whitespace-nowrap">{formatDate(txn.date)}</td>
                <td className="px-2 py-1.5 text-xs text-neutral-900 font-medium truncate max-w-[120px]">{txn.description}</td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                    txn.type === 'income' ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {txn.type === 'income' ? 'Income' : 'Expense'}
                  </span>
                </td>
                <td className="px-2 py-1.5 hidden sm:table-cell">
                  <span className="text-[10px] text-neutral-500 capitalize">{txn.source.replace('_', ' ')}</span>
                </td>
                <td className={`px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap ${txn.type === 'income' ? 'text-[#476E66]' : 'text-red-600'}`}>
                  {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-neutral-500 text-xs">No transactions found</div>
        )}
      </div>
    </div>
  );
}

// Bank Account Modal
function BankAccountModal({ account, companyId, onClose, onSave }: {
  account: BankAccount | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_name: account?.account_name || '',
    bank_name: account?.bank_name || '',
    account_number: account?.account_number || '',
    account_type: account?.account_type || 'checking',
    balance: account?.balance?.toString() || '0'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_name) return;

    setSaving(true);
    try {
      const data = {
        company_id: companyId,
        account_name: form.account_name,
        bank_name: form.bank_name || null,
        account_number: form.account_number || null,
        account_type: form.account_type,
        balance: parseFloat(form.balance) || 0
      };

      if (account) {
        await supabase.from('bank_accounts').update(data).eq('id', account.id);
      } else {
        await supabase.from('bank_accounts').insert(data);
      }
      onSave();
    } catch (error) {
      console.error('Failed to save account:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{account ? 'Edit Bank Account' : 'Add Bank Account'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Account Name *</label>
            <input
              type="text"
              value={form.account_name}
              onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              placeholder="Business Checking"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Bank Name</label>
              <input
                type="text"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                placeholder="Chase"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Account #</label>
              <input
                type="text"
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                placeholder="****1234"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Account Type</label>
              <select
                value={form.account_type}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none bg-white"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Current Balance</label>
              <input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg hover:bg-neutral-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50">
              {saving ? 'Saving...' : account ? 'Update' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Reports Tab - Generate Financial Reports
function ReportsTab({ monthlyData, invoices, expenses, companyExpenses, payrollData, summary, formatCurrency }: {
  monthlyData: MonthlyData[];
  invoices: Invoice[];
  expenses: Expense[];
  companyExpenses: any[];
  payrollData: PayrollData;
  summary: any;
  formatCurrency: (n: number) => string;
}) {
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  const reports = [
    {
      id: 'pnl',
      name: 'Profit & Loss',
      description: 'Revenue, expenses, and net profit',
      icon: BarChart3,
      color: 'bg-[#476E66]/10 text-[#476E66]'
    },
    {
      id: 'ar',
      name: 'Accounts Receivable',
      description: 'Outstanding invoices & aging',
      icon: FileText,
      color: 'bg-[#476E66]/10 text-[#476E66]'
    },
    {
      id: 'expense',
      name: 'Expense Report',
      description: 'Expenses by category',
      icon: ClipboardList,
      color: 'bg-amber-50 text-amber-600'
    },
    {
      id: 'cashflow',
      name: 'Cash Flow',
      description: 'Cash inflows & outflows',
      icon: DollarSign,
      color: 'bg-[#476E66]/10 text-[#476E66]'
    }
  ];

  const generateReport = (reportId: string) => {
    setGeneratingReport(reportId);
    
    let content = '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    if (reportId === 'pnl') {
      const totals = {
        revenue: monthlyData.reduce((s, m) => s + m.revenue, 0),
        expenses: monthlyData.reduce((s, m) => s + m.expenses, 0),
        payroll: payrollData.totalMonthly * 12,
        profit: monthlyData.reduce((s, m) => s + m.profit, 0)
      };

      content = `
<!DOCTYPE html>
<html>
<head>
  <title>Profit & Loss Statement</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #333; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #476E66; padding-bottom: 20px; }
    h1 { margin: 0; color: #476E66; font-size: 28px; }
    .subtitle { color: #666; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f9fafb; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    .amount { text-align: right; font-family: 'Courier New', monospace; }
    .positive { color: #059669; }
    .negative { color: #dc2626; }
    .total-row { background: #f3f4f6; font-weight: bold; }
    .total-row td { border-top: 2px solid #d1d5db; }
    .summary-box { display: flex; gap: 20px; margin: 30px 0; }
    .summary-item { flex: 1; padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center; }
    .summary-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: bold; margin-top: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #999; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>PROFIT & LOSS STATEMENT</h1>
    <p class="subtitle">For the Period: Last 12 Months | Generated: ${dateStr}</p>
  </div>
  
  <div class="summary-box">
    <div class="summary-item">
      <div class="summary-label">Total Revenue</div>
      <div class="summary-value positive">${formatCurrency(totals.revenue)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Total Expenses</div>
      <div class="summary-value negative">${formatCurrency(totals.expenses + totals.payroll)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Net Profit</div>
      <div class="summary-value ${totals.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(totals.profit)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th class="amount">Revenue</th>
        <th class="amount">Expenses</th>
        <th class="amount">Payroll</th>
        <th class="amount">Net Profit</th>
      </tr>
    </thead>
    <tbody>
      ${monthlyData.map(m => `
        <tr>
          <td>${m.month}</td>
          <td class="amount positive">${formatCurrency(m.revenue)}</td>
          <td class="amount negative">${formatCurrency(m.expenses)}</td>
          <td class="amount negative">${formatCurrency(m.payroll)}</td>
          <td class="amount ${m.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(m.profit)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="amount positive">${formatCurrency(totals.revenue)}</td>
        <td class="amount negative">${formatCurrency(totals.expenses)}</td>
        <td class="amount negative">${formatCurrency(totals.payroll)}</td>
        <td class="amount ${totals.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(totals.profit)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Generated by Billdora | ${dateStr}
  </div>
</body>
</html>`;
    } else if (reportId === 'ar') {
      const outstanding = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue');
      const overdue = outstanding.filter(inv => inv.due_date && new Date(inv.due_date) < new Date());
      const totalOutstanding = outstanding.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      const overdueAmount = overdue.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

      content = `
<!DOCTYPE html>
<html>
<head>
  <title>Accounts Receivable Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #333; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #476E66; padding-bottom: 20px; }
    h1 { margin: 0; color: #476E66; font-size: 28px; }
    .subtitle { color: #666; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f9fafb; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 11px; }
    .amount { text-align: right; font-family: 'Courier New', monospace; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .status-sent { background: #dbeafe; color: #1d4ed8; }
    .status-overdue { background: #fee2e2; color: #dc2626; }
    .summary-box { display: flex; gap: 20px; margin: 30px 0; }
    .summary-item { flex: 1; padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center; }
    .summary-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: bold; margin-top: 8px; }
    .warning { color: #dc2626; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #999; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>ACCOUNTS RECEIVABLE REPORT</h1>
    <p class="subtitle">Outstanding Invoices | Generated: ${dateStr}</p>
  </div>
  
  <div class="summary-box">
    <div class="summary-item">
      <div class="summary-label">Total Outstanding</div>
      <div class="summary-value">${formatCurrency(totalOutstanding)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Overdue Amount</div>
      <div class="summary-value warning">${formatCurrency(overdueAmount)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Invoices Count</div>
      <div class="summary-value">${outstanding.length}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Invoice #</th>
        <th>Date</th>
        <th>Due Date</th>
        <th>Status</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${outstanding.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#999;">No outstanding invoices</td></tr>' : 
        outstanding.map(inv => `
        <tr>
          <td>${inv.invoice_number || '-'}</td>
          <td>${inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '-'}</td>
          <td>${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td>
          <td><span class="status ${inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date()) ? 'status-overdue' : 'status-sent'}">${inv.status?.toUpperCase() || 'SENT'}</span></td>
          <td class="amount">${formatCurrency(Number(inv.total || 0))}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated by Billdora | ${dateStr}
  </div>
</body>
</html>`;
    } else if (reportId === 'expense') {
      // Combine all expenses
      const allExpenses = [
        ...expenses.map(e => ({ ...e, source: 'Project' })),
        ...companyExpenses.map((e: any) => ({ ...e, source: 'Company' }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      // Group by category
      const byCategory: Record<string, number> = {};
      allExpenses.forEach(e => {
        const cat = e.category || 'Uncategorized';
        byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
      });

      content = `
<!DOCTYPE html>
<html>
<head>
  <title>Expense Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #333; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #476E66; padding-bottom: 20px; }
    h1 { margin: 0; color: #476E66; font-size: 28px; }
    .subtitle { color: #666; margin-top: 8px; }
    h2 { color: #374151; font-size: 16px; margin: 30px 0 15px; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f9fafb; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 11px; }
    .amount { text-align: right; font-family: 'Courier New', monospace; }
    .category-tag { padding: 4px 8px; border-radius: 4px; font-size: 11px; background: #f3f4f6; }
    .summary-total { font-size: 24px; font-weight: bold; text-align: center; padding: 20px; background: #fef2f2; color: #dc2626; border-radius: 8px; margin: 20px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #999; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>EXPENSE REPORT</h1>
    <p class="subtitle">All Expenses | Generated: ${dateStr}</p>
  </div>
  
  <div class="summary-total">Total Expenses: ${formatCurrency(totalExpenses)}</div>

  <h2>By Category</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th class="amount">Amount</th>
        <th class="amount">% of Total</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `
        <tr>
          <td>${cat}</td>
          <td class="amount">${formatCurrency(amt)}</td>
          <td class="amount">${((amt / totalExpenses) * 100).toFixed(1)}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Detailed Transactions (Last 50)</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Category</th>
        <th>Source</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${allExpenses.slice(0, 50).map(e => `
        <tr>
          <td>${new Date(e.date).toLocaleDateString()}</td>
          <td>${e.description || '-'}</td>
          <td><span class="category-tag">${e.category || 'Uncategorized'}</span></td>
          <td>${e.source}</td>
          <td class="amount">${formatCurrency(Number(e.amount || 0))}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated by Billdora | ${dateStr}
  </div>
</body>
</html>`;
    } else if (reportId === 'cashflow') {
      const inflows = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      const outflows = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) +
                       companyExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0) +
                       (payrollData.totalMonthly * 12);

      content = `
<!DOCTYPE html>
<html>
<head>
  <title>Cash Flow Summary</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #333; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #476E66; padding-bottom: 20px; }
    h1 { margin: 0; color: #476E66; font-size: 28px; }
    .subtitle { color: #666; margin-top: 8px; }
    .flow-section { display: flex; gap: 40px; margin: 40px 0; }
    .flow-box { flex: 1; padding: 30px; border-radius: 12px; text-align: center; }
    .inflow { background: #ecfdf5; border: 2px solid #10b981; }
    .outflow { background: #fef2f2; border: 2px solid #ef4444; }
    .net { background: #f3f4f6; border: 2px solid #6b7280; }
    .flow-label { font-size: 14px; text-transform: uppercase; font-weight: 600; margin-bottom: 10px; }
    .flow-value { font-size: 32px; font-weight: bold; }
    .inflow .flow-value { color: #059669; }
    .outflow .flow-value { color: #dc2626; }
    .net .flow-value { color: ${(inflows - outflows) >= 0 ? '#059669' : '#dc2626'}; }
    .breakdown { margin: 40px 0; }
    .breakdown h2 { color: #374151; font-size: 16px; margin-bottom: 15px; }
    .breakdown-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
    .breakdown-label { color: #6b7280; }
    .breakdown-value { font-weight: 600; font-family: 'Courier New', monospace; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #999; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>CASH FLOW SUMMARY</h1>
    <p class="subtitle">Annual Overview | Generated: ${dateStr}</p>
  </div>
  
  <div class="flow-section">
    <div class="flow-box inflow">
      <div class="flow-label">Cash Inflows</div>
      <div class="flow-value">${formatCurrency(inflows)}</div>
    </div>
    <div class="flow-box outflow">
      <div class="flow-label">Cash Outflows</div>
      <div class="flow-value">${formatCurrency(outflows)}</div>
    </div>
    <div class="flow-box net">
      <div class="flow-label">Net Cash Flow</div>
      <div class="flow-value">${formatCurrency(inflows - outflows)}</div>
    </div>
  </div>

  <div class="breakdown">
    <h2>Cash Inflows Breakdown</h2>
    <div class="breakdown-item">
      <span class="breakdown-label">Paid Invoices</span>
      <span class="breakdown-value" style="color:#059669">${formatCurrency(inflows)}</span>
    </div>
  </div>

  <div class="breakdown">
    <h2>Cash Outflows Breakdown</h2>
    <div class="breakdown-item">
      <span class="breakdown-label">Project Expenses</span>
      <span class="breakdown-value" style="color:#dc2626">${formatCurrency(expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</span>
    </div>
    <div class="breakdown-item">
      <span class="breakdown-label">Company Expenses</span>
      <span class="breakdown-value" style="color:#dc2626">${formatCurrency(companyExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0))}</span>
    </div>
    <div class="breakdown-item">
      <span class="breakdown-label">Payroll (Annual)</span>
      <span class="breakdown-value" style="color:#dc2626">${formatCurrency(payrollData.totalMonthly * 12)}</span>
    </div>
  </div>

  <div class="footer">
    Generated by Billdora | ${dateStr}
  </div>
</body>
</html>`;
    }

    // Open in new window for printing/saving
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      setTimeout(() => {
        setGeneratingReport(null);
      }, 500);
    } else {
      setGeneratingReport(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Reports Container - Compact */}
      <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">Generate Reports</h3>
        <p className="text-[10px] text-neutral-500 mb-3">Select a report type. Opens in new window for printing/PDF.</p>
        
        {/* Report Cards - Compact Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reports.map(report => (
            <div 
              key={report.id}
              className="border border-neutral-200 rounded-lg p-2.5 hover:border-[#476E66] hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => generateReport(report.id)}
            >
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${report.color} flex items-center justify-center flex-shrink-0`}>
                  <report.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-neutral-900 group-hover:text-[#476E66] transition-colors truncate">
                    {report.name}
                  </h4>
                  <p className="text-[9px] text-neutral-500 truncate">{report.description}</p>
                </div>
                <button
                  disabled={generatingReport === report.id}
                  className="flex items-center gap-1 px-2 py-1 bg-neutral-100 text-neutral-700 rounded-md hover:bg-[#476E66] hover:text-white transition-colors text-[10px] font-medium disabled:opacity-50 flex-shrink-0"
                >
                  {generatingReport === report.id ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Printer className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline">Generate</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tips - Compact */}
      <div className="bg-neutral-50 rounded-lg p-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h4 className="text-[10px] font-medium text-neutral-700 mb-1">💡 Tips</h4>
        <ul className="text-[9px] text-neutral-600 space-y-0.5">
          <li>• Click <strong>Generate</strong> to open a formatted report</li>
          <li>• Use <strong>Ctrl/Cmd + P</strong> to print or save as PDF</li>
        </ul>
      </div>
    </div>
  );
}


// Tax Reports Tab - CPA-Ready Tax Reports
function TaxReportsTab({ invoices, expenses, companyExpenses, payrollData, formatCurrency }: {
  invoices: Invoice[];
  expenses: Expense[];
  companyExpenses: any[];
  payrollData: PayrollData;
  formatCurrency: (n: number) => string;
}) {
  const currentYear = new Date().getFullYear();
  const [selectedPeriod, setSelectedPeriod] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Annual'>('Annual');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [activeReport, setActiveReport] = useState<'pnl' | 'income' | 'expense' | 'receivables'>('pnl');

  // Calculate date range based on period selection
  const getDateRange = () => {
    const year = selectedYear;
    if (selectedPeriod === 'Annual') {
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    }
    const quarterMap: Record<string, { startMonth: number; endMonth: number }> = {
      Q1: { startMonth: 0, endMonth: 2 },
      Q2: { startMonth: 3, endMonth: 5 },
      Q3: { startMonth: 6, endMonth: 8 },
      Q4: { startMonth: 9, endMonth: 11 }
    };
    const q = quarterMap[selectedPeriod];
    return {
      start: new Date(year, q.startMonth, 1),
      end: new Date(year, q.endMonth + 1, 0, 23, 59, 59)
    };
  };

  const { start, end } = getDateRange();

  // Filter data by period
  const periodInvoices = invoices.filter(inv => {
    const d = new Date(inv.created_at || '');
    return d >= start && d <= end;
  });

  const periodExpenses = expenses.filter(exp => {
    const d = new Date(exp.date);
    return d >= start && d <= end;
  });

  const periodCompanyExpenses = companyExpenses.filter((exp: any) => {
    const d = new Date(exp.date);
    return d >= start && d <= end;
  });

  // Calculate P&L
  const pnlData = useMemo(() => {
    const revenue = periodInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const projectExp = periodExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    const compExp = periodCompanyExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
    const months = selectedPeriod === 'Annual' ? 12 : 3;
    const payroll = payrollData.totalMonthly * months;
    const totalExpenses = projectExp + compExp + payroll;
    return { revenue, projectExp, compExp, payroll, totalExpenses, netProfit: revenue - totalExpenses };
  }, [periodInvoices, periodExpenses, periodCompanyExpenses, payrollData, selectedPeriod]);

  // Income by client/project
  const incomeByClient = useMemo(() => {
    const byClient: Record<string, { name: string; total: number; count: number }> = {};
    periodInvoices.filter(inv => inv.status === 'paid').forEach(inv => {
      const clientId = inv.client_id || 'unknown';
      const clientName = (inv as any).client?.name || (inv as any).client_name || 'Unknown Client';
      if (!byClient[clientId]) {
        byClient[clientId] = { name: clientName, total: 0, count: 0 };
      }
      byClient[clientId].total += Number(inv.total || 0);
      byClient[clientId].count += 1;
    });
    return Object.values(byClient).sort((a, b) => b.total - a.total);
  }, [periodInvoices]);

  // Expense by category
  const expenseByCategory = useMemo(() => {
    const byCategory: Record<string, number> = {};
    periodExpenses.forEach(exp => {
      const cat = exp.category || 'Uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + Number(exp.amount || 0);
    });
    periodCompanyExpenses.forEach((exp: any) => {
      const cat = exp.category || 'Overhead';
      byCategory[cat] = (byCategory[cat] || 0) + Number(exp.amount || 0);
    });
    const months = selectedPeriod === 'Annual' ? 12 : 3;
    if (payrollData.totalMonthly > 0) {
      byCategory['Labor/Payroll'] = payrollData.totalMonthly * months;
    }
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses, periodCompanyExpenses, payrollData, selectedPeriod]);

  // Outstanding receivables
  const outstandingReceivables = useMemo(() => {
    return periodInvoices
      .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
      .sort((a, b) => new Date(a.due_date || '').getTime() - new Date(b.due_date || '').getTime());
  }, [periodInvoices]);

  const totalOutstanding = outstandingReceivables.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const periodLabel = selectedPeriod === 'Annual' ? `${selectedYear}` : `${selectedPeriod} ${selectedYear}`;

  // Export to CSV
  const exportCSV = (type: string) => {
    let csv = '';
    const dateStr = new Date().toISOString().split('T')[0];

    if (type === 'pnl') {
      csv = `Profit & Loss Statement - ${periodLabel}\nGenerated: ${dateStr}\n\nCategory,Amount\n`;
      csv += `Revenue,${pnlData.revenue}\n`;
      csv += `Project Expenses,${pnlData.projectExp}\n`;
      csv += `Company Expenses,${pnlData.compExp}\n`;
      csv += `Payroll,${pnlData.payroll}\n`;
      csv += `Total Expenses,${pnlData.totalExpenses}\n`;
      csv += `Net Profit,${pnlData.netProfit}\n`;
    } else if (type === 'income') {
      csv = `Income Summary - ${periodLabel}\nGenerated: ${dateStr}\n\nClient,Invoices,Total\n`;
      incomeByClient.forEach(c => {
        csv += `"${c.name}",${c.count},${c.total}\n`;
      });
    } else if (type === 'expense') {
      csv = `Expense Summary - ${periodLabel}\nGenerated: ${dateStr}\n\nCategory,Amount\n`;
      expenseByCategory.forEach(([cat, amt]) => {
        csv += `"${cat}",${amt}\n`;
      });
    } else if (type === 'receivables') {
      csv = `Outstanding Receivables - ${periodLabel}\nGenerated: ${dateStr}\n\nInvoice #,Due Date,Amount,Status\n`;
      outstandingReceivables.forEach(inv => {
        csv += `${inv.invoice_number || '-'},${inv.due_date || '-'},${inv.total},${inv.status}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax_report_${type}_${periodLabel.replace(' ', '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to PDF (opens print dialog)
  const exportPDF = (type: string) => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let content = '';

    const styles = `
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #476E66; padding-bottom: 20px; }
        h1 { margin: 0; color: #476E66; font-size: 24px; }
        .subtitle { color: #666; margin-top: 8px; font-size: 14px; }
        .period-badge { display: inline-block; padding: 6px 16px; background: #476E66; color: white; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        th { background: #f9fafb; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        .amount { text-align: right; font-family: 'Courier New', monospace; }
        .positive { color: #059669; }
        .negative { color: #dc2626; }
        .total-row { background: #f3f4f6; font-weight: bold; }
        .total-row td { border-top: 2px solid #d1d5db; }
        .summary-box { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
        .summary-item { padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center; }
        .summary-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-value { font-size: 24px; font-weight: bold; margin-top: 8px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #999; font-size: 11px; }
        .cpa-notice { background: #fef3cd; border: 1px solid #ffc107; padding: 12px 16px; border-radius: 8px; margin: 20px 0; font-size: 12px; color: #856404; }
        @media print { body { padding: 20px; } .cpa-notice { break-inside: avoid; } }
      </style>
    `;

    if (type === 'pnl') {
      content = `<!DOCTYPE html><html><head><title>P&L Statement - ${periodLabel}</title>${styles}</head><body>
        <div class="header">
          <h1>PROFIT & LOSS STATEMENT</h1>
          <p class="subtitle">Tax Report</p>
          <span class="period-badge">${periodLabel}</span>
        </div>
        <div class="cpa-notice">This report is generated for tax preparation purposes. Please review with your CPA.</div>
        <div class="summary-box">
          <div class="summary-item"><div class="summary-label">Total Revenue</div><div class="summary-value positive">${formatCurrency(pnlData.revenue)}</div></div>
          <div class="summary-item"><div class="summary-label">Total Expenses</div><div class="summary-value negative">${formatCurrency(pnlData.totalExpenses)}</div></div>
          <div class="summary-item"><div class="summary-label">Net Profit</div><div class="summary-value ${pnlData.netProfit >= 0 ? 'positive' : 'negative'}">${formatCurrency(pnlData.netProfit)}</div></div>
        </div>
        <table>
          <thead><tr><th>Category</th><th class="amount">Amount</th></tr></thead>
          <tbody>
            <tr><td>Revenue (Paid Invoices)</td><td class="amount positive">${formatCurrency(pnlData.revenue)}</td></tr>
            <tr><td>Project Expenses</td><td class="amount negative">${formatCurrency(pnlData.projectExp)}</td></tr>
            <tr><td>Company/Overhead Expenses</td><td class="amount negative">${formatCurrency(pnlData.compExp)}</td></tr>
            <tr><td>Payroll</td><td class="amount negative">${formatCurrency(pnlData.payroll)}</td></tr>
            <tr class="total-row"><td>Total Expenses</td><td class="amount negative">${formatCurrency(pnlData.totalExpenses)}</td></tr>
            <tr class="total-row"><td>Net Profit</td><td class="amount ${pnlData.netProfit >= 0 ? 'positive' : 'negative'}">${formatCurrency(pnlData.netProfit)}</td></tr>
          </tbody>
        </table>
        <div class="footer">Generated by Billdora | ${dateStr}</div>
      </body></html>`;
    } else if (type === 'income') {
      const totalIncome = incomeByClient.reduce((sum, c) => sum + c.total, 0);
      content = `<!DOCTYPE html><html><head><title>Income Summary - ${periodLabel}</title>${styles}</head><body>
        <div class="header">
          <h1>INCOME SUMMARY</h1>
          <p class="subtitle">Breakdown by Client/Project</p>
          <span class="period-badge">${periodLabel}</span>
        </div>
        <div class="cpa-notice">This report is generated for tax preparation purposes. Please review with your CPA.</div>
        <div class="summary-box">
          <div class="summary-item"><div class="summary-label">Total Income</div><div class="summary-value positive">${formatCurrency(totalIncome)}</div></div>
          <div class="summary-item"><div class="summary-label">Clients</div><div class="summary-value">${incomeByClient.length}</div></div>
          <div class="summary-item"><div class="summary-label">Invoices</div><div class="summary-value">${incomeByClient.reduce((s, c) => s + c.count, 0)}</div></div>
        </div>
        <table>
          <thead><tr><th>Client</th><th class="amount">Invoices</th><th class="amount">Total</th></tr></thead>
          <tbody>
            ${incomeByClient.map(c => `<tr><td>${c.name}</td><td class="amount">${c.count}</td><td class="amount positive">${formatCurrency(c.total)}</td></tr>`).join('')}
            <tr class="total-row"><td>Total</td><td class="amount">${incomeByClient.reduce((s, c) => s + c.count, 0)}</td><td class="amount positive">${formatCurrency(totalIncome)}</td></tr>
          </tbody>
        </table>
        <div class="footer">Generated by Billdora | ${dateStr}</div>
      </body></html>`;
    } else if (type === 'expense') {
      const totalExp = expenseByCategory.reduce((sum, [, amt]) => sum + amt, 0);
      content = `<!DOCTYPE html><html><head><title>Expense Summary - ${periodLabel}</title>${styles}</head><body>
        <div class="header">
          <h1>EXPENSE SUMMARY</h1>
          <p class="subtitle">Breakdown by Category</p>
          <span class="period-badge">${periodLabel}</span>
        </div>
        <div class="cpa-notice">This report is generated for tax preparation purposes. Please review with your CPA.</div>
        <div class="summary-box">
          <div class="summary-item"><div class="summary-label">Total Expenses</div><div class="summary-value negative">${formatCurrency(totalExp)}</div></div>
          <div class="summary-item"><div class="summary-label">Categories</div><div class="summary-value">${expenseByCategory.length}</div></div>
          <div class="summary-item"><div class="summary-label">Largest Category</div><div class="summary-value" style="font-size:14px">${expenseByCategory[0]?.[0] || 'N/A'}</div></div>
        </div>
        <table>
          <thead><tr><th>Category</th><th class="amount">Amount</th><th class="amount">% of Total</th></tr></thead>
          <tbody>
            ${expenseByCategory.map(([cat, amt]) => `<tr><td>${cat}</td><td class="amount negative">${formatCurrency(amt)}</td><td class="amount">${((amt / totalExp) * 100).toFixed(1)}%</td></tr>`).join('')}
            <tr class="total-row"><td>Total</td><td class="amount negative">${formatCurrency(totalExp)}</td><td class="amount">100%</td></tr>
          </tbody>
        </table>
        <div class="footer">Generated by Billdora | ${dateStr}</div>
      </body></html>`;
    } else if (type === 'receivables') {
      content = `<!DOCTYPE html><html><head><title>Outstanding Receivables - ${periodLabel}</title>${styles}</head><body>
        <div class="header">
          <h1>OUTSTANDING RECEIVABLES</h1>
          <p class="subtitle">Unpaid Invoices</p>
          <span class="period-badge">${periodLabel}</span>
        </div>
        <div class="cpa-notice">This report is generated for tax preparation purposes. Please review with your CPA.</div>
        <div class="summary-box">
          <div class="summary-item"><div class="summary-label">Total Outstanding</div><div class="summary-value" style="color:#d97706">${formatCurrency(totalOutstanding)}</div></div>
          <div class="summary-item"><div class="summary-label">Invoices</div><div class="summary-value">${outstandingReceivables.length}</div></div>
          <div class="summary-item"><div class="summary-label">Overdue</div><div class="summary-value negative">${outstandingReceivables.filter(inv => inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date())).length}</div></div>
        </div>
        <table>
          <thead><tr><th>Invoice #</th><th>Due Date</th><th>Status</th><th class="amount">Amount</th></tr></thead>
          <tbody>
            ${outstandingReceivables.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999;padding:24px">No outstanding receivables</td></tr>' : outstandingReceivables.map(inv => {
              const isOverdue = inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date());
              return `<tr><td>${inv.invoice_number || '-'}</td><td>${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td><td><span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;${isOverdue ? 'background:#fee2e2;color:#dc2626' : 'background:#dbeafe;color:#1d4ed8'}">${isOverdue ? 'OVERDUE' : 'SENT'}</span></td><td class="amount">${formatCurrency(Number(inv.total || 0))}</td></tr>`;
            }).join('')}
            ${outstandingReceivables.length > 0 ? `<tr class="total-row"><td colspan="3">Total Outstanding</td><td class="amount" style="color:#d97706">${formatCurrency(totalOutstanding)}</td></tr>` : ''}
          </tbody>
        </table>
        <div class="footer">Generated by Billdora | ${dateStr}</div>
      </body></html>`;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
    }
  };

  const reports = [
    { id: 'pnl', label: 'P&L', icon: BarChart3 },
    { id: 'income', label: 'Income', icon: TrendingUp },
    { id: 'expense', label: 'Expense', icon: TrendingDown },
    { id: 'receivables', label: 'Receivables', icon: FileText }
  ];

  return (
    <div className="space-y-2">
      {/* Period Selector - Compact */}
      <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Tax Reports</h3>
            <p className="text-[10px] text-neutral-500">Quarterly or annual for tax prep</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 p-0.5 bg-neutral-100 rounded-lg">
              {(['Q1', 'Q2', 'Q3', 'Q4', 'Annual'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    selectedPeriod === period ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2 py-1 border border-neutral-200 rounded-lg text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none bg-white"
            >
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Report Type Tabs - Compact Inline */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {reports.map(report => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id as any)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeReport === report.id 
                ? 'bg-[#476E66] text-white' 
                : 'bg-white border border-neutral-200 text-neutral-700 hover:border-[#476E66]'
            }`}
            style={activeReport !== report.id ? { boxShadow: 'var(--shadow-card)' } : {}}
          >
            <report.icon className="w-3 h-3" />
            {report.label}
          </button>
        ))}
      </div>

      {/* Report Content - Compact */}
      <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-neutral-900">
              {reports.find(r => r.id === activeReport)?.label} - {periodLabel}
            </h3>
            <p className="text-[9px] text-neutral-500">
              {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => exportCSV(activeReport)}
              className="flex items-center gap-1 px-2 py-1 border border-neutral-200 rounded-md text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
            <button
              onClick={() => exportPDF(activeReport)}
              className="flex items-center gap-1 px-2 py-1 bg-[#476E66] text-white rounded-md text-[10px] font-medium hover:bg-[#3A5B54]"
            >
              <Printer className="w-3 h-3" />
              PDF
            </button>
          </div>
        </div>

        {/* P&L Report - Compact */}
        {activeReport === 'pnl' && (
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="p-2 bg-[#476E66]/10 rounded-lg text-center">
                <p className="text-[9px] text-[#476E66] font-medium uppercase">Revenue</p>
                <p className="text-sm font-bold text-[#476E66] mt-0.5">{formatCurrency(pnlData.revenue)}</p>
              </div>
              <div className="p-2 bg-red-50 rounded-lg text-center">
                <p className="text-[9px] text-red-600 font-medium uppercase">Expenses</p>
                <p className="text-sm font-bold text-red-700 mt-0.5">{formatCurrency(pnlData.totalExpenses)}</p>
              </div>
              <div className={`p-2 rounded-lg text-center ${pnlData.netProfit >= 0 ? 'bg-[#476E66]/10' : 'bg-amber-50'}`}>
                <p className={`text-[9px] font-medium uppercase ${pnlData.netProfit >= 0 ? 'text-[#476E66]' : 'text-amber-600'}`}>Net Profit</p>
                <p className={`text-sm font-bold mt-0.5 ${pnlData.netProfit >= 0 ? 'text-[#476E66]' : 'text-amber-700'}`}>{formatCurrency(pnlData.netProfit)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px]">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Category</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 text-xs">
                  <tr><td className="px-2 py-1.5">Revenue (Paid Invoices)</td><td className="px-2 py-1.5 text-right text-[#476E66] font-medium">{formatCurrency(pnlData.revenue)}</td></tr>
                  <tr><td className="px-2 py-1.5">Project Expenses</td><td className="px-2 py-1.5 text-right text-red-600">{formatCurrency(pnlData.projectExp)}</td></tr>
                  <tr><td className="px-2 py-1.5">Company Expenses</td><td className="px-2 py-1.5 text-right text-red-600">{formatCurrency(pnlData.compExp)}</td></tr>
                  <tr><td className="px-2 py-1.5">Payroll</td><td className="px-2 py-1.5 text-right text-red-600">{formatCurrency(pnlData.payroll)}</td></tr>
                  <tr className="bg-neutral-50 font-semibold"><td className="px-2 py-1.5">Total Expenses</td><td className="px-2 py-1.5 text-right text-red-700">{formatCurrency(pnlData.totalExpenses)}</td></tr>
                  <tr className="bg-neutral-100 font-bold"><td className="px-2 py-1.5">Net Profit</td><td className={`px-2 py-1.5 text-right ${pnlData.netProfit >= 0 ? 'text-[#476E66]' : 'text-red-700'}`}>{formatCurrency(pnlData.netProfit)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Income Summary - Compact */}
        {activeReport === 'income' && (
          <div className="p-3">
            <div className="mb-3 p-2 bg-[#476E66]/10 rounded-lg text-center">
              <p className="text-[9px] text-[#476E66] font-medium uppercase">Total Income</p>
              <p className="text-sm font-bold text-[#476E66] mt-0.5">{formatCurrency(incomeByClient.reduce((s, c) => s + c.total, 0))}</p>
            </div>
            {incomeByClient.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 text-xs">No paid invoices in this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[300px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Client</th>
                      <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Inv.</th>
                      <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50 text-xs">
                    {incomeByClient.map((client, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50">
                        <td className="px-2 py-1.5 font-medium text-neutral-900 truncate max-w-[150px]">{client.name}</td>
                        <td className="px-2 py-1.5 text-right text-neutral-600">{client.count}</td>
                        <td className="px-2 py-1.5 text-right text-[#476E66] font-medium">{formatCurrency(client.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Expense Summary - Compact */}
        {activeReport === 'expense' && (
          <div className="p-3">
            <div className="mb-3 p-2 bg-amber-50 rounded-lg text-center">
              <p className="text-[9px] text-amber-600 font-medium uppercase">Total Expenses</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5">{formatCurrency(expenseByCategory.reduce((s, [, amt]) => s + amt, 0))}</p>
            </div>
            {expenseByCategory.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 text-xs">No expenses in this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[300px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Category</th>
                      <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Amount</th>
                      <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide hidden sm:table-cell">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50 text-xs">
                    {expenseByCategory.map(([cat, amt], idx) => {
                      const total = expenseByCategory.reduce((s, [, a]) => s + a, 0);
                      return (
                        <tr key={idx} className="hover:bg-neutral-50">
                          <td className="px-2 py-1.5 font-medium text-neutral-900 truncate max-w-[120px]">{cat}</td>
                          <td className="px-2 py-1.5 text-right text-red-600">{formatCurrency(amt)}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-500 hidden sm:table-cell">{((amt / total) * 100).toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Outstanding Receivables - Compact */}
        {activeReport === 'receivables' && (
          <div className="p-3">
            <div className="mb-3 p-2 bg-amber-50 rounded-lg text-center">
              <p className="text-[9px] text-amber-600 font-medium uppercase">Total Outstanding</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5">{formatCurrency(totalOutstanding)}</p>
            </div>
            {outstandingReceivables.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 text-xs">No outstanding receivables</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[350px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Invoice</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Due</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Status</th>
                      <th className="text-right px-2 py-1.5 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50 text-xs">
                    {outstandingReceivables.map(inv => {
                      const isOverdue = inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date());
                      return (
                        <tr key={inv.id} className="hover:bg-neutral-50">
                          <td className="px-2 py-1.5 font-medium text-neutral-900">{inv.invoice_number || '-'}</td>
                          <td className="px-2 py-1.5 text-neutral-600">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                          <td className="px-2 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${isOverdue ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-[#476E66]/10 text-[#476E66]'}`}>
                              {isOverdue ? 'Overdue' : 'Sent'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium text-amber-600">{formatCurrency(Number(inv.total || 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
