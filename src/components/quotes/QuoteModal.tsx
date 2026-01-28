import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Eye } from 'lucide-react';
import { Quote, Client, api } from '../../lib/api';

// Generate quote number in format: YYMMDD-XXX
function generateQuoteNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${yy}${mm}${dd}-${seq}`;
}

interface QuoteModalProps {
  quote: Quote | null;
  clients: Client[];
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}

export default function QuoteModal({ quote, clients, companyId, onClose, onSave }: QuoteModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(quote?.title || '');
  const [description, setDescription] = useState(quote?.description || '');
  const [clientId, setClientId] = useState(quote?.client_id || '');
  const [amount, setAmount] = useState(quote?.total_amount?.toString() || '');
  const [billingModel, setBillingModel] = useState(quote?.billing_model || 'fixed');
  const [validUntil, setValidUntil] = useState(quote?.valid_until?.split('T')[0] || '');
  const [status, setStatus] = useState(quote?.status || 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !clientId) return;
    setError(null);
    setSaving(true);
    try {
      const quoteData = {
        title,
        description,
        client_id: clientId,
        total_amount: parseFloat(amount) || 0,
        billing_model: billingModel,
        valid_until: validUntil || null,
        status,
      };
      if (quote) {
        await api.updateQuote(quote.id, quoteData);
      } else {
        await api.createQuote({ ...quoteData, company_id: companyId, quote_number: generateQuoteNumber() });
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save quote:', err);
      setError(err?.message || 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">{quote ? 'Edit Quote' : 'Create Quote'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Quote Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" required placeholder="e.g. Website Redesign Proposal" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Client *</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" required>
              <option value="">Select a client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none" placeholder="Scope of work, deliverables, etc." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Total Amount ($)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Billing Model</label>
              <select value={billingModel} onChange={(e) => setBillingModel(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="fixed">Fixed Price</option>
                <option value="time_and_materials">Time & Materials</option>
                <option value="retainer">Retainer</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Valid Until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} onClick={(e) => { e.preventDefault(); handleSubmit(e as any); }} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : quote ? 'Update Quote' : 'Create Quote'}
            </button>
          </div>
          {quote && (
            <button
              type="button"
              onClick={() => navigate(`/quotes/${quote.id}/document`)}
              className="w-full mt-3 px-4 py-2.5 bg-neutral-1000 text-white rounded-xl hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View Full Document
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
