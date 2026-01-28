import { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { Lead, api, leadsApi } from '../../lib/api';
import { useToast } from '../Toast';

interface ConvertToClientModalProps {
  lead: Lead;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}

export default function ConvertToClientModal({ lead, companyId, onClose, onSave }: ConvertToClientModalProps) {
  const [name, setName] = useState(lead.company_name || lead.name || '');
  const [displayName, setDisplayName] = useState(lead.name || '');
  const [email, setEmail] = useState(lead.email || '');
  const [phone, setPhone] = useState(lead.phone || '');
  
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [clientType, setClientType] = useState('');
  
  const [primaryContactName, setPrimaryContactName] = useState(lead.name || '');
  const [primaryContactTitle, setPrimaryContactTitle] = useState('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState(lead.email || '');
  const [primaryContactPhone, setPrimaryContactPhone] = useState(lead.phone || '');
  
  const [billingContactName, setBillingContactName] = useState('');
  const [billingContactTitle, setBillingContactTitle] = useState('');
  const [billingContactEmail, setBillingContactEmail] = useState('');
  const [billingContactPhone, setBillingContactPhone] = useState('');
  
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await api.createClient({
        company_id: companyId,
        name: name.trim(),
        display_name: displayName.trim() || name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zip: zip.trim() || undefined,
        country: country.trim() || undefined,
        website: website.trim() || undefined,
        type: clientType.trim().toLowerCase() === 'person' ? 'person' : 'company',
        lifecycle_stage: 'active',
        primary_contact_name: primaryContactName.trim() || undefined,
        primary_contact_title: primaryContactTitle.trim() || undefined,
        primary_contact_email: primaryContactEmail.trim() || undefined,
        primary_contact_phone: primaryContactPhone.trim() || undefined,
        billing_contact_name: billingContactName.trim() || undefined,
        billing_contact_title: billingContactTitle.trim() || undefined,
        billing_contact_email: billingContactEmail.trim() || undefined,
        billing_contact_phone: billingContactPhone.trim() || undefined,
      });
      
      await leadsApi.updateLead(lead.id, { status: 'won' });
      
      showToast('Lead converted to client successfully!', 'success');
      onSave();
    } catch (error) {
      console.error('Failed to convert lead:', error);
      showToast('Failed to convert lead', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Convert Lead to Client</h2>
            <p className="text-sm text-neutral-500">Complete the client profile to finalize conversion</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Basic Information</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Company/Client Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="Acme Corporation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="Acme Corp"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="contact@company.com"
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Website</label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="https://company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Client Type</label>
                  <input
                    type="text"
                    value={clientType}
                    onChange={(e) => setClientType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="Commercial, Residential, etc."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Address</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Street Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="New York"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="NY"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">ZIP</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="10001"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Primary Contact */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Primary Contact</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={primaryContactTitle}
                  onChange={(e) => setPrimaryContactTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="Project Manager"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="john@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={primaryContactPhone}
                  onChange={(e) => setPrimaryContactPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Billing Contact */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Billing Contact <span className="text-neutral-400 font-normal">(Optional)</span></h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={billingContactName}
                  onChange={(e) => setBillingContactName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={billingContactTitle}
                  onChange={(e) => setBillingContactTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="Accounts Payable"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={billingContactEmail}
                  onChange={(e) => setBillingContactEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="billing@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={billingContactPhone}
                  onChange={(e) => setBillingContactPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  placeholder="(555) 987-6543"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-neutral-200">
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
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Convert to Client
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
