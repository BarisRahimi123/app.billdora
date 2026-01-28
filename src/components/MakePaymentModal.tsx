import { useState, useEffect, useMemo } from 'react';
import { X, DollarSign, Calendar, Search, Check } from 'lucide-react';
import { Invoice, Client } from '../lib/api';

interface MakePaymentModalProps {
  clients: Client[];
  invoices: Invoice[];
  onClose: () => void;
  onSave: (payments: { invoiceId: string; amount: number }[], paymentInfo: { date: string; method: string; referenceNumber: string; notes: string }) => Promise<void>;
}

export default function MakePaymentModal({ clients, invoices, onClose, onSave }: MakePaymentModalProps) {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentType, setPaymentType] = useState('check');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [projectSpecific, setProjectSpecific] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [autoMatchedInvoiceId, setAutoMatchedInvoiceId] = useState<string | null>(null);

  // Get unique projects from client's invoices
  const clientProjects = useMemo(() => {
    const projectMap = new Map<string, { id: string; name: string }>();
    invoices
      .filter(inv => inv.client_id === selectedClientId && inv.project)
      .forEach(inv => {
        if (inv.project && !projectMap.has(inv.project_id!)) {
          projectMap.set(inv.project_id!, { id: inv.project_id!, name: inv.project.name || 'Unknown Project' });
        }
      });
    return Array.from(projectMap.values());
  }, [invoices, selectedClientId]);

  // Filter invoices for selected client with open balance
  const clientInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesClient = inv.client_id === selectedClientId;
      const hasOpenBalance = (inv.total - (inv.amount_paid || 0)) > 0;
      const matchesProject = !projectSpecific || !selectedProjectId || inv.project_id === selectedProjectId;
      const notPaid = inv.status !== 'paid';
      return matchesClient && hasOpenBalance && matchesProject && notPaid;
    }).sort((a, b) => new Date(a.due_date || '').getTime() - new Date(b.due_date || '').getTime());
  }, [invoices, selectedClientId, projectSpecific, selectedProjectId]);

  // Auto-match logic: when amount is entered, try to match with an invoice's open balance
  useEffect(() => {
    if (!totalAmount || !selectedClientId) {
      setAutoMatchedInvoiceId(null);
      return;
    }

    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
      setAutoMatchedInvoiceId(null);
      return;
    }

    // Find an invoice with matching open balance
    const matchingInvoice = clientInvoices.find(inv => {
      const openBalance = inv.total - (inv.amount_paid || 0);
      return Math.abs(openBalance - amount) < 0.01; // Allow small rounding differences
    });

    if (matchingInvoice) {
      setAutoMatchedInvoiceId(matchingInvoice.id);
      // Auto-fill the payment amount for this invoice
      setPaymentAmounts({ [matchingInvoice.id]: totalAmount });
    } else {
      setAutoMatchedInvoiceId(null);
    }
  }, [totalAmount, selectedClientId, clientInvoices]);

  const handlePaymentAmountChange = (invoiceId: string, value: string) => {
    setPaymentAmounts(prev => ({
      ...prev,
      [invoiceId]: value
    }));
  };

  const totalAllocated = useMemo(() => {
    return Object.values(paymentAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  }, [paymentAmounts]);

  const remainingToAllocate = (parseFloat(totalAmount) || 0) - totalAllocated;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payments = Object.entries(paymentAmounts)
      .filter(([_, amount]) => parseFloat(amount) > 0)
      .map(([invoiceId, amount]) => ({
        invoiceId,
        amount: parseFloat(amount)
      }));

    if (payments.length === 0) {
      alert('Please allocate payment to at least one invoice');
      return;
    }

    setSaving(true);
    try {
      await onSave(payments, {
        date: paymentDate,
        method: paymentType,
        referenceNumber,
        notes
      });
      onClose();
    } catch (error) {
      console.error('Failed to save payment:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-elevated)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-neutral-100 flex-shrink-0">
          <h2 className="text-sm sm:text-base font-semibold text-neutral-900">Create A New Payment</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-3 sm:px-4 py-2.5 space-y-2">
            {/* Top Row: Client, Amount, Type, Date - 4 columns on landscape */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Client</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setPaymentAmounts({});
                    setAutoMatchedInvoiceId(null);
                  }}
                  className="w-full h-9 px-2 py-1.5 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                  required
                >
                  <option value="">Select a client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Total Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full h-9 pl-6 pr-2 py-1.5 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Payment Type</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full h-9 px-2 py-1.5 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                >
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer / ACH</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full h-9 px-2 py-1.5 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                  required
                />
              </div>
            </div>

            {/* Second Row: Reference and Notes - 2 columns on landscape */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Reference Number</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full h-9 px-2 py-1.5 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                  placeholder="Check # or Reference"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Payment Notes/Memo</label>
                <div className="relative">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none resize-none h-9 text-xs"
                    placeholder="Add any notes about this payment..."
                    maxLength={500}
                  />
                  <span className="absolute bottom-1.5 right-2 text-[10px] text-neutral-400">
                    {500 - notes.length} left
                  </span>
                </div>
              </div>
            </div>

            {/* Project Specific Checkbox */}
            <div className="flex items-start gap-1.5 p-1.5 bg-neutral-50 rounded-lg" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <input
                type="checkbox"
                id="projectSpecific"
                checked={projectSpecific}
                onChange={(e) => {
                  setProjectSpecific(e.target.checked);
                  if (!e.target.checked) setSelectedProjectId('');
                }}
                className="mt-0.5 w-3 h-3 text-[#476E66] rounded border-neutral-300 focus:ring-[#476E66]"
              />
              <div className="flex-1">
                <label htmlFor="projectSpecific" className="text-[10px] font-medium text-neutral-900 cursor-pointer">
                  Project-Specific Payment
                </label>
                <p className="text-[10px] text-neutral-600 mt-0.5 leading-tight">
                  Apply to a specific project only (optional).
                </p>
                {projectSpecific && (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="mt-1 w-full h-8 px-2 py-1 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                  >
                    <option value="">All Projects</option>
                    {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Invoices Table */}
            {selectedClientId && (
              <div className="rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                <table className="w-full">
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">
                        <input type="checkbox" className="w-3 h-3 rounded border-neutral-300" disabled />
                      </th>
                      <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Invoice</th>
                      <th className="text-left px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Due Date</th>
                      <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Amount</th>
                      <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Open Balance</th>
                      <th className="text-right px-2 py-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wide">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {clientInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-4 text-center text-neutral-500 text-xs">
                          No open invoices found for this client
                        </td>
                      </tr>
                    ) : (
                      clientInvoices.map((invoice) => {
                        const openBalance = invoice.total - (invoice.amount_paid || 0);
                        const isAutoMatched = invoice.id === autoMatchedInvoiceId;
                        const paymentAmount = paymentAmounts[invoice.id] || '';
                        
                        return (
                          <tr 
                            key={invoice.id} 
                            className={`${isAutoMatched ? 'bg-[#476E66]/5' : 'hover:bg-neutral-50/50'} transition-colors`}
                          >
                            <td className="px-2 py-1.5">
                              <input 
                                type="checkbox" 
                                checked={!!paymentAmount && parseFloat(paymentAmount) > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    handlePaymentAmountChange(invoice.id, openBalance.toString());
                                  } else {
                                    handlePaymentAmountChange(invoice.id, '');
                                  }
                                }}
                                className="w-3 h-3 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-neutral-900 font-medium text-xs">
                                  {invoice.invoice_number}
                                </span>
                                {isAutoMatched && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-[#476E66] bg-[#476E66]/10 px-1 py-0.5 rounded">
                                    <Check className="w-2.5 h-2.5" /> Matched
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-[10px] text-neutral-600">
                              {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs text-neutral-600">
                              {formatCurrency(invoice.total)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs font-medium text-neutral-900">
                              {formatCurrency(openBalance)}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="relative">
                                <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-neutral-400" />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={openBalance}
                                  value={paymentAmount}
                                  onChange={(e) => handlePaymentAmountChange(invoice.id, e.target.value)}
                                  className="w-20 h-7 pl-5 pr-1.5 py-1 text-right border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-xs"
                                  placeholder="0.00"
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Allocation Summary */}
            {selectedClientId && parseFloat(totalAmount) > 0 && (
              <div className="flex justify-end">
                <div className="text-[10px] space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-600">Total Payment:</span>
                    <span className="font-semibold text-neutral-900">{formatCurrency(parseFloat(totalAmount))}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-600">Allocated:</span>
                    <span className="font-semibold text-neutral-900">{formatCurrency(totalAllocated)}</span>
                  </div>
                  <div className={`flex justify-between gap-4 pt-0.5 border-t border-neutral-200 ${Math.abs(remainingToAllocate) < 0.01 ? 'text-[#476E66]' : 'text-neutral-900'}`}>
                    <span className="font-medium">Remaining:</span>
                    <span className="font-semibold">{formatCurrency(remainingToAllocate)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-3 sm:px-4 py-2 border-t border-neutral-100 flex-shrink-0 bg-neutral-50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-white transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedClientId || totalAllocated <= 0}
              className="flex-1 sm:flex-none px-4 py-1.5 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
