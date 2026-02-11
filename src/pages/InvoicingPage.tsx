import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureGating } from '../hooks/useFeatureGating';
import { api, Invoice, Client, Project, reminderHistoryApi, ReminderHistory, recurringInvoicesApi, RecurringInvoice, notificationsApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { NotificationService } from '../lib/notificationService';
import { Plus, Search, Filter, Download, MoreHorizontal, DollarSign, FileText, Clock, X, Check, Send, Printer, Copy, Mail, CreditCard, Eye, ChevronLeft, RefreshCw, Camera, Save, Trash2, Edit2, ArrowUpRight, List, LayoutGrid, ChevronDown, ChevronRight, Bell, Calendar, CheckCircle, AlertCircle, Repeat, History, User, Layers } from 'lucide-react';
import PaymentModal from '../components/PaymentModal';
import MakePaymentModal from '../components/MakePaymentModal';
import { useToast } from '../components/Toast';
import { InvoicesSkeleton } from '../components/Skeleton';
import { sortClientsForDisplay } from '../lib/utils';
import { usePermissions } from '../contexts/PermissionsContext';

export default function InvoicingPage() {
  const { profile, user, loading: authLoading } = useAuth();
  const { canView, canCreate, canEdit, canDelete, canViewFinancials, isAdmin, loading: permLoading } = usePermissions();
  const { checkAndProceed } = useFeatureGating();
  const { showToast } = useToast();
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'sent' | 'aging'>('all');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMakePaymentModal, setShowMakePaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [pendingOpenInvoiceId, setPendingOpenInvoiceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'client'>('list');
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('invoicesExpandedClients');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [company, setCompany] = useState<{ company_name?: string; logo_url?: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; website?: string } | null>(null);

  // Count invoices created this month for limit checking
  const currentMonthInvoiceCount = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return invoices.filter(inv => new Date(inv.created_at) >= startOfMonth).length;
  }, [invoices]);

  const toggleClientExpanded = useCallback((clientName: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientName)) newExpanded.delete(clientName);
    else newExpanded.add(clientName);
    setExpandedClients(newExpanded);
    localStorage.setItem('invoicesExpandedClients', JSON.stringify([...newExpanded]));
  }, [expandedClients]);

  const toggleInvoiceSelection = useCallback((invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) newSelected.delete(invoiceId);
    else newSelected.add(invoiceId);
    setSelectedInvoices(newSelected);
  }, [selectedInvoices]);

  // Note: toggleSelectAll is defined later after filteredInvoices

  const handleDeleteInvoice = useCallback(async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    setDeleting(true);
    try {
      await api.deleteInvoice(invoiceId);
      showToast('Invoice deleted successfully', 'success');
      loadData();
      setSelectedInvoices(prev => {
        const newSet = new Set(prev);
        newSet.delete(invoiceId);
        return newSet;
      });
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      showToast('Failed to delete invoice', 'error');
    }
    setDeleting(false);
  }, [showToast]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedInvoices.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedInvoices.size} invoice(s)?`)) return;
    setDeleting(true);
    try {
      await api.deleteInvoices(Array.from(selectedInvoices));
      showToast(`${selectedInvoices.size} invoice(s) deleted successfully`, 'success');
      loadData();
      setSelectedInvoices(new Set());
    } catch (err) {
      console.error('Failed to delete invoices:', err);
      showToast('Failed to delete invoices', 'error');
    }
    setDeleting(false);
  }, [selectedInvoices, showToast]);

  const [consolidating, setConsolidating] = useState(false);
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);

  // Check if selected invoices can be consolidated (same client, ONLY draft invoices, not already consolidated)
  const canConsolidate = useMemo(() => {
    if (selectedInvoices.size < 2) return { allowed: false, reason: 'Select at least 2 invoices' };

    const selected = invoices.filter(inv => selectedInvoices.has(inv.id));

    // Check all from same client
    const clientIds = [...new Set(selected.map(inv => inv.client_id))];
    if (clientIds.length > 1) return { allowed: false, reason: 'Invoices must be from the same client' };

    // Check all are draft status (not sent, paid, or consolidated)
    const nonDraftInvoices = selected.filter(inv => inv.status !== 'draft');
    if (nonDraftInvoices.length > 0) {
      return { allowed: false, reason: 'Only draft invoices can be consolidated' };
    }

    // Check none are already consolidated into another invoice
    const alreadyConsolidated = selected.filter(inv => inv.consolidated_into);
    if (alreadyConsolidated.length > 0) {
      return { allowed: false, reason: 'Some invoices are already consolidated into another invoice' };
    }

    // Prevent re-consolidating consolidated invoices (invoices that have consolidated_from)
    const areConsolidatedInvoices = selected.filter(inv => inv.consolidated_from && inv.consolidated_from.length > 0);
    if (areConsolidatedInvoices.length > 0) {
      return { allowed: false, reason: 'Cannot re-consolidate consolidated invoices. Select original invoices only.' };
    }

    return { allowed: true, reason: '' };
  }, [selectedInvoices, invoices]);

  // Get consolidation details for the modal
  const consolidationDetails = useMemo(() => {
    const selected = invoices.filter(inv => selectedInvoices.has(inv.id));
    const clientName = selected[0]?.client?.name || 'Unknown Client';
    const totalAmount = selected.reduce((sum, inv) => sum + (inv.total || 0), 0);
    return { selected, clientName, totalAmount };
  }, [selectedInvoices, invoices]);

  const handleConsolidateClick = useCallback(() => {
    if (!canConsolidate.allowed) return;
    setShowConsolidateModal(true);
  }, [canConsolidate.allowed]);

  const handleConsolidateConfirm = useCallback(async () => {
    if (!canConsolidate.allowed || !profile?.company_id) return;

    setShowConsolidateModal(false);
    setConsolidating(true);
    try {
      const result = await api.consolidateInvoices(Array.from(selectedInvoices), profile.company_id);

      if (result.success) {
        showToast(`Successfully consolidated ${selectedInvoices.size} invoices into ${result.consolidatedInvoice?.invoice_number}`, 'success');
        loadData();
        setSelectedInvoices(new Set());
        // Open the new consolidated invoice
        if (result.consolidatedInvoice) {
          setViewingInvoice(result.consolidatedInvoice);
        }
      } else {
        showToast(result.error || 'Failed to consolidate invoices', 'error');
      }
    } catch (err) {
      console.error('Failed to consolidate invoices:', err);
      showToast('Failed to consolidate invoices', 'error');
    }
    setConsolidating(false);
  }, [selectedInvoices, canConsolidate, profile?.company_id, showToast]);

  // Check for navigation state to open a specific invoice
  useEffect(() => {
    const state = location.state as { openInvoiceId?: string } | null;
    if (state?.openInvoiceId) {
      setPendingOpenInvoiceId(state.openInvoiceId);
      // Clear the state to prevent re-opening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Open the invoice when data is loaded and we have a pending invoice to open
  useEffect(() => {
    if (pendingOpenInvoiceId && invoices.length > 0) {
      const invoiceToOpen = invoices.find(i => i.id === pendingOpenInvoiceId);
      if (invoiceToOpen) {
        setViewingInvoice(invoiceToOpen);
      }
      setPendingOpenInvoiceId(null);
    }
  }, [pendingOpenInvoiceId, invoices]);

  const menuRef = useRef<HTMLDivElement>(null);

  // Reload data when navigating to this page or when profile changes
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      await loadData();
    };
    load();
    return () => { mounted = false; };
  }, [profile?.company_id, user?.id, location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadData() {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [invoicesData, clientsData, projectsData, recurringData, companyData] = await Promise.all([
        api.getInvoices(profile.company_id),
        api.getClients(profile.company_id),
        api.getProjects(profile.company_id),
        recurringInvoicesApi.getAll(profile.company_id),
        supabase.from('company_settings').select('company_name, logo_url, address, city, state, zip, phone, website').eq('company_id', profile.company_id).single(),
      ]);
      setInvoices(invoicesData);
      setClients(clientsData);
      setProjects(projectsData);
      setRecurringInvoices(recurringData);
      if (companyData.data) setCompany(companyData.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const wip = invoices.filter(i => i.status === 'draft').reduce((sum, i) => sum + Number(i.total), 0);
    const drafts = invoices.filter(i => i.status === 'draft').length;
    const sentInvoices = invoices.filter(i => i.status === 'sent');
    const sentTotal = sentInvoices.reduce((sum, i) => sum + Number(i.total), 0);
    const arAging = invoices.filter(i => (i.status === 'sent' || i.status === 'overdue') && i.due_date && new Date(i.due_date) < new Date())
      .reduce((sum, i) => sum + Number(i.total), 0);
    const agingCount = invoices.filter(i => (i.status === 'sent' || i.status === 'overdue') && i.due_date && new Date(i.due_date) < new Date()).length;
    return { wip, drafts, arAging, agingCount, sentTotal, sentCount: sentInvoices.length };
  }, [invoices]);

  // AR Aging breakdown by bucket
  const agingBuckets = useMemo(() => {
    const buckets = { current: { count: 0, amount: 0 }, '1-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 } };
    invoices.filter(i => i.status === 'sent' || i.status === 'overdue').forEach(inv => {
      if (!inv.due_date) return;
      const daysOverdue = Math.floor((new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
      const amount = Number(inv.total || 0);
      if (daysOverdue <= 0) { buckets.current.count++; buckets.current.amount += amount; }
      else if (daysOverdue <= 30) { buckets['1-30'].count++; buckets['1-30'].amount += amount; }
      else if (daysOverdue <= 60) { buckets['31-60'].count++; buckets['31-60'].amount += amount; }
      else if (daysOverdue <= 90) { buckets['61-90'].count++; buckets['61-90'].amount += amount; }
      else { buckets['90+'].count++; buckets['90+'].amount += amount; }
    });
    return buckets;
  }, [invoices]);

  // Invoices for AR Aging view (with days overdue calculation)
  const agingInvoices = useMemo(() => {
    return invoices
      .filter(i => (i.status === 'sent' || i.status === 'overdue') && i.due_date)
      .map(inv => ({
        ...inv,
        daysOverdue: Math.floor((new Date().getTime() - new Date(inv.due_date!).getTime()) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [invoices]);

  // Sent invoices list
  const sentInvoicesList = useMemo(() => {
    return invoices.filter(i => i.status === 'sent').sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Apply tab filter first
    if (activeTab === 'sent') {
      filtered = sentInvoicesList;
    } else if (activeTab === 'aging') {
      filtered = agingInvoices;
    }

    // Then apply search, status, client, and date range filters
    return filtered.filter(i => {
      const matchesSearch = i.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.client?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || i.status === statusFilter;
      const matchesClient = clientFilter === 'all' || i.client_id === clientFilter;
      const invDate = i.created_at ? new Date(i.created_at.split('T')[0]).getTime() : 0;
      const fromTs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
      const toTs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
      const matchesDate = (!fromTs || invDate >= fromTs) && (!toTs || invDate <= toTs);
      return matchesSearch && matchesStatus && matchesClient && matchesDate;
    });
  }, [invoices, activeTab, sentInvoicesList, agingInvoices, searchTerm, statusFilter, clientFilter, dateFrom, dateTo]);

  const toggleSelectAll = useCallback(() => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map(i => i.id)));
    }
  }, [selectedInvoices, filteredInvoices]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'draft': return 'bg-neutral-100 text-neutral-700';
      case 'sent': return 'bg-amber-50 text-amber-600';
      case 'paid': return 'bg-[#476E66]/10 text-[#476E66]';
      case 'overdue': return 'bg-red-50 text-red-600';
      case 'consolidated': return 'bg-purple-50 text-purple-600';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const handleExportCSV = useCallback(() => {
    const headers = ['Invoice #', 'Client', 'Project', 'Amount', 'Status', 'Due Date', 'Created'];
    const rows = filteredInvoices.map(inv => [
      inv.invoice_number || '',
      inv.client?.name || '',
      inv.project?.name || '',
      inv.total?.toString() || '0',
      inv.status || '',
      inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '',
      inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredInvoices]);

  const updateInvoiceStatus = useCallback(async (invoiceId: string, status: string, paidAt?: string) => {
    try {
      const updates: any = { status, paid_at: paidAt };
      // When marking as sent, also set sent_at and generate view token
      if (status === 'sent') {
        updates.sent_at = new Date().toISOString();
        updates.sent_date = new Date().toISOString().split('T')[0];
        updates.public_view_token = crypto.randomUUID();
      }
      await api.updateInvoice(invoiceId, updates);

      // Send notification when invoice is marked as paid
      if (status === 'paid' && profile?.company_id) {
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (invoice) {
          // Create in-app notification
          try {
            await notificationsApi.createNotification({
              company_id: profile.company_id,
              type: 'invoice_paid',
              title: '💰 Payment Received',
              message: `Invoice #${invoice.invoice_number} from ${invoice.client?.name || 'client'} has been paid - ${formatCurrency(invoice.total)}`,
              reference_id: invoiceId,
              reference_type: 'invoice',
              is_read: false,
            });
          } catch (e) { console.warn('Failed to create notification:', e); }

          // Send email notification if user has it enabled
          try {
            const { data: userData } = await supabase.from('profiles').select('email_preferences').eq('id', profile.id).single();
            const emailPrefs = userData?.email_preferences || {};
            if (emailPrefs.invoice_paid !== false) {
              const { data: companyData } = await supabase.from('companies').select('name').eq('id', profile.company_id).single();
              await supabase.functions.invoke('send-email', {
                body: {
                  to: profile.email,
                  subject: `💰 Payment Received - Invoice #${invoice.invoice_number}`,
                  type: 'invoice_paid',
                  data: {
                    invoiceNumber: invoice.invoice_number,
                    clientName: invoice.client?.name,
                    companyName: companyData?.name,
                    total: invoice.total,
                    paidDate: new Date().toLocaleDateString(),
                  },
                },
              });
            }
          } catch (e) { console.warn('Failed to send email:', e); }
        }
      }

      loadData();
    } catch (error) {
      console.error('Failed to update invoice:', error);
    }
    setActiveMenu(null);
  }, [invoices, profile, supabase, showToast]);

  const duplicateInvoice = useCallback(async (invoice: Invoice) => {
    try {
      await api.createInvoice({
        company_id: invoice.company_id,
        client_id: invoice.client_id,
        project_id: invoice.project_id || null,
        invoice_number: `INV-${Date.now().toString().slice(-6)}`,
        subtotal: invoice.subtotal,
        tax_amount: invoice.tax_amount,
        total: invoice.total,
        due_date: null,
        status: 'draft',
      });
      showToast('Invoice duplicated successfully', 'success');
      loadData();
    } catch (error) {
      console.error('Failed to duplicate invoice:', error);
      showToast('Failed to duplicate invoice', 'error');
    }
    setActiveMenu(null);
  }, [showToast]);

  const sendInvoiceEmail = useCallback(async (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.client_id);
    // Determine best recipient: billing contact > primary contact > client email
    const recipientEmail = client?.billing_contact_email || client?.primary_contact_email || client?.email;
    const recipientName = client?.billing_contact_name || client?.primary_contact_name || client?.name;
    if (!recipientEmail) {
      showToast('Client does not have an email address. Please add a billing or primary contact.', 'error');
      setActiveMenu(null);
      return;
    }
    try {
      // Send actual email via edge function
      await api.sendEmail({
        to: recipientEmail,
        subject: `Invoice ${invoice.invoice_number} from ${profile?.full_name || 'Our Company'}`,
        documentType: 'invoice',
        documentNumber: invoice.invoice_number,
        clientName: recipientName || 'Client',
        companyName: profile?.full_name || 'Our Company',
        total: invoice.total,
      });
      // Update status to sent with timestamp and generate view token
      const viewToken = invoice.public_view_token || crypto.randomUUID();
      await api.updateInvoice(invoice.id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_date: new Date().toISOString().split('T')[0],
        public_view_token: viewToken
      });
      showToast(`Invoice sent to ${recipientEmail}`, 'success');
      loadData();
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      showToast(error?.message || 'Failed to send invoice', 'error');
    }
    setActiveMenu(null);
  }, [clients, profile, showToast]);

  const openPaymentModal = useCallback((invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
    setActiveMenu(null);
  }, []);

  const generatePDF = useCallback((invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.client_id);
    const project = projects.find(p => p.id === invoice.project_id);

    const content = `
<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${invoice.invoice_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { margin: 0; size: auto; }
    body { font-family: 'Inter', sans-serif; padding: 60px; max-width: 800px; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #171717; }
    .header { display: flex; justify-content: space-between; margin-bottom: 60px; }
    .invoice-title { font-size: 32px; font-weight: 700; color: #171717; letter-spacing: -1px; }
    .invoice-number { color: #737373; margin-top: 8px; font-weight: 500; }
    .section { margin-bottom: 40px; }
    .section-title { font-size: 11px; font-weight: 600; color: #171717; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .client-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .client-details { font-size: 14px; color: #525252; line-height: 1.5; }
    
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 40px; }
    th { text-align: left; padding: 12px 16px; border-bottom: 1px solid #e5e5e5; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #737373; background: #fafafa; }
    td { padding: 16px 16px; border-bottom: 1px solid #f5f5f5; font-size: 14px; color: #171717; }
    .amount { text-align: right; font-feature-settings: "tnum"; }
    
    .totals-area { margin-top: 30px; margin-left: auto; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #525252; }
    .grand-total { border-top: 2px solid #171717; margin-top: 12px; padding-top: 12px; font-weight: 700; font-size: 18px; color: #171717; }
    
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 99px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    .status-draft { background: #f5f5f5; color: #525252; }
    .status-sent { background: #fffbeb; color: #b45309; border: 1px solid #fcd34d; }
    .status-paid { background: #ecfdf5; color: #047857; border: 1px solid #6ee7b7; }
    
    .payment-received { margin-top: 12px; padding: 12px; background: #ecfdf5; border-radius: 8px; color: #065f46; font-size: 13px; text-align: right; }

    .footer { 
      position: fixed; 
      bottom: 0; 
      left: 0; 
      right: 0; 
      padding: 30px 60px 20px 60px;
      background: white;
      border-top: 1px solid #e5e5e5;
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #a3a3a3;
      opacity: 0.7;
    }
    .footer-left { display: flex; gap: 16px; align-items: center; }
    .footer-divider { color: #e5e5e5; }
    
    /* Ensure content doesn't overlapping footer */
    .content-wrapper { padding-bottom: 100px; }
    
    @media print {
      body { -webkit-print-color-adjust: exact; }
      .footer { position: fixed; bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="header">
      <div>
        <div class="invoice-title">INVOICE</div>
        <div class="invoice-number">#${invoice.invoice_number}</div>
      </div>
      <div style="text-align: right;">
        <span class="status-badge status-${invoice.status}">${(invoice.status || 'draft').toUpperCase()}</span>
        <div style="color: #525252; font-size: 13px;">
          <div>Issued: ${new Date(invoice.created_at || '').toLocaleDateString()}</div>
          ${invoice.due_date ? `<div>Due: ${new Date(invoice.due_date).toLocaleDateString()}</div>` : ''}
        </div>
      </div>
    </div>
    
    <div style="display: flex; justify-content: space-between; margin-bottom: 60px;">
      <div class="section" style="flex: 1;">
        <div class="section-title">Bill To</div>
        <div class="client-name">${client?.name || 'Valued Client'}</div>
        <div class="client-details">
          ${client?.address ? `<div>${client.address}</div>` : ''}
          ${(client?.city || client?.state || client?.zip) ? `<div>${[client?.city, client?.state, client?.zip].filter(Boolean).join(', ')}</div>` : ''}
          ${client?.email ? `<div>${client.email}</div>` : ''}
        </div>
      </div>
      
      <div class="section" style="text-align: right; flex: 1;">
        <div class="section-title">Payable To</div>
        <div class="client-name">${company?.company_name || profile?.full_name || 'Us'}</div>
        <div class="client-details">
          ${company?.address ? `<div>${company.address}</div>` : ''}
          ${(company?.city || company?.state || company?.zip) ? `<div>${[company?.city, company?.state, company?.zip].filter(Boolean).join(', ')}</div>` : ''}
          ${company?.website ? `<div>${company.website.replace(/^https?:\/\//, '')}</div>` : ''}
        </div>
      </div>
    </div>
    
    ${project ? `
    <div class="section">
      <div class="section-title">Project Reference</div>
      <div style="font-weight: 500;">${project.name}</div>
    </div>
    ` : ''}
    
    <table>
      <thead>
        <tr>
          <th style="width: 60%">Time & Materials / Description</th>
          <th class="amount">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div style="font-weight: 500; margin-bottom: 4px;">Services Rendered</div>
            <div style="font-size: 12px; color: #737373;">Professional services as per agreement</div>
          </td>
          <td class="amount">${formatCurrency(invoice.subtotal)}</td>
        </tr>
        <tr>
          <td>
            <div style="font-weight: 500; margin-bottom: 4px;">Tax</div>
            <div style="font-size: 12px; color: #737373;">Applicable taxes</div>
          </td>
          <td class="amount">${formatCurrency(invoice.tax_amount)}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="totals-area">
      <div class="total-row">
        <span>Subtotal</span>
        <span>${formatCurrency(invoice.subtotal)}</span>
      </div>
      <div class="total-row">
        <span>Tax</span>
        <span>${formatCurrency(invoice.tax_amount)}</span>
      </div>
      <div class="total-row grand-total">
        <span>Total</span>
        <span>${formatCurrency(invoice.total)}</span>
      </div>
      
      ${invoice.status === 'paid' && invoice.paid_at ? `
      <div class="payment-received">
        <strong>✓ Payment Received</strong><br/>
        <span style="font-size: 11px; opacity: 0.8">${new Date(invoice.paid_at).toLocaleDateString()}</span>
      </div>
      ` : ''}
    </div>
  </div>
  
  <div class="footer">
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
    setActiveMenu(null);
  }, [clients, projects]);

  // Only block for auth loading, NOT data loading (prevents iOS resume spinner)
  if (authLoading || permLoading) {
    return <InvoicesSkeleton />;
  }

  if (!profile?.company_id) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500">Unable to load invoices. Please log in again.</p>
      </div>
    );
  }

  if (!isAdmin && !canView('invoicing')) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500 text-lg font-medium">Access Restricted</p>
        <p className="text-neutral-400 text-sm mt-2">You don't have permission to view invoices. Contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-neutral-900 uppercase">Invoicing</h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#476E66] mt-1">Manage invoices and payments</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 border border-neutral-200 bg-white text-neutral-900 rounded-sm hover:bg-neutral-50 transition-colors text-[10px] font-bold uppercase tracking-widest shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => setShowMakePaymentModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 border border-neutral-200 bg-white text-neutral-900 rounded-sm hover:bg-neutral-50 transition-colors text-[10px] font-bold uppercase tracking-widest shadow-sm"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log Payment</span>
            <span className="sm:hidden">Log</span>
          </button>
          {(isAdmin || canCreate('invoicing')) && (
          <button
            onClick={() => checkAndProceed('invoices', currentMonthInvoiceCount, () => setShowInvoiceModal(true))}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors text-[10px] font-bold uppercase tracking-widest shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Create Invoice</span>
            <span className="sm:hidden">New</span>
          </button>
          )}
        </div>
      </div>

      {/* Stats Cards - Hide on mobile when AR Aging is active */}
      <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${activeTab === 'aging' ? 'hidden sm:grid' : ''}`}>
        <div
          onClick={() => setStatusFilter('draft')}
          className="bg-white rounded-sm border border-neutral-200 p-4 cursor-pointer hover:border-[#476E66]/50 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 group-hover:text-[#476E66] transition-colors">Work-in-Progress</span>
            <Clock className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#476E66]" />
          </div>
          <p className="text-2xl font-light tracking-tight text-neutral-900">{formatCurrency(stats.wip)}</p>
          <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wide">{stats.drafts} draft invoices</p>
        </div>

        <div
          onClick={() => setStatusFilter('draft')}
          className="bg-white rounded-sm border border-neutral-200 p-4 cursor-pointer hover:border-[#476E66]/50 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 group-hover:text-[#476E66] transition-colors">Drafts</span>
            <FileText className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#476E66]" />
          </div>
          <p className="text-2xl font-light tracking-tight text-neutral-900">{formatCurrency(stats.wip)}</p>
          <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wide">{stats.drafts} invoices</p>
        </div>

        <div
          onClick={() => setActiveTab('sent')}
          className={`bg-white rounded-sm border p-4 cursor-pointer transition-all shadow-sm group ${activeTab === 'sent' ? 'border-[#476E66] ring-1 ring-[#476E66]/10' : 'border-neutral-200 hover:border-[#476E66]/50'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 group-hover:text-[#476E66] transition-colors">Sent</span>
            <Send className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#476E66]" />
          </div>
          <p className="text-2xl font-light tracking-tight text-neutral-900">{formatCurrency(stats.sentTotal)}</p>
          <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wide">{stats.sentCount} invoices</p>
        </div>

        <div
          onClick={() => setActiveTab('aging')}
          className={`bg-white rounded-sm border p-4 cursor-pointer transition-all shadow-sm group ${activeTab === 'aging' ? 'border-red-500 ring-1 ring-red-500/10' : 'border-neutral-200 hover:border-red-300'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 group-hover:text-red-600 transition-colors">A/R Aging</span>
            <AlertCircle className="w-3.5 h-3.5 text-neutral-400 group-hover:text-red-600" />
          </div>
          <p className="text-2xl font-light tracking-tight text-neutral-900">{formatCurrency(stats.arAging)}</p>
          <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wide text-red-600 font-bold">{stats.agingCount} overdue</p>
        </div>

        <div
          onClick={() => setStatusFilter('all')}
          className="bg-white rounded-sm border border-neutral-200 p-4 cursor-pointer hover:border-[#476E66]/50 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 group-hover:text-[#476E66] transition-colors">Recurring</span>
            <Repeat className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#476E66]" />
          </div>
          <p className="text-2xl font-light tracking-tight text-neutral-900">{recurringInvoices.filter(r => r.is_active).length}</p>
          <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wide">Active schedules</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-6 border-b border-neutral-200 pb-0.5 overflow-x-auto">
        <button
          onClick={() => { setActiveTab('all'); setStatusFilter('all'); }}
          className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'all' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
            }`}
        >
          All Invoices
        </button>
        <button
          onClick={() => { setActiveTab('sent'); setStatusFilter('all'); }}
          className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'sent' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
            }`}
        >
          Sent
          {stats.sentCount > 0 && <span className="bg-neutral-100 text-neutral-600 text-[9px] px-1.5 py-0.5 rounded-full">{stats.sentCount}</span>}
        </button>
        <button
          onClick={() => { setActiveTab('aging'); setStatusFilter('all'); }}
          className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'aging' ? 'border-red-600 text-red-600' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
            }`}
        >
          AR Aging
          {stats.agingCount > 0 && <span className="bg-red-50 text-red-600 text-[9px] px-1.5 py-0.5 rounded-full">{stats.agingCount}</span>}
        </button>
      </div>

      {/* AR Aging Summary - Only show when on aging tab - Ultra compact on mobile */}
      {activeTab === 'aging' && (
        <div className="bg-white rounded-sm border border-neutral-200 p-2 shadow-sm">
          <div className="flex items-center gap-1 overflow-x-auto">
            <div className="flex-1 min-w-0 p-2 bg-emerald-50/50 rounded-sm text-center border border-emerald-100">
              <p className="text-[9px] font-bold text-emerald-800 uppercase tracking-widest truncate">Current</p>
              <p className="text-sm font-bold text-emerald-700 mt-1">{formatCurrency(agingBuckets.current.amount)}</p>
              <p className="text-[10px] text-emerald-600/70">{agingBuckets.current.count}</p>
            </div>
            <div className="flex-1 min-w-0 p-2 bg-amber-50/50 rounded-sm text-center border border-amber-100">
              <p className="text-[9px] font-bold text-amber-800 uppercase tracking-widest truncate">1-30d</p>
              <p className="text-sm font-bold text-amber-700 mt-1">{formatCurrency(agingBuckets['1-30'].amount)}</p>
              <p className="text-[10px] text-amber-600/70">{agingBuckets['1-30'].count}</p>
            </div>
            <div className="flex-1 min-w-0 p-2 bg-orange-50/50 rounded-sm text-center border border-orange-100">
              <p className="text-[9px] font-bold text-orange-800 uppercase tracking-widest truncate">31-60d</p>
              <p className="text-sm font-bold text-orange-700 mt-1">{formatCurrency(agingBuckets['31-60'].amount)}</p>
              <p className="text-[10px] text-orange-600/70">{agingBuckets['31-60'].count}</p>
            </div>
            <div className="flex-1 min-w-0 p-2 bg-red-50/50 rounded-sm text-center border border-red-100">
              <p className="text-[9px] font-bold text-red-800 uppercase tracking-widest truncate">61-90d</p>
              <p className="text-sm font-bold text-red-700 mt-1">{formatCurrency(agingBuckets['61-90'].amount)}</p>
              <p className="text-[10px] text-red-600/70">{agingBuckets['61-90'].count}</p>
            </div>
            <div className="flex-1 min-w-0 p-2 bg-red-100/50 rounded-sm text-center border border-red-200">
              <p className="text-[9px] font-bold text-red-900 uppercase tracking-widest truncate">90+d</p>
              <p className="text-sm font-bold text-red-900 mt-1">{formatCurrency(agingBuckets['90+'].amount)}</p>
              <p className="text-[10px] text-red-800/70">{agingBuckets['90+'].count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white p-3 rounded-sm border border-neutral-200 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-sm border border-neutral-200 focus:border-neutral-900 focus:ring-0 outline-none text-[13px] placeholder:text-neutral-400 transition-colors bg-neutral-50 focus:bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:ring-0 outline-none text-[13px] font-medium bg-neutral-50 focus:bg-white transition-colors cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="consolidated">Consolidated</option>
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:ring-0 outline-none text-[13px] font-medium bg-neutral-50 focus:bg-white transition-colors cursor-pointer min-w-[140px]"
          title="Filter by client"
        >
          <option value="all">All Clients</option>
          {sortClientsForDisplay(clients).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-2 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:ring-0 outline-none text-[13px] bg-neutral-50 focus:bg-white transition-colors w-[130px]"
            title="From date"
            placeholder="From"
          />
          <span className="text-neutral-400 text-xs">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-2 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:ring-0 outline-none text-[13px] bg-neutral-50 focus:bg-white transition-colors w-[130px]"
            title="To date"
            placeholder="To"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-sm border border-neutral-200">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-sm transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200'}`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('client')}
            className={`p-1.5 rounded-sm transition-all ${viewMode === 'client' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200'}`}
            title="Client View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-sm border border-neutral-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-white border-b border-neutral-200">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filteredInvoices.length > 0 && selectedInvoices.size === filteredInvoices.length}
                    onChange={toggleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded-sm border-neutral-200 text-[#476E66] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
                <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Invoice</th>
                <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Client</th>
                {activeTab === 'sent' && <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden sm:table-cell">Sent To</th>}
                {activeTab !== 'sent' && <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden sm:table-cell">Project</th>}
                <th className="text-right px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Amount</th>
                {activeTab === 'aging' && <th className="text-center px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Days Overdue</th>}
                {activeTab !== 'aging' && <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden md:table-cell">Status</th>}
                <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden lg:table-cell">Views</th>
                <th className="text-left px-2 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden md:table-cell">Due Date</th>
                <th className="w-20 px-2 py-3">
                  {selectedInvoices.size > 0 && (
                    <div className="flex items-center gap-1 justify-end">
                      {selectedInvoices.size >= 2 && (
                        <button
                          onClick={handleConsolidateClick}
                          disabled={consolidating || !canConsolidate.allowed}
                          className={`p-1 rounded-sm ${canConsolidate.allowed ? 'text-[#476E66] hover:bg-[#476E66]/10' : 'text-neutral-300 cursor-not-allowed'}`}
                          title={canConsolidate.allowed ? `Consolidate ${selectedInvoices.size} invoices` : canConsolidate.reason}
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(isAdmin || canDelete('invoicing')) && (
                      <button
                        onClick={handleBatchDelete}
                        disabled={deleting}
                        className="p-1 text-red-600 hover:bg-red-50 rounded-sm"
                        title={`Delete ${selectedInvoices.size} selected`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      )}
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">No invoices found</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className={`hover:bg-neutral-50/80 transition-colors cursor-pointer group ${selectedInvoices.has(invoice.id) ? 'bg-[#476E66]/5' : ''}`} onClick={() => setViewingInvoice(invoice)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedInvoices.has(invoice.id)}
                        onChange={() => toggleInvoiceSelection(invoice.id)}
                        className="w-3.5 h-3.5 rounded-sm border-neutral-200 text-[#476E66] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-[13px] font-medium text-neutral-900 font-mono">{invoice.invoice_number}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-wide">{new Date(invoice.created_at || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </td>
                    <td className="px-2 py-3 text-[13px] font-medium text-neutral-700">{invoice.client?.name || '-'}</td>
                    {activeTab === 'sent' && (
                      <td className="px-2 py-3 text-[13px] text-neutral-500 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-neutral-400" />
                          <span className="truncate max-w-[120px]">{invoice.client?.email || '-'}</span>
                        </div>
                      </td>
                    )}
                    {activeTab !== 'sent' && <td className="px-2 py-3 text-[13px] text-neutral-500 hidden sm:table-cell">{invoice.project?.name || '-'}</td>}
                    <td className="px-2 py-3 text-right text-[13px] font-bold text-neutral-900 font-mono tracking-tight">{formatCurrency(invoice.total)}</td>
                    {activeTab === 'aging' && (
                      <td className="px-2 py-3 text-center">
                        {(() => {
                          const daysOverdue = (invoice as any).daysOverdue || 0;
                          const bgColor = daysOverdue <= 0 ? 'bg-emerald-100 text-emerald-700' :
                            daysOverdue <= 30 ? 'bg-yellow-100 text-yellow-700' :
                              daysOverdue <= 60 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
                          return (
                            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest ${bgColor}`}>
                              {daysOverdue <= 0 ? 'Current' : `${daysOverdue}d`}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {activeTab !== 'aging' && <td className="px-2 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest border ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          invoice.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            invoice.status === 'overdue' ? 'bg-red-50 text-red-700 border-red-100' :
                              'bg-neutral-100 text-neutral-600 border-neutral-200'
                          }`}>
                          {invoice.status || 'draft'}
                        </span>
                        {invoice.consolidated_from && invoice.consolidated_from.length > 0 && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-sm text-[9px] font-bold uppercase tracking-widest" title={`Combined from ${invoice.consolidated_from.length} invoices`}>
                            <Layers className="w-3 h-3" /> {invoice.consolidated_from.length}
                          </span>
                        )}
                        {recurringInvoices.some(r => r.template_invoice_id === invoice.id && r.is_active) && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] border border-[#476E66]/20 rounded-sm text-[9px] font-bold uppercase tracking-widest">
                            <Repeat className="w-3 h-3" /> Recurring
                          </span>
                        )}
                      </div>
                    </td>}
                    <td className="px-2 py-3 hidden lg:table-cell">
                      {invoice.view_count ? (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-neutral-900 capitalize">{invoice.view_count} view{invoice.view_count !== 1 ? 's' : ''}</span>
                          {invoice.last_viewed_at && (
                            <span className="text-[9px] text-neutral-400 mt-0.5 uppercase tracking-wide">
                              {new Date(invoice.last_viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(invoice.last_viewed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-neutral-300 uppercase tracking-widest font-bold">Never</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-[11px] font-medium text-neutral-500 hidden md:table-cell">
                      {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                    </td>
                    <td className="px-2 py-3 relative text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === invoice.id ? null : invoice.id); }}
                        className="p-1.5 hover:bg-neutral-100 rounded-sm text-neutral-400 hover:text-neutral-900 transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {activeMenu === invoice.id && (
                        <div ref={menuRef} className="absolute right-0 mt-1 w-52 bg-white rounded-sm shadow-lg border border-neutral-200 py-1 z-20">
                          <button onClick={(e) => { e.stopPropagation(); setViewingInvoice(invoice); setActiveMenu(null); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 tracking-wide uppercase">
                            <Eye className="w-3.5 h-3.5" /> View Invoice
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); generatePDF(invoice); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 tracking-wide uppercase">
                            <Printer className="w-3.5 h-3.5" /> Download PDF
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); duplicateInvoice(invoice); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 tracking-wide uppercase">
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </button>
                          {invoice.status === 'draft' && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); sendInvoiceEmail(invoice); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50 tracking-wide uppercase">
                                <Mail className="w-3.5 h-3.5" /> Send to Client
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); updateInvoiceStatus(invoice.id, 'sent'); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 tracking-wide uppercase">
                                <Send className="w-3.5 h-3.5" /> Mark as Sent
                              </button>
                            </>
                          )}
                          {(invoice.status === 'sent' || invoice.status === 'draft') && (
                            <button onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-[#476E66] hover:bg-[#476E66]/5 tracking-wide uppercase">
                              <CreditCard className="w-3.5 h-3.5" /> Record Payment
                            </button>
                          )}
                          <div className="border-t border-neutral-100 my-1"></div>
                          {(isAdmin || canDelete('invoicing')) && (
                          <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeleteInvoice(invoice.id); }} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 tracking-wide uppercase">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Client-Grouped View */
        <div className="space-y-4">
          {(() => {
            const grouped: Record<string, Invoice[]> = {};
            filteredInvoices.forEach(inv => {
              const clientName = inv.client?.name || 'Unassigned';
              if (!grouped[clientName]) grouped[clientName] = [];
              grouped[clientName].push(inv);
            });
            const sortedClients = Object.keys(grouped).sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));
            return sortedClients.map(clientName => {
              const clientInvoices = grouped[clientName];
              const clientTotal = clientInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
              return (
                <div key={clientName} className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
                  <div className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50 hover:bg-neutral-100 transition-colors">
                    <div className="flex items-center gap-3">
                      {expandedClients.has(clientName) && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={clientInvoices.filter(inv => inv.status === 'draft').every(inv => selectedInvoices.has(inv.id)) && clientInvoices.filter(inv => inv.status === 'draft').length > 0}
                            onChange={() => {
                              const draftInvoices = clientInvoices.filter(inv => inv.status === 'draft');
                              const allSelected = draftInvoices.every(inv => selectedInvoices.has(inv.id));
                              const newSelected = new Set(selectedInvoices);
                              if (allSelected) {
                                draftInvoices.forEach(inv => newSelected.delete(inv.id));
                              } else {
                                draftInvoices.forEach(inv => newSelected.add(inv.id));
                              }
                              setSelectedInvoices(newSelected);
                            }}
                            className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66] cursor-pointer"
                            title="Select all draft invoices for this client"
                          />
                        </div>
                      )}
                      <button onClick={() => toggleClientExpanded(clientName)} className="flex items-center gap-3">
                        {expandedClients.has(clientName) ? <ChevronDown className="w-5 h-5 text-neutral-500" /> : <ChevronRight className="w-5 h-5 text-neutral-500" />}
                        <span className="font-semibold text-neutral-900">{clientName}</span>
                        <span className="text-sm text-neutral-500">({clientInvoices.length} invoice{clientInvoices.length !== 1 ? 's' : ''})</span>
                      </button>
                    </div>
                    <span className="font-semibold text-neutral-900">{formatCurrency(clientTotal)}</span>
                  </div>
                  {expandedClients.has(clientName) && (
                    <div className="divide-y divide-neutral-100">
                      {clientInvoices.map(invoice => (
                        <div
                          key={invoice.id}
                          className={`flex items-center gap-4 px-6 py-4 hover:bg-neutral-50 cursor-pointer ${selectedInvoices.has(invoice.id) ? 'bg-[#476E66]/5' : ''}`}
                        >
                          <div onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedInvoices.has(invoice.id)}
                              onChange={() => toggleInvoiceSelection(invoice.id)}
                              className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66] cursor-pointer"
                            />
                          </div>
                          <div className="flex-1" onClick={() => setViewingInvoice(invoice)}>
                            <p className="font-medium text-neutral-900">{invoice.invoice_number}</p>
                            <p className="text-sm text-neutral-500">
                              {invoice.project?.name || 'No project'} • {new Date(invoice.created_at || '').toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2" onClick={() => setViewingInvoice(invoice)}>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                              {invoice.status || 'draft'}
                            </span>
                            {invoice.consolidated_from && invoice.consolidated_from.length > 0 && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-xs" title={`Combined from ${invoice.consolidated_from.length} invoices`}>
                                <Layers className="w-3 h-3" /> {invoice.consolidated_from.length}
                              </span>
                            )}
                          </div>
                          <span className="font-medium text-neutral-900 w-28 text-right" onClick={() => setViewingInvoice(invoice)}>{formatCurrency(invoice.total)}</span>
                          <span className="text-sm text-neutral-500 w-24" onClick={() => setViewingInvoice(invoice)}>
                            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                          </span>
                          <ChevronRight className="w-4 h-4 text-neutral-400" onClick={() => setViewingInvoice(invoice)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
          {filteredInvoices.length === 0 && (
            <div className="text-center py-12 text-neutral-500 bg-white rounded-2xl border border-neutral-100">No invoices found</div>
          )}
        </div>
      )}

      {/* Floating Action Bar when invoices selected */}
      {selectedInvoices.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedInvoices.size} invoice{selectedInvoices.size > 1 ? 's' : ''} selected</span>
          <div className="w-px h-5 bg-neutral-700" />
          {selectedInvoices.size >= 2 && (
            <button
              onClick={handleConsolidateClick}
              disabled={consolidating || !canConsolidate.allowed}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${canConsolidate.allowed
                ? 'bg-[#476E66] hover:bg-[#3d5f58] text-white'
                : 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                }`}
              title={canConsolidate.allowed ? 'Combine into single invoice' : canConsolidate.reason}
            >
              {consolidating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
              Consolidate
            </button>
          )}
          <button
            onClick={handleBatchDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-full text-sm font-medium transition-colors"
          >
            {deleting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete
          </button>
          <button
            onClick={() => setSelectedInvoices(new Set())}
            className="p-1.5 hover:bg-neutral-700 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Consolidate Confirmation Modal */}
      {showConsolidateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#476E66]/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-[#476E66]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Consolidate Invoices</h3>
                <p className="text-sm text-neutral-500">Combine {selectedInvoices.size} invoices into one</p>
              </div>
            </div>

            <div className="bg-neutral-50 rounded-xl p-4 mb-4">
              <div className="text-sm text-neutral-600 mb-2">Client</div>
              <div className="font-medium text-neutral-900 mb-3">{consolidationDetails.clientName}</div>

              <div className="text-sm text-neutral-600 mb-2">Invoices to consolidate</div>
              <div className="space-y-1 max-h-32 overflow-y-auto mb-3">
                {consolidationDetails.selected.map(inv => (
                  <div key={inv.id} className="flex justify-between text-sm">
                    <span className="text-neutral-700">{inv.invoice_number}</span>
                    <span className="text-neutral-900 font-medium">{formatCurrency(inv.total)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-neutral-200 pt-3 flex justify-between">
                <span className="font-medium text-neutral-700">Total Amount</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(consolidationDetails.totalAmount)}</span>
              </div>
            </div>

            <p className="text-sm text-neutral-500 mb-4">
              The original invoices will be marked as "consolidated" and a new draft invoice will be created with all line items combined.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConsolidateModal(false)}
                className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConsolidateConfirm}
                disabled={consolidating}
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg font-medium hover:bg-[#3d5f58] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {consolidating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Consolidating...
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    Consolidate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          clients={clients}
          projects={projects}
          companyId={profile?.company_id || ''}
          onClose={() => setShowInvoiceModal(false)}
          onSave={() => { loadData(); setShowInvoiceModal(false); }}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => { setShowPaymentModal(false); setSelectedInvoice(null); }}
          onSave={async (payment) => {
            const newAmountPaid = (selectedInvoice.amount_paid || 0) + payment.amount;
            const newStatus = newAmountPaid >= selectedInvoice.total ? 'paid' : 'sent';
            await api.updateInvoice(selectedInvoice.id, {
              amount_paid: newAmountPaid,
              status: newStatus,
              payment_date: payment.date,
              payment_method: payment.method
            });

            // Send notification for payment
            if (profile?.company_id) {
              const clientName = clients.find(c => c.id === selectedInvoice.client_id)?.name || 'Client';
              const amount = formatCurrency(payment.amount);
              if (newStatus === 'paid') {
                NotificationService.invoicePaid(profile.company_id, selectedInvoice.invoice_number, clientName, amount, selectedInvoice.id);
              } else {
                NotificationService.paymentReceived(profile.company_id, selectedInvoice.invoice_number, clientName, amount, selectedInvoice.id);
              }
            }

            loadData();
            setShowPaymentModal(false);
            setSelectedInvoice(null);
            showToast('Payment recorded successfully', 'success');
          }}
        />
      )}

      {/* Make Payment Modal */}
      {showMakePaymentModal && (
        <MakePaymentModal
          clients={clients}
          invoices={invoices}
          onClose={() => setShowMakePaymentModal(false)}
          onSave={async (payments, paymentInfo) => {
            // Apply payments to each invoice
            for (const payment of payments) {
              const invoice = invoices.find(i => i.id === payment.invoiceId);
              if (invoice) {
                const newAmountPaid = (invoice.amount_paid || 0) + payment.amount;
                const newStatus = newAmountPaid >= invoice.total ? 'paid' : invoice.status;
                await api.updateInvoice(payment.invoiceId, {
                  amount_paid: newAmountPaid,
                  status: newStatus,
                  payment_date: paymentInfo.date,
                  payment_method: paymentInfo.method
                });

                // Send notification for payment
                if (profile?.company_id) {
                  const clientName = clients.find(c => c.id === invoice.client_id)?.name || 'Client';
                  const amount = formatCurrency(payment.amount);
                  if (newStatus === 'paid') {
                    NotificationService.invoicePaid(profile.company_id, invoice.invoice_number, clientName, amount, invoice.id);
                  } else {
                    NotificationService.paymentReceived(profile.company_id, invoice.invoice_number, clientName, amount, invoice.id);
                  }
                }
              }
            }
            loadData();
            setShowMakePaymentModal(false);
            showToast('Payment recorded successfully', 'success');
          }}
        />
      )}

      {/* Invoice Detail View */}
      {viewingInvoice && (
        <InvoiceDetailView
          invoice={viewingInvoice}
          clients={clients}
          projects={projects}
          companyId={profile?.company_id || ''}
          company={company}
          onClose={() => setViewingInvoice(null)}
          onUpdate={() => { loadData(); }}
          getStatusColor={getStatusColor}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
}

function InvoiceModal({ clients, projects, companyId, onClose, onSave }: { clients: Client[]; projects: Project[]; companyId: string; onClose: () => void; onSave: () => void }) {
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  // Default due date to 30 days from today
  const getDefaultDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [calculatorType, setCalculatorType] = useState('manual');
  const [pdfTemplateId, setPdfTemplateId] = useState('');
  const [pdfTemplates, setPdfTemplates] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [enabledCalculators, setEnabledCalculators] = useState<string[]>(['manual', 'milestone', 'percentage', 'time_materials', 'fixed_fee']);
  const [saving, setSaving] = useState(false);

  // Task billing state
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Map<string, { billingType: 'milestone' | 'percentage'; percentageToBill: number }>>(new Map());
  const [loadingTasks, setLoadingTasks] = useState(false);

  // T&M billing state
  const [tmTimeEntries, setTmTimeEntries] = useState<any[]>([]);
  const [tmExpenses, setTmExpenses] = useState<any[]>([]);
  const [loadingTM, setLoadingTM] = useState(false);
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<Set<string>>(new Set());
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());

  // Recurring invoice state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');

  const CALCULATOR_OPTIONS = [
    { id: 'manual', name: 'Manual Invoice', description: 'Enter a specific dollar amount' },
    { id: 'milestone', name: 'By Milestone', description: 'Bill entire task budget' },
    { id: 'percentage', name: 'By Percentage', description: 'Bill % of task budget' },
    { id: 'time_materials', name: 'Time & Materials', description: 'Bill hours and expenses' },
    { id: 'fixed_fee', name: 'Fixed Fee', description: 'Bill based on project tasks' },
  ];

  const calculateNextRunDate = (frequency: string, fromDate: Date): Date => {
    const next = new Date(fromDate);
    switch (frequency) {
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'bi-weekly': next.setDate(next.getDate() + 14); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'quarterly': next.setMonth(next.getMonth() + 3); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      default: next.setMonth(next.getMonth() + 1);
    }
    return next;
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!mounted) return;
      await loadSettings();
    };
    load();
    return () => { mounted = false; };
  }, [companyId]);

  useEffect(() => {
    let mounted = true;
    if (projectId && (calculatorType === 'milestone' || calculatorType === 'percentage')) {
      const load = async () => {
        if (!mounted) return;
        await loadProjectTasks();
      };
      load();
    }
    return () => { mounted = false; };
  }, [projectId, calculatorType]);

  useEffect(() => {
    let mounted = true;
    if (projectId && calculatorType === 'time_materials') {
      const load = async () => {
        if (!mounted) return;
        await loadTMData();
      };
      load();
    }
    return () => { mounted = false; };
  }, [projectId, calculatorType]);

  async function loadTMData() {
    if (!projectId) return;
    setLoadingTM(true);
    try {
      // Load approved, billable time entries not yet invoiced
      const { data: timeData } = await supabase
        .from('time_entries')
        .select('*, profiles(full_name), tasks(name, total_budget, estimated_fees)')
        .eq('project_id', projectId)
        .eq('approval_status', 'approved')
        .eq('billable', true)
        .is('invoice_id', null);

      if (timeData) {
        setTmTimeEntries(timeData);
        // Auto-select all time entries
        setSelectedTimeEntries(new Set(timeData.map((t: any) => t.id)));
      }

      // Load approved, billable expenses not yet invoiced
      const { data: expenseData } = await supabase
        .from('expenses')
        .select('*')
        .eq('project_id', projectId)
        .eq('approval_status', 'approved')
        .eq('billable', true);

      if (expenseData) {
        setTmExpenses(expenseData);
        // Auto-select all expenses
        setSelectedExpenses(new Set(expenseData.map((e: any) => e.id)));
      }
    } catch (err) {
      console.error('Failed to load T&M data:', err);
    }
    setLoadingTM(false);
  }

  async function loadSettings() {
    try {
      const { data: settings } = await supabase
        .from('invoice_settings')
        .select('default_calculator, enabled_calculators')
        .eq('company_id', companyId)
        .single();

      if (settings) {
        setCalculatorType(settings.default_calculator || 'manual');
        setEnabledCalculators(settings.enabled_calculators || CALCULATOR_OPTIONS.map(c => c.id));
      }

      const { data: templates } = await supabase
        .from('invoice_pdf_templates')
        .select('id, name, is_default')
        .eq('company_id', companyId)
        .order('is_default', { ascending: false });

      if (templates && templates.length > 0) {
        setPdfTemplates(templates);
        const defaultTemplate = templates.find(t => t.is_default);
        if (defaultTemplate) {
          setPdfTemplateId(defaultTemplate.id);
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  async function loadProjectTasks() {
    if (!projectId) return;
    setLoadingTasks(true);
    try {
      const tasksData = await api.getTasksWithBilling(projectId);
      setTasks(tasksData);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
    setLoadingTasks(false);
  }

  // Calculate T&M totals
  const tmCalculation = useMemo(() => {
    const selectedTimeData = tmTimeEntries.filter(t => selectedTimeEntries.has(t.id));
    const selectedExpenseData = tmExpenses.filter(e => selectedExpenses.has(e.id));

    const timeTotal = selectedTimeData.reduce((sum, t) => sum + ((t.hours || 0) * (t.hourly_rate || 0)), 0);
    const expenseTotal = selectedExpenseData.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalHours = selectedTimeData.reduce((sum, t) => sum + (t.hours || 0), 0);

    // Calculate NTE warnings by task
    const taskBudgets = new Map<string, { name: string; budget: number; billed: number }>();
    selectedTimeData.forEach(t => {
      if (t.task_id && t.tasks) {
        const existing = taskBudgets.get(t.task_id) || {
          name: t.tasks.name,
          budget: t.tasks.total_budget || t.tasks.estimated_fees || 0,
          billed: 0
        };
        existing.billed += (t.hours || 0) * (t.hourly_rate || 0);
        taskBudgets.set(t.task_id, existing);
      }
    });

    const nteWarnings: string[] = [];
    taskBudgets.forEach((info, taskId) => {
      if (info.budget > 0 && info.billed > info.budget) {
        nteWarnings.push(`"${info.name}" exceeds budget by ${formatCurrency(info.billed - info.budget)}`);
      }
    });

    return { timeTotal, expenseTotal, totalHours, nteWarnings, taskBudgets };
  }, [tmTimeEntries, tmExpenses, selectedTimeEntries, selectedExpenses]);

  // Calculate total from selected tasks
  const calculatedSubtotal = useMemo(() => {
    if (calculatorType === 'milestone' || calculatorType === 'percentage') {
      let total = 0;
      selectedTasks.forEach((selection, taskId) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          const totalBudget = task.total_budget || task.estimated_fees || 0;
          const remainingPercentage = 100 - (task.billed_percentage || 0);

          if (selection.billingType === 'milestone') {
            // Bill remaining amount
            total += (totalBudget * remainingPercentage) / 100;
          } else {
            // Bill specified percentage
            const maxPercentage = Math.min(selection.percentageToBill, remainingPercentage);
            total += (totalBudget * maxPercentage) / 100;
          }
        }
      });
      return total;
    }
    if (calculatorType === 'time_materials') {
      return tmCalculation.timeTotal + tmCalculation.expenseTotal;
    }
    return parseFloat(subtotal) || 0;
  }, [calculatorType, selectedTasks, tasks, subtotal, tmCalculation]);

  const total = calculatedSubtotal + (parseFloat(taxAmount) || 0);

  const toggleTaskSelection = (taskId: string, billingType: 'milestone' | 'percentage') => {
    const newSelected = new Map(selectedTasks);
    if (newSelected.has(taskId) && newSelected.get(taskId)?.billingType === billingType) {
      newSelected.delete(taskId);
    } else {
      newSelected.set(taskId, { billingType, percentageToBill: billingType === 'milestone' ? 100 : 10 });
    }
    setSelectedTasks(newSelected);
  };

  const updateTaskPercentage = (taskId: string, percentage: number) => {
    const newSelected = new Map(selectedTasks);
    const existing = newSelected.get(taskId);
    if (existing) {
      newSelected.set(taskId, { ...existing, percentageToBill: percentage });
    }
    setSelectedTasks(newSelected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    // For milestone/percentage, require task selection
    if ((calculatorType === 'milestone' || calculatorType === 'percentage') && selectedTasks.size === 0) {
      alert('Please select at least one task to bill');
      return;
    }

    // Validate billing mode compatibility
    if (calculatorType === 'milestone' || calculatorType === 'percentage') {
      const incompatibleTask = tasks.find(t =>
        selectedTasks.has(t.id) &&
        (t as any).billing_mode &&
        (t as any).billing_mode !== 'unset' &&
        (t as any).billing_mode !== calculatorType
      );
      if (incompatibleTask) {
        alert(`Cannot bill: Task "${incompatibleTask.name}" is locked to ${(incompatibleTask as any).billing_mode} billing mode`);
        return;
      }
    }

    setSaving(true);
    try {
      let createdInvoice: Invoice | null = null;

      if (calculatorType === 'milestone' || calculatorType === 'percentage') {
        // Create invoice with task billing
        const taskBillings = Array.from(selectedTasks.entries()).map(([taskId, selection]) => {
          const task = tasks.find(t => t.id === taskId);
          const totalBudget = task?.total_budget || task?.estimated_fees || 0;
          const remainingPercentage = 100 - (task?.billed_percentage || 0);

          let percentageToBill: number;
          let amountToBill: number;

          if (selection.billingType === 'milestone') {
            percentageToBill = remainingPercentage;
            amountToBill = (totalBudget * remainingPercentage) / 100;
          } else {
            percentageToBill = Math.min(selection.percentageToBill, remainingPercentage);
            amountToBill = (totalBudget * percentageToBill) / 100;
          }

          return {
            taskId,
            billingType: selection.billingType,
            percentageToBill,
            amountToBill,
            totalBudget,
            previousBilledPercentage: task?.billed_percentage || 0,
            previousBilledAmount: task?.billed_amount || 0,
          };
        });

        createdInvoice = await api.createInvoiceWithTaskBilling({
          company_id: companyId,
          client_id: clientId,
          project_id: projectId || null,
          invoice_number: `INV-${Date.now().toString().slice(-6)}`,
          subtotal: calculatedSubtotal,
          tax_amount: parseFloat(taxAmount) || 0,
          total,
          due_date: dueDate || null,
          status: 'draft',
          calculator_type: calculatorType,
          pdf_template_id: pdfTemplateId || null,
        }, taskBillings);
      } else if (calculatorType === 'time_materials') {
        // T&M invoice creation - validate selection
        if (selectedTimeEntries.size === 0 && selectedExpenses.size === 0) {
          alert('Please select at least one time entry or expense to bill');
          setSaving(false);
          return;
        }

        // Create the invoice first
        createdInvoice = await api.createInvoice({
          company_id: companyId,
          client_id: clientId,
          project_id: projectId || null,
          invoice_number: `INV-${Date.now().toString().slice(-6)}`,
          subtotal: calculatedSubtotal,
          tax_amount: parseFloat(taxAmount) || 0,
          total,
          due_date: dueDate || null,
          status: 'draft',
          calculator_type: calculatorType,
          pdf_template_id: pdfTemplateId || null,
        });

        if (createdInvoice) {
          // Link time entries to invoice
          if (selectedTimeEntries.size > 0) {
            await supabase
              .from('time_entries')
              .update({ invoice_id: createdInvoice.id })
              .in('id', Array.from(selectedTimeEntries));
          }

          // Create line items for time entries (grouped by person)
          const timeByPerson = new Map<string, { name: string; hours: number; rate: number; amount: number }>();
          tmTimeEntries.filter(t => selectedTimeEntries.has(t.id)).forEach(entry => {
            const personId = entry.user_id || 'unknown';
            const personName = entry.profiles?.full_name || 'Team Member';
            const existing = timeByPerson.get(personId) || { name: personName, hours: 0, rate: entry.hourly_rate || 0, amount: 0 };
            existing.hours += entry.hours || 0;
            existing.amount += (entry.hours || 0) * (entry.hourly_rate || 0);
            timeByPerson.set(personId, existing);
          });

          const lineItems: any[] = [];
          timeByPerson.forEach((info, personId) => {
            lineItems.push({
              invoice_id: createdInvoice!.id,
              description: `${info.name} - Professional Services`,
              quantity: info.hours,
              unit_price: info.rate,
              amount: info.amount,
              item_type: 'time',
            });
          });

          // Add expense line items
          tmExpenses.filter(e => selectedExpenses.has(e.id)).forEach(expense => {
            lineItems.push({
              invoice_id: createdInvoice!.id,
              description: expense.description || expense.category || 'Expense',
              quantity: 1,
              unit_price: expense.amount,
              amount: expense.amount,
              item_type: 'expense',
            });
          });

          if (lineItems.length > 0) {
            await supabase.from('invoice_line_items').insert(lineItems);
          }
        }
      } else {
        // Standard invoice creation
        createdInvoice = await api.createInvoice({
          company_id: companyId,
          client_id: clientId,
          project_id: projectId || null,
          invoice_number: `INV-${Date.now().toString().slice(-6)}`,
          subtotal: parseFloat(subtotal),
          tax_amount: parseFloat(taxAmount) || 0,
          total,
          due_date: dueDate || null,
          status: 'draft',
          calculator_type: calculatorType,
          pdf_template_id: pdfTemplateId || null,
        });
      }

      // Create recurring invoice schedule if enabled
      if (isRecurring && createdInvoice) {
        const nextRunDate = calculateNextRunDate(recurringFrequency, new Date());
        await recurringInvoicesApi.create({
          company_id: companyId,
          client_id: clientId,
          project_id: projectId || undefined,
          template_invoice_id: createdInvoice.id,
          frequency: recurringFrequency,
          next_run_date: nextRunDate.toISOString().split('T')[0],
          is_active: true,
        });
      }

      onSave();
    } catch (error) {
      console.error('Failed to create invoice:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatCurrencyCompact = (amount: number) => {
    // Remove decimals if the amount is a whole number
    if (amount % 1 === 0) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-elevated)' }}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-neutral-100 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-neutral-900">Create Invoice</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form id="invoice-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
          {/* Calculator Type Selection */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Invoice Type</label>
            <div className="grid grid-cols-2 gap-2">
              {CALCULATOR_OPTIONS.filter(c => enabledCalculators.includes(c.id)).map((calc) => (
                <label
                  key={calc.id}
                  className={`p-2.5 border rounded-lg cursor-pointer transition-colors ${calculatorType === calc.id
                    ? 'border-[#476E66] bg-[#476E66]/5 text-[#476E66]'
                    : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  style={calculatorType !== calc.id ? { boxShadow: 'var(--shadow-sm)' } : undefined}
                >
                  <input
                    type="radio"
                    name="calculatorType"
                    value={calc.id}
                    checked={calculatorType === calc.id}
                    onChange={() => setCalculatorType(calc.id)}
                    className="sr-only"
                  />
                  <p className={`font-medium text-sm ${calculatorType === calc.id ? 'text-[#476E66]' : 'text-neutral-900'}`}>{calc.name}</p>
                  <p className={`text-xs ${calculatorType === calc.id ? 'text-[#476E66]/70' : 'text-neutral-500'}`}>{calc.description}</p>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Client *</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm" required>
              <option value="">Select a client</option>
              {sortClientsForDisplay(clients).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Project {(calculatorType === 'milestone' || calculatorType === 'percentage' || calculatorType === 'time_materials') && '*'}</label>
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setSelectedTasks(new Map()); setSelectedTimeEntries(new Set()); setSelectedExpenses(new Set()); }}
              className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
              required={calculatorType === 'milestone' || calculatorType === 'percentage' || calculatorType === 'time_materials'}
            >
              <option value="">Select a project</option>
              {projects.filter(p => p.client_id === clientId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Task Selection for Milestone/Percentage billing */}
          {(calculatorType === 'milestone' || calculatorType === 'percentage') && projectId && (
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                Select Tasks to Bill {calculatorType === 'milestone' ? '(Full Budget)' : '(By Percentage)'}
              </label>
              {loadingTasks ? (
                <div className="text-center py-4 text-neutral-500 text-sm">Loading tasks...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-4 text-neutral-500 text-sm">No tasks found for this project</div>
              ) : (() => {
                const availableTasks = tasks.filter(t => {
                  const remainingPct = 100 - (t.billed_percentage || 0);
                  const isFullyBilled = remainingPct <= 0;
                  const taskMode = (t as any).billing_mode || 'unset';
                  const isModeLocked = taskMode !== 'unset';
                  const isModeIncompatible = isModeLocked && taskMode !== calculatorType;
                  return !isFullyBilled && !isModeIncompatible;
                });
                const allFullyBilled = tasks.every(t => (100 - (t.billed_percentage || 0)) <= 0);
                return availableTasks.length === 0 ? (
                  <div className="text-center py-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-700 text-sm font-medium">
                      {allFullyBilled
                        ? '✓ All tasks have been fully billed (100%)'
                        : `Tasks are locked to a different billing mode`}
                    </p>
                    <p className="text-amber-600 text-xs mt-1">
                      {allFullyBilled
                        ? 'Create new tasks or use Manual Invoice for additional billing'
                        : `Switch to the matching billing type or use Manual Invoice`}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg overflow-hidden overflow-x-auto" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-neutral-50 border-b border-neutral-100">
                        <tr>
                          {calculatorType === 'milestone' && (
                            <th className="text-center px-1.5 py-1.5 text-xs font-medium text-neutral-600 w-8">
                              <input type="checkbox" className="w-3.5 h-3.5 rounded border-neutral-300" disabled />
                            </th>
                          )}
                          <th className="text-left px-1.5 py-1.5 text-xs font-medium text-neutral-600">Task</th>
                          <th className="text-right px-1.5 py-1.5 text-xs font-medium text-neutral-600 w-20">Budget</th>
                          <th className="text-right px-1.5 py-1.5 text-xs font-medium text-neutral-600 w-20">Billed</th>
                          <th className="text-right px-1.5 py-1.5 text-xs font-medium text-neutral-600 w-24">Remain</th>
                          {calculatorType === 'percentage' && (
                            <th className="text-center px-1.5 py-1.5 text-xs font-medium text-neutral-600 w-16">% to Bill</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {tasks.map(task => {
                          const totalBudget = task.total_budget || task.estimated_fees || 0;
                          const billedPct = task.billed_percentage || 0;
                          const remainingPct = 100 - billedPct;
                          const remainingAmt = (totalBudget * remainingPct) / 100;
                          const isSelected = selectedTasks.has(task.id);
                          const selection = selectedTasks.get(task.id);
                          const isFullyBilled = remainingPct <= 0;
                          const taskMode = (task as any).billing_mode || 'unset';
                          const isModeLocked = taskMode !== 'unset';
                          const isModeIncompatible = isModeLocked && taskMode !== calculatorType;
                          const isDisabled = isFullyBilled || isModeIncompatible;

                          return (
                            <tr
                              key={task.id}
                              className={`${isDisabled ? 'bg-neutral-50 opacity-50 cursor-not-allowed' : (calculatorType === 'milestone' ? isSelected : (selection?.percentageToBill || 0) > 0) ? 'bg-[#476E66]/5' : 'hover:bg-neutral-50/50'}`}
                              title={isFullyBilled ? 'Already fully billed (100%)' : isModeIncompatible ? `Task locked to ${taskMode} billing` : undefined}
                            >
                              {calculatorType === 'milestone' && (
                                <td className="px-1.5 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isDisabled}
                                    onChange={() => toggleTaskSelection(task.id, 'milestone')}
                                    className="w-3.5 h-3.5 text-[#476E66] rounded border-neutral-300 focus:ring-[#476E66]"
                                  />
                                </td>
                              )}
                              <td className="px-1.5 py-1.5">
                                <div className="flex items-center gap-1">
                                  <p className="text-xs font-medium text-neutral-900 leading-tight">{task.name}</p>
                                  {isModeLocked && (
                                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${taskMode === 'time' ? 'bg-blue-100 text-blue-700' :
                                      taskMode === 'percentage' ? 'bg-purple-100 text-purple-700' :
                                        'bg-amber-100 text-amber-700'
                                      }`}>
                                      {taskMode === 'time' ? 'T&M' : taskMode === 'percentage' ? '%' : 'MS'}
                                    </span>
                                  )}
                                </div>
                                {billedPct > 0 && (
                                  <p className="text-xs text-neutral-500 mt-0.5">{billedPct}% billed</p>
                                )}
                              </td>
                              <td className="px-1.5 py-1.5 text-right text-xs whitespace-nowrap">{formatCurrencyCompact(totalBudget)}</td>
                              <td className="px-1.5 py-1.5 text-right text-xs text-neutral-500 whitespace-nowrap">{formatCurrencyCompact(task.billed_amount || 0)}</td>
                              <td className="px-1.5 py-1.5 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <span className="text-xs font-medium text-neutral-900 whitespace-nowrap">{formatCurrencyCompact(remainingAmt)}</span>
                                  <span className="text-xs text-neutral-400">({remainingPct}%)</span>
                                </div>
                              </td>
                              {calculatorType === 'percentage' && (
                                <td className="px-1.5 py-1.5 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max={remainingPct}
                                    value={selection?.percentageToBill || 0}
                                    disabled={isDisabled}
                                    onChange={(e) => {
                                      const pct = Math.min(parseFloat(e.target.value) || 0, remainingPct);
                                      if (pct > 0) {
                                        setSelectedTasks(new Map(selectedTasks.set(task.id, { billingType: 'percentage', percentageToBill: pct })));
                                      } else {
                                        const newMap = new Map(selectedTasks);
                                        newMap.delete(task.id);
                                        setSelectedTasks(newMap);
                                      }
                                    }}
                                    className="w-14 h-7 px-1 py-1 border border-neutral-200 rounded text-center text-xs focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                                  />
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* T&M Time Entries and Expenses Section */}
          {calculatorType === 'time_materials' && projectId && (
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                Time Entries & Expenses to Bill
              </label>
              {loadingTM ? (
                <div className="text-center py-4 text-neutral-500 text-sm">Loading time & expenses...</div>
              ) : tmTimeEntries.length === 0 && tmExpenses.length === 0 ? (
                <div className="text-center py-4 text-neutral-500 text-sm border border-neutral-200 rounded-lg">
                  No approved billable time or expenses found for this project
                </div>
              ) : (
                <div className="space-y-3">
                  {/* NTE Warnings */}
                  {tmCalculation.nteWarnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      <p className="text-xs font-medium text-amber-800 mb-1">⚠️ Budget Exceeded (NTE Warning)</p>
                      {tmCalculation.nteWarnings.map((warning, i) => (
                        <p key={i} className="text-xs text-amber-700">{warning}</p>
                      ))}
                    </div>
                  )}

                  {/* Time Entries */}
                  {tmTimeEntries.length > 0 && (
                    <div className="border border-neutral-200 rounded-lg overflow-hidden">
                      <div className="bg-neutral-50 px-3 py-2 border-b border-neutral-200 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-neutral-900 uppercase tracking-wide mb-0.5">
                            {projects.find(p => p.id === projectId)?.name || 'Project'}
                          </p>
                          <p className="text-[10px] font-medium text-neutral-500">
                            Time Entries ({tmTimeEntries.length})
                          </p>
                        </div>
                        <span className="text-xs font-medium text-[#476E66]">{formatCurrency(tmCalculation.timeTotal)}</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white sticky top-0 z-10 shadow-sm border-b border-neutral-100">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-neutral-600 w-8">
                                <input
                                  type="checkbox"
                                  checked={selectedTimeEntries.size === tmTimeEntries.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTimeEntries(new Set(tmTimeEntries.map((t: any) => t.id)));
                                    } else {
                                      setSelectedTimeEntries(new Set());
                                    }
                                  }}
                                  className="w-3.5 h-3.5 text-[#476E66] rounded border-neutral-300 focus:ring-[#476E66]"
                                />
                              </th>
                              <th className="text-left px-2 py-2 font-medium text-neutral-600">Details</th>
                              <th className="text-right px-3 py-2 font-medium text-neutral-600">Hours</th>
                              <th className="text-right px-3 py-2 font-medium text-neutral-600">Rate</th>
                              <th className="text-right px-3 py-2 font-medium text-neutral-600">Amount</th>
                            </tr>
                          </thead>
                          {Object.entries(tmTimeEntries.reduce((acc: Record<string, any[]>, entry: any) => {
                            const taskName = entry.tasks?.name || 'General Tasks';
                            if (!acc[taskName]) acc[taskName] = [];
                            acc[taskName].push(entry);
                            return acc;
                          }, {})).map(([taskName, entries]: [string, any[]]) => (
                            <tbody key={taskName} className="border-b border-neutral-50 last:border-0">
                              <tr className="bg-neutral-50/30">
                                <td colSpan={5} className="px-3 py-1.5">
                                  <div className="flex items-center gap-2 pl-8">
                                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-300"></div>
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                                      {taskName}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              {entries.map((entry: any) => (
                                <tr key={entry.id} className="hover:bg-neutral-50 group transition-colors">
                                  <td className="px-3 py-2 align-top">
                                    <input
                                      type="checkbox"
                                      checked={selectedTimeEntries.has(entry.id)}
                                      onChange={() => {
                                        const newSet = new Set(selectedTimeEntries);
                                        if (newSet.has(entry.id)) newSet.delete(entry.id);
                                        else newSet.add(entry.id);
                                        setSelectedTimeEntries(newSet);
                                      }}
                                      className="w-3.5 h-3.5 text-[#476E66] rounded border-neutral-300 focus:ring-[#476E66] mt-0.5"
                                    />
                                  </td>
                                  <td className="px-2 py-2 align-top">
                                    <div className="font-medium text-neutral-900">{entry.profiles?.full_name || 'Unknown'}</div>
                                    <div className="text-[10px] text-neutral-500">{new Date(entry.date).toLocaleDateString()}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right align-top">{entry.hours}</td>
                                  <td className="px-3 py-2 text-right text-neutral-500 align-top">${entry.hourly_rate || 0}</td>
                                  <td className="px-3 py-2 text-right font-medium align-top">{formatCurrency((entry.hours || 0) * (entry.hourly_rate || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          ))}
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Expenses */}
                  {tmExpenses.length > 0 && (
                    <div className="border border-neutral-200 rounded-lg overflow-hidden">
                      <div className="bg-neutral-50 px-2.5 py-1.5 border-b border-neutral-200 flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-700">Expenses ({tmExpenses.length})</span>
                        <span className="text-xs font-medium text-[#476E66]">{formatCurrency(tmCalculation.expenseTotal)}</span>
                      </div>
                      <div className="max-h-28 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-neutral-50 sticky top-0">
                            <tr>
                              <th className="text-left px-2 py-1.5 font-medium text-neutral-600 w-8">
                                <input
                                  type="checkbox"
                                  checked={selectedExpenses.size === tmExpenses.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedExpenses(new Set(tmExpenses.map(ex => ex.id)));
                                    } else {
                                      setSelectedExpenses(new Set());
                                    }
                                  }}
                                  className="w-3 h-3 text-[#476E66] rounded border-neutral-300"
                                />
                              </th>
                              <th className="text-left px-2 py-1.5 font-medium text-neutral-600">Date</th>
                              <th className="text-left px-2 py-1.5 font-medium text-neutral-600">Category</th>
                              <th className="text-left px-2 py-1.5 font-medium text-neutral-600">Description</th>
                              <th className="text-right px-2 py-1.5 font-medium text-neutral-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tmExpenses.map((expense) => (
                              <tr key={expense.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                                <td className="px-2 py-1.5">
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
                                </td>
                                <td className="px-2 py-1.5 text-neutral-600">{new Date(expense.date).toLocaleDateString()}</td>
                                <td className="px-2 py-1.5">{expense.category || '-'}</td>
                                <td className="px-2 py-1.5 truncate max-w-[150px]">{expense.description || '-'}</td>
                                <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(expense.amount || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* T&M Summary */}
                  <div className="bg-neutral-50 rounded-lg p-2.5 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-neutral-600">Time ({tmCalculation.totalHours} hrs)</span>
                      <span className="font-medium">{formatCurrency(tmCalculation.timeTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600">Expenses</span>
                      <span className="font-medium">{formatCurrency(tmCalculation.expenseTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual amount input for non-task-based billing */}
          {calculatorType !== 'milestone' && calculatorType !== 'percentage' && calculatorType !== 'time_materials' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Subtotal *</label>
                <input type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Tax</label>
                <input type="number" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm" />
              </div>
            </div>
          )}

          {/* Tax for task-based or T&M billing */}
          {(calculatorType === 'milestone' || calculatorType === 'percentage' || calculatorType === 'time_materials') && (
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">Tax Amount</label>
              <input type="number" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm" />
          </div>

          {/* PDF Template Selection */}
          {pdfTemplates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">PDF Template</label>
              <select
                value={pdfTemplateId}
                onChange={(e) => setPdfTemplateId(e.target.value)}
                className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
              >
                <option value="">Use default template</option>
                {pdfTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_default ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recurring Invoice Option */}
          <div className="rounded-lg p-2.5 bg-neutral-50" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
              />
              <div className="flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-sm font-medium text-neutral-900">Make this a recurring invoice</span>
              </div>
            </label>
            {isRecurring && (
              <div className="mt-2 pl-5">
                <label className="block text-xs font-medium text-neutral-600 mb-1">Frequency</label>
                <select
                  value={recurringFrequency}
                  onChange={(e) => setRecurringFrequency(e.target.value as typeof recurringFrequency)}
                  className="w-full h-10 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  A new invoice will be automatically created based on this schedule.
                </p>
              </div>
            )}
          </div>

          <div className="p-3 bg-[#476E66] text-white rounded-lg space-y-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span>Subtotal</span>
              <span className="text-white">{formatCurrencyCompact(calculatedSubtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-white/70">
              <span>Tax</span>
              <span className="text-white">{formatCurrencyCompact(parseFloat(taxAmount) || 0)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-white/20 pt-1.5 mt-1.5">
              <span>Total</span>
              <span>{formatCurrencyCompact(total)}</span>
            </div>
          </div>
        </form>
        <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-neutral-100 flex-shrink-0 bg-neutral-50">
          <button type="button" onClick={onClose} className="flex-1 sm:flex-none px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-white transition-colors font-medium">Cancel</button>
          <button type="submit" form="invoice-form" disabled={saving} className="flex-1 sm:flex-none px-6 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Invoice Line Item type
interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  unit?: string; // 'hr', 'unit', 'ea', etc.
  billedPercentage?: number; // Percentage billed with this invoice
  priorBilledPercentage?: number; // Cumulative prior billing percentage
  taskBudget?: number; // Total task budget
  taskName?: string;
  projectName?: string;
}

// PDF Template type for detail view
interface PDFTemplateOption {
  id: string;
  name: string;
  is_default: boolean;
}

// Invoice Detail View Component - Full page view with tabs (matches Project Billing view)
function PaymentReminderSection({
  invoice,
  sentDate,
  formatCurrency
}: {
  invoice: Invoice;
  sentDate: string;
  formatCurrency: (amount: number) => string;
}) {
  const { showToast } = useToast();
  const [reminderDays, setReminderDays] = useState(45);
  const [reminderDate, setReminderDate] = useState('');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);
  const [reminderScheduled, setReminderScheduled] = useState(false);

  // Calculate default reminder date (45 days from sent date or today)
  useEffect(() => {
    const baseDate = sentDate ? new Date(sentDate) : new Date();
    const defaultReminder = new Date(baseDate);
    defaultReminder.setDate(defaultReminder.getDate() + reminderDays);
    setReminderDate(defaultReminder.toISOString().split('T')[0]);
  }, [sentDate, reminderDays]);

  const handleScheduleReminder = async () => {
    const schedClient = invoice.client;
    const schedEmail = (schedClient as any)?.billing_contact_email || (schedClient as any)?.primary_contact_email || schedClient?.email;
    if (!schedEmail) {
      showToast('Client does not have an email address', 'error');
      return;
    }
    setSchedulingReminder(true);
    try {
      // Save reminder to database
      const { error } = await supabase
        .from('invoice_reminders')
        .upsert({
          invoice_id: invoice.id,
          reminder_date: reminderDate,
          reminder_days: reminderDays,
          status: 'scheduled',
          created_at: new Date().toISOString()
        }, { onConflict: 'invoice_id' });

      if (error) throw error;

      setReminderScheduled(true);
      setShowReminderModal(false);
      showToast(`Payment reminder scheduled for ${new Date(reminderDate).toLocaleDateString()}`, 'success');
    } catch (err: any) {
      console.error('Failed to schedule reminder:', err);
      showToast(err?.message || 'Failed to schedule reminder', 'error');
    }
    setSchedulingReminder(false);
  };

  const handleSendReminderNow = async () => {
    const client = invoice.client;
    const reminderEmail = (client as any)?.billing_contact_email || (client as any)?.primary_contact_email || client?.email;
    const reminderName = (client as any)?.billing_contact_name || (client as any)?.primary_contact_name || client?.name;
    if (!reminderEmail) {
      showToast('Client does not have an email address', 'error');
      return;
    }
    setSchedulingReminder(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-payment-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          invoiceId: invoice.id,
          clientEmail: reminderEmail,
          clientName: reminderName || 'Client',
          invoiceNumber: invoice.invoice_number,
          totalAmount: formatCurrency(invoice.total),
          dueDate: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A',
          portalUrl: `${(window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost')) ? 'https://billdora.com' : window.location.origin}/invoice-view/${invoice.id}`
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('Payment reminder sent successfully', 'success');
      setShowReminderModal(false);
    } catch (err: any) {
      console.error('Failed to send reminder:', err);
      showToast(err?.message || 'Failed to send reminder', 'error');
    }
    setSchedulingReminder(false);
  };

  // Only show for sent/overdue invoices that are not paid
  if (invoice.status === 'paid' || invoice.status === 'draft') {
    return null;
  }

  return (
    <>
      <div className="bg-amber-50 rounded-xl p-4 space-y-3 border border-amber-200">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-600" />
          <label className="block text-xs font-medium text-amber-700">Payment Reminder</label>
        </div>

        <p className="text-xs text-amber-600">
          {reminderScheduled
            ? `Reminder scheduled for ${new Date(reminderDate).toLocaleDateString()}`
            : 'Set up automatic reminder if payment not received'
          }
        </p>

        <button
          onClick={() => setShowReminderModal(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium transition-colors"
        >
          <Bell className="w-4 h-4" />
          {reminderScheduled ? 'Edit Reminder' : 'Set Reminder'}
        </button>
      </div>

      {/* Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl mx-4">
            <div className="p-6 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Bell className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Payment Reminder</h3>
                    <p className="text-sm text-neutral-500">Invoice {invoice.invoice_number}</p>
                  </div>
                </div>
                <button onClick={() => setShowReminderModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-neutral-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-neutral-600">Amount Due</span>
                  <span className="font-semibold text-lg">{formatCurrency(invoice.total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-600">Client</span>
                  <span className="text-sm font-medium">{invoice.client?.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Reminder after (days from sent date)
                </label>
                <div className="flex gap-2">
                  {[30, 45, 60, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setReminderDays(days)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${reminderDays === days
                        ? 'bg-[#476E66] text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Or choose specific date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="date"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] outline-none"
                  />
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm font-medium text-blue-800 mb-2">Email Preview</p>
                <div className="text-xs text-blue-700 space-y-1">
                  <p><strong>Subject:</strong> Payment Reminder - Invoice {invoice.invoice_number}</p>
                  <p className="mt-2">Dear {invoice.client?.name},</p>
                  <p className="mt-1">This is a friendly reminder that we haven't received payment for Invoice {invoice.invoice_number} in the amount of {formatCurrency(invoice.total)}.</p>
                  <p className="mt-1">Please review the attached invoice and process payment at your earliest convenience.</p>
                  <p className="mt-1 text-blue-600">[Invoice PDF will be attached]</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex gap-3">
              <button
                onClick={handleSendReminderNow}
                disabled={schedulingReminder}
                className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send Now
              </button>
              <button
                onClick={handleScheduleReminder}
                disabled={schedulingReminder}
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3a5b54] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {schedulingReminder ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    Schedule Reminder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InvoiceDetailView({
  invoice,
  clients,
  projects,
  companyId,
  company,
  onClose,
  onUpdate,
  getStatusColor,
  formatCurrency
}: {
  invoice: Invoice;
  clients: Client[];
  projects: Project[];
  companyId: string;
  company: { company_name?: string; logo_url?: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; website?: string } | null;
  onClose: () => void;
  onUpdate: () => void;
  getStatusColor: (status?: string) => string;
  formatCurrency: (amount?: number) => string;
}) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'preview' | 'detail' | 'time' | 'expenses' | 'history'>('preview');
  const [pdfTemplates, setPdfTemplates] = useState<PDFTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(invoice.pdf_template_id || '');
  const [calculatorType, setCalculatorType] = useState(invoice.calculator_type || 'time_material');
  const [autoSave, setAutoSave] = useState(true);
  const [saving, setSaving] = useState(false);

  // Invoice details state
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number || '');
  const [poNumber, setPoNumber] = useState('');
  const [terms, setTerms] = useState('Net 30');
  const [status, setStatus] = useState(invoice.status || 'draft');
  const [acceptOnlinePayment, setAcceptOnlinePayment] = useState((invoice as any).accept_online_payment || false);
  const [draftDate] = useState(invoice.created_at ? new Date(invoice.created_at).toISOString().split('T')[0] : '');
  const [sentDate, setSentDate] = useState((invoice as any).sent_at ? new Date((invoice as any).sent_at).toISOString().split('T')[0] : '');
  const [dueDate, setDueDate] = useState(invoice.due_date ? invoice.due_date.split('T')[0] : '');
  const [notes, setNotes] = useState('');

  // Send invoice modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [emailContent, setEmailContent] = useState('');
  const [showClientPreview, setShowClientPreview] = useState(false);
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');

  // Contact selection state for send modal
  const [sendToEmail, setSendToEmail] = useState('');
  const [sendToName, setSendToName] = useState('');
  const [ccRecipients, setCcRecipients] = useState<{ email: string; name: string; enabled: boolean; label: string }[]>([]);
  const [customCcEmail, setCustomCcEmail] = useState('');

  // Initialize email content and contacts when modal opens
  useEffect(() => {
    if (showSendModal && invoice.client) {
      const client = clients.find(c => c.id === invoice.client_id) || invoice.client;
      const billingEmail = (client as any).billing_contact_email;
      const billingName = (client as any).billing_contact_name;
      const primaryEmail = (client as any).primary_contact_email;
      const primaryName = (client as any).primary_contact_name;
      const clientEmail = client.email;
      const clientName = client.name;

      // Determine primary recipient: billing contact > primary contact > client email
      if (billingEmail) {
        setSendToEmail(billingEmail);
        setSendToName(billingName || 'Billing Contact');
      } else if (primaryEmail) {
        setSendToEmail(primaryEmail);
        setSendToName(primaryName || 'Primary Contact');
      } else {
        setSendToEmail(clientEmail || '');
        setSendToName(clientName || '');
      }

      // Build CC list from available contacts (excluding whoever is the "To" recipient)
      const ccList: { email: string; name: string; enabled: boolean; label: string }[] = [];
      const toEmail = billingEmail || primaryEmail || clientEmail || '';

      if (primaryEmail && primaryEmail.toLowerCase() !== toEmail.toLowerCase()) {
        ccList.push({ email: primaryEmail, name: primaryName || 'Primary Contact', enabled: true, label: 'Primary Contact' });
      }
      if (billingEmail && billingEmail.toLowerCase() !== toEmail.toLowerCase()) {
        ccList.push({ email: billingEmail, name: billingName || 'Billing Contact', enabled: true, label: 'Billing Contact' });
      }
      if (clientEmail && clientEmail.toLowerCase() !== toEmail.toLowerCase()
        && !ccList.some(c => c.email.toLowerCase() === clientEmail.toLowerCase())) {
        ccList.push({ email: clientEmail, name: clientName || 'Company Email', enabled: false, label: 'Company Email' });
      }

      setCcRecipients(ccList);
      setCustomCcEmail('');

      const recipientName = billingName || primaryName || clientName || 'Client';
      const defaultContent = `Please find attached Invoice ${invoiceNumber} for ${invoice.project?.name || 'services rendered'}.\n\nThe total amount due is ${formatCurrency(invoice.total)}${dueDate ? ` and payment is due by ${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.\n\nThank you for your business. Please don't hesitate to reach out if you have any questions.`;
      setEmailContent(defaultContent);
    }
  }, [showSendModal, invoice, invoiceNumber, dueDate, clients]);

  // Calculate due date from sent date and terms
  useEffect(() => {
    if (sentDate && terms) {
      const sent = new Date(sentDate);
      let daysToAdd = 30;
      if (terms === 'Due on Receipt') daysToAdd = 0;
      else if (terms === 'Net 15') daysToAdd = 15;
      else if (terms === 'Net 30' || terms === '1% 10 Net 30' || terms === '2% 10 Net 30') daysToAdd = 30;
      else if (terms === 'Net 45') daysToAdd = 45;
      else if (terms === 'Net 60') daysToAdd = 60;
      sent.setDate(sent.getDate() + daysToAdd);
      setDueDate(sent.toISOString().split('T')[0]);
    }
  }, [sentDate, terms]);

  // Line items state - will be populated from tasks
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);

  // Time entries state
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [timeTotal, setTimeTotal] = useState(0);

  // Expenses state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);

  // Reminder history state
  const [reminderHistory, setReminderHistory] = useState<ReminderHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const tabs = [
    { id: 'preview', label: 'Preview' },
    { id: 'detail', label: 'Invoice Detail' },
    { id: 'time', label: `Time (${formatCurrency(timeTotal)})` },
    { id: 'expenses', label: `Expenses (${formatCurrency(expensesTotal)})` },
    { id: 'history', label: `History (${reminderHistory.length})` },
  ];

  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      if (!mounted) return;
      await Promise.all([
        loadPdfTemplates(),
        loadProjectTasks(),
        loadTimeEntries(),
        loadExpenses(),
        loadReminderHistory()
      ]);
    };
    loadAll();
    return () => { mounted = false; };
  }, [companyId, invoice.id]);

  async function loadReminderHistory() {
    setLoadingHistory(true);
    try {
      const history = await reminderHistoryApi.getHistory(companyId, invoice.id);
      setReminderHistory(history);
    } catch (error) {
      console.error('Failed to load reminder history:', error);
    }
    setLoadingHistory(false);
  }

  async function loadProjectTasks() {
    try {
      // First, try to load saved line items from invoice_line_items table
      const { data: savedLineItems } = await supabase
        .from('invoice_line_items')
        .select('id, description, quantity, unit_price, amount, billing_type, billed_percentage, task_id')
        .eq('invoice_id', invoice.id);

      if (savedLineItems && savedLineItems.length > 0) {
        // Get task details with project info
        let taskMap: Record<string, any> = {};
        const taskIds = Array.from(new Set(savedLineItems.map(i => i.task_id).filter(Boolean)));

        if (taskIds.length > 0) {
          const { data: tasks } = await supabase
            .from('tasks')
            .select('id, name, total_budget, estimated_fees, projects(name)')
            .in('id', taskIds);

          if (tasks) {
            taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
          }
        } else if (invoice.project_id) {
          const { data: tasks } = await supabase
            .from('tasks')
            .select('id, name, total_budget, estimated_fees')
            .eq('project_id', invoice.project_id);
          if (tasks) {
            taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
          }
        }

        // Get prior invoice line items (from invoices created BEFORE this one)
        const priorBilledMap: Record<string, number> = {};
        if (invoice.project_id && invoice.created_at) {
          const { data: priorLineItems } = await supabase
            .from('invoice_line_items')
            .select('task_id, billed_percentage, invoice_id, invoices!inner(created_at, project_id)')
            .eq('invoices.project_id', invoice.project_id)
            .lt('invoices.created_at', invoice.created_at)
            .not('task_id', 'is', null);

          if (priorLineItems) {
            // Sum up prior billing percentages for each task
            priorLineItems.forEach((item: any) => {
              if (item.task_id && item.billed_percentage) {
                priorBilledMap[item.task_id] = (priorBilledMap[item.task_id] || 0) + Number(item.billed_percentage);
              }
            });
          }
        }

        // Use the saved line items with correct prior billing
        const items: InvoiceLineItem[] = savedLineItems.map(item => {
          const task = item.task_id ? taskMap[item.task_id] : null;
          const taskBudget = task?.total_budget || task?.estimated_fees || item.amount;
          const itemBilledPct = item.billed_percentage || (taskBudget > 0 ? (item.amount / taskBudget) * 100 : 0);
          const priorBilledPct = item.task_id ? (priorBilledMap[item.task_id] || 0) : 0;

          return {
            id: item.id,
            description: item.description || 'Service',
            quantity: item.quantity || 1,
            rate: item.unit_price || item.amount || 0,
            amount: item.amount || 0,
            unit: 'unit', // basic fallback, usually we'd infer from rate/qty or description
            billedPercentage: Math.round(itemBilledPct),
            priorBilledPercentage: Math.round(priorBilledPct),
            taskBudget: taskBudget,
            taskName: task?.name || (item.description && item.description.includes(':') ? item.description.split(':')[1].trim() : undefined),
            projectName: task?.projects?.name || (invoice.project?.name) || (item.description && item.description.includes(':') ? item.description.split(':')[0].trim() : undefined)
          };
        });
        setLineItems(items);
        setLineItemsLoaded(true);
        return;
      }

      // Fallback: load from tasks if no saved line items (for older invoices)
      if (invoice.project_id) {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, name, estimated_fees, estimated_hours, actual_hours, billing_unit')
          .eq('project_id', invoice.project_id);

        if (tasks && tasks.length > 0) {
          const items: InvoiceLineItem[] = tasks.map(task => {
            // Use billing_unit field to determine if hour-based or unit-based
            const isHourBased = task.billing_unit !== 'unit';
            const quantity = isHourBased
              ? (task.actual_hours || task.estimated_hours || 1)
              : 1;
            const rate = isHourBased
              ? (task.estimated_fees ? (task.estimated_fees / (task.estimated_hours || 1)) : 0)
              : (task.estimated_fees || 0);
            return {
              id: task.id,
              description: task.name,
              quantity,
              rate,
              amount: task.estimated_fees || 0,
              unit: isHourBased ? 'hr' : 'unit'
            };
          });
          setLineItems(items);
        } else {
          // Fallback if no tasks
          setLineItems([{
            id: '1',
            description: invoice.project?.name ? `Services for ${invoice.project.name}` : 'Professional Services',
            quantity: 1,
            rate: invoice.subtotal || 0,
            amount: invoice.subtotal || 0
          }]);
        }
      } else {
        setLineItems([{
          id: '1',
          description: 'Professional Services',
          quantity: 1,
          rate: invoice.subtotal || 0,
          amount: invoice.subtotal || 0
        }]);
      }
      setLineItemsLoaded(true);
    } catch (err) {
      console.error('Failed to load line items:', err);
      setLineItems([{
        id: '1',
        description: invoice.project?.name ? `Services for ${invoice.project.name}` : 'Professional Services',
        quantity: 1,
        rate: invoice.subtotal || 0,
        amount: invoice.subtotal || 0
      }]);
      setLineItemsLoaded(true);
    }
  }

  async function loadPdfTemplates() {
    try {
      const { data } = await supabase
        .from('invoice_pdf_templates')
        .select('id, name, is_default')
        .eq('company_id', companyId)
        .order('is_default', { ascending: false });

      if (data) {
        setPdfTemplates(data);
        if (!selectedTemplateId && data.length > 0) {
          const defaultTemplate = data.find(t => t.is_default);
          if (defaultTemplate) setSelectedTemplateId(defaultTemplate.id);
        }
      }
    } catch (err) {
      console.error('Failed to load PDF templates:', err);
    }
  }

  async function loadTimeEntries() {
    try {
      let query = supabase
        .from('time_entries')
        .select('*, profiles(full_name), tasks(name)');

      // If invoice exists, fetch entries linked to it. Otherwise fetch by project.
      if (invoice.id) {
        query = query.eq('invoice_id', invoice.id);
      } else if (invoice.project_id) {
        query = query.eq('project_id', invoice.project_id).eq('approval_status', 'approved');
      } else {
        return;
      }

      const { data } = await query;

      if (data) {
        setTimeEntries(data);
        const total = data.reduce((sum, entry) => sum + (entry.billable_amount || 0), 0);
        setTimeTotal(total);
      }
    } catch (err) {
      console.error('Failed to load time entries:', err);
    }
  }

  async function loadExpenses() {
    if (invoice.project_id) {
      try {
        const { data } = await supabase
          .from('expenses')
          .select('*')
          .eq('project_id', invoice.project_id)
          .eq('approval_status', 'approved');

        if (data) {
          setExpenses(data);
          const total = data.reduce((sum, exp) => sum + (exp.amount || 0), 0);
          setExpensesTotal(total);
        }
      } catch (err) {
        console.error('Failed to load expenses:', err);
      }
    }
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = invoice.tax_amount || 0;
  const total = subtotal + taxAmount;
  const displayTotal = invoice.total != null && invoice.total !== undefined ? invoice.total : total;
  const displaySubtotal = invoice.subtotal != null && invoice.subtotal !== undefined ? invoice.subtotal : subtotal;

  const isConsolidated = !!(invoice.consolidated_from && invoice.consolidated_from.length > 0);
  const CONSOLIDATED_DESC_REGEX = /^\[([^\]]+)\]\s*(.*)$/;
  function groupLineItemsByProject(items: typeof lineItems): { project: string; items: { description: string; amount: number; id: string }[] }[] {
    const map = new Map<string, { description: string; amount: number; id: string }[]>();
    for (const item of items) {
      const desc = item.description || '';
      const m = desc.match(CONSOLIDATED_DESC_REGEX);
      const project = m ? m[1].trim() : 'Other';
      const taskDescription = m ? m[2].trim() : desc || 'Line item';
      if (!map.has(project)) map.set(project, []);
      map.get(project)!.push({ description: taskDescription, amount: item.amount, id: String(item.id) });
    }
    return Array.from(map.entries()).map(([project, itemList]) => ({ project, items: itemList }));
  }
  const consolidatedGroups = isConsolidated ? groupLineItemsByProject(lineItems) : [];

  const addLineItem = () => {
    setLineItems([...lineItems, {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      rate: 0,
      amount: 0
    }]);
  };

  const updateLineItem = (id: string, field: keyof InvoiceLineItem, value: any) => {
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

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      // Update invoice metadata
      await api.updateInvoice(invoice.id, {
        subtotal,
        total: subtotal + taxAmount,
        due_date: dueDate || null,
        status,
        pdf_template_id: selectedTemplateId || null,
        calculator_type: calculatorType,
        accept_online_payment: acceptOnlinePayment,
      });

      // Save line items - delete existing and insert new ones
      const { error: deleteError } = await supabase
        .from('invoice_line_items')
        .delete()
        .eq('invoice_id', invoice.id);

      if (deleteError) {
        console.error('Failed to delete old line items:', deleteError);
      }

      // Insert new line items
      if (lineItems.length > 0) {
        const itemsToInsert = lineItems.map(item => ({
          invoice_id: invoice.id,
          description: item.description || '',
          quantity: item.quantity || 1,
          unit_price: item.rate || 0,
          amount: item.amount || 0,
          task_id: (item as any).task_id || null,
          billing_type: (item as any).billing_type || null,
          billed_percentage: item.billedPercentage || null,
        }));

        const { error: insertError } = await supabase
          .from('invoice_line_items')
          .insert(itemsToInsert);

        if (insertError) {
          console.error('Failed to save line items:', insertError);
        }
      }

      onUpdate();
    } catch (err) {
      console.error('Failed to save invoice:', err);
    }
    setSaving(false);
  };

  const selectedTemplate = pdfTemplates.find(t => t.id === selectedTemplateId);

  return (
    <div className="fixed inset-0 bg-neutral-100 z-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Back to Invoices</span>
            </button>
            <div className="h-6 w-px bg-neutral-200" />
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">
                {invoice.client?.name} - Draft Date {draftDate}
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-neutral-200 px-6">
        <div className="flex items-center gap-6">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                  ? 'border-neutral-500 text-neutral-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const client = clients.find(c => c.id === invoice.client_id);
                  const project = projects.find(p => p.id === invoice.project_id);

                  // Build line items HTML
                  let lineItemsHtml = '';
                  if (calculatorType === 'milestone' || calculatorType === 'percentage') {
                    lineItemsHtml = `
                      <table>
                        <thead>
                          <tr>
                            <th style="text-align:left;">Task</th>
                            <th style="text-align:center;width:80px;">Prior</th>
                            <th style="text-align:center;width:80px;">Current</th>
                            <th style="text-align:right;width:100px;">Budget</th>
                            <th style="text-align:right;width:100px;">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${lineItems.map(item => {
                      const priorPct = item.priorBilledPercentage || 0;
                      const currPct = item.billedPercentage || 0;
                      const budget = item.taskBudget || item.amount;
                      return `<tr>
                              <td>${item.description}</td>
                              <td style="text-align:center;">${priorPct}%</td>
                              <td style="text-align:center;color:#16a34a;font-weight:600;">${currPct}%</td>
                              <td style="text-align:right;">${formatCurrency(budget)}</td>
                              <td style="text-align:right;font-weight:600;">${formatCurrency(item.amount)}</td>
                            </tr>`;
                    }).join('')}
                        </tbody>
                      </table>`;
                  } else {
                    if (invoice.consolidated_from && invoice.consolidated_from.length > 0 && consolidatedGroups.length > 0) {
                      lineItemsHtml = consolidatedGroups.map(({ project, items }) => `
                        <div style="margin-bottom: 20px;">
                          <div style="font-weight: 700; font-size: 12px; color: #333; margin-bottom: 2px; padding-bottom: 0; border-bottom: 2px solid #476E66;">${project}</div>
                          ${items.length > 1 ? `<div style="font-size: 10px; color: #666; margin-bottom: 8px;">${items.length} tasks</div>` : '<div style="margin-bottom: 8px;"></div>'}
                          <table class="section-table">
                            <thead>
                              <tr>
                                <th style="text-align:left;">Description</th>
                                <th style="text-align:right;width:100px;">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${items.map(row => `<tr>
                                <td>${row.description}</td>
                                <td style="text-align:right;font-weight:600;">${formatCurrency(row.amount)}</td>
                              </tr>`).join('')}
                            </tbody>
                            <tfoot>
                              <tr style="background: #f9f9f9;">
                                <td style="padding: 10px 10px 8px; font-size: 11px; font-weight: 600;">Subtotal</td>
                                <td style="text-align:right; padding: 10px 10px 8px; font-size: 11px; font-weight: 600;">${formatCurrency(items.reduce((s, r) => s + r.amount, 0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>`).join('');
                    } else {
                      lineItemsHtml = `
                      <table>
                        <thead>
                          <tr>
                            <th style="text-align:left;">Description</th>
                            <th style="text-align:center;width:80px;">Qty</th>
                            <th style="text-align:right;width:100px;">Rate</th>
                            <th style="text-align:right;width:100px;">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${lineItems.map(item => `<tr>
                            <td>${item.description}</td>
                            <td style="text-align:center;">${item.quantity}</td>
                            <td style="text-align:right;">${formatCurrency(item.rate)}</td>
                            <td style="text-align:right;font-weight:600;">${formatCurrency(item.amount)}</td>
                          </tr>`).join('')}
                        </tbody>
                      </table>`;
                    }
                  }

                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${invoiceNumber}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: letter; margin: 0.6in; margin-bottom: 1.1in; }
    @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9px; color: #666; font-family: 'Inter', sans-serif; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.4; padding-bottom: 80px; }
    @media print { body { padding-bottom: 0; } }
    
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .logo { width: 50px; height: 50px; background: #111; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; margin-bottom: 12px; }
    .company-info { font-size: 11px; color: #666; }
    .company-name { font-weight: 600; color: #111; font-size: 13px; margin-bottom: 2px; }
    
    .invoice-title { font-size: 28px; font-weight: 700; color: #111; text-align: right; margin-bottom: 12px; letter-spacing: -0.5px; }
    .invoice-meta { text-align: right; font-size: 11px; }
    .invoice-meta span { color: #666; margin-right: 4px; }
    .invoice-meta div { margin-bottom: 2px; }
    
    .bill-to { margin-bottom: 24px; }
    .bill-to-label { font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .bill-to-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    
    .calc-type { font-size: 13px; font-weight: 600; margin-bottom: 12px; color: #111; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f9f9f9; padding: 8px 10px; font-size: 10px; font-weight: 600; color: #666; text-transform: uppercase; border-bottom: 1px solid #ddd; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #eee; font-size: 11px; vertical-align: top; }
    table.section-table tbody tr:last-child td { border-bottom: none !important; }
    table.section-table tfoot td { border: none !important; border-bottom: none !important; }
    
    .totals { display: flex; justify-content: flex-end; margin-top: 20px; }
    .totals-box { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 11px; color: #666; }
    .totals-row.total { margin-top: 6px; padding-top: 10px; font-size: 14px; font-weight: 700; color: #111; }
    
    .print-footer { 
      position: fixed; 
      bottom: 0; 
      left: 0; 
      right: 0; 
      height: auto; 
      font-size: 9px; 
      color: #a3a3a3;
      opacity: 0.7;
      border-top: 1px solid #e5e5e5; 
      padding: 15px 0.6in;
      background: #fff; 
      display: flex; 
      align-items: center; 
      justify-content: space-between; 
      text-transform: uppercase; 
      letter-spacing: 2px;
      font-weight: 500;
      z-index: 1000;
    }
    .print-footer-left { display: flex; align-items: center; gap: 12px; }
    .footer-divider { color: #ddd; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">${(company?.company_name || 'C').charAt(0)}</div>
      <div class="company-info">
        <div class="company-name">${company?.company_name || 'Your Company'}</div>
        ${company?.address ? `<div>${company.address}</div>` : ''}
        ${(company?.city || company?.state || company?.zip) ? `<div>${[company?.city, company?.state, company?.zip].filter(Boolean).join(', ')}</div>` : ''}
        ${company?.phone ? `<div>${company.phone}</div>` : ''}
      </div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <div><span>Date:</span> ${draftDate ? new Date(draftDate).toLocaleDateString() : new Date().toLocaleDateString()}</div>
        <div><span>Number:</span> ${invoiceNumber}</div>
        <div><span>Terms:</span> ${terms}</div>
        ${project ? `<div><span>Project:</span> ${project.name}</div>` : ''}
      </div>
    </div>
  </div>
  
  <div class="bill-to">
    <div class="bill-to-label">Bill To</div>
    <div class="bill-to-name">${client?.name || 'Client'}</div>
    ${client?.address ? `<div>${client.address}</div>` : ''}
    ${(client?.city || client?.state || client?.zip) ? `<div>${[client?.city, client?.state, client?.zip].filter(Boolean).join(', ')}</div>` : ''}
    ${client?.phone ? `<div>${client.phone}</div>` : ''}
  </div>

  <div class="calc-type">${calculatorType === 'percentage' ? 'Percentage Billing' : calculatorType === 'milestone' ? 'Milestone Billing' : calculatorType === 'time_material' ? 'Time & Materials' : 'Fixed Fee'}</div>
  
  ${lineItemsHtml}
  
  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal</span><span>${formatCurrency(displaySubtotal)}</span></div>
      ${parseFloat(taxAmount as any) > 0 ? `<div class="totals-row"><span>Tax</span><span>${formatCurrency(parseFloat(taxAmount as any))}</span></div>` : ''}
      <div class="totals-row total"><span>Total</span><span>${formatCurrency(displayTotal)}</span></div>
    </div>
  </div>

  <div class="print-footer">
  </div>
</body>
</html>`);
                    printWindow.document.close();
                    setTimeout(() => { printWindow.print(); }, 300);
                  }
                }}
                className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500"
                title="Download as PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500">
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Preview Tab */}
        {activeTab === 'preview' && (
          <div className="flex-1 bg-neutral-200 p-6 overflow-auto">
            {/* Calculator Controls */}
            <div className="flex items-center gap-3 mb-6">
              <select value={calculatorType} onChange={(e) => setCalculatorType(e.target.value)} className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium">
                <option value="time_material">Time & Material</option>
                <option value="fixed_fee">Fixed Fee</option>
                <option value="milestone">Milestone</option>
                <option value="percentage">Percentage</option>
                <option value="summary">Summary Only</option>
              </select>
              <button className="px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-100 rounded-lg font-medium">Edit</button>
              <button className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50">Refresh</button>
              <button className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50">Snapshot</button>
              <button
                onClick={() => setShowClientPreview(true)}
                className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" /> Preview as Client
              </button>
              <div className="h-6 w-px bg-neutral-300 mx-1" />
              <button
                type="button"
                onClick={() => setAcceptOnlinePayment(!acceptOnlinePayment)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${acceptOnlinePayment ? 'bg-[#635BFF]/10 border-[#635BFF]/30 text-[#635BFF]' : 'bg-white border-neutral-300 text-neutral-500 hover:bg-neutral-50'}`}
                title={acceptOnlinePayment ? 'Online payment enabled - click to disable' : 'Online payment disabled - click to enable'}
              >
                <CreditCard className="w-4 h-4" />
                <span className="hidden sm:inline">Pay Online</span>
                <span className={`inline-flex items-center justify-center w-7 h-5 rounded-full text-[10px] font-bold ${acceptOnlinePayment ? 'bg-[#635BFF] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
                  {acceptOnlinePayment ? 'ON' : 'OFF'}
                </span>
              </button>
              <button
                onClick={() => setShowSendModal(true)}
                className="px-4 py-2 bg-[#476E66] text-white rounded-lg text-sm font-medium hover:bg-[#3a5b54] flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Send Invoice
              </button>
            </div>

            {/* Full-width Invoice Preview Card */}
            <div className="bg-white rounded-xl shadow-lg p-8 invoice-preview-content">
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  {company?.logo_url ? (
                    <img src={company.logo_url} alt="" className="h-16 w-auto object-contain mb-4" />
                  ) : (
                    <div className="w-16 h-16 bg-[#476E66] rounded-xl flex items-center justify-center text-white font-bold text-2xl mb-4">
                      {company?.company_name?.charAt(0) || 'C'}
                    </div>
                  )}
                  <div className="text-sm text-neutral-600">
                    <p className="font-semibold text-neutral-900 text-base">{company?.company_name || 'Your Company'}</p>
                    {company?.address && <p>{company.address}</p>}
                    {(company?.city || company?.state || company?.zip) && (
                      <p>{[company.city, company.state, company.zip].filter(Boolean).join(', ')}</p>
                    )}
                    {company?.phone && <p>{company.phone}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-3xl font-bold text-neutral-900 mb-4">INVOICE</h2>
                  <div className="text-sm space-y-1">
                    <p><span className="text-neutral-500">Invoice Date:</span> {draftDate ? new Date(draftDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                    <p><span className="text-neutral-500">Total Amount:</span> <span className="font-semibold text-lg">{formatCurrency(displayTotal)}</span></p>
                    <p><span className="text-neutral-500">Number:</span> {invoiceNumber}</p>
                    <p><span className="text-neutral-500">Terms:</span> {terms}</p>
                    {invoice.project && <p><span className="text-neutral-500">Project:</span> {invoice.project.name}</p>}
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-8">
                <p className="text-sm text-neutral-500 mb-1">Bill To:</p>
                <p className="font-semibold text-lg">{invoice.client?.name}</p>
                {invoice.client?.address && <p className="text-neutral-600">{invoice.client.address}</p>}
                {(invoice.client?.city || invoice.client?.state || invoice.client?.zip) && (
                  <p className="text-neutral-600">
                    {[invoice.client.city, invoice.client.state, invoice.client.zip].filter(Boolean).join(', ')}
                  </p>
                )}

                {invoice.client?.phone && <p className="text-neutral-600">{invoice.client.phone}</p>}
                {invoice.client?.website && <p className="text-neutral-600">{invoice.client.website}</p>}
              </div>

              {/* Search bar for line items */}
              {(lineItems.length > 3 || isConsolidated) && (
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="text"
                      value={previewSearchQuery}
                      onChange={(e) => setPreviewSearchQuery(e.target.value)}
                      placeholder="Search line items, projects, tasks..."
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-neutral-200 rounded-lg bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-[#476E66]/30 focus:border-[#476E66] outline-none transition-colors placeholder:text-neutral-400"
                    />
                    {previewSearchQuery && (
                      <button
                        onClick={() => setPreviewSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {previewSearchQuery && (
                    <p className="text-xs text-neutral-400 mt-1.5 pl-1">
                      {(() => {
                        const q = previewSearchQuery.toLowerCase();
                        const count = lineItems.filter(item =>
                          (item.description || '').toLowerCase().includes(q) ||
                          (item.taskName || '').toLowerCase().includes(q) ||
                          (item.projectName || '').toLowerCase().includes(q)
                        ).length;
                        return `${count} result${count !== 1 ? 's' : ''} found`;
                      })()}
                    </p>
                  )}
                </div>
              )}

              {/* Calculator-based Content */}
              {(() => {
                const pq = previewSearchQuery.toLowerCase().trim();

                // Helper to highlight matching text
                const hl = (text: string) => {
                  if (!pq) return text;
                  const idx = text.toLowerCase().indexOf(pq);
                  if (idx === -1) return text;
                  return (
                    <>
                      {text.slice(0, idx)}
                      <mark className="bg-yellow-200 text-neutral-900 rounded-sm px-0.5">{text.slice(idx, idx + pq.length)}</mark>
                      {text.slice(idx + pq.length)}
                    </>
                  );
                };

                // Helper: does an item match the search?
                const itemMatches = (item: any) => {
                  if (!pq) return true;
                  return (item.description || '').toLowerCase().includes(pq) ||
                    (item.taskName || '').toLowerCase().includes(pq) ||
                    (item.projectName || '').toLowerCase().includes(pq);
                };

                // Filter line items
                const filteredLineItems = pq ? lineItems.filter(itemMatches) : lineItems;

                // Filter consolidated groups
                const filteredConsolidatedGroups = pq
                  ? consolidatedGroups.map(g => ({
                      ...g,
                      items: g.project.toLowerCase().includes(pq)
                        ? g.items // show all if project name matches
                        : g.items.filter((item: any) => (item.description || '').toLowerCase().includes(pq)),
                    })).filter(g => g.items.length > 0)
                  : consolidatedGroups;

                return (
              <div className="border-t border-b border-neutral-200 py-6 mb-6">
                {calculatorType === 'summary' ? (
                  /* Summary Only - Just project name and total */
                  <div className="text-center py-8">
                    <p className="text-xl font-medium text-neutral-700 mb-2">
                      Professional Services for {invoice.project?.name || 'Project'}
                    </p>
                    <p className="text-neutral-500">Period: {draftDate ? new Date(draftDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                  </div>
                ) : calculatorType === 'milestone' || calculatorType === 'percentage' ? (
                  /* Milestone/Percentage - Show prior and current billing */
                  <>
                    <h4 className="font-semibold text-neutral-900 mb-4 text-lg">{calculatorType === 'milestone' ? 'Milestone Billing' : 'Percentage Billing'}</h4>
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-neutral-500 text-sm border-b border-neutral-200">
                          <th className="pb-3 font-medium">Task</th>
                          <th className="pb-3 font-medium text-center w-20">Prior</th>
                          <th className="pb-3 font-medium text-center w-20">Current</th>
                          <th className="pb-3 font-medium text-right w-28">Budget</th>
                          <th className="pb-3 font-medium text-right w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {filteredLineItems.map(item => {
                          const priorAmt = ((item.taskBudget || item.amount) * (item.priorBilledPercentage || 0)) / 100;
                          const currentAmt = ((item.taskBudget || item.amount) * (item.billedPercentage || 0)) / 100;
                          return (
                            <tr key={item.id}>
                              <td className="py-3">{hl(item.description)}</td>
                              <td className="py-3 text-center">
                                <div className="text-xs">
                                  <span className="inline-flex items-center justify-center w-14 h-5 bg-neutral-100 rounded font-medium text-neutral-500">
                                    {item.priorBilledPercentage || 0}%
                                  </span>
                                  <p className="text-neutral-500 mt-0.5">{formatCurrency(priorAmt)}</p>
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <div className="text-xs">
                                  <span className="inline-flex items-center justify-center w-14 h-5 bg-green-100 rounded font-medium text-green-700">
                                    {item.billedPercentage || 0}%
                                  </span>
                                  <p className="text-green-600 mt-0.5">{formatCurrency(currentAmt)}</p>
                                </div>
                              </td>
                              <td className="py-3 text-right text-neutral-500">{formatCurrency(item.taskBudget || item.amount)}</td>
                              <td className="py-3 text-right font-medium">{formatCurrency(item.amount)}</td>
                            </tr>
                          );
                        })}
                        {pq && filteredLineItems.length === 0 && (
                          <tr><td colSpan={5} className="py-6 text-center text-neutral-400 text-sm">No items match "{previewSearchQuery}"</td></tr>
                        )}
                      </tbody>
                    </table>
                    {/* Billing Summary */}
                    <div className="mt-4 pt-4 border-t border-neutral-100 bg-blue-50 rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-neutral-500 mb-1">Prior Billed</p>
                          <p className="font-medium text-neutral-700">
                            {formatCurrency(lineItems.reduce((sum, item) => sum + ((item.taskBudget || item.amount) * (item.priorBilledPercentage || 0)) / 100, 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-green-600 mb-1">This Invoice</p>
                          <p className="font-medium text-green-700">{formatCurrency(subtotal)}</p>
                        </div>
                        <div>
                          <p className="text-neutral-500 mb-1">Total After</p>
                          <p className="font-medium text-neutral-900">
                            {formatCurrency(lineItems.reduce((sum, item) => {
                              const budget = item.taskBudget || item.amount;
                              const totalPct = (item.priorBilledPercentage || 0) + (item.billedPercentage || 0);
                              return sum + (budget * totalPct) / 100;
                            }, 0))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : calculatorType === 'time_material' ? (
                  /* Time & Material - Grouped by Project, List of Tasks */
                  <>
                    <h4 className="font-semibold text-neutral-900 mb-4 text-lg">Time & Material Details</h4>

                    {(() => {
                      // Group line items by project, then filter
                      const tmGroups = Object.entries(lineItems.reduce((acc, item) => {
                        const proj = item.projectName || 'Professional Services';
                        if (!acc[proj]) acc[proj] = [];
                        acc[proj].push(item);
                        return acc;
                      }, {} as Record<string, InvoiceLineItem[]>));

                      const filteredTmGroups = pq
                        ? tmGroups.map(([projName, items]) => [
                            projName,
                            projName.toLowerCase().includes(pq)
                              ? items  // show all if project name matches
                              : items.filter(itemMatches),
                          ] as [string, InvoiceLineItem[]])
                          .filter(([, items]) => items.length > 0)
                        : tmGroups;

                      if (pq && filteredTmGroups.length === 0) {
                        return <p className="py-6 text-center text-neutral-400 text-sm">No items match "{previewSearchQuery}"</p>;
                      }

                      return filteredTmGroups.map(([projName, items]) => (
                      <div key={projName} className="mb-8 break-inside-avoid">
                        {/* Project Header */}
                        <div className="border-b-2 border-[#476E66] mb-3 pb-1">
                          <h3 className="text-lg font-bold text-[#476E66] uppercase tracking-wide">{hl(projName)}</h3>
                        </div>

                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs font-bold text-neutral-500 uppercase border-b border-neutral-200 bg-neutral-50/30">
                              <th className="text-left py-2 px-2 w-32">Task</th>
                              <th className="text-left py-2 px-2">Description</th>
                              <th className="text-center py-2 px-2 w-20">Hours</th>
                              <th className="text-right py-2 px-2 w-24">Rate</th>
                              <th className="text-right py-2 px-2 w-24">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {items.map(item => (
                              <tr key={item.id} className="hover:bg-neutral-50">
                                <td className="py-2.5 px-2 font-bold text-neutral-800 align-top">
                                  {hl(item.taskName || 'Service')}
                                </td>
                                <td className="py-2.5 px-2 text-neutral-600 align-top">
                                  {hl(item.description && item.description.includes(':')
                                    ? item.description.split(':').pop()?.trim() || ''
                                    : item.description || 'No description')}
                                </td>
                                <td className="py-2.5 px-2 text-center text-neutral-700 font-medium align-top">
                                  {item.quantity}
                                </td>
                                <td className="py-2.5 px-2 text-right text-neutral-500 align-top">
                                  {formatCurrency(item.rate)}
                                </td>
                                <td className="py-2.5 px-2 text-right font-bold text-neutral-900 align-top">
                                  {formatCurrency(item.amount)}
                                </td>
                              </tr>
                            ))}
                            {/* Project Subtotal */}
                            <tr className="bg-neutral-50 font-bold border-t border-neutral-200">
                              <td colSpan={4} className="py-2 px-2 text-right text-xs uppercase text-neutral-500 tracking-wider">
                                Total {projName}
                              </td>
                              <td className="py-2 px-2 text-right text-[#476E66]">
                                {formatCurrency(items.reduce((sum, i) => sum + i.amount, 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ));
                    })()}

                    {lineItems.length === 0 && <p className="text-neutral-500 italic">No time entries found.</p>}
                  </>
                ) : (
                  /* Fixed Fee - Simple line items; when consolidated, group by project with section headers */
                  <>
                    <h4 className="font-semibold text-neutral-900 mb-4 text-lg">Fixed Fee Invoice</h4>
                    {isConsolidated && filteredConsolidatedGroups.length > 0 ? (
                      <div className="space-y-6">
                        {filteredConsolidatedGroups.map(({ project, items }) => (
                          <div key={project} className="break-inside-avoid">
                            <div className="border-b-2 border-[#476E66] mb-3 pb-1">
                              <h3 className="text-base font-bold text-[#476E66] uppercase tracking-wide">{hl(project)}</h3>
                              {items.length > 1 && (
                                <p className="text-xs text-neutral-500 mt-0.5">{items.length} tasks</p>
                              )}
                            </div>
                            <table className="w-full">
                              <thead>
                                <tr className="text-left text-neutral-500 text-sm border-b border-neutral-200">
                                  <th className="pb-2 font-medium">Description</th>
                                  <th className="pb-2 font-medium text-right w-40">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {items.map((row) => (
                                  <tr key={row.id}>
                                    <td className="py-2.5">{hl(row.description)}</td>
                                    <td className="py-2.5 text-right font-medium">{formatCurrency(row.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="border-t border-neutral-200 bg-neutral-50/50">
                                <tr>
                                  <td className="py-2.5 text-sm font-semibold text-neutral-700">Subtotal</td>
                                  <td className="py-2.5 text-right text-sm font-semibold text-neutral-900">{formatCurrency(items.reduce((s, r) => s + r.amount, 0))}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ))}
                        {pq && isConsolidated && filteredConsolidatedGroups.length === 0 && (
                          <p className="py-6 text-center text-neutral-400 text-sm">No items match "{previewSearchQuery}"</p>
                        )}
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-neutral-500 text-sm border-b border-neutral-200">
                            <th className="pb-3 font-medium">Description</th>
                            <th className="pb-3 font-medium text-right w-40">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {filteredLineItems.map(item => (
                            <tr key={item.id}>
                              <td className="py-3">{hl(item.description || 'Service')}</td>
                              <td className="py-3 text-right font-medium">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))}
                          {pq && filteredLineItems.length === 0 && (
                            <tr><td colSpan={2} className="py-6 text-center text-neutral-400 text-sm">No items match "{previewSearchQuery}"</td></tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
                );
              })()}

              {/* Totals Section */}
              <div className="flex justify-end">
                <div className="w-72">
                  <div className="flex justify-between py-2 text-neutral-600">
                    <span>Subtotal</span>
                    <span>{formatCurrency(displaySubtotal)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between py-2 text-neutral-600">
                      <span>Tax</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 text-xl font-bold border-t border-neutral-300 mt-2">
                    <span>Total</span>
                    <span>{formatCurrency(displayTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Expenses Section if billable */}
              {expenses.filter((e: any) => e.billable).length > 0 && calculatorType !== 'summary' && (
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  <h4 className="font-semibold text-neutral-900 mb-3">Billable Expenses</h4>
                  <div className="text-sm space-y-2">
                    {expenses.filter((e: any) => e.billable).map((exp: any) => (
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

        {/* Invoice Detail Tab */}
        {activeTab === 'detail' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-auto lg:overflow-hidden">
            {/* Invoice Details Sidebar - Shows first on mobile */}
            <div className="w-full lg:w-80 lg:order-2 shrink-0 bg-white lg:border-l border-neutral-200 p-3 sm:p-4 lg:overflow-auto space-y-3">

              {/* Invoice Info Card */}
              <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Invoice Info</p>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Invoice Number</label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">PO Number <span className="text-neutral-300">(Optional)</span></label>
                    <input
                      type="text"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="e.g. PO-12345"
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] outline-none placeholder:text-neutral-300"
                    />
                  </div>
                </div>
              </div>

              {/* Billing Terms Card */}
              <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Billing Terms</p>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Payment Terms</label>
                    <select
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] outline-none cursor-pointer"
                    >
                      <option value="Due on Receipt">Due on Receipt</option>
                      <option value="Net 15">Net 15</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="Net 60">Net 60</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66] outline-none"
                    />
                  </div>
                  <div className="pt-2 border-t border-neutral-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Online Payment</label>
                        <p className="text-[10px] text-neutral-400 mt-0.5">Allow client to pay online via Stripe</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={acceptOnlinePayment}
                        onClick={() => setAcceptOnlinePayment(!acceptOnlinePayment)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 ${acceptOnlinePayment ? 'bg-[#476E66]' : 'bg-neutral-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${acceptOnlinePayment ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                      </button>
                    </div>
                    {acceptOnlinePayment && (
                      <div className="mt-2 px-2 py-1.5 bg-emerald-50 rounded-md">
                        <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> "Pay Online" button will be visible to client
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Card */}
              <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Status & Timeline</p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border-0 outline-none cursor-pointer ${status === 'draft' ? 'bg-neutral-100 text-neutral-700' :
                        status === 'sent' ? 'bg-blue-50 text-blue-700' :
                          status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                            'bg-neutral-100 text-neutral-700'
                        }`}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                    </select>
                    {status !== 'draft' && (
                      <input
                        type="date"
                        value={sentDate}
                        onChange={(e) => setSentDate(e.target.value)}
                        className="w-32 px-2 py-2 border border-neutral-200 rounded-lg text-xs bg-white"
                        title="Sent Date"
                      />
                    )}
                  </div>

                  {/* Clean Timeline */}
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div className="space-y-1">
                      <div className={`w-3 h-3 rounded-full mx-auto ${draftDate ? 'bg-[#476E66]' : 'bg-neutral-200'}`} />
                      <p className="text-[10px] font-medium text-neutral-600">Draft</p>
                      <p className="text-[9px] text-neutral-400">{draftDate ? new Date(draftDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <div className={`w-3 h-3 rounded-full mx-auto ${sentDate ? 'bg-blue-500' : 'bg-neutral-200'}`} />
                      <p className="text-[10px] font-medium text-neutral-600">Sent</p>
                      <p className="text-[9px] text-neutral-400">{sentDate ? new Date(sentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <div className={`w-3 h-3 rounded-full mx-auto ${dueDate ? 'bg-amber-500' : 'bg-neutral-200'}`} />
                      <p className="text-[10px] font-medium text-neutral-600">Due</p>
                      <p className="text-[9px] text-neutral-400">{dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <div className={`w-3 h-3 rounded-full mx-auto ${status === 'paid' ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
                      <p className="text-[10px] font-medium text-neutral-600">Paid</p>
                      <p className="text-[9px] text-neutral-400">{status === 'paid' && invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Reminder Section */}
              <PaymentReminderSection
                invoice={invoice}
                sentDate={sentDate}
                formatCurrency={formatCurrency}
              />

              {/* Payment Options - hidden on mobile to save space */}
              <div className="hidden lg:block bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Payment Methods</p>
                </div>
                <div className="p-4 space-y-2">
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]" />
                    <span className="text-neutral-700">Bank Transfer</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]" />
                    <span className="text-neutral-700">Credit Card</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]" />
                    <span className="text-neutral-700">Check</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Main Content - Line Items */}
            <div className="flex-1 lg:order-1 p-3 lg:p-6 overflow-auto">
              {/* Client Info Header */}
              <div className="flex items-center justify-between mb-4 lg:mb-6">
                <div className="text-sm">
                  <a href="#" className="text-neutral-700 hover:underline font-medium">{invoice.client?.name}</a>
                  <p className="text-neutral-500 text-xs">Client</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl lg:text-3xl font-bold text-neutral-900">{formatCurrency(displayTotal)}</p>
                </div>
              </div>

              {/* Line Items - Card style on mobile */}
              <div className="space-y-2 lg:space-y-0 mb-4 lg:mb-6">
                {/* Desktop table view */}
                <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Description</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-600 uppercase w-20">Qty</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase w-28">Rate</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase w-28">Amount</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.id} className="border-b border-neutral-100">
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                              className="w-full px-2 py-1 border border-neutral-200 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-neutral-200 rounded text-center focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-neutral-200 rounded text-right focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-sm">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => removeLineItem(item.id)}
                              className="p-1 text-neutral-400 hover:text-neutral-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card view */}
                <div className="lg:hidden space-y-2">
                  {lineItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-lg border border-neutral-200 p-3">
                      <div className="flex items-start justify-between mb-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          className="flex-1 px-2 py-1 border border-neutral-200 rounded text-sm mr-2"
                          placeholder="Description"
                        />
                        <button
                          onClick={() => removeLineItem(item.id)}
                          className="p-1 text-neutral-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-neutral-500">Qty</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-neutral-200 rounded text-center text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-neutral-500">Rate</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-neutral-200 rounded text-right text-sm"
                          />
                        </div>
                        <div className="flex-1 text-right">
                          <label className="text-xs text-neutral-500">Amount</label>
                          <p className="font-medium text-sm py-1">{formatCurrency(item.amount)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={addLineItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#476E66] text-white text-sm rounded-lg hover:bg-[#3A5B54] mb-4 lg:mb-6"
              >
                <Plus className="w-4 h-4" /> Add Line Item
              </button>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-64 text-sm">
                  <div className="flex justify-between py-2 border-t border-neutral-200">
                    <span className="text-neutral-600">Subtotal</span>
                    <span className="font-medium">{formatCurrency(displaySubtotal)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-lg font-bold border-t border-neutral-300">
                    <span>Total</span>
                    <span>{formatCurrency(displayTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Time Tab */}
        {activeTab === 'time' && (
          <div className="flex-1 p-6 overflow-auto">
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="p-4 border-b border-neutral-200 flex items-center gap-3">
                <button className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50">
                  Add Time
                </button>
                <button className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50">
                  Update Rates
                </button>
                <button className="px-4 py-2 bg-neutral-1000 text-white rounded-lg text-sm font-medium hover:bg-emerald-600">
                  Recalculate Invoice Amount
                </button>
              </div>

              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Staff Member</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Notes</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Hours</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Task</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-neutral-500">
                        No time entries found for this invoice
                      </td>
                    </tr>
                  ) : (
                    timeEntries.map((entry) => (
                      <tr key={entry.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-4 py-3 text-sm">{entry.profiles?.full_name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-sm">{new Date(entry.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm">{entry.category || '-'}</td>
                        <td className="px-4 py-3 text-sm">{entry.notes || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">-</td>
                        <td className="px-4 py-3 text-sm text-right">{(entry.hours || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">{entry.task_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">-</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-neutral-50 border-t border-neutral-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-semibold">OVERALL TOTALS</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {timeEntries.reduce((sum, e) => sum + (e.hours || 0), 0).toFixed(2)}
                    </td>
                    <td></td>
                    <td className="px-4 py-3 text-right font-semibold">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="flex-1 p-3 lg:p-6 overflow-auto">
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              {/* Header with buttons */}
              <div className="p-3 lg:p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <button className="px-4 py-2 border-2 border-[#476E66] text-[#476E66] bg-transparent rounded-lg text-sm font-medium hover:bg-[#476E66]/5 transition-colors">
                  Add Expense
                </button>
                <button className="hidden sm:block px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50">
                  Recalculate Invoice Amount
                </button>
              </div>

              {/* Desktop table view */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Vendor</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Amount</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-600 uppercase">Billable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                          No expenses found for this invoice
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
                        <tr key={expense.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="px-4 py-3 text-sm">{new Date(expense.date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-sm">{expense.category || '-'}</td>
                          <td className="px-4 py-3 text-sm">{expense.description || '-'}</td>
                          <td className="px-4 py-3 text-sm">{expense.vendor || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right">{formatCurrency(expense.amount)}</td>
                          <td className="px-4 py-3 text-center">
                            {expense.billable ? <Check className="w-4 h-4 text-neutral-700 mx-auto" /> : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-semibold">TOTAL</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatCurrency(expenses.reduce((sum, e) => sum + (e.amount || 0), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="lg:hidden">
                {expenses.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-neutral-500 text-sm mb-3">No expenses found for this invoice</p>
                    <button className="px-4 py-2 bg-[#476E66] text-white rounded-lg text-sm font-medium hover:bg-[#3A5B54]">
                      Add First Expense
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="p-3 space-y-2">
                      {expenses.map((expense) => (
                        <div key={expense.id} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-medium text-sm text-neutral-900">
                                {expense.description || 'No description'}
                              </div>
                              <div className="text-xs text-neutral-500 mt-0.5">
                                {expense.category || 'Uncategorized'}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="font-semibold text-sm text-neutral-900">
                                {formatCurrency(expense.amount)}
                              </div>
                              {expense.billable && (
                                <div className="text-xs text-emerald-600 flex items-center justify-end gap-1 mt-0.5">
                                  <Check className="w-3 h-3" /> Billable
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-neutral-500">
                            <span>{new Date(expense.date).toLocaleDateString()}</span>
                            {expense.vendor && (
                              <>
                                <span>•</span>
                                <span>{expense.vendor}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mobile total */}
                    <div className="border-t border-neutral-200 bg-neutral-50 p-3 flex justify-between items-center">
                      <span className="font-semibold text-sm text-neutral-900">TOTAL</span>
                      <span className="font-bold text-base text-neutral-900">
                        {formatCurrency(expenses.reduce((sum, e) => sum + (e.amount || 0), 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex-1 p-6 overflow-auto">
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="p-4 border-b border-neutral-200">
                <h3 className="font-semibold text-neutral-900">Reminder History</h3>
                <p className="text-sm text-neutral-500 mt-1">Track all payment reminders sent for this invoice</p>
              </div>

              {loadingHistory ? (
                <div className="p-12 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full mx-auto" />
                </div>
              ) : reminderHistory.length === 0 ? (
                <div className="p-12 text-center text-neutral-500">
                  <Mail className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                  <p>No reminders have been sent for this invoice yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {reminderHistory.map((entry) => (
                    <div key={entry.id} className="p-4 hover:bg-neutral-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${entry.status === 'sent' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                            }`}>
                            {entry.status === 'sent' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900">
                              Reminder sent to {entry.recipient_email}
                            </p>
                            <p className="text-sm text-neutral-500 mt-0.5">
                              {entry.sent_at ? new Date(entry.sent_at).toLocaleString() : 'Unknown date'}
                            </p>
                            {entry.subject && (
                              <p className="text-sm text-neutral-600 mt-2">
                                <span className="font-medium">Subject:</span> {entry.subject}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${entry.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                          {entry.status === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-neutral-200 px-6 py-4 flex items-center justify-between">
        <button className="flex items-center gap-2 px-4 py-2 text-neutral-900 hover:bg-neutral-100 rounded-lg">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50">
            Cancel
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={saving}
            className="px-6 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Client Preview Modal - Shows exactly what the client will see */}
      {showClientPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
          {/* Header Bar */}
          <div className="bg-white border-b border-neutral-200 px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-[#476E66]" />
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Client Preview</h3>
                <p className="text-xs text-neutral-500">This is exactly what your client will see</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowClientPreview(false); setShowSendModal(true); }}
                className="px-4 py-2 bg-[#476E66] text-white rounded-lg text-sm font-medium hover:bg-[#3a5b54] flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Send Invoice
              </button>
              <button
                onClick={() => setShowClientPreview(false)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
          </div>

          {/* Scrollable Client View */}
          <div className="flex-1 overflow-auto bg-neutral-100 py-8 px-4">
            <div className="max-w-4xl mx-auto">
              {/* Simulated Action Bar (read-only, no functional buttons) */}
              <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-[#476E66]" />
                    <span className="font-semibold text-neutral-900">Invoice {invoiceNumber}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {status === 'paid' ? (
                      <div className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-100 text-emerald-700 font-semibold rounded-lg min-h-[44px] w-full sm:w-auto">
                        <CheckCircle className="w-5 h-5" />
                        Paid - {formatCurrency(invoice.total)}
                      </div>
                    ) : acceptOnlinePayment ? (
                      <div className="flex items-center justify-center gap-2 px-6 py-3 bg-[#635BFF] text-white font-semibold rounded-lg text-lg min-h-[44px] w-full sm:w-auto opacity-75 cursor-default">
                        <CreditCard className="w-5 h-5" />
                        Pay Online - {formatCurrency(invoice.total)}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-center gap-2 px-4 py-3 border border-neutral-300 text-neutral-700 rounded-lg min-h-[44px] w-full sm:w-auto opacity-75 cursor-default">
                      <Download className="w-4 h-4" />
                      Print / Download PDF
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Document - matching InvoiceViewPage layout */}
              <div className="bg-white rounded-xl shadow-sm p-8">
                {/* Header */}
                <div className="flex justify-between items-start mb-8">
                  <div>
                    {company?.logo_url && (
                      <img src={company.logo_url} alt="" className="h-12 w-auto object-contain mb-3" />
                    )}
                    <h2 className="text-xl font-bold text-neutral-900">{company?.company_name || 'Company'}</h2>
                    {company?.address && <p className="text-sm text-neutral-600">{company.address}</p>}
                    {(company?.city || company?.state || company?.zip) && (
                      <p className="text-sm text-neutral-600">
                        {[company.city, company.state, company.zip].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {company?.phone && <p className="text-sm text-neutral-600">{company.phone}</p>}
                  </div>
                  <div className="text-right">
                    <h1 className="text-3xl font-bold text-neutral-900 mb-1">INVOICE</h1>
                    <p className="text-neutral-500">#{invoiceNumber}</p>
                  </div>
                </div>

                {/* Invoice Dates */}
                <div className="flex justify-end mb-8">
                  <div className="text-right">
                    <p className="text-sm text-neutral-500">Invoice Date</p>
                    <p className="font-medium">{draftDate ? new Date(draftDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                    {dueDate && (
                      <>
                        <p className="text-sm text-neutral-500 mt-2">Due Date</p>
                        <p className="font-medium">{new Date(dueDate).toLocaleDateString()}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Bill To */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <p className="text-sm font-medium text-neutral-500 mb-2">BILL TO</p>
                    <p className="font-semibold text-lg text-neutral-900">{invoice.client?.name}</p>
                    {invoice.client?.address && <p className="text-neutral-600">{invoice.client.address}</p>}
                    {(invoice.client?.city || invoice.client?.state || invoice.client?.zip) && (
                      <p className="text-neutral-600">
                        {[invoice.client.city, invoice.client.state, invoice.client.zip].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {invoice.client?.phone && <p className="text-neutral-600">{invoice.client.phone}</p>}
                    {invoice.client?.website && <p className="text-neutral-600">{invoice.client.website}</p>}
                  </div>
                  {invoice.project && (
                    <div>
                      <p className="text-sm font-medium text-neutral-500 mb-2">PROJECT</p>
                      <p className="font-semibold text-neutral-900">{invoice.project.name}</p>
                    </div>
                  )}
                </div>

                {/* Line Items - grouped by project if consolidated */}
                {(() => {
                  const projectPattern = /^\[([^\]]+)\]\s*/;
                  const hasProjectGroups = lineItems.some(item => projectPattern.test(item.description || ''));

                  if (hasProjectGroups && lineItems.length > 0) {
                    const groups: { project: string; items: typeof lineItems }[] = [];
                    const groupMap: Record<string, typeof lineItems> = {};
                    for (const item of lineItems) {
                      const match = (item.description || '').match(projectPattern);
                      const project = match ? match[1] : 'Other';
                      const cleanDesc = match ? (item.description || '').replace(projectPattern, '') : item.description;
                      const cleanItem = { ...item, description: cleanDesc };
                      if (!groupMap[project]) { groupMap[project] = []; groups.push({ project, items: groupMap[project] }); }
                      groupMap[project].push(cleanItem);
                    }

                    return (
                      <div className="mb-8">
                        {groups.map(({ project, items }) => (
                          <div key={project} className="mb-6">
                            <div className="border-b-2 border-neutral-300 mb-3 pb-1">
                              <h3 className="text-base font-bold text-neutral-900 uppercase tracking-wide">{project}</h3>
                            </div>
                            <table className="w-full">
                              <thead>
                                <tr className="text-xs font-bold text-neutral-500 uppercase border-b border-neutral-200">
                                  <th className="text-left py-2 px-2">Description</th>
                                  <th className="text-right py-2 px-2 w-32">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-neutral-50">
                                    <td className="py-2.5 px-2 text-neutral-800">{item.description}</td>
                                    <td className="py-2.5 px-2 text-right font-semibold text-neutral-900">{formatCurrency(item.amount)}</td>
                                  </tr>
                                ))}
                                <tr className="bg-neutral-50 font-bold border-t border-neutral-200">
                                  <td className="py-2 px-2 text-right text-xs uppercase text-neutral-500 tracking-wider">
                                    Subtotal
                                  </td>
                                  <td className="py-2 px-2 text-right text-neutral-600">
                                    {formatCurrency(items.reduce((sum, i) => sum + (i.amount || 0), 0))}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <table className="w-full mb-8">
                      <thead>
                        <tr className="border-b-2 border-neutral-200">
                          <th className="text-left py-3 text-sm font-semibold text-neutral-600">Description</th>
                          <th className="text-right py-3 text-sm font-semibold text-neutral-600 w-32">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.length > 0 ? (
                          lineItems.map((item, idx) => (
                            <tr key={idx} className="border-b border-neutral-100">
                              <td className="py-4 text-neutral-900">{item.description}</td>
                              <td className="py-4 text-right font-medium text-neutral-900">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={2} className="py-8 text-center text-neutral-500">No line items</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  );
                })()}

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-72">
                    <div className="flex justify-between py-2">
                      <span className="text-neutral-600">Subtotal</span>
                      <span className="font-medium">{formatCurrency(invoice.subtotal || subtotal)}</span>
                    </div>
                    {(taxAmount || 0) > 0 && (
                      <div className="flex justify-between py-2">
                        <span className="text-neutral-600">Tax</span>
                        <span className="font-medium">{formatCurrency(taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-3 border-t-2 border-neutral-900">
                      <span className="text-lg font-bold">Total Due</span>
                      <span className="text-lg font-bold">{formatCurrency(invoice.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-8 pt-8 border-t border-neutral-200 text-center">
                  <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                    status === 'paid' ? 'bg-green-100 text-green-700' :
                    status === 'sent' ? 'bg-blue-100 text-blue-700' :
                    status === 'overdue' ? 'bg-red-100 text-red-700' :
                    'bg-neutral-100 text-neutral-700'
                  }`}>
                    {status?.toUpperCase() || 'DRAFT'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Invoice Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-neutral-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Send Invoice</h3>
                <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* To Recipient */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Send To</label>
                <div className="px-4 py-3 bg-[#476E66]/5 rounded-lg border border-[#476E66]/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-neutral-900">{sendToName || invoice.client?.name || 'No recipient'}</p>
                      <p className="text-sm text-neutral-500">{sendToEmail || 'No email on file'}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[#476E66] bg-[#476E66]/10 px-2 py-1 rounded">
                      {(() => {
                        const client = clients.find(c => c.id === invoice.client_id) || invoice.client;
                        const billingEmail = (client as any)?.billing_contact_email;
                        if (billingEmail && sendToEmail === billingEmail) return 'Billing';
                        const primaryEmail = (client as any)?.primary_contact_email;
                        if (primaryEmail && sendToEmail === primaryEmail) return 'Primary';
                        return 'Client';
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* CC Recipients */}
              {ccRecipients.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">CC (Copy)</label>
                  <div className="space-y-2">
                    {ccRecipients.map((cc, idx) => (
                      <label key={idx} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${cc.enabled ? 'bg-neutral-50 border-neutral-300' : 'bg-white border-neutral-200 opacity-60'}`}>
                        <input
                          type="checkbox"
                          checked={cc.enabled}
                          onChange={() => {
                            const updated = [...ccRecipients];
                            updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                            setCcRecipients(updated);
                          }}
                          className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{cc.name}</p>
                          <p className="text-xs text-neutral-500 truncate">{cc.email}</p>
                        </div>
                        <span className="text-[10px] uppercase tracking-wide font-medium text-neutral-400 flex-shrink-0">{cc.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Custom CC */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Add CC Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={customCcEmail}
                    onChange={(e) => setCustomCcEmail(e.target.value)}
                    placeholder="Enter email address..."
                    className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#476E66]/30 focus:border-[#476E66]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customCcEmail.trim() && customCcEmail.includes('@')) {
                        e.preventDefault();
                        const newEmail = customCcEmail.trim().toLowerCase();
                        if (newEmail !== sendToEmail.toLowerCase() && !ccRecipients.some(c => c.email.toLowerCase() === newEmail)) {
                          setCcRecipients([...ccRecipients, { email: newEmail, name: newEmail, enabled: true, label: 'Custom' }]);
                          setCustomCcEmail('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newEmail = customCcEmail.trim().toLowerCase();
                      if (newEmail && newEmail.includes('@') && newEmail !== sendToEmail.toLowerCase() && !ccRecipients.some(c => c.email.toLowerCase() === newEmail)) {
                        setCcRecipients([...ccRecipients, { email: newEmail, name: newEmail, enabled: true, label: 'Custom' }]);
                        setCustomCcEmail('');
                      }
                    }}
                    disabled={!customCcEmail.trim() || !customCcEmail.includes('@')}
                    className="px-3 py-2 text-sm font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Invoice Details */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Invoice Details</label>
                <div className="px-4 py-3 bg-neutral-50 rounded-lg flex justify-between items-center">
                  <span className="text-neutral-600">Invoice {invoiceNumber}</span>
                  <span className="font-semibold text-lg">{formatCurrency(invoice.total)}</span>
                </div>
              </div>

              {/* Email Message */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email Message</label>
                <textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 border border-neutral-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                  placeholder="Enter your email message..."
                />
                <p className="text-xs text-neutral-500 mt-1">You can customize this message before sending.</p>
              </div>
            </div>
            <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowSendModal(false)}
                className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!sendToEmail) {
                    alert('No recipient email address available. Please add a billing or primary contact to this client.');
                    return;
                  }
                  setSendingInvoice(true);
                  try {
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                    const enabledCc = ccRecipients.filter(c => c.enabled).map(c => ({ email: c.email, name: c.name }));
                    const res = await fetch(`${supabaseUrl}/functions/v1/send-invoice`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseAnonKey}`
                      },
                      body: JSON.stringify({
                        invoiceId: invoice.id,
                        clientEmail: sendToEmail,
                        clientName: sendToName,
                        invoiceNumber,
                        projectName: invoice.project?.name || '',
                        companyName: profile?.full_name || 'Billdora',
                        senderName: profile?.full_name || 'Billdora',
                        totalAmount: formatCurrency(invoice.total),
                        dueDate: dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
                        emailContent,
                        portalUrl: `${(window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost')) ? 'https://billdora.com' : window.location.origin}/invoice-view/${invoice.id}`,
                        ccRecipients: enabledCc
                      })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    setShowSendModal(false);
                    setStatus('sent');
                    setSentDate(new Date().toISOString().split('T')[0]);
                    onUpdate();
                    const ccMsg = enabledCc.length > 0 ? ` (CC: ${enabledCc.map(c => c.email).join(', ')})` : '';
                    alert(`Invoice sent to ${sendToEmail}${ccMsg}`);
                  } catch (error: any) {
                    console.error('Failed to send invoice:', error);
                    alert(error?.message || 'Failed to send invoice');
                  }
                  setSendingInvoice(false);
                }}
                disabled={sendingInvoice || !sendToEmail}
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3a5b54] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingInvoice ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Invoice
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}
