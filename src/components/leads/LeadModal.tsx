import { useState } from 'react';
import { X } from 'lucide-react';
import { Lead, leadsApi } from '../../lib/api';

interface LeadModalProps {
  lead: Lead | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}

export default function LeadModal({ lead, companyId, onClose, onSave }: LeadModalProps) {
  const [name, setName] = useState(lead?.name || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [companyName, setCompanyName] = useState(lead?.company_name || '');
  const [source, setSource] = useState<string>(lead?.source || 'other');
  const [sourceDetails, setSourceDetails] = useState(lead?.source_details || '');
  const [estimatedValue, setEstimatedValue] = useState(lead?.estimated_value?.toString() || '');
  const [notes, setNotes] = useState(lead?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Contact name is required');
      return;
    }

    setSaving(true);
    setError(null);
    
    const timeoutId = setTimeout(() => {
      setSaving(false);
      setError('Request timed out. Please check your connection and try again.');
    }, 15000);
    
    try {
      const data: Partial<Lead> = {
        company_id: companyId,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company_name: companyName.trim() || null,
        source: source as Lead['source'],
        source_details: sourceDetails.trim() || null,
        estimated_value: estimatedValue ? parseFloat(estimatedValue) : null,
        notes: notes.trim() || null,
        status: 'new',
      };

      if (lead) {
        await leadsApi.updateLead(lead.id, data);
      } else {
        await leadsApi.createLead(data);
      }
      
      clearTimeout(timeoutId);
      onSave();
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Failed to save lead:', err);
      setError(err?.message || 'Failed to save lead. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{lead ? 'Edit Lead' : 'Add New Lead'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Contact Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              placeholder="John Smith"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                placeholder="john@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Company</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              placeholder="Acme Inc."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Lead Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              >
                <option value="referral">Referral</option>
                <option value="website">Website</option>
                <option value="social_media">Social Media</option>
                <option value="cold_call">Cold Call</option>
                <option value="advertisement">Advertisement</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Estimated Value</label>
              <input
                type="number"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                placeholder="5000"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Source Details</label>
            <input
              type="text"
              value={sourceDetails}
              onChange={(e) => setSourceDetails(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
              placeholder="Referred by John Doe, Saw our Google ad, etc."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none resize-none"
              placeholder="Initial contact notes, requirements, etc."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : lead ? 'Update Lead' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
