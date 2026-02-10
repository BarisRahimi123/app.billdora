import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { bankStatementsApi, companyExpensesApi, BankStatement, BankTransaction, CompanyExpense, transactionCategoryApi, TransactionCategory } from '../lib/api';
import { useToast } from '../components/Toast';
import PlaidLink from '../components/PlaidLink';
import { 
  Upload, FileText, Calendar, DollarSign, CheckCircle2, AlertTriangle, 
  XCircle, RefreshCw, Trash2, ChevronRight, ChevronDown, Download, 
  Printer, ArrowLeft, Building2, Search, Filter, X, Link2, Camera, Image as ImageIcon,
  Sparkles, Tag, FolderOpen, MoreVertical, Brain, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReconciliationDashboard } from '../bank-reconciliation';
import { aiClient } from '../ai/ai-client';

type ViewMode = 'list' | 'detail' | 'report' | 'reconcile';

// Full fallback list in case DB categories haven't loaded yet
const FALLBACK_CATEGORIES = [
  { value: 'owner_draw', label: 'Owner/Member Draw' },
  { value: 'owner_contribution', label: 'Owner Contribution' },
  { value: 'payroll', label: 'Payroll & Wages' },
  { value: 'rent', label: 'Rent & Lease' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'software', label: 'Software & Subscriptions' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals & Entertainment' },
  { value: 'vehicle', label: 'Vehicle & Gas' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'marketing', label: 'Marketing & Advertising' },
  { value: 'project_expense', label: 'Project Expense' },
  { value: 'materials', label: 'Materials & Supplies' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'taxes', label: 'Taxes & Fees' },
  { value: 'bank_fees', label: 'Bank Fees' },
  { value: 'loan_payment', label: 'Loan Payment' },
  { value: 'income', label: 'Client Payment / Income' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'personal', label: 'Personal (Non-Business)' },
  { value: 'other', label: 'Other' },
];

// ─── Keyword Auto-Categorization Rules ─────────────────────
// Bank descriptions use abbreviations (ATT*, MSFT, SQ *, etc.) so we match those too
const CATEGORY_KEYWORD_RULES: { keywords: string[]; category: string }[] = [
  // Software & Subscriptions
  { keywords: [
    'adobe', 'figma', 'slack', 'zoom', 'dropbox', 'google workspace', 'google storage',
    'microsoft 365', 'microsoft office', 'msft', 'github', 'gitlab', 'atlassian', 'jira',
    'notion', 'canva', 'hubspot', 'salesforce', 'quickbooks', 'xero', 'freshbooks',
    'mailchimp', 'sendgrid', 'twilio', 'aws', 'amazon web services', 'azure',
    'google cloud', 'gcloud', 'heroku', 'digital ocean', 'digitalocean', 'cloudflare',
    'shopify', 'squarespace', 'wix', 'godaddy', 'namecheap', 'hover', 'openai',
    'anthropic', 'vercel', 'netlify', 'supabase', 'mongodb', 'datadog', 'sentry',
    'intercom', 'zendesk', 'calendly', 'docusign', 'loom', 'miro', 'airtable',
    'zapier', 'make.com', 'grammarly', '1password', 'lastpass', 'bitwarden',
    'nordvpn', 'expressvpn', 'chatgpt', 'spotify', 'apple.com/bill', 'icloud',
    'google *', 'linkedin premium', 'semrush', 'ahrefs', 'hootsuite', 'buffer',
  ], category: 'software' },
  // Utilities & Telecom
  { keywords: [
    'att*', 'at&t', 'at & t', 'verizon', 't-mobile', 'tmobile', 'sprint',
    'comcast', 'xfinity', 'spectrum', 'cox comm', 'centurylink', 'lumen',
    'frontier comm', 'electric', 'gas bill', 'water bill', 'power company',
    'edison', 'pacific gas', 'con edison', 'duke energy', 'dominion energy',
    'southern company', 'xcel energy', 'internet service', 'phone bill',
    'utility payment', 'waste management', 'republic services',
  ], category: 'utilities' },
  // Travel
  { keywords: [
    'delta air', 'united air', 'american air', 'southwest air', 'jetblue',
    'spirit air', 'frontier air', 'alaska air', 'hilton', 'marriott', 'hyatt',
    'airbnb', 'vrbo', 'booking.com', 'expedia', 'hotels.com', 'enterprise rent',
    'hertz', 'avis', 'budget rent', 'national car', 'turo', 'amtrak', 'greyhound',
    'tsa precheck', 'global entry', 'airline', 'hotel', 'flight',
    'uber trip', 'lyft ride',
  ], category: 'travel' },
  // Vehicle & Gas
  { keywords: [
    'shell', 'chevron', 'exxon', 'exxonmobil', 'exxon mobil', 'sunoco', 'valero', 'marathon petro',
    'speedway', 'wawa', 'racetrac', 'circle k', 'quiktrip', 'loves travel',
    'pilot flying', 'costco gas', "sam's gas", 'buc-ees', 'jiffy lube',
    'valvoline', 'midas', 'firestone', 'goodyear', 'discount tire',
    'autozone', 'advance auto', 'oreilly auto', "o'reilly auto", 'napa auto',
    'car wash', 'bp gas', 'fuel', 'gasoline', 'arco',
  ], category: 'vehicle' },
  // Meals & Entertainment
  { keywords: [
    'doordash', 'grubhub', 'uber eats', 'ubereats', 'postmates', 'seamless',
    'caviar', 'instacart', 'starbucks', 'dunkin', 'mcdonalds', "mcdonald's",
    'chipotle', 'chick-fil-a', 'panera', 'subway', 'wendy', 'burger king',
    'taco bell', 'domino', 'pizza hut', 'papa john', 'olive garden', 'applebee',
    'ihop', 'waffle house', 'five guys', 'shake shack', 'sweetgreen', 'cava grill',
    'panda express', 'restaurant', 'cafe ', 'diner', 'bistro', 'catering',
    'sq *', 'tst*', 'toast*',
  ], category: 'meals' },
  // Office Supplies
  { keywords: [
    'staples', 'office depot', 'officemax', 'uline', 'quill.com', 'w.b. mason',
    'toner', 'ink cartridge', 'office supply', 'usps', 'ups store', 'fedex office',
    'stamps.com', 'pitney bowes',
  ], category: 'office_supplies' },
  // Marketing & Advertising
  { keywords: [
    'meta ads', 'facebook ads', 'fb *', 'google ads', 'adwords', 'linkedin ads',
    'twitter ads', 'x ads', 'tiktok ads', 'bing ads', 'yelp ads', 'thumbtack',
    'angi leads', 'homeadvisor', 'facebook business', 'meta business',
    'google marketing', 'vistaprint', 'moo.com', 'fiverr', 'upwork', '99designs',
    'advertising', 'sponsorship', 'flyers', 'promo',
  ], category: 'marketing' },
  // Insurance
  { keywords: [
    'geico', 'state farm', 'progressive', 'allstate', 'liberty mutual', 'usaa',
    'nationwide', 'farmers ins', 'travelers ins', 'the hartford', 'hiscox',
    'next insurance', 'simply business', 'general liability', 'workers comp',
    'insurance premium', 'insurance payment',
  ], category: 'insurance' },
  // Rent & Lease
  { keywords: [
    'rent payment', 'lease payment', 'monthly rent', 'office rent', 'warehouse rent',
    'storage unit', 'public storage', 'extra space', 'cubesmart', 'life storage',
    'regus', 'wework', 'industrious', 'coworking',
  ], category: 'rent' },
  // Bank Fees
  { keywords: [
    'monthly maintenance fee', 'service charge', 'overdraft fee', 'nsf fee',
    'wire transfer fee', 'atm fee', 'foreign transaction fee', 'account fee',
    'annual fee', 'card fee', 'statement fee', 'bank charge', 'bank fee',
    'monthly fee', 'analysis charge',
  ], category: 'bank_fees' },
  // Taxes & Fees
  { keywords: [
    'irs ', 'eftps', 'internal revenue', 'tax payment', 'estimated tax',
    'state tax', 'federal tax', 'sales tax', 'property tax', 'payroll tax',
    'quarterly tax', 'annual tax',
  ], category: 'taxes' },
  // Professional Services
  { keywords: [
    'attorney', 'law office', 'law firm', 'legal fee', 'legal service',
    'cpa ', 'accountant', 'accounting fee', 'bookkeep', 'tax preparation',
    'consultant', 'consulting fee', 'advisory fee', 'audit fee',
  ], category: 'professional_services' },
  // Equipment
  { keywords: [
    'apple store', 'apple.com', 'best buy', 'b&h photo', 'adorama', 'newegg',
    'dell.com', 'lenovo', 'hp store', 'samsung store', 'micro center',
    'cdw ', 'tiger direct', 'monoprice', 'amazon.com',
  ], category: 'equipment' },
  // Payroll & Wages
  { keywords: [
    'payroll', 'gusto', 'adp ', 'paychex', 'paylocity', 'rippling', 'justworks',
    'square payroll', 'wage payment', 'salary payment', 'employee pay',
  ], category: 'payroll' },
  // Loan Payments
  { keywords: [
    'loan payment', 'sba loan', 'line of credit', 'credit line', 'mortgage payment',
    'principal payment', 'interest payment', 'kabbage', 'ondeck', 'bluevine',
    'fundbox', 'lendio',
  ], category: 'loan_payment' },
  // Materials & Supplies
  { keywords: [
    'home depot', 'lowes', "lowe's", 'menards', 'ace hardware', 'tractor supply',
    'grainger', 'fastenal', 'lumber', 'supply house', 'plumbing supply',
    'electrical supply', 'building material',
  ], category: 'materials' },
  // Transfers
  { keywords: [
    'transfer to', 'transfer from', 'online transfer', 'ach transfer',
    'wire transfer', 'internal transfer', 'account transfer',
  ], category: 'transfer' },
  // Zelle / Person-to-person payments (freelancer / subcontractor likely)
  { keywords: [
    'zelle payment', 'zelle to', 'zelle from', 'venmo', 'cashapp', 'cash app',
    'paypal',
  ], category: 'transfer' },
  // Refunds (positive amounts with refund keyword)
  { keywords: ['refund', 'credit memo', 'chargeback', 'reversal'], category: 'refund' },
  // Income / Client Payments
  { keywords: [
    'deposit from', 'client payment', 'invoice payment', 'payment received',
    'incoming wire', 'incoming ach', 'check deposit',
  ], category: 'income' },
];

/**
 * Auto-categorize a transaction description using keyword rules (client-side).
 */
function matchCategory(description: string): string | null {
  if (!description) return null;
  const desc = description.toLowerCase();
  for (const rule of CATEGORY_KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      // Use word-boundary check to avoid partial matches (e.g. "mobil" matching "mobile")
      const idx = desc.indexOf(keyword);
      if (idx === -1) continue;
      const charAfter = desc[idx + keyword.length];
      // Match if keyword is at end of string, or followed by a non-letter character
      if (charAfter === undefined || !/[a-z]/.test(charAfter)) {
        return rule.category;
      }
    }
  }
  return null;
}

// ─── Description normalization for learned rules ────────────
// Extract a stable "merchant key" from a bank transaction description.
// This strips all the variable parts (transaction IDs, dates, amounts, cities, etc.)
// so that "PURCHASE FACEBK *T5HTV8DLT2 650- CA" and "PURCHASE FACEBK *XYZ999 650- CA"
// both normalize to "facebk".
const BANK_PREFIXES = /^(purchase|checkcard|pmnt sent|pmnt rcvd|wire type:\S+|prog express|preauthorized|ach|pos|debit|credit|recurring|autopay|online payment|bill pay|transfer to|transfer from|direct dep|direct deposit|mobile deposit)\b/i;
const MONTH_NAMES = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi;
const STATE_ABBREVS = /\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\s*$/i;

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(BANK_PREFIXES, '')                       // remove bank prefixes (purchase, checkcard, etc.)
    .replace(/\*[\w]+/g, '')                          // remove transaction IDs (*T5HTV8DLT2)
    .replace(/#[\w]+/g, '')                           // remove reference numbers (#07071)
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '')   // remove dates (MM/DD or MM/DD/YY)
    .replace(MONTH_NAMES, '')                         // remove month names
    .replace(/\$[\d,.]+/g, '')                        // remove dollar amounts
    .replace(/\d{3,}-\d{3,}-?\d*/g, '')               // remove phone numbers (855-380-xxxx)
    .replace(/\d{3}-\s/g, '')                         // remove partial phone (650- )
    .replace(/https?:\/\/\S+/g, '')                   // remove full URLs
    .replace(/\w+\.\w{2,4}(\/\S*)?/g, '')            // remove domains (amzn.com/bill, cursor.com)
    .replace(/\b(des|id|indn|trn|bnf|ppd|co|et|type|ref|service|time|date|out|intl):\S*/gi, '') // remove ACH/wire metadata
    .replace(/\b\d{4,}\b/g, '')                       // remove long numbers (check #, card #)
    .replace(STATE_ABBREVS, '')                        // remove trailing state abbreviation
    .replace(/[^a-z\s]/g, '')                         // remove non-alpha characters
    .replace(/\s+/g, ' ')                             // collapse whitespace
    .trim();
}

// Fuzzy match: check if a transaction description matches a saved pattern.
// Uses token overlap — if 60%+ of the saved pattern's tokens appear in the description, it's a match.
function fuzzyMatchPattern(descriptionTokens: string[], patternTokens: string[]): boolean {
  if (patternTokens.length === 0 || descriptionTokens.length === 0) return false;
  const matches = patternTokens.filter(pt => descriptionTokens.includes(pt));
  const score = matches.length / patternTokens.length;
  return score >= 0.6 && matches.length >= 1;
}

interface LearnedRule {
  id: string;
  description_pattern: string;
  category: string | null;
  payee_id: string | null;
  project_id: string | null;
}

export default function BankStatementsPage() {
  const { profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedSections, setExpandedSections] = useState({
    matched: true,
    unmatched: true,
    discrepancies: true
  });
  const [autoMatching, setAutoMatching] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [showAttachModal, setShowAttachModal] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [staffMembers, setStaffMembers] = useState<{ id: string; full_name: string; employment_type: string | null }[]>([]);
  const [learnedRules, setLearnedRules] = useState<LearnedRule[]>([]);
  const [dbCategories, setDbCategories] = useState<TransactionCategory[]>([]);

  // Build the dropdown list from DB categories (with 'Uncategorized' at top)
  const TRANSACTION_CATEGORIES = [
    { value: '', label: 'Uncategorized' },
    ...(dbCategories.length > 0
      ? dbCategories.map(c => ({ value: c.value, label: c.label }))
      : FALLBACK_CATEGORIES
    ),
  ];
  // Reconciliation state
  const [reconStep, setReconStep] = useState<'idle' | 'review' | 'done'>('idle');
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [aiCategorizing, setAiCategorizing] = useState(false);

  useEffect(() => {
    if (profile?.company_id) {
      loadData();
    }
  }, [profile?.company_id]);

  async function loadData() {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const [statementsData, expensesData, receiptsData, projectsData, staffData, rulesData] = await Promise.all([
        bankStatementsApi.getStatements(profile.company_id),
        companyExpensesApi.getExpenses(profile.company_id),
        supabase.from('receipts').select('*').eq('company_id', profile.company_id).then(r => r.data || []),
        supabase.from('projects').select('id, name').eq('company_id', profile.company_id).neq('status', 'archived').order('name').then(r => r.data || []),
        supabase.from('profiles').select('id, full_name, employment_type').eq('company_id', profile.company_id).eq('is_active', true).order('full_name').then(r => r.data || []),
        supabase.from('category_learned_rules').select('id, description_pattern, category, payee_id, project_id').eq('company_id', profile.company_id).then(r => r.data || []),
      ]);
      setStatements(statementsData);
      setExpenses(expensesData);
      setReceipts(receiptsData);
      setProjects(projectsData);
      setStaffMembers(staffData);
      setLearnedRules(rulesData as LearnedRule[]);
      // Load categories separately so a failure doesn't block the rest of the page
      transactionCategoryApi.getAll(profile.company_id)
        .then(cats => setDbCategories(cats))
        .catch(() => console.warn('Using fallback categories'));
    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('Failed to load bank statements', 'error');
    }
    setLoading(false);
  }

  async function loadStatementDetails(statement: BankStatement) {
    try {
      const txData = await bankStatementsApi.getTransactions(statement.id);
      
      // Auto-apply learned rules (fuzzy) to uncategorized transactions (silent)
      const uncategorized = txData.filter((t: BankTransaction) => !t.category);
      if (uncategorized.length > 0 && learnedRules.length > 0) {
        const autoUpdates: { id: string; updates: Record<string, any> }[] = [];
        for (const tx of uncategorized) {
          if (!tx.description) continue;
          const learned = matchLearnedRule(tx.description);
          if (learned?.category) {
            const upd: Record<string, any> = { category: learned.category, category_source: 'auto' };
            if (learned.payee_id) upd.payee_id = learned.payee_id;
            if (learned.project_id) upd.project_id = learned.project_id;
            autoUpdates.push({ id: tx.id, updates: upd });
          }
        }
        if (autoUpdates.length > 0) {
          // Apply in background — don't block the UI
          Promise.all(autoUpdates.map(u => bankStatementsApi.updateTransaction(u.id, u.updates))).catch(() => {});
          // Update local state immediately
          const updateMap = new Map(autoUpdates.map(u => [u.id, u.updates]));
          for (const tx of txData) {
            const upd = updateMap.get(tx.id);
            if (upd) Object.assign(tx, upd);
          }
        }
      }

      setTransactions(txData);
      setSelectedStatement(statement);
      setViewMode('detail');
    } catch (error) {
      console.error('Failed to load transactions:', error);
      showToast('Failed to load transactions', 'error');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !profile?.company_id) return;
    
    // Validate all files are PDFs
    for (let i = 0; i < files.length; i++) {
      if (!files[i].name.toLowerCase().endsWith('.pdf')) {
        showToast('Please upload only PDF files', 'error');
        return;
      }
    }
    
    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // Create statement record and upload file
          const statement = await bankStatementsApi.uploadStatement(profile.company_id, file);
          
          // Parse with AI — edge function saves transactions & updates statement server-side
          const parseResult = await aiClient.parseStatement(profile.company_id, file, statement.id);
          
          if (parseResult.success && parseResult.data) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err: any) {
          console.error(`Failed to upload ${file.name}:`, err);
          errorCount++;
        }
      }
      
      if (successCount > 0) {
        showToast(`${successCount} statement(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`, 'success');
        await loadData();
      } else {
        showToast('Failed to upload statements', 'error');
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      showToast(error?.message || 'Failed to upload statements', 'error');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeleteStatement(id: string) {
    if (!confirm('Are you sure you want to delete this statement and all its transactions?')) return;
    
    try {
      await bankStatementsApi.deleteStatement(id);
      showToast('Statement deleted', 'success');
      setStatements(statements.filter(s => s.id !== id));
      if (selectedStatement?.id === id) {
        setSelectedStatement(null);
        setTransactions([]);
        setViewMode('list');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      showToast('Failed to delete statement', 'error');
    }
  }

  async function handleReprocessStatement(statement: BankStatement) {
    if (!profile?.company_id || !statement.file_path) return;
    
    showToast('Reprocessing statement with AI...', 'info');
    setStatements(statements.map(s => s.id === statement.id ? { ...s, status: 'pending' } : s));
    
    try {
      // Download the file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('bank-statements')
        .download(statement.file_path);
      
      if (downloadError || !fileData) {
        throw new Error('Could not download file');
      }
      
      // Create a File object
      const file = new File([fileData], statement.original_filename || 'statement.pdf', { type: 'application/pdf' });
      
      // Parse with AI — edge function handles deleting old transactions, 
      // inserting new ones, and updating the statement status server-side
      const parseResult = await aiClient.parseStatement(profile.company_id, file, statement.id);
      
      if (parseResult.success && parseResult.data) {
        const txCount = parseResult.data.transactions?.length || 0;
        showToast(`Statement parsed: ${txCount} transactions saved`, 'success');
      } else {
        throw new Error(parseResult.error || 'Failed to parse statement');
      }
      
      await loadData();
    } catch (error: any) {
      console.error('Reprocess failed:', error);
      showToast(error?.message || 'Failed to reprocess statement', 'error');
      setStatements(statements.map(s => s.id === statement.id ? { ...s, status: 'error' } : s));
    }
  }

  async function handleUpdateMatchStatus(transactionId: string, status: BankTransaction['match_status']) {
    try {
      await bankStatementsApi.updateTransaction(transactionId, { match_status: status });
      setTransactions(transactions.map(t => 
        t.id === transactionId ? { ...t, match_status: status } : t
      ));
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Failed to update transaction', 'error');
    }
  }

  // ─── Layer 2: Save learned rule when user manually categorizes ──
  async function saveLearnedRule(description: string, updates: { category?: string | null; payee_id?: string | null; project_id?: string | null }) {
    if (!profile?.company_id || !description) return;
    const pattern = normalizeDescription(description);
    if (!pattern || pattern.length < 2) return;

    // Find existing rule — use fuzzy match (re-normalize stored patterns with current logic)
    const patternTokens = pattern.split(' ').filter(Boolean);
    const existing = learnedRules.find(r => {
      const rNormalized = normalizeDescription(r.description_pattern);
      const rTokens = rNormalized.split(' ').filter(Boolean);
      return rNormalized === pattern || fuzzyMatchPattern(patternTokens, rTokens) || fuzzyMatchPattern(rTokens, patternTokens);
    });

    const ruleData = {
      company_id: profile.company_id,
      description_pattern: pattern,
      category: updates.category !== undefined ? updates.category : (existing?.category || null),
      payee_id: updates.payee_id !== undefined ? updates.payee_id : (existing?.payee_id || null),
      project_id: updates.project_id !== undefined ? updates.project_id : (existing?.project_id || null),
      match_count: existing ? undefined : 1,
      updated_at: new Date().toISOString(),
    };

    try {
      if (existing) {
        await supabase.from('category_learned_rules').update(ruleData).eq('id', existing.id);
        setLearnedRules(learnedRules.map(r => r.id === existing.id ? { ...r, ...ruleData } : r));
      } else {
        const { data } = await supabase.from('category_learned_rules').insert(ruleData).select().single();
        if (data) setLearnedRules([...learnedRules, data as LearnedRule]);
      }
    } catch (e) {
      console.error('Failed to save learned rule:', e);
    }
  }

  function matchLearnedRule(description: string): LearnedRule | null {
    if (!description) return null;
    const descTokens = normalizeDescription(description).split(' ').filter(Boolean);
    if (descTokens.length === 0) return null;
    // Find the best matching rule using fuzzy token overlap.
    // Re-normalize stored patterns too (they may use old normalization).
    let bestMatch: LearnedRule | null = null;
    let bestScore = 0;
    for (const rule of learnedRules) {
      // Normalize the stored pattern with current logic in case it was saved with old normalization
      const ruleTokens = normalizeDescription(rule.description_pattern).split(' ').filter(Boolean);
      if (ruleTokens.length === 0) continue;
      const matches = ruleTokens.filter(rt => descTokens.includes(rt));
      const score = matches.length / Math.max(ruleTokens.length, descTokens.length);
      // Require at least 60% overlap AND at least 1 meaningful token match
      if (score >= 0.5 && matches.length >= 1 && score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }
    return bestMatch;
  }

  // Apply a learned rule to all matching uncategorized siblings in the current view
  function applySiblingRules(sourceId: string, description: string, updates: { category?: string; payee_id?: string; project_id?: string }) {
    if (!description) return;
    const sourceTokens = normalizeDescription(description).split(' ').filter(Boolean);
    if (sourceTokens.length < 1) return;

    const siblings = transactions.filter(t => {
      if (t.id === sourceId || t.category || !t.description) return false;
      const txTokens = normalizeDescription(t.description).split(' ').filter(Boolean);
      // Check both directions for fuzzy match
      return fuzzyMatchPattern(txTokens, sourceTokens) || fuzzyMatchPattern(sourceTokens, txTokens);
    });
    if (siblings.length === 0) return;

    // Update siblings in DB (background)
    const dbUpdates: Record<string, any> = { category_source: 'auto' };
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.payee_id) dbUpdates.payee_id = updates.payee_id;
    if (updates.project_id) dbUpdates.project_id = updates.project_id;
    Promise.all(siblings.map(s => bankStatementsApi.updateTransaction(s.id, dbUpdates))).catch(() => {});

    // Update local state immediately
    const siblingIds = new Set(siblings.map(s => s.id));
    setTransactions(prev => prev.map(t => {
      if (!siblingIds.has(t.id)) return t;
      return {
        ...t,
        ...(updates.category ? { category: updates.category, category_source: 'auto' as const } : {}),
        ...(updates.payee_id ? { payee_id: updates.payee_id, payee: staffMembers.find(s => s.id === updates.payee_id) } : {}),
        ...(updates.project_id ? { project_id: updates.project_id, project: projects.find(p => p.id === updates.project_id) } : {}),
      };
    }));
  }

  async function handleUpdateCategory(transactionId: string, category: string) {
    try {
      await bankStatementsApi.updateTransaction(transactionId, { 
        category: category || null,
        category_source: category ? 'manual' : null,
      });
      const tx = transactions.find(t => t.id === transactionId);
      setTransactions(transactions.map(t => 
        t.id === transactionId ? { ...t, category: category || undefined, category_source: category ? 'manual' as const : null } : t
      ));
      // Save learned rule + apply to siblings
      if (tx?.description && category) {
        saveLearnedRule(tx.description, { category });
        applySiblingRules(transactionId, tx.description, { category });
      }
    } catch (error) {
      console.error('Category update failed:', error);
      showToast('Failed to update category', 'error');
    }
  }

  async function handleUpdateProject(transactionId: string, projectId: string) {
    try {
      await bankStatementsApi.updateTransaction(transactionId, { project_id: projectId || null });
      const project = projects.find(p => p.id === projectId);
      const tx = transactions.find(t => t.id === transactionId);
      setTransactions(transactions.map(t => 
        t.id === transactionId ? { ...t, project_id: projectId || undefined, project: project || undefined } : t
      ));
      if (tx?.description && projectId) {
        saveLearnedRule(tx.description, { project_id: projectId });
        applySiblingRules(transactionId, tx.description, { project_id: projectId });
      }
    } catch (error) {
      console.error('Project update failed:', error);
      showToast('Failed to update project', 'error');
    }
  }

  async function handleUpdatePayee(transactionId: string, payeeId: string) {
    try {
      await bankStatementsApi.updateTransaction(transactionId, { payee_id: payeeId || null });
      const member = staffMembers.find(s => s.id === payeeId);
      const tx = transactions.find(t => t.id === transactionId);
      setTransactions(transactions.map(t =>
        t.id === transactionId ? { ...t, payee_id: payeeId || undefined, payee: member || undefined } : t
      ));
      if (tx?.description && payeeId) {
        saveLearnedRule(tx.description, { payee_id: payeeId });
        applySiblingRules(transactionId, tx.description, { payee_id: payeeId });
      }
    } catch (error) {
      console.error('Payee update failed:', error);
      showToast('Failed to update payee', 'error');
    }
  }

  async function handleAutoCategorize() {
    const uncategorized = transactions.filter(t => !t.category);
    if (uncategorized.length === 0) {
      showToast('All transactions are already categorized', 'info');
      return;
    }
    let learnedCount = 0;
    let keywordCount = 0;
    const updates: { id: string; category: string; source: 'auto' | 'learned'; payee_id?: string; project_id?: string }[] = [];
    for (const tx of uncategorized) {
      // Check learned rules first (most specific)
      const learned = matchLearnedRule(tx.description || '');
      if (learned?.category) {
        updates.push({ id: tx.id, category: learned.category, source: 'learned', payee_id: learned.payee_id || undefined, project_id: learned.project_id || undefined });
        learnedCount++;
        continue;
      }
      // Fall back to keyword rules
      const cat = matchCategory(tx.description || '');
      if (cat) {
        updates.push({ id: tx.id, category: cat, source: 'auto' });
        keywordCount++;
      }
    }
    if (updates.length === 0) {
      showToast(`No matches found for ${uncategorized.length} uncategorized transactions`, 'info');
      return;
    }
    try {
      await Promise.all(
        updates.map(u => bankStatementsApi.updateTransaction(u.id, { 
          category: u.category, 
          category_source: u.source === 'learned' ? 'auto' : 'auto',
          ...(u.payee_id ? { payee_id: u.payee_id } : {}),
          ...(u.project_id ? { project_id: u.project_id } : {}),
        }))
      );
      setTransactions(transactions.map(t => {
        const update = updates.find(u => u.id === t.id);
        if (!update) return t;
        const payee = update.payee_id ? staffMembers.find(s => s.id === update.payee_id) : undefined;
        const project = update.project_id ? projects.find(p => p.id === update.project_id) : undefined;
        return { 
          ...t, 
          category: update.category, 
          category_source: 'auto' as const,
          ...(update.payee_id ? { payee_id: update.payee_id, payee } : {}),
          ...(update.project_id ? { project_id: update.project_id, project } : {}),
        };
      }));
      const parts: string[] = [];
      if (learnedCount > 0) parts.push(`${learnedCount} from memory`);
      if (keywordCount > 0) parts.push(`${keywordCount} by keywords`);
      showToast(`Auto-categorized ${updates.length} transactions (${parts.join(', ')})`, 'success');
    } catch (error) {
      console.error('Auto-categorize failed:', error);
      showToast('Failed to auto-categorize some transactions', 'error');
    }
  }

  // ─── Layer 3: AI-powered categorization for remaining uncategorized ──
  async function handleAiCategorize() {
    if (!profile?.company_id) return;
    const uncategorized = transactions.filter(t => !t.category && t.description);
    if (uncategorized.length === 0) {
      showToast('All transactions are already categorized', 'info');
      return;
    }
    setAiCategorizing(true);
    try {
      // Build the list of valid categories for the AI prompt
      const validCategories = TRANSACTION_CATEGORIES.filter(c => c.value).map(c => c.value);

      const response = await aiClient.categorize(
        profile.company_id,
        uncategorized.map(tx => ({
          description: tx.description || '',
          amount: tx.amount,
          date: tx.transaction_date || '',
        })),
        validCategories
      );

      if (!response.success || !response.data) {
        showToast('AI categorization failed — try again later', 'error');
        return;
      }

      const results = response.data;
      let aiCount = 0;
      const updates: { id: string; category: string }[] = [];

      for (const result of results) {
        const tx = uncategorized[result.index];
        if (!tx) continue;
        // Only accept categories that exist in our list
        const category = validCategories.includes(result.category) ? result.category : null;
        if (category) {
          updates.push({ id: tx.id, category });
          aiCount++;
        }
      }

      if (updates.length === 0) {
        showToast('AI could not determine categories for these transactions', 'info');
        return;
      }

      // Save to DB
      await Promise.all(
        updates.map(u => bankStatementsApi.updateTransaction(u.id, {
          category: u.category,
          category_source: 'ai',
        }))
      );

      // Update local state
      const updateMap = new Map(updates.map(u => [u.id, u.category]));
      setTransactions(prev => prev.map(t => {
        const cat = updateMap.get(t.id);
        if (!cat) return t;
        return { ...t, category: cat, category_source: 'ai' as const };
      }));

      // Save to learned rules so they're remembered next time
      for (const u of updates) {
        const tx = transactions.find(t => t.id === u.id);
        if (tx?.description) {
          saveLearnedRule(tx.description, { category: u.category });
        }
      }

      showToast(`AI categorized ${aiCount} transactions (1 credit used)`, 'success');
    } catch (error) {
      console.error('AI categorize failed:', error);
      showToast('AI categorization failed', 'error');
    } finally {
      setAiCategorizing(false);
    }
  }

  async function handleAutoMatchReceipts() {
    if (!profile?.company_id) return;
    setAutoMatching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-match-receipts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ company_id: profile.company_id }),
        }
      );
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      showToast(`Matched ${result.matched} receipts to transactions!`, 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to auto-match receipts', 'error');
    } finally {
      setAutoMatching(false);
    }
  }

  async function handleAttachReceipt(transactionId: string, receiptId: string) {
    try {
      await supabase.from('receipts').update({ matched_transaction_id: transactionId }).eq('id', receiptId);
      setReceipts(receipts.map(r => r.id === receiptId ? { ...r, matched_transaction_id: transactionId } : r));
      showToast('Receipt attached!', 'success');
      setShowAttachModal(null);
    } catch (err) {
      showToast('Failed to attach receipt', 'error');
    }
  }

  function getReceiptForTransaction(transactionId: string) {
    return receipts.find(r => r.matched_transaction_id === transactionId);
  }

  function getUnmatchedReceipts() {
    return receipts.filter(r => !r.matched_transaction_id);
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const summary = bankStatementsApi.getReconciliationSummary(transactions);

  // Filter transactions
  const filteredTransactions = filterStatus === 'all' 
    ? transactions 
    : filterStatus === 'uncategorized'
    ? transactions.filter(t => !t.category)
    : transactions.filter(t => t.match_status === filterStatus);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#476E66] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile?.company_id) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500">Please log in to view bank statements.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          {viewMode !== 'list' && (
            <button
              onClick={() => { setViewMode('list'); setSelectedStatement(null); }}
              className="p-1.5 hover:bg-neutral-100 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-base sm:text-lg font-bold text-neutral-900">
              {viewMode === 'list' ? 'Bank Statements' : 
               viewMode === 'reconcile' ? 'AI Reconciliation' :
               viewMode === 'report' ? 'Reconciliation Report' :
               selectedStatement?.original_filename || 'Statement Details'}
            </h1>
            <p className="text-neutral-500 text-[10px]">
              {viewMode === 'list' 
                ? 'Upload and reconcile bank statements with expense records'
                : viewMode === 'reconcile'
                ? 'Upload a statement and let AI match transactions with your records'
                : viewMode === 'report'
                ? `${selectedStatement?.account_name || 'Account'} - ${formatDate(selectedStatement?.period_start)} to ${formatDate(selectedStatement?.period_end)}`
                : `${transactions.length} transactions`}
            </p>
          </div>
        </div>
        
        <div className="flex gap-1.5">
          {viewMode === 'list' && (
            <>
              <button
                onClick={() => setViewMode('reconcile')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/10"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">Reconcile with AI</span>
                <span className="sm:hidden">Reconcile</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50"
              >
                {uploading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload Statements'}</span>
                <span className="sm:hidden">{uploading ? '...' : 'Upload'}</span>
              </button>
            </>
          )}
          
          {viewMode === 'detail' && (
            <>
              <button
                onClick={handleAutoCategorize}
                disabled={transactions.every(t => t.category)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/10 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">Auto-Categorize</span>
                <span className="sm:hidden">Categorize</span>
              </button>
              <button
                onClick={handleAutoMatchReceipts}
                disabled={autoMatching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/10 disabled:opacity-50"
              >
                {autoMatching ? (
                  <Link2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Link2 className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{autoMatching ? 'Matching...' : 'Auto-Match Receipts'}</span>
                <span className="sm:hidden">{autoMatching ? '...' : 'Match'}</span>
              </button>
              <button
                onClick={() => { setReconStep('review'); setClearedIds(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54]"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span className="hidden sm:inline">Reconcile</span>
              </button>
              <button
                onClick={() => setViewMode('report')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50"
              >
                <FileText className="w-3 h-3" />
                <span className="hidden sm:inline">Report</span>
              </button>
            </>
          )}
          
          {viewMode === 'report' && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50"
            >
              <Printer className="w-3 h-3" />
              <span className="hidden sm:inline">Print</span>
            </button>
          )}
        </div>
      </div>

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2.5">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 px-2 md:px-0">
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#476E66]/10 flex items-center justify-center">
                  <FileText className="w-3 h-3 text-[#476E66]" />
                </div>
                <div>
                  <p className="text-base font-bold text-neutral-900">{statements.length}</p>
                  <p className="text-[10px] text-neutral-500">Statements</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-neutral-900">
                    {statements.filter(s => s.status === 'parsed' || s.status === 'reconciled').length}
                  </p>
                  <p className="text-[10px] text-neutral-500">Parsed</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                  <RefreshCw className="w-3 h-3 text-amber-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-neutral-900">
                    {statements.filter(s => s.status === 'pending').length}
                  </p>
                  <p className="text-[10px] text-neutral-500">Pending</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle className="w-3 h-3 text-red-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-neutral-900">
                    {statements.filter(s => s.status === 'error').length}
                  </p>
                  <p className="text-[10px] text-neutral-500">Errors</p>
                </div>
              </div>
            </div>
          </div>

          {/* Plaid Bank Connection */}
          {profile?.id && profile?.company_id && (
            <PlaidLink 
              userId={profile.id} 
              companyId={profile.company_id}
              onSuccess={loadData}
            />
          )}

          {/* Statements List */}
          <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {statements.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-5 h-5 text-neutral-400" />
                </div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-1">No statements yet</h3>
                <p className="text-[10px] text-neutral-500 mb-3">Upload your first bank statement PDF to get started</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54]"
                >
                  Upload Statement
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Statement</th>
                      <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide hidden sm:table-cell">Period</th>
                      <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Balance</th>
                      <th className="text-center px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {statements.map((statement) => (
                      <tr key={statement.id} className="hover:bg-neutral-50/50">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#476E66]/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-[#476E66]" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-neutral-900 truncate">
                                {statement.account_name || statement.original_filename || 'Bank Statement'}
                              </p>
                              {statement.account_number && (
                                <p className="text-[10px] text-neutral-500">****{statement.account_number.slice(-4)}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell">
                          <p className="text-xs text-neutral-900">
                            {formatDate(statement.period_start)} - {formatDate(statement.period_end)}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <p className="text-xs font-medium text-neutral-900">
                            {statement.ending_balance ? formatCurrency(statement.ending_balance) : '-'}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            statement.status === 'parsed' ? 'bg-green-100 text-green-700' :
                            statement.status === 'reconciled' ? 'bg-blue-100 text-blue-700' :
                            statement.status === 'error' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {statement.status === 'parsed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {statement.status === 'reconciled' && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {statement.status === 'error' && <XCircle className="w-2.5 h-2.5" />}
                            <span className="hidden sm:inline">{statement.status.charAt(0).toUpperCase() + statement.status.slice(1)}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Show reprocess directly only for pending/error */}
                            {statement.file_path && (statement.status === 'pending' || statement.status === 'error') && (
                              <button
                                onClick={() => handleReprocessStatement(statement)}
                                className="p-1 hover:bg-blue-50 rounded text-blue-600"
                                title="Parse with AI"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => loadStatementDetails(statement)}
                              className="p-1 hover:bg-neutral-100 rounded text-neutral-600"
                              title="View Details"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            {/* Three-dot menu for secondary actions */}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === statement.id ? null : statement.id); }}
                                className="p-1 hover:bg-neutral-100 rounded text-neutral-400"
                                title="More actions"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                              {openMenuId === statement.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                                  <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-neutral-200 shadow-lg z-20 py-1">
                                    {statement.file_path && (statement.status === 'parsed' || statement.status === 'reconciled') && (
                                      <button
                                        onClick={() => { setOpenMenuId(null); handleReprocessStatement(statement); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 text-left"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        Re-parse (uses AI credits)
                                      </button>
                                    )}
                                    <button
                                      onClick={() => { setOpenMenuId(null); handleDeleteStatement(statement.id); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 text-left"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      Delete statement
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail View */}
      {viewMode === 'detail' && selectedStatement && (
        <div className="space-y-2.5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5 px-2 md:px-0">
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] text-neutral-500 mb-0.5">Beginning Balance</p>
              <p className="text-base font-bold text-neutral-900">
                {formatCurrency(selectedStatement.beginning_balance || 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] text-neutral-500 mb-0.5">Ending Balance</p>
              <p className="text-base font-bold text-neutral-900">
                {formatCurrency(selectedStatement.ending_balance || 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] text-green-600 mb-0.5">Deposits</p>
              <p className="text-base font-bold text-green-600">
                +{formatCurrency(summary.depositsTotal)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] text-red-600 mb-0.5">Withdrawals</p>
              <p className="text-base font-bold text-red-600">
                -{formatCurrency(summary.withdrawalsTotal)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-2 col-span-2 md:col-span-1" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-neutral-500">Match</span>
                <span className="text-[10px] font-medium text-green-600">{summary.matchedCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-neutral-500">Unmatch</span>
                <span className="text-[10px] font-medium text-amber-600">{summary.unmatchedCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-neutral-500">Issues</span>
                <span className="text-[10px] font-medium text-red-600">{summary.discrepancyCount}</span>
              </div>
            </div>
          </div>

          {/* Categorization Progress */}
          {transactions.length > 0 && (() => {
            const categorizedCount = transactions.filter(t => t.category).length;
            const autoCount = transactions.filter(t => t.category_source === 'auto').length;
            const aiCount = transactions.filter(t => t.category_source === 'ai').length;
            const manualCount = categorizedCount - autoCount - aiCount;
            const uncategorizedCount = transactions.length - categorizedCount;
            const pct = transactions.length > 0 ? (categorizedCount / transactions.length) * 100 : 0;
            return (
              <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#476E66]" />
                    <span className="text-xs font-medium text-neutral-900">Categorization</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    {categorizedCount} of {transactions.length} categorized
                  </span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-1.5">
                  <div 
                    className="bg-[#476E66] h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  {autoCount > 0 && (
                    <p className="text-[10px] text-[#476E66] flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> {autoCount} auto-detected
                    </p>
                  )}
                  {aiCount > 0 && (
                    <p className="text-[10px] text-purple-600 flex items-center gap-1">
                      <Brain className="w-3 h-3" /> {aiCount} AI-suggested
                    </p>
                  )}
                  {manualCount > 0 && (
                    <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                      {manualCount} manual
                    </p>
                  )}
                </div>
                {categorizedCount === transactions.length && transactions.length > 0 && (
                  <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> All transactions categorized
                  </p>
                )}
                {/* AI Suggest Banner — only show when there are uncategorized left */}
                {uncategorizedCount > 0 && !aiCategorizing && (
                  <button
                    onClick={handleAiCategorize}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Use AI to categorize {uncategorizedCount} remaining ({uncategorizedCount === 1 ? 'transaction' : 'transactions'}) — 1 credit
                  </button>
                )}
                {aiCategorizing && (
                  <div className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-600 rounded-lg text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    AI is analyzing transactions...
                  </div>
                )}
              </div>
            );
          })()}

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-neutral-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2 py-1 border border-neutral-200 rounded-lg text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66]"
            >
              <option value="all">All ({transactions.length})</option>
              <option value="matched">Matched ({summary.matchedCount})</option>
              <option value="unmatched">Unmatched ({summary.unmatchedCount})</option>
              <option value="discrepancy">Issues ({summary.discrepancyCount})</option>
              <option value="uncategorized">Uncategorized ({transactions.filter(t => !t.category).length})</option>
            </select>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Description</th>
                    <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Amount</th>
                    <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Category</th>
                    <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide hidden lg:table-cell">Payee</th>
                    <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide hidden md:table-cell">Project</th>
                    <th className="text-center px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                    <th className="text-center px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide hidden sm:table-cell">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-neutral-50/50 group">
                      <td className="px-2 py-1.5 text-xs text-neutral-900 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                      <td className="px-2 py-1.5">
                        <p className="text-xs text-neutral-900 truncate max-w-[180px]">{tx.description || '-'}</p>
                        {tx.check_number && (
                          <p className="text-[10px] text-neutral-500">Check #{tx.check_number}</p>
                        )}
                      </td>
                      <td className={`px-2 py-1.5 text-right text-xs font-medium whitespace-nowrap ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <select
                            value={tx.category || ''}
                            onChange={(e) => handleUpdateCategory(tx.id, e.target.value)}
                            className={`w-full max-w-[140px] px-1.5 py-1 text-[11px] border rounded focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] ${
                              tx.category_source === 'ai' ? 'border-purple-300 text-neutral-900 bg-purple-50/50' :
                              tx.category_source === 'auto' ? 'border-[#476E66]/40 text-neutral-900 bg-emerald-50/50' :
                              tx.category ? 'border-neutral-200 text-neutral-900 bg-white' : 'border-dashed border-neutral-300 text-neutral-400 bg-neutral-50/50'
                            }`}
                          >
                            {TRANSACTION_CATEGORIES.map(cat => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                          {tx.category_source === 'ai' && (
                            <span title="AI-suggested — review this"><Brain className="w-3 h-3 text-purple-500 flex-shrink-0" /></span>
                          )}
                          {tx.category_source === 'auto' && (
                            <span title="Auto-detected"><Sparkles className="w-3 h-3 text-[#476E66] flex-shrink-0" /></span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 hidden lg:table-cell">
                        <select
                          value={tx.payee_id || ''}
                          onChange={(e) => handleUpdatePayee(tx.id, e.target.value)}
                          className={`w-full max-w-[150px] px-1.5 py-1 text-[11px] border rounded focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] ${
                            tx.payee_id ? 'border-neutral-200 text-neutral-900 bg-white' : 'border-dashed border-neutral-300 text-neutral-400 bg-neutral-50/50'
                          }`}
                        >
                          <option value="">No Payee</option>
                          {staffMembers.map(member => (
                            <option key={member.id} value={member.id}>
                              {member.full_name}{member.employment_type ? ` (${member.employment_type === 'contractor' ? 'Contractor' : member.employment_type === 'freelancer' ? 'Freelancer' : member.employment_type})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 hidden md:table-cell">
                        <select
                          value={tx.project_id || ''}
                          onChange={(e) => handleUpdateProject(tx.id, e.target.value)}
                          className={`w-full max-w-[160px] px-1.5 py-1 text-[11px] border rounded focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] ${
                            tx.project_id ? 'border-neutral-200 text-neutral-900 bg-white' : 'border-dashed border-neutral-300 text-neutral-400 bg-neutral-50/50'
                          }`}
                        >
                          <option value="">No Project</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name.length > 30 ? p.name.slice(0, 30) + '...' : p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <select
                          value={tx.match_status}
                          onChange={(e) => handleUpdateMatchStatus(tx.id, e.target.value as BankTransaction['match_status'])}
                          className={`px-1 py-0.5 text-[10px] border rounded focus:ring-1 focus:ring-[#476E66] ${
                            tx.match_status === 'matched' ? 'border-green-200 bg-green-50 text-green-700' :
                            tx.match_status === 'discrepancy' ? 'border-red-200 bg-red-50 text-red-700' :
                            tx.match_status === 'ignored' ? 'border-neutral-200 bg-neutral-50 text-neutral-500' :
                            'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          <option value="matched">Matched</option>
                          <option value="unmatched">Unmatched</option>
                          <option value="discrepancy">Issue</option>
                          <option value="ignored">Ignore</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center hidden sm:table-cell">
                        {(() => {
                          const receipt = getReceiptForTransaction(tx.id);
                          if (receipt) {
                            return (
                              <a href={receipt.image_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">
                                <ImageIcon className="w-2.5 h-2.5" />
                              </a>
                            );
                          }
                          if (tx.amount < 0) {
                            return (
                              <button
                                onClick={() => setShowAttachModal(tx.id)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-dashed border-neutral-300 text-neutral-500 rounded text-[10px] hover:border-[#476E66] hover:text-[#476E66]"
                              >
                                <Camera className="w-2.5 h-2.5" />
                              </button>
                            );
                          }
                          return <span className="text-neutral-300 text-[10px]">—</span>;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredTransactions.length === 0 && (
              <div className="p-6 text-center text-xs text-neutral-500">
                No transactions found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report View */}
      {viewMode === 'report' && selectedStatement && (
        <div className="bg-white rounded-lg p-4 print:border-0 print:p-0" style={{ boxShadow: 'var(--shadow-card)' }}>
          {/* Report Header */}
          <div className="border-b border-neutral-100 pb-3 mb-3">
            <h2 className="text-base font-bold text-neutral-900 mb-2">Bank Reconciliation Report</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <p className="text-[10px] text-neutral-500">Account</p>
                <p className="font-medium">{selectedStatement.account_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500">Account Number</p>
                <p className="font-medium">****{selectedStatement.account_number?.slice(-4) || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500">Period</p>
                <p className="font-medium">{formatDate(selectedStatement.period_start)} - {formatDate(selectedStatement.period_end)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500">Generated</p>
                <p className="font-medium">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-4">
            <div className="bg-neutral-50 rounded-lg p-2">
              <p className="text-[10px] text-neutral-500">Beginning Balance</p>
              <p className="text-base font-bold">{formatCurrency(selectedStatement.beginning_balance || 0)}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-2">
              <p className="text-[10px] text-neutral-500">Ending Balance</p>
              <p className="text-base font-bold">{formatCurrency(selectedStatement.ending_balance || 0)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <p className="text-[10px] text-green-600">Total Deposits</p>
              <p className="text-base font-bold text-green-600">+{formatCurrency(summary.depositsTotal)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <p className="text-[10px] text-red-600">Total Withdrawals</p>
              <p className="text-base font-bold text-red-600">-{formatCurrency(summary.withdrawalsTotal)}</p>
            </div>
          </div>

          {/* Reconciliation Status */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">Reconciliation Summary</h3>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-green-600">{summary.matchedCount}</p>
                <p className="text-[10px] text-green-700">Matched</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-amber-600">{summary.unmatchedCount}</p>
                <p className="text-[10px] text-amber-700">Unmatched</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-red-600">{summary.discrepancyCount}</p>
                <p className="text-[10px] text-red-700">Discrepancies</p>
              </div>
            </div>
          </div>

          {/* Matched Transactions */}
          {summary.matched.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setExpandedSections(s => ({ ...s, matched: !s.matched }))}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 mb-2"
              >
                {expandedSections.matched ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Matched Transactions ({summary.matched.length})
              </button>
              {expandedSections.matched && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-neutral-200 rounded-lg overflow-hidden min-w-[400px]">
                    <thead>
                      <tr className="bg-green-50">
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Description</th>
                        <th className="text-right px-2 py-1">Amount</th>
                        <th className="text-left px-2 py-1 hidden sm:table-cell">Matched With</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {summary.matched.map(tx => (
                        <tr key={tx.id}>
                          <td className="px-2 py-1.5">{formatDate(tx.transaction_date)}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{tx.description}</td>
                          <td className="px-2 py-1.5 text-right">{formatCurrency(tx.amount)}</td>
                          <td className="px-2 py-1.5 text-neutral-500 hidden sm:table-cell">{tx.matched_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Unmatched Transactions */}
          {summary.unmatched.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setExpandedSections(s => ({ ...s, unmatched: !s.unmatched }))}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 mb-2"
              >
                {expandedSections.unmatched ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Unmatched Transactions ({summary.unmatched.length})
              </button>
              {expandedSections.unmatched && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                  <p className="text-[10px] text-amber-700">
                    These transactions could not be matched to any expense record.
                  </p>
                </div>
              )}
              {expandedSections.unmatched && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-neutral-200 rounded-lg overflow-hidden min-w-[400px]">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Description</th>
                        <th className="text-left px-2 py-1 hidden sm:table-cell">Type</th>
                        <th className="text-right px-2 py-1">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {summary.unmatched.map(tx => (
                        <tr key={tx.id}>
                          <td className="px-2 py-1.5">{formatDate(tx.transaction_date)}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{tx.description}</td>
                          <td className="px-2 py-1.5 hidden sm:table-cell">{tx.type}</td>
                          <td className="px-2 py-1.5 text-right">{formatCurrency(tx.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Discrepancies */}
          {summary.discrepancies.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setExpandedSections(s => ({ ...s, discrepancies: !s.discrepancies }))}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 mb-2"
              >
                {expandedSections.discrepancies ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Discrepancies ({summary.discrepancies.length})
              </button>
              {expandedSections.discrepancies && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
                  <p className="text-[10px] text-red-700">
                    These transactions have matching dates but different amounts.
                  </p>
                </div>
              )}
              {expandedSections.discrepancies && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-neutral-200 rounded-lg overflow-hidden min-w-[400px]">
                    <thead>
                      <tr className="bg-red-50">
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Description</th>
                        <th className="text-right px-2 py-1">Amount</th>
                        <th className="text-left px-2 py-1 hidden sm:table-cell">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {summary.discrepancies.map(tx => (
                        <tr key={tx.id}>
                          <td className="px-2 py-1.5">{formatDate(tx.transaction_date)}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{tx.description}</td>
                          <td className="px-2 py-1.5 text-right">{formatCurrency(tx.amount)}</td>
                          <td className="px-2 py-1.5 text-red-600 hidden sm:table-cell">{tx.matched_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Variance Analysis */}
          <div className="border-t border-neutral-100 pt-3 mt-4">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">Variance Analysis</h3>
            <div className="bg-neutral-50 rounded-lg p-2">
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="py-1">Beginning Balance</td>
                    <td className="py-1 text-right">{formatCurrency(selectedStatement.beginning_balance || 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">+ Deposits</td>
                    <td className="py-1 text-right text-green-600">+{formatCurrency(summary.depositsTotal)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">- Withdrawals</td>
                    <td className="py-1 text-right text-red-600">-{formatCurrency(summary.withdrawalsTotal)}</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="py-1 font-medium">Calculated Ending</td>
                    <td className="py-1 text-right font-medium">
                      {formatCurrency((selectedStatement.beginning_balance || 0) + summary.depositsTotal - summary.withdrawalsTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium">Statement Ending</td>
                    <td className="py-1 text-right font-medium">{formatCurrency(selectedStatement.ending_balance || 0)}</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="py-1 font-bold">Variance</td>
                    <td className={`py-1 text-right font-bold ${
                      Math.abs((selectedStatement.ending_balance || 0) - ((selectedStatement.beginning_balance || 0) + summary.depositsTotal - summary.withdrawalsTotal)) < 0.01
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {formatCurrency(
                        (selectedStatement.ending_balance || 0) - 
                        ((selectedStatement.beginning_balance || 0) + summary.depositsTotal - summary.withdrawalsTotal)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Manual Reconciliation Panel */}
      {reconStep === 'review' && selectedStatement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-neutral-50">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Reconcile Statement</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Check off each transaction as you verify it matches your bank statement</p>
              </div>
              <button onClick={() => setReconStep('idle')} className="p-1 hover:bg-neutral-200 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Balance Summary Bar */}
            {(() => {
              const beginBal = selectedStatement.beginning_balance || 0;
              const endBal = selectedStatement.ending_balance || 0;
              const clearedDeposits = transactions.filter(t => clearedIds.has(t.id) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
              const clearedWithdrawals = transactions.filter(t => clearedIds.has(t.id) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
              const clearedBalance = beginBal + clearedDeposits - clearedWithdrawals;
              const difference = endBal - clearedBalance;
              const isBalanced = Math.abs(difference) < 0.01;

              return (
                <div className={`px-4 py-3 border-b ${isBalanced ? 'bg-green-50' : 'bg-amber-50'}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase">Statement Balance</p>
                      <p className="text-sm font-semibold text-neutral-900">{formatCurrency(endBal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase">Cleared Balance</p>
                      <p className="text-sm font-semibold text-neutral-900">{formatCurrency(clearedBalance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase">Cleared</p>
                      <p className="text-sm font-medium text-neutral-600">{clearedIds.size} of {transactions.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase">Difference</p>
                      <p className={`text-sm font-bold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                        {isBalanced ? '$0.00' : formatCurrency(difference)}
                      </p>
                    </div>
                  </div>
                  {isBalanced && (
                    <p className="text-xs text-green-700 text-center mt-2 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Balanced! Ready to finish reconciliation.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Transaction Checklist */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white border-b">
                  <tr>
                    <th className="text-center px-3 py-2 text-[10px] font-medium text-neutral-500 uppercase w-10">
                      <input 
                        type="checkbox"
                        checked={clearedIds.size === transactions.length && transactions.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setClearedIds(new Set(transactions.map(t => t.id)));
                          } else {
                            setClearedIds(new Set());
                          }
                        }}
                        className="rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                      />
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-medium text-neutral-500 uppercase">Date</th>
                    <th className="text-left px-3 py-2 text-[10px] font-medium text-neutral-500 uppercase">Description</th>
                    <th className="text-right px-3 py-2 text-[10px] font-medium text-neutral-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {transactions.map((tx) => (
                    <tr 
                      key={tx.id} 
                      className={`cursor-pointer transition-colors ${clearedIds.has(tx.id) ? 'bg-green-50/50' : 'hover:bg-neutral-50'}`}
                      onClick={() => {
                        const next = new Set(clearedIds);
                        if (next.has(tx.id)) next.delete(tx.id);
                        else next.add(tx.id);
                        setClearedIds(next);
                      }}
                    >
                      <td className="text-center px-3 py-2">
                        <input 
                          type="checkbox" 
                          checked={clearedIds.has(tx.id)} 
                          onChange={() => {}} 
                          className="rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-900 truncate max-w-[250px]">
                        {tx.description || '-'}
                        {tx.category && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">
                            {TRANSACTION_CATEGORIES.find(c => c.value === tx.category)?.label || tx.category}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-xs text-right font-medium whitespace-nowrap ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t bg-neutral-50">
              <button
                onClick={() => setReconStep('idle')}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const beginBal = selectedStatement.beginning_balance || 0;
                  const endBal = selectedStatement.ending_balance || 0;
                  const clearedDeposits = transactions.filter(t => clearedIds.has(t.id) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
                  const clearedWithdrawals = transactions.filter(t => clearedIds.has(t.id) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
                  const clearedBalance = beginBal + clearedDeposits - clearedWithdrawals;
                  const difference = endBal - clearedBalance;
                  const isBalanced = Math.abs(difference) < 0.01;

                  if (!isBalanced) {
                    if (!confirm(`The difference is ${formatCurrency(difference)}. Are you sure you want to finish with an unbalanced reconciliation?`)) return;
                  }

                  try {
                    setReconciling(true);
                    // Mark cleared transactions
                    const now = new Date().toISOString();
                    await Promise.all(
                      Array.from(clearedIds).map(id =>
                        bankStatementsApi.updateTransaction(id, { is_cleared: true, reconciled_at: now, match_status: 'matched' })
                      )
                    );
                    // Update statement status
                    await supabase.from('bank_statements').update({ status: 'reconciled' }).eq('id', selectedStatement.id);

                    setTransactions(transactions.map(t => 
                      clearedIds.has(t.id) ? { ...t, is_cleared: true, reconciled_at: now, match_status: 'matched' as const } : t
                    ));
                    setStatements(statements.map(s => s.id === selectedStatement.id ? { ...s, status: 'reconciled' as const } : s));
                    setSelectedStatement({ ...selectedStatement, status: 'reconciled' });
                    setReconStep('idle');
                    showToast(`Reconciliation complete: ${clearedIds.size} transactions cleared${isBalanced ? ', balanced!' : ''}`, 'success');
                  } catch (error) {
                    console.error('Finish reconciliation failed:', error);
                    showToast('Failed to finish reconciliation', 'error');
                  } finally {
                    setReconciling(false);
                  }
                }}
                disabled={clearedIds.size === 0 || reconciling}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50"
              >
                {reconciling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {reconciling ? 'Saving...' : `Finish (${clearedIds.size} cleared)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Receipt Modal */}
      {showAttachModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Attach Receipt</h3>
              <button onClick={() => setShowAttachModal(null)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {getUnmatchedReceipts().length === 0 ? (
                <div className="text-center py-8">
                  <Camera className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-neutral-500 text-sm">No unmatched receipts</p>
                  <p className="text-neutral-400 text-xs mt-1">Scan receipts first from the Receipts page</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {getUnmatchedReceipts().map((receipt) => (
                    <button
                      key={receipt.id}
                      onClick={() => handleAttachReceipt(showAttachModal, receipt.id)}
                      className="border border-neutral-200 rounded-lg overflow-hidden hover:border-[#476E66] hover:shadow-md transition-all"
                    >
                      <div className="aspect-[3/4] bg-neutral-100">
                        <img src={receipt.image_url} alt="Receipt" className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2 text-left">
                        <p className="text-xs font-medium truncate">{receipt.vendor || 'Unknown'}</p>
                        <p className="text-xs text-[#476E66]">{formatCurrency(receipt.amount || 0)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reconcile View */}
      {viewMode === 'reconcile' && (
        <ReconciliationDashboard companyId={profile?.company_id} />
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:border-0 { border: none !important; }
          .print\\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
