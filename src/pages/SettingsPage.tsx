import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Settings, Building2, Users, FileText, Bell, Link, Shield, Package, Plus, Edit2, Trash2, X, Upload, Camera, Mail, UserCheck, UserX, MoreVertical, Check, User, Receipt, MapPin, Calculator, FileType, Send, Tag, List, Activity, Target, GripVertical, ArrowLeft, LogOut, CreditCard, Loader2, AlertTriangle, Star, ChevronRight, Download, FolderUp, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useFeatureGating } from '../hooks/useFeatureGating';
import { useSubscription } from '../contexts/SubscriptionContext';
import { api, Service, CompanySettings, userManagementApi, Role, UserProfile, CompanyInvitation, settingsApi, Category, ExpenseCode, InvoiceTerm, FieldValue, StatusCode, CostCenter, emailTemplatesApi, EmailTemplate, collaboratorCategoryApi, CollaboratorCategory } from '../lib/api';
import { supabase } from '../lib/supabase';

const CATEGORIES = ['Scanning', 'Modeling', 'Drafting', 'GIS', 'Consulting', 'Other'];
const PRICING_TYPES = [
  { value: 'hourly', label: 'Hourly Rate', unit: 'hour' },
  { value: 'per_sqft', label: 'Per Square Foot', unit: 'sq ft' },
  { value: 'fixed', label: 'Fixed Price', unit: 'project' },
  { value: 'per_unit', label: 'Per Unit', unit: 'unit' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, signOut, loading: authLoading } = useAuth();
  const { canViewFinancials } = usePermissions();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // Company Info State
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('USA');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [defaultTaxRate, setDefaultTaxRate] = useState('8.25');
  const [defaultTerms, setDefaultTerms] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Import/Export State
  const [importingProjects, setImportingProjects] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null);
  const projectsCsvInputRef = useRef<HTMLInputElement>(null);

  const { canView, isAdmin } = usePermissions();

  const allTabs = [
    { id: 'profile', label: 'My Profile', icon: User, adminOnly: false },
    { id: 'subscription', label: 'Subscription', icon: CreditCard, adminOnly: false },
    { id: 'company', label: 'Company Info', icon: Building2, adminOnly: true },
    { id: 'users', label: 'User Management', icon: Users, adminOnly: true },
    { id: 'services', label: 'Products & Services', icon: Package, adminOnly: true },
    { id: 'codes-fields', label: 'Catalog & Fields', icon: Tag, adminOnly: true },
    { id: 'collaborators', label: 'Collaborator Categories', icon: Users, adminOnly: true },
    { id: 'staff', label: 'Staff', icon: Users, adminOnly: true },
    { id: 'templates', label: 'Templates', icon: FileText, adminOnly: true },
    { id: 'import-export', label: 'Import / Export', icon: FolderUp, adminOnly: true },
    { id: 'notifications', label: 'Notifications', icon: Bell, adminOnly: false },
    { id: 'integrations', label: 'Integrations', icon: Link, adminOnly: true },
    { id: 'security', label: 'Security', icon: Shield, adminOnly: false },
    { id: 'invoicing', label: 'Invoicing', icon: Receipt, adminOnly: true },
  ];

  // Filter tabs based on user permissions - staff can see profile, notifications, security
  const tabs = allTabs.filter(tab => !tab.adminOnly || isAdmin || canView('settings'));

  useEffect(() => {
    let mounted = true;
    if (profile?.company_id) {
      if (activeTab === 'services') {
        loadServices(mounted);
      } else if (activeTab === 'company') {
        loadCompanySettings(mounted);
      }
    }
    return () => { mounted = false; };
  }, [activeTab, profile?.company_id]);

  async function loadCompanySettings(mounted = true) {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const settings = await api.getCompanySettings(profile.company_id);
      if (mounted && settings) {
        setCompanySettings(settings);
        setCompanyName(settings.company_name || '');
        setAddress(settings.address || '');
        setCity(settings.city || '');
        setState(settings.state || '');
        setZip(settings.zip || '');
        setCountry(settings.country || 'USA');
        setPhone(settings.phone || '');
        setFax(settings.fax || '');
        setWebsite(settings.website || '');
        setEmail(settings.email || '');
        setLogoUrl(settings.logo_url || '');
        setDefaultTaxRate(settings.default_tax_rate?.toString() || '8.25');
        setDefaultTerms(settings.default_terms || '');
      }
    } catch (error) {
      console.error('Failed to load company settings:', error);
    }
    if (mounted) setLoading(false);
  }

  async function handleSaveCompanySettings(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;

    setSavingCompany(true);
    setCompanyError(null);
    setCompanySuccess(false);

    try {
      const settingsData: Partial<CompanySettings> = {
        company_id: profile.company_id,
        company_name: companyName || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        country: country || null,
        phone: phone || null,
        fax: fax || null,
        website: website || null,
        email: email || null,
        logo_url: logoUrl || null,
        default_tax_rate: defaultTaxRate ? parseFloat(defaultTaxRate) : null,
        default_terms: defaultTerms || null,
      };

      // If we have existing settings, include the id
      if (companySettings?.id) {
        settingsData.id = companySettings.id;
      }

      const saved = await api.upsertCompanySettings(settingsData);
      setCompanySettings(saved);
      setCompanySuccess(true);
    } catch (err: any) {
      console.error('Failed to save company settings:', err);
      setCompanyError(err?.message || 'Failed to save settings');
    } finally {
      setSavingCompany(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile?.company_id) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setCompanyError('Please upload an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setCompanyError('Image must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    setCompanyError(null);

    try {
      // Create a unique filename
      const ext = file.name.split('.').pop();
      const filename = `${profile.company_id}/logo-${Date.now()}.${ext}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('company-logos')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filename);

      setLogoUrl(urlData.publicUrl);
    } catch (err: any) {
      console.error('Failed to upload logo:', err);
      setCompanyError(err?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function loadServices(mounted = true) {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const data = await api.getServices(profile.company_id);
      if (mounted) setServices(data);
    } catch (error) {
      console.error('Failed to load services:', error);
    }
    if (mounted) setLoading(false);
  }

  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;
    try {
      await api.deleteService(id);
      loadServices();
    } catch (error) {
      console.error('Failed to delete service:', error);
    }
  };

  const formatRate = (service: Service) => {
    if (service.pricing_type === 'per_sqft' && service.min_rate && service.max_rate) {
      return `$${service.min_rate} - $${service.max_rate}`;
    }
    return service.base_rate ? `$${service.base_rate}` : '-';
  };

  if (authLoading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-neutral-500">Loading settings...</p>
      </div>
    );
  }

  if (!profile?.company_id) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500">Unable to load settings. Please log in again.</p>
      </div>
    );
  }

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMoreTabs, setShowMoreTabs] = useState(false);

  // Split tabs: first 6 visible, rest in dropdown (on mobile)
  const visibleTabCount = 6;
  const visibleTabs = tabs.slice(0, visibleTabCount);
  const moreTabs = tabs.slice(visibleTabCount);
  const activeTabInMore = moreTabs.some(t => t.id === activeTab);

  return (
    <div className="space-y-3">
      {/* Page Header */}
      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-lg sm:text-2xl font-bold text-neutral-900 uppercase tracking-tight">Settings</h1>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-neutral-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors whitespace-nowrap ${activeTab === tab.id
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="pt-6">

        {/* Content */}
        <div className="w-full">
          {activeTab === 'profile' && (
            <ProfileTab />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionTab />
          )}

          {activeTab === 'company' && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4">Company Information</h2>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-neutral-600 border-t-transparent rounded-full" />
                </div>
              ) : (
                <form onSubmit={handleSaveCompanySettings} className="space-y-6 max-w-3xl">
                  {companyError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
                      {companyError}
                    </div>
                  )}
                  {companySuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-medium">
                      Settings saved successfully!
                    </div>
                  )}

                  {/* Branding Section */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Branding</h3>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Company Logo</label>
                      <div className="flex items-center gap-4">
                        <div
                          className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden bg-neutral-50 cursor-pointer hover:border-[#476E66] transition-colors flex-shrink-0 group"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {logoUrl ? (
                            <img src={logoUrl} alt="Company logo" className="w-full h-full object-contain" />
                          ) : (
                            <Camera className="w-6 h-6 text-neutral-300 group-hover:text-[#476E66] transition-colors" />
                          )}
                        </div>
                        <div className="flex-1">
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            disabled={uploadingLogo}
                            className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                          </button>
                          <p className="text-[10px] text-neutral-400 mt-2 font-medium uppercase tracking-wide">PNG, JPG up to 5MB</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details Section */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100">
                    <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Contact Details</h3>

                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Company Name</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Your Company Name"
                        className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Street Address</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="123 Business St"
                        className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">City</label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="City"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">State</label>
                        <input
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          placeholder="State"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">ZIP</label>
                        <input
                          type="text"
                          value={zip}
                          onChange={(e) => setZip(e.target.value)}
                          placeholder="ZIP"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Phone</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(555) 123-4567"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Fax</label>
                        <input
                          type="tel"
                          value={fax}
                          onChange={(e) => setFax(e.target.value)}
                          placeholder="(555) 123-4568"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Website</label>
                        <input
                          type="url"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://yourcompany.com"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="info@yourcompany.com"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Defaults Section */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100">
                    <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Defaults</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Default Tax Rate (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={defaultTaxRate}
                          onChange={(e) => setDefaultTaxRate(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Default Terms & Conditions</label>
                      <textarea
                        value={defaultTerms}
                        onChange={(e) => setDefaultTerms(e.target.value)}
                        placeholder="Enter default terms and conditions..."
                        rows={4}
                        className="w-full p-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none resize-none placeholder:text-neutral-400"
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={savingCompany}
                      className="h-10 px-5 bg-[#476E66] text-white text-sm font-medium rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                    >
                      {savingCompany ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <UserManagementTab companyId={profile.company_id} currentUserId={profile?.id || ''} />
          )}

          {activeTab === 'services' && (
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Products & Services</h2>
                  <p className="text-neutral-500 text-xs">Manage your service catalog for quotes</p>
                </div>
                <button
                  onClick={() => { setEditingService(null); setShowServiceModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-xs font-bold uppercase tracking-wider shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Service</span>
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-neutral-600 border-t-transparent rounded-full" />
                </div>
              ) : services.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-neutral-200 rounded-lg bg-neutral-50/50">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-neutral-100">
                    <Package className="w-5 h-5 text-neutral-400" />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-900 mb-1 uppercase tracking-wide">No services found</h3>
                  <p className="text-neutral-500 text-xs mb-4 max-w-xs mx-auto">Get started by adding your first service to the catalog.</p>
                  <button
                    onClick={() => { setEditingService(null); setShowServiceModal(true); }}
                    className="px-4 py-2 bg-white border border-neutral-200 text-neutral-900 text-xs font-bold uppercase tracking-wide rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    Add Service
                  </button>
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Name</th>
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest hidden sm:table-cell">Category</th>
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest hidden md:table-cell">Pricing</th>
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest hidden md:table-cell">Rate</th>
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest hidden lg:table-cell">Unit</th>
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Status</th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {services.map((service) => (
                          <tr key={service.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-bold text-neutral-900 text-xs leading-tight mb-0.5">{service.name}</p>
                                {service.description && (
                                  <p className="text-[10px] text-neutral-500 truncate max-w-[200px]">{service.description}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-neutral-600 text-xs font-medium hidden sm:table-cell">{service.category || '-'}</td>
                            <td className="px-4 py-3 text-neutral-600 text-[11px] font-medium capitalize hidden md:table-cell">
                              {PRICING_TYPES.find(p => p.value === service.pricing_type)?.label || service.pricing_type}
                            </td>
                            <td className="px-4 py-3 font-mono text-neutral-900 text-xs hidden md:table-cell">{formatRate(service)}</td>
                            <td className="px-4 py-3 text-neutral-600 text-[11px] hidden lg:table-cell">{service.unit_label || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide ${service.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                                }`}>
                                {service.is_active !== false ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => { setEditingService(service); setShowServiceModal(true); }}
                                  className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteService(service.id)}
                                  className="p-1.5 text-neutral-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoicing' && (
            <InvoicingSettingsTab companyId={profile.company_id} />
          )}

          {activeTab === 'codes-fields' && (
            <CodesAndFieldsTab companyId={profile.company_id} />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsTab companyId={profile.company_id} />
          )}

          {activeTab === 'templates' && (
            <EmailTemplatesTab companyId={profile.company_id} />
          )}

          {activeTab === 'collaborators' && (
            <CollaboratorCategoriesTab companyId={profile.company_id} />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab />
          )}

          {activeTab === 'import-export' && (
            <ImportExportTab 
              companyId={profile.company_id} 
              showToast={showToast}
            />
          )}

          {activeTab !== 'profile' && activeTab !== 'subscription' && activeTab !== 'company' && activeTab !== 'services' && activeTab !== 'users' && activeTab !== 'invoicing' && activeTab !== 'codes-fields' && activeTab !== 'integrations' && activeTab !== 'templates' && activeTab !== 'collaborators' && activeTab !== 'notifications' && activeTab !== 'import-export' && (
            <div className="bg-white rounded-sm p-12 border border-neutral-200 text-center">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-[13px] font-bold text-neutral-900 uppercase tracking-wide mb-2">{tabs.find(t => t.id === activeTab)?.label}</h3>
              <p className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium">This settings section is under development</p>
            </div>
          )}
        </div>
      </div>

      {/* Service Modal */}
      {showServiceModal && (
        <ServiceModal
          service={editingService}
          companyId={profile.company_id}
          onClose={() => { setShowServiceModal(false); setEditingService(null); }}
          onSave={() => { setShowServiceModal(false); setEditingService(null); loadServices(); }}
        />
      )}
    </div>
  );
}

function ServiceModal({ service, companyId, onClose, onSave }: {
  service: Service | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(service?.name || '');
  const [description, setDescription] = useState(service?.description || '');
  const [category, setCategory] = useState(service?.category || 'Other');
  const [pricingType, setPricingType] = useState(service?.pricing_type || 'hourly');
  const [baseRate, setBaseRate] = useState(service?.base_rate?.toString() || '');
  const [minRate, setMinRate] = useState(service?.min_rate?.toString() || '');
  const [maxRate, setMaxRate] = useState(service?.max_rate?.toString() || '');
  const [unitLabel, setUnitLabel] = useState(service?.unit_label || 'hour');
  const [isActive, setIsActive] = useState(service?.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update unit label when pricing type changes
  useEffect(() => {
    const pType = PRICING_TYPES.find(p => p.value === pricingType);
    if (pType && !service) {
      setUnitLabel(pType.unit);
    }
  }, [pricingType, service]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Service name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const serviceData: Partial<Service> = {
        company_id: companyId,
        name: name.trim(),
        description: description.trim() || null,
        category,
        pricing_type: pricingType,
        base_rate: baseRate ? parseFloat(baseRate) : null,
        min_rate: minRate ? parseFloat(minRate) : null,
        max_rate: maxRate ? parseFloat(maxRate) : null,
        unit_label: unitLabel,
        is_active: isActive,
      };

      if (service) {
        await api.updateService(service.id, serviceData);
      } else {
        await api.createService(serviceData);
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save service:', err);
      setError(err?.message || 'Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">
            {service ? 'Edit Service' : 'Add Service'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Service Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="e.g., 3D Laser Scanning"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none resize-none h-20"
              placeholder="Brief description of the service..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Pricing Type</label>
            <select
              value={pricingType}
              onChange={(e) => setPricingType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
            >
              {PRICING_TYPES.map(pt => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </div>

          {pricingType === 'per_sqft' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Min Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={minRate}
                  onChange={(e) => setMinRate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                  placeholder="0.02"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Max Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={maxRate}
                  onChange={(e) => setMaxRate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                  placeholder="0.20"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Rate ($)</label>
              <input
                type="number"
                step="0.01"
                value={baseRate}
                onChange={(e) => setBaseRate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                placeholder="150.00"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Unit Label</label>
            <input
              type="text"
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="hour, sq ft, project, etc."
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-neutral-400 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#476E66]"></div>
            </label>
            <span className="text-sm font-medium text-neutral-700">Active</span>
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
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : service ? 'Update Service' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// User Management Tab Component
function UserManagementTab({ companyId, currentUserId }: { companyId: string; currentUserId: string }) {
  const { showToast } = useToast();
  const { canViewFinancials } = usePermissions();
  const { checkAndProceed } = useFeatureGating();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'roles' | 'invitations'>('users');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (companyId) loadData(mounted);
    return () => { mounted = false; };
  }, [companyId]);

  async function loadData(mounted = true) {
    setLoading(true);
    try {
      const [usersData, rolesData, invitationsData] = await Promise.all([
        userManagementApi.getCompanyUsers(companyId),
        userManagementApi.getRoles(companyId),
        userManagementApi.getInvitations(companyId),
      ]);
      if (mounted) {
        setUsers(usersData);
        setRoles(rolesData);
        setInvitations(invitationsData.filter(i => i.status === 'pending'));
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
    if (mounted) setLoading(false);
  }

  const handleDeactivateUser = async (userId: string) => {
    try {
      await userManagementApi.deactivateUser(userId);
      loadData();
    } catch (error) {
      console.error('Failed to deactivate user:', error);
    }
    setMenuOpen(null);
  };

  const handleActivateUser = async (userId: string) => {
    try {
      await userManagementApi.activateUser(userId);
      loadData();
    } catch (error) {
      console.error('Failed to activate user:', error);
    }
    setMenuOpen(null);
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await userManagementApi.cancelInvitation(invitationId);
      loadData();
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to delete this role? Users with this role will lose their permissions.')) return;
    try {
      await userManagementApi.deleteRole(roleId);
      loadData();
    } catch (error) {
      console.error('Failed to delete role:', error);
      showToast('Cannot delete this role. It may be a system role or in use.', 'error');
    }
    setRoleMenuOpen(null);
  };

  const getRoleName = (roleId?: string) => {
    if (!roleId) return 'No Role';
    const role = roles.find(r => r.id === roleId);
    return role?.name || 'Unknown';
  };

  const getRoleColor = (roleName: string) => {
    switch (roleName) {
      case 'Admin': return 'bg-purple-50 text-purple-700 border border-purple-100';
      case 'Manager': return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'Staff': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Viewer': return 'bg-neutral-50 text-neutral-700 border border-neutral-200';
      default: return 'bg-neutral-50 text-neutral-600 border border-neutral-200';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-sm border border-neutral-200 p-12">
        <div className="flex justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200 pb-0.5">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide w-full sm:w-auto">
          <button
            onClick={() => setActiveSubTab('users')}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === 'users' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === 'roles' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            Roles ({roles.length})
          </button>
          <button
            onClick={() => setActiveSubTab('invitations')}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === 'invitations' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            Pending Invites ({invitations.length})
          </button>
        </div>
        <button
          onClick={() => checkAndProceed('team_members', users.length, () => setShowInviteModal(true))}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors self-end sm:self-auto shadow-sm"
        >
          <Mail className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Invite User</span>
          <span className="sm:hidden">Invite</span>
        </button>
      </div>

      {/* Users List */}
      {activeSubTab === 'users' && (
        <div className="bg-white rounded-sm border border-neutral-200 overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead className="bg-white border-b border-neutral-200">
              <tr>
                <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">User</th>
                <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden sm:table-cell">Role</th>
                <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Status</th>
                {canViewFinancials && <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden md:table-cell">Hourly Rate</th>}
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="px-3 sm:px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-sm bg-neutral-100 flex items-center justify-center text-neutral-500 font-bold text-xs flex-shrink-0 border border-neutral-200">
                        {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-neutral-900 text-xs truncate uppercase tracking-tight">{user.full_name || 'Unknown'}</p>
                        <p className="text-[10px] text-neutral-400 truncate mt-0.5">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest ${getRoleColor(getRoleName(user.role_id))}`}>
                      {getRoleName(user.role_id)}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest ${user.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                      {user.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canViewFinancials && <td className="px-3 sm:px-4 py-3 text-neutral-600 text-[11px] font-mono hidden md:table-cell">
                    {user.hourly_rate ? `$${user.hourly_rate}/hr` : '-'}
                  </td>}
                  <td className="px-3 sm:px-4 py-3 relative">
                    <button
                      onClick={() => setMenuOpen(menuOpen === user.id ? null : user.id)}
                      className="p-1.5 hover:bg-neutral-100 rounded-sm text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen === user.id && (
                      <div className="absolute right-3 top-full mt-1 bg-white border border-neutral-200 rounded-sm shadow-lg py-1 z-20 min-w-[120px]">
                        <button
                          onClick={() => { setEditingUser(user); setShowEditUserModal(true); setMenuOpen(null); }}
                          className="w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                        >
                          <Edit2 className="w-3 h-3" /> Edit User
                        </button>
                        {user.id !== currentUserId && (
                          user.is_active !== false ? (
                            <button
                              onClick={() => handleDeactivateUser(user.id)}
                              className="w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 text-neutral-900 flex items-center gap-1.5"
                            >
                              <UserX className="w-3 h-3" /> Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivateUser(user.id)}
                              className="w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 text-neutral-900 flex items-center gap-1.5"
                            >
                              <UserCheck className="w-3 h-3" /> Activate
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="p-8 text-center text-neutral-400 text-xs uppercase tracking-widest font-bold">No users found</div>
          )}
        </div>
      )}

      {/* Roles List */}
      {activeSubTab === 'roles' && (
        <div className="bg-white rounded-sm border border-neutral-200 overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-bold text-neutral-900 uppercase tracking-wide">Permission Roles</h3>
              <p className="text-[10px] text-neutral-500 mt-0.5 uppercase tracking-widest font-bold">Define access levels for your team members</p>
            </div>
            <button
              onClick={() => { setEditingRole(null); setShowRoleModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] text-[10px] font-bold uppercase tracking-widest self-end sm:self-auto flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Role</span><span className="sm:hidden">Add</span>
            </button>
          </div>
          <div className="divide-y divide-neutral-100">
            {roles.map((role) => (
              <div key={role.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-neutral-900 text-xs uppercase tracking-wide">{role.name}</h4>
                      {role.is_system && (
                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest bg-neutral-100 text-neutral-500 border border-neutral-200">System</span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1">{role.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest ${getRoleColor(role.name)}`}>
                      {users.filter(u => u.role_id === role.id).length} users
                    </span>
                    <div className="relative">
                      <button
                        onClick={() => setRoleMenuOpen(roleMenuOpen === role.id ? null : role.id)}
                        className="p-1.5 hover:bg-neutral-100 rounded-sm text-neutral-400 hover:text-neutral-900"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {roleMenuOpen === role.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-sm shadow-lg py-1 z-20 min-w-[100px]">
                          <button
                            onClick={() => { setEditingRole(role); setShowRoleModal(true); setRoleMenuOpen(null); }}
                            className="w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          {!role.is_system && (
                            <button
                              onClick={() => handleDeleteRole(role.id)}
                              className="w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide hover:bg-neutral-50 text-neutral-900 flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {role.permissions && (
                  <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4">
                    <div className="grid grid-cols-5 gap-2 min-w-[600px]">
                      {Object.entries(role.permissions).map(([module, perms]) => (
                        <div key={module} className="bg-neutral-50 rounded-sm p-2 border border-neutral-100">
                          <p className="text-[9px] font-bold text-neutral-500 uppercase mb-2 tracking-widest">{module}</p>
                          <div className="space-y-1">
                            {['view', 'create', 'edit', 'delete'].map((action) => (
                              <div key={action} className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full border ${(perms as any)[action]
                                  ? 'bg-[#476E66] border-[#476E66]'
                                  : 'bg-transparent border-neutral-300'
                                  }`} />
                                <span className={`text-[9px] uppercase tracking-wide font-medium ${(perms as any)[action] ? 'text-neutral-900' : 'text-neutral-400'
                                  }`}>{action}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {activeSubTab === 'invitations' && (
        <div className="bg-white rounded-sm shadow-sm border border-neutral-200 overflow-hidden">
          {invitations.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-[13px] font-bold text-neutral-900 uppercase tracking-wide mb-1">No pending invitations</h3>
              <p className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium mb-4">Invite team members to join your company</p>
              <button
                onClick={() => checkAndProceed('team_members', users.length, () => setShowInviteModal(true))}
                className="px-4 py-2 border border-[#476E66] text-[#476E66] bg-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#476E66]/5 transition-colors"
              >
                Send Invitation
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead className="bg-white border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Email</th>
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden sm:table-cell">Role</th>
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden md:table-cell">Sent</th>
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hidden lg:table-cell">Expires</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-3 sm:px-4 py-3 font-medium text-neutral-900 text-xs font-mono">{invitation.email}</td>
                      <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                        <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest ${getRoleColor((invitation.role as any)?.name || 'Unknown')}`}>
                          {(invitation.role as any)?.name || 'No Role'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-neutral-500 text-[11px] hidden md:table-cell uppercase tracking-wide">
                        {invitation.created_at ? new Date(invitation.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-neutral-500 text-[11px] hidden lg:table-cell uppercase tracking-wide">
                        {invitation.expires_at ? new Date(invitation.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right">
                        <button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="text-neutral-400 hover:text-red-600 text-[10px] font-bold uppercase tracking-widest transition-colors"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <InviteUserModal
          companyId={companyId}
          currentUserId={currentUserId}
          roles={roles}
          onClose={() => setShowInviteModal(false)}
          onInvite={() => { loadData(); setShowInviteModal(false); }}
        />
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <EditUserModal
          user={editingUser}
          roles={roles}
          onClose={() => { setShowEditUserModal(false); setEditingUser(null); }}
          onSave={() => { loadData(); setShowEditUserModal(false); setEditingUser(null); }}
        />
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <RoleModal
          role={editingRole}
          companyId={companyId}
          onClose={() => { setShowRoleModal(false); setEditingRole(null); }}
          onSave={() => { loadData(); setShowRoleModal(false); setEditingRole(null); }}
        />
      )}
    </div>
  );
}

function InviteUserModal({ companyId, currentUserId, roles, onClose, onInvite }: {
  companyId: string;
  currentUserId: string;
  roles: Role[];
  onClose: () => void;
  onInvite: () => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setSaving(true);
    setError(null);

    // Timeout after 15 seconds
    const timeoutId = setTimeout(() => {
      setSaving(false);
      setError('Request timed out. Please try again.');
    }, 15000);

    try {
      // Create invitation record
      await userManagementApi.createInvitation({
        company_id: companyId,
        email,
        role_id: roleId || null,
        invited_by: currentUserId,
      });

      // Send invitation email via edge function
      const selectedRole = roles.find(r => r.id === roleId);
      const { data: companyData } = await supabase.from('companies').select('name').eq('id', companyId).single();
      const { data: inviterData } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).single();

      const emailResult = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: `You've been invited to join ${companyData?.name || 'a company'} on Billdora`,
          type: 'invitation',
          data: {
            inviterName: inviterData?.full_name || 'A team member',
            companyName: companyData?.name || 'a company',
            roleName: selectedRole?.name || '',
            signupUrl: `${(window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost')) ? 'https://billdora.com' : window.location.origin}/login?email=${encodeURIComponent(email)}&signup=true`,
          },
        },
      });

      clearTimeout(timeoutId);

      if (emailResult.error) {
        console.error('Email send failed:', emailResult.error);
        showToast(`Invitation created but email failed to send. Please notify ${email} manually.`, 'error');
      } else {
        showToast(`Invitation sent to ${email}`, 'success');
      }

      onInvite();
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Failed to send invitation:', err);
      setError(err?.message || 'Failed to send invitation. You may need Admin permissions.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm w-full max-w-md p-6 mx-4 border border-neutral-200 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-bold text-neutral-900 uppercase tracking-wide">Invite User</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-sm">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none text-[13px] bg-neutral-50"
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none text-[13px] bg-neutral-50"
            >
              <option value="">Select a role</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <p className="text-sm text-neutral-500">
            An invitation email will be sent with a link to join your company.
          </p>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-neutral-200 rounded-sm hover:bg-neutral-50 transition-colors text-[10px] font-bold uppercase tracking-widest text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest"
            >
              {saving ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, roles, onClose, onSave }: {
  user: UserProfile;
  roles: Role[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [roleId, setRoleId] = useState(user.role_id || '');
  const [hourlyRate, setHourlyRate] = useState(user.hourly_rate?.toString() || '');
  const [isBillable, setIsBillable] = useState(user.is_billable !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await userManagementApi.updateUserProfile(user.id, {
        full_name: fullName,
        role_id: roleId || null,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
        is_billable: isBillable,
      });
      onSave();
    } catch (err: any) {
      console.error('Failed to update user:', err);
      setError(err?.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm w-full max-w-md p-6 mx-4 border border-neutral-200 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-bold text-neutral-900 uppercase tracking-wide">Edit User</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-sm">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none text-[13px] bg-neutral-50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-3 py-2 rounded-sm border border-neutral-200 bg-neutral-100 text-neutral-500 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none text-[13px] bg-neutral-50"
            >
              <option value="">No role assigned</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Hourly Rate ($)</label>
            <input
              type="number"
              step="0.01"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none text-[13px] bg-neutral-50"
              placeholder="150.00"
            />
            <p className="mt-1.5 text-xs text-neutral-500">Used as default rate for time entry billing calculations</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="billable"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
            />
            <label htmlFor="billable" className="text-sm text-neutral-700">Billable employee</label>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-neutral-200 rounded-sm hover:bg-neutral-50 transition-colors text-[10px] font-bold uppercase tracking-widest text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Role Modal - Create/Edit roles with permission matrix
function RoleModal({ role, companyId, onClose, onSave }: {
  role: Role | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const modules = ['projects', 'time', 'invoicing', 'quotes', 'settings'];
  const actions = ['view', 'create', 'edit', 'delete'];

  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [canViewFinancials, setCanViewFinancials] = useState(() => {
    if (role?.permissions && typeof (role.permissions as any).canViewFinancials === 'boolean') {
      return (role.permissions as any).canViewFinancials;
    }
    return true; // Default to true for new roles
  });
  const [canApprove, setCanApprove] = useState(() => {
    if (role?.permissions && typeof (role.permissions as any).approvals === 'object') {
      return (role.permissions as any).approvals?.approve || false;
    }
    return false;
  });
  const [canViewApprovals, setCanViewApprovals] = useState(() => {
    if (role?.permissions && typeof (role.permissions as any).approvals === 'object') {
      return (role.permissions as any).approvals?.view || false;
    }
    return false;
  });
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>(() => {
    if (role?.permissions) {
      return role.permissions as Record<string, Record<string, boolean>>;
    }
    const initial: Record<string, Record<string, boolean>> = {};
    modules.forEach(m => {
      initial[m] = { view: false, create: false, edit: false, delete: false };
    });
    return initial;
  });

  // Preset role configurations
  const applyPreset = (preset: 'admin' | 'manager' | 'team_member') => {
    if (preset === 'admin') {
      setName('Admin');
      setDescription('Full access to all features');
      setCanViewFinancials(true);
      const newPerms: Record<string, Record<string, boolean>> = {};
      modules.forEach(m => {
        newPerms[m] = { view: true, create: true, edit: true, delete: true };
      });
      setPermissions(newPerms);
    } else if (preset === 'manager') {
      setName('Manager');
      setDescription('Manage projects and team');
      setCanViewFinancials(true);
      setPermissions({
        projects: { view: true, create: true, edit: true, delete: false },
        time: { view: true, create: true, edit: true, delete: true },
        invoicing: { view: true, create: true, edit: true, delete: false },
        quotes: { view: true, create: true, edit: true, delete: false },
        settings: { view: true, create: false, edit: false, delete: false },
      });
    } else if (preset === 'team_member') {
      setName('Team Member');
      setDescription('Work on projects and log time without financial access');
      setCanViewFinancials(false);
      setPermissions({
        projects: { view: true, create: true, edit: true, delete: true },
        time: { view: true, create: true, edit: true, delete: true },
        invoicing: { view: false, create: false, edit: false, delete: false },
        quotes: { view: false, create: false, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
      });
    }
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePermission = (module: string, action: string) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: !prev[module][action],
      }
    }));
  };

  const toggleModule = (module: string, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [module]: { view: value, create: value, edit: value, delete: value }
    }));
  };

  const toggleAll = (value: boolean) => {
    const newPerms: Record<string, Record<string, boolean>> = {};
    modules.forEach(m => {
      newPerms[m] = { view: value, create: value, edit: value, delete: value };
    });
    setPermissions(newPerms);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Role name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const permissionsWithFinancials = { ...permissions, canViewFinancials, approvals: { view: canViewApprovals, approve: canApprove } };
      if (role) {
        await userManagementApi.updateRole(role.id, {
          name: name.trim(),
          description: description.trim() || null,
          permissions: permissionsWithFinancials,
        });
      } else {
        await userManagementApi.createRole({
          company_id: companyId,
          name: name.trim(),
          description: description.trim() || null,
          permissions: permissionsWithFinancials,
          is_system: false,
        });
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save role:', err);
      setError(err?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm w-full max-w-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto border border-neutral-200 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-bold text-neutral-900 uppercase tracking-wide">
            {role ? 'Edit Role' : 'Create Role'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-sm">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Role Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={role?.is_system}
                className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none disabled:bg-neutral-50 text-[13px]"
                placeholder="e.g. Project Manager"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-sm border border-neutral-200 focus:ring-0 focus:border-neutral-900 outline-none text-[13px]"
                placeholder="Brief description of this role"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-neutral-900">Permissions</label>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mr-2 self-center">Presets:</span>
                <button type="button" onClick={() => applyPreset('admin')} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-purple-50 text-purple-700 rounded-sm border border-purple-100 hover:bg-purple-100">
                  Admin
                </button>
                <button type="button" onClick={() => applyPreset('manager')} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-blue-50 text-blue-700 rounded-sm border border-blue-100 hover:bg-blue-100">
                  Manager
                </button>
                <button type="button" onClick={() => applyPreset('team_member')} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-amber-50 text-amber-700 rounded-sm border border-amber-100 hover:bg-amber-100">
                  Team Member
                </button>
                <button type="button" onClick={() => toggleAll(true)} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-emerald-50 text-emerald-700 rounded-sm border border-emerald-100 hover:bg-emerald-100">
                  Grant All
                </button>
                <button type="button" onClick={() => toggleAll(false)} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-neutral-50 text-neutral-700 rounded-sm border border-neutral-200 hover:bg-neutral-100">
                  Revoke All
                </button>
              </div>
            </div>

            <div className="border border-neutral-200 rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Module</th>
                    {actions.map(action => (
                      <th key={action} className="text-center px-3 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-20">
                        {action}
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest w-16">All</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {modules.map(module => {
                    const allChecked = actions.every(a => permissions[module]?.[a]);
                    return (
                      <tr key={module} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-medium text-neutral-900 capitalize">{module}</td>
                        {actions.map(action => (
                          <td key={action} className="text-center px-3 py-3">
                            <input
                              type="checkbox"
                              checked={permissions[module]?.[action] || false}
                              onChange={() => togglePermission(module, action)}
                              className="w-4 h-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                            />
                          </td>
                        ))}
                        <td className="text-center px-3 py-3">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={() => toggleModule(module, !allChecked)}
                            className="w-4 h-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Access */}
          <div className="p-4 bg-amber-50/50 rounded-sm border border-amber-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={canViewFinancials}
                onChange={(e) => setCanViewFinancials(e.target.checked)}
                className="w-5 h-5 rounded-sm border-neutral-300 text-amber-700 focus:ring-amber-500"
              />
              <div>
                <span className="font-medium text-neutral-900">Can View Financial Data</span>
                <p className="text-sm text-neutral-500">Allow access to dollar amounts, rates, invoicing, and budget information</p>
              </div>
            </label>
          </div>

          {/* Approval Access */}
          <div className="p-4 bg-emerald-50/50 rounded-sm border border-emerald-100 space-y-3">
            <div className="font-medium text-neutral-900">Approval Permissions</div>
            <p className="text-sm text-neutral-500">Control access to approve time entries and expenses</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canViewApprovals}
                  onChange={(e) => setCanViewApprovals(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-neutral-300 text-emerald-700 focus:ring-emerald-500"
                />
                <span className="text-sm text-neutral-700">View Pending Approvals</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canApprove}
                  onChange={(e) => setCanApprove(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-neutral-300 text-emerald-700 focus:ring-emerald-500"
                />
                <span className="text-sm text-neutral-700">Can Approve/Reject</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-neutral-200 rounded-sm hover:bg-neutral-50 transition-colors text-[10px] font-bold uppercase tracking-widest text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest"
            >
              {saving ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Profile Tab Component - User's personal settings
function ProfileTab() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [city, setCity] = useState(profile?.city || '');
  const [profileState, setProfileState] = useState(profile?.state || '');
  const [zipCode, setZipCode] = useState(profile?.zip_code || '');
  const [emergencyContactName, setEmergencyContactName] = useState(profile?.emergency_contact_name || '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(profile?.emergency_contact_phone || '');
  const [hireDate, setHireDate] = useState(profile?.hire_date || '');
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setDateOfBirth(profile.date_of_birth || '');
      setAddress(profile.address || '');
      setCity(profile.city || '');
      setProfileState(profile.state || '');
      setZipCode(profile.zip_code || '');
      setEmergencyContactName(profile.emergency_contact_name || '');
      setEmergencyContactPhone(profile.emergency_contact_phone || '');
      setHireDate(profile.hire_date || '');
    }
  }, [profile]);

  // Load company name for staff to see which company they belong to
  useEffect(() => {
    async function loadCompanyName() {
      if (!profile?.company_id) return;
      try {
        const { data } = await supabase.from('companies').select('name').eq('id', profile.company_id).single();
        if (data?.name) setCompanyName(data.name);
      } catch (err) { /* ignore */ }
    }
    loadCompanyName();
  }, [profile?.company_id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName || null,
          phone: phone || null,
          date_of_birth: dateOfBirth || null,
          address: address || null,
          city: city || null,
          state: profileState || null,
          zip_code: zipCode || null,
          emergency_contact_name: emergencyContactName || null,
          emergency_contact_phone: emergencyContactPhone || null,
          hire_date: hireDate || null,
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      if (refreshProfile) await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setError(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-widest mb-6 border-b border-neutral-100 pb-2">My Profile</h2>

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
            {error}
          </div>
        )}
        {success && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs">
            Profile updated successfully!
          </div>
        )}

        {/* Basic Info Section */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Basic Information</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="YOUR NAME"
                className="w-full h-10 px-3 rounded-sm border border-neutral-200 text-sm font-bold text-neutral-900 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:font-medium placeholder:uppercase"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full h-10 px-3 rounded-sm border border-neutral-200 text-sm font-bold text-neutral-900 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full h-10 px-3 rounded-sm border border-neutral-200 bg-neutral-100/50 text-neutral-500 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
          </div>

          {companyName && (
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Company</label>
              <input
                type="text"
                value={companyName}
                disabled
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 text-sm"
              />
              <p className="text-[10px] text-neutral-500 mt-1">You are a member of this company</p>
            </div>
          )}
        </div>

        {/* Address Section */}
        <div className="space-y-4 pt-6 border-t border-neutral-100">
          <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Address</h3>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Street Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">State</label>
              <input
                type="text"
                value={profileState}
                onChange={(e) => setProfileState(e.target.value)}
                placeholder="CA"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Zip Code</label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="12345"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact Section */}
        <div className="space-y-4 pt-6 border-t border-neutral-100">
          <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Emergency Contact</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Contact Name</label>
              <input
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                placeholder="+1 (555) 987-6543"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Employment Section */}
        <div className="space-y-4 pt-6 border-t border-neutral-100">
          <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Employment</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Date of Hire</label>
              <input
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Role</label>
              <input
                type="text"
                value={profile?.role || ''}
                disabled
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 text-sm capitalize"
              />
            </div>
          </div>
        </div>

        <div className="pt-3">
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-6 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Invoice Settings Tab Component
function InvoicingSettingsTab({ companyId }: { companyId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<'address' | 'defaults' | 'calculators' | 'pdf' | 'email'>('address');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Address Info state
  const [invoiceCompanyName, setInvoiceCompanyName] = useState('');
  const [invoiceAddress, setInvoiceAddress] = useState('');
  const [invoiceCity, setInvoiceCity] = useState('');
  const [invoiceState, setInvoiceState] = useState('');
  const [invoiceZip, setInvoiceZip] = useState('');
  const [invoiceCountry, setInvoiceCountry] = useState('USA');
  const [invoicePhone, setInvoicePhone] = useState('');
  const [invoiceWebsite, setInvoiceWebsite] = useState('');
  const [invoiceLogoUrl, setInvoiceLogoUrl] = useState('');
  const [addressBlockPosition, setAddressBlockPosition] = useState<'left' | 'right'>('left');

  const subTabs = [
    { id: 'address', label: 'Address Info', icon: MapPin },
    { id: 'defaults', label: 'Defaults', icon: Settings },
    { id: 'calculators', label: 'Calculators', icon: Calculator },
    { id: 'pdf', label: 'PDF Formats', icon: FileType },
    { id: 'email', label: 'Email Settings', icon: Send },
  ];

  useEffect(() => {
    if (companyId) {
      loadInvoiceSettings();
    }
  }, [companyId]);

  async function loadInvoiceSettings() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('invoice_settings')
        .select('*')
        .eq('company_id', companyId)
        .single();

      if (data) {
        setInvoiceCompanyName(data.company_name || '');
        setInvoiceAddress(data.address || '');
        setInvoiceCity(data.city || '');
        setInvoiceState(data.state || '');
        setInvoiceZip(data.zip || '');
        setInvoiceCountry(data.country || 'USA');
        setInvoicePhone(data.phone || '');
        setInvoiceWebsite(data.website || '');
        setInvoiceLogoUrl(data.logo_url || '');
        setAddressBlockPosition(data.address_block_position || 'left');
      }
    } catch (err) {
      console.error('Failed to load invoice settings:', err);
    }
    setLoading(false);
  }

  async function handleSaveAddressInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: upsertError } = await supabase
        .from('invoice_settings')
        .upsert({
          company_id: companyId,
          company_name: invoiceCompanyName || null,
          address: invoiceAddress || null,
          city: invoiceCity || null,
          state: invoiceState || null,
          zip: invoiceZip || null,
          country: invoiceCountry || null,
          phone: invoicePhone || null,
          website: invoiceWebsite || null,
          logo_url: invoiceLogoUrl || null,
          address_block_position: addressBlockPosition,
        }, { onConflict: 'company_id' });

      if (upsertError) throw upsertError;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save invoice settings:', err);
      setError(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const ext = file.name.split('.').pop();
      const filename = `${companyId}/invoice-logo-${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from('company-logos')
        .upload(filename, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filename);

      setInvoiceLogoUrl(urlData.publicUrl);
    } catch (err: any) {
      console.error('Failed to upload logo:', err);
      setError(err?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-100 p-6">
        <div className="flex justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-6 border-b border-neutral-200 pb-px overflow-x-auto scrollbar-hide">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`pb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === tab.id ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            <tab.icon className="w-3.5 h-3.5 mb-0.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Address Info Tab */}
      {activeSubTab === 'address' && (
        <div className="space-y-6 max-w-2xl">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Invoice Address</h2>
            <p className="text-neutral-500 text-xs">Configure the company information as it appears on invoices</p>
          </div>

          <form onSubmit={handleSaveAddressInfo} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-medium">
                Settings saved successfully!
              </div>
            )}

            {/* Logo Section */}
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Invoice Logo</label>
              <div className="flex items-center gap-4">
                <div
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden bg-white cursor-pointer hover:border-neutral-400 transition-colors flex-shrink-0 group"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {invoiceLogoUrl ? (
                    <img src={invoiceLogoUrl} alt="Invoice logo" className="w-full h-full object-contain" />
                  ) : (
                    <Camera className="w-6 h-6 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  <p className="text-[10px] text-neutral-400 mt-2 font-medium uppercase tracking-wide">PNG, JPG up to 5MB</p>
                </div>
              </div>
            </div>

            {/* Company Info */}
            <div className="space-y-4 pt-6 border-t border-neutral-100">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Company Details</h3>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Company Name</label>
                <input
                  type="text"
                  value={invoiceCompanyName}
                  onChange={(e) => setInvoiceCompanyName(e.target.value)}
                  placeholder="Your Company Name"
                  className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Street Address</label>
                <input
                  type="text"
                  value={invoiceAddress}
                  onChange={(e) => setInvoiceAddress(e.target.value)}
                  placeholder="123 Business St"
                  className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">City</label>
                  <input
                    type="text"
                    value={invoiceCity}
                    onChange={(e) => setInvoiceCity(e.target.value)}
                    placeholder="City"
                    className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">State</label>
                  <input
                    type="text"
                    value={invoiceState}
                    onChange={(e) => setInvoiceState(e.target.value)}
                    placeholder="State"
                    className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">ZIP</label>
                  <input
                    type="text"
                    value={invoiceZip}
                    onChange={(e) => setInvoiceZip(e.target.value)}
                    placeholder="ZIP"
                    className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Country</label>
                <input
                  type="text"
                  value={invoiceCountry}
                  onChange={(e) => setInvoiceCountry(e.target.value)}
                  placeholder="Country"
                  className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Phone</label>
                  <input
                    type="tel"
                    value={invoicePhone}
                    onChange={(e) => setInvoicePhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Website</label>
                  <input
                    type="url"
                    value={invoiceWebsite}
                    onChange={(e) => setInvoiceWebsite(e.target.value)}
                    placeholder="https://yourcompany.com"
                    className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none placeholder:text-neutral-400"
                  />
                </div>
              </div>
            </div>

            {/* Address Block Position */}
            <div className="space-y-4 pt-6 border-t border-neutral-100">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Layout Preference</h3>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Address Block Position</label>
                <div className="flex gap-4">
                  <label className={`flex items-center gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-colors ${addressBlockPosition === 'left' ? 'border-[#476E66] bg-[#476E66]/5' : 'border-neutral-200 hover:border-neutral-300'
                    }`}>
                    <input
                      type="radio"
                      name="addressPosition"
                      value="left"
                      checked={addressBlockPosition === 'left'}
                      onChange={() => setAddressBlockPosition('left')}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${addressBlockPosition === 'left' ? 'border-[#476E66]' : 'border-neutral-300'
                      }`}>
                      {addressBlockPosition === 'left' && <div className="w-2 h-2 rounded-full bg-[#476E66]" />}
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-neutral-900 uppercase tracking-wide">Left Side</span>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-colors ${addressBlockPosition === 'right' ? 'border-[#476E66] bg-[#476E66]/5' : 'border-neutral-200 hover:border-neutral-300'
                    }`}>
                    <input
                      type="radio"
                      name="addressPosition"
                      value="right"
                      checked={addressBlockPosition === 'right'}
                      onChange={() => setAddressBlockPosition('right')}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${addressBlockPosition === 'right' ? 'border-[#476E66]' : 'border-neutral-300'
                      }`}>
                      {addressBlockPosition === 'right' && <div className="w-2 h-2 rounded-full bg-[#476E66]" />}
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-neutral-900 uppercase tracking-wide">Right Side</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-6 bg-[#476E66] text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Calculators Tab */}
      {activeSubTab === 'calculators' && (
        <CalculatorsTab companyId={companyId} />
      )}

      {/* PDF Formats Tab */}
      {activeSubTab === 'pdf' && (
        <PDFFormatsTab companyId={companyId} />
      )}

      {/* Placeholder for other tabs */}
      {(activeSubTab === 'defaults' || activeSubTab === 'email') && (
        <div className="bg-white rounded-2xl p-12 border border-neutral-100 text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            {activeSubTab === 'defaults' && <Settings className="w-8 h-8 text-neutral-400" />}
            {activeSubTab === 'email' && <Send className="w-8 h-8 text-neutral-400" />}
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            {subTabs.find(t => t.id === activeSubTab)?.label}
          </h3>
          <p className="text-neutral-500">This section will be implemented next</p>
        </div>
      )}
    </div>
  );
}

// Calculator types definition
const CALCULATOR_TYPES = [
  {
    id: 'manual',
    name: 'Manual Invoice',
    description: 'Create a brand new invoice for a specific dollar amount and ignore billable time/expenses.',
    icon: '📝',
  },
  {
    id: 'time_materials',
    name: 'Time & Materials (T&M)',
    description: 'Create an invoice which bills hours (based on the billing rate(s) you\'ve setup) and expenses.',
    icon: '⏱️',
  },
  {
    id: 'fixed_fee',
    name: 'Fixed Fee',
    description: 'Bill based on the tasks you have defined for each project. You\'ll have the option to bill a percentage of each task, or to bill 100% of any completed tasks.',
    icon: '💰',
  },
  {
    id: 'item_based',
    name: 'Item Based Billing',
    description: 'Bill based on the task fee types you have defined for each project. You\'ll have the option to bill each task as a T&M, Milestone, Percent Complete, Retainer, or Non-billable line item.',
    icon: '📋',
  },
  {
    id: 'project_monthly',
    name: 'Project Monthly Fee',
    description: 'Bill based on the project monthly fee. Ideal for recurring retainer arrangements.',
    icon: '📅',
  },
];

// Calculators Tab Component
function CalculatorsTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultCalculator, setDefaultCalculator] = useState('time_materials');
  const [enabledCalculators, setEnabledCalculators] = useState<string[]>(CALCULATOR_TYPES.map(c => c.id));
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [companyId]);

  async function loadSettings() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('invoice_settings')
        .select('default_calculator, enabled_calculators')
        .eq('company_id', companyId)
        .single();

      if (data) {
        setDefaultCalculator(data.default_calculator || 'time_materials');
        setEnabledCalculators(data.enabled_calculators || CALCULATOR_TYPES.map(c => c.id));
      }
    } catch (err) {
      console.error('Failed to load calculator settings:', err);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('invoice_settings')
        .upsert({
          company_id: companyId,
          default_calculator: defaultCalculator,
          enabled_calculators: enabledCalculators,
        }, { onConflict: 'company_id' });

      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save calculator settings:', err);
    }
    setSaving(false);
  }

  const toggleCalculator = (id: string) => {
    if (enabledCalculators.includes(id)) {
      if (enabledCalculators.length > 1) {
        setEnabledCalculators(enabledCalculators.filter(c => c !== id));
        if (defaultCalculator === id) {
          setDefaultCalculator(enabledCalculators.find(c => c !== id) || 'time_materials');
        }
      }
    } else {
      setEnabledCalculators([...enabledCalculators, id]);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-neutral-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Invoice Calculators</h2>
        <p className="text-neutral-500 text-xs">Choose which invoice calculation methods are available</p>
      </div>

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-medium">
          Calculator settings saved successfully!
        </div>
      )}

      <div className="space-y-3">
        {CALCULATOR_TYPES.map((calc) => (
          <div
            key={calc.id}
            className={`p-4 rounded-lg border transition-colors ${enabledCalculators.includes(calc.id)
              ? 'border-neutral-200 bg-white shadow-sm'
              : 'border-neutral-100 bg-neutral-50 opacity-60'
              }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-xl mt-1">{calc.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">{calc.name}</h3>
                  {defaultCalculator === calc.id && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#476E66] text-white rounded uppercase tracking-widest">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500">{calc.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {enabledCalculators.includes(calc.id) && defaultCalculator !== calc.id && (
                  <button
                    onClick={() => setDefaultCalculator(calc.id)}
                    className="text-[10px] font-bold text-neutral-400 hover:text-neutral-900 uppercase tracking-wider transition-colors"
                  >
                    Set Default
                  </button>
                )}
                {/* Switch Toggle */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledCalculators.includes(calc.id)}
                    onChange={() => toggleCalculator(calc.id)}
                    disabled={enabledCalculators.length <= 1 && enabledCalculators.includes(calc.id)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#476E66]"></div>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-10 px-6 bg-[#476E66] text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// PDF Template type
interface PDFTemplate {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  show_logo: boolean;
  logo_position: string;
  show_company_address: boolean;
  show_client_address: boolean;
  include_line_items: boolean;
  include_time_detail: boolean;
  include_expense_detail: boolean;
  include_budget_status: boolean;
  include_receipts: boolean;
  font_name: string;
  font_size: number;
  created_at: string;
}

// PDF Formats Tab Component
function PDFFormatsTab({ companyId }: { companyId: string }) {
  const [templates, setTemplates] = useState<PDFTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PDFTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [companyId]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('invoice_pdf_templates')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to load PDF templates:', err);
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this PDF template?')) return;
    try {
      await supabase.from('invoice_pdf_templates').delete().eq('id', id);
      loadTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  }

  async function setAsDefault(id: string) {
    try {
      // First remove default from all templates
      await supabase
        .from('invoice_pdf_templates')
        .update({ is_default: false })
        .eq('company_id', companyId);

      // Then set this one as default
      await supabase
        .from('invoice_pdf_templates')
        .update({ is_default: true })
        .eq('id', id);

      loadTemplates();
    } catch (err) {
      console.error('Failed to set default:', err);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-100 p-12">
        <div className="flex justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-8 border border-neutral-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-1">PDF Format Templates</h2>
            <p className="text-neutral-500 text-sm">Create custom PDF styles for your invoices</p>
          </div>
          <button
            onClick={() => { setEditingTemplate(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileType className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">No PDF templates yet</h3>
            <p className="text-neutral-500 mb-4">Create your first PDF template to customize how your invoices look</p>
            <button
              onClick={() => { setEditingTemplate(null); setShowModal(true); }}
              className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54]"
            >
              Create Your First Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="p-5 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-neutral-900">{template.name}</h3>
                      {template.is_default && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-neutral-500">{template.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingTemplate(template); setShowModal(true); }}
                      className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {template.include_line_items && (
                    <span className="px-2 py-1 text-xs bg-neutral-100 text-neutral-600 rounded">Line Items</span>
                  )}
                  {template.include_time_detail && (
                    <span className="px-2 py-1 text-xs bg-neutral-100 text-neutral-600 rounded">Time Detail</span>
                  )}
                  {template.include_expense_detail && (
                    <span className="px-2 py-1 text-xs bg-neutral-100 text-neutral-600 rounded">Expenses</span>
                  )}
                  {template.include_budget_status && (
                    <span className="px-2 py-1 text-xs bg-neutral-100 text-neutral-600 rounded">Budget Status</span>
                  )}
                  {template.include_receipts && (
                    <span className="px-2 py-1 text-xs bg-neutral-100 text-neutral-600 rounded">Receipts</span>
                  )}
                </div>
                {!template.is_default && (
                  <button
                    onClick={() => setAsDefault(template.id)}
                    className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                  >
                    Set as default
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF Template Modal */}
      {showModal && (
        <PDFTemplateModal
          template={editingTemplate}
          companyId={companyId}
          onClose={() => { setShowModal(false); setEditingTemplate(null); }}
          onSave={() => { setShowModal(false); setEditingTemplate(null); loadTemplates(); }}
        />
      )}
    </div>
  );
}

// PDF Template Modal Component
function PDFTemplateModal({ template, companyId, onClose, onSave }: {
  template: PDFTemplate | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'basic' | 'header' | 'fields' | 'details' | 'appearance'>('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic info
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');

  // Header settings
  const [showLogo, setShowLogo] = useState(template?.show_logo ?? true);
  const [logoPosition, setLogoPosition] = useState(template?.logo_position || 'left');
  const [showCompanyAddress, setShowCompanyAddress] = useState(template?.show_company_address ?? true);
  const [showClientAddress, setShowClientAddress] = useState(template?.show_client_address ?? true);

  // Fields
  const [showTotalAmountDue, setShowTotalAmountDue] = useState(true);
  const [showInvoiceNumber, setShowInvoiceNumber] = useState(true);
  const [showInvoiceDate, setShowInvoiceDate] = useState(true);
  const [showDueDate, setShowDueDate] = useState(true);
  const [showInvoiceTerms, setShowInvoiceTerms] = useState(true);
  const [showPONumber, setShowPONumber] = useState(false);
  const [showProjectName, setShowProjectName] = useState(true);

  // Details
  const [includeLineItems, setIncludeLineItems] = useState(template?.include_line_items ?? true);
  const [includeTimeDetail, setIncludeTimeDetail] = useState(template?.include_time_detail ?? false);
  const [includeExpenseDetail, setIncludeExpenseDetail] = useState(template?.include_expense_detail ?? false);
  const [includeBudgetStatus, setIncludeBudgetStatus] = useState(template?.include_budget_status ?? false);
  const [includeReceipts, setIncludeReceipts] = useState(template?.include_receipts ?? false);
  const [receiptsPerPage, setReceiptsPerPage] = useState(4);

  // Appearance
  const [fontName, setFontName] = useState(template?.font_name || 'Arial');
  const [fontSize, setFontSize] = useState(template?.font_size || 10);
  const [colorScheme, setColorScheme] = useState('default');

  const tabs = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'header', label: 'Header' },
    { id: 'fields', label: 'Fields' },
    { id: 'details', label: 'Details' },
    { id: 'appearance', label: 'Appearance' },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const templateData = {
        company_id: companyId,
        name: name.trim(),
        description: description.trim() || null,
        show_logo: showLogo,
        logo_position: logoPosition,
        show_company_address: showCompanyAddress,
        show_client_address: showClientAddress,
        show_total_amount_due: showTotalAmountDue,
        show_invoice_number: showInvoiceNumber,
        show_invoice_date: showInvoiceDate,
        show_due_date: showDueDate,
        show_invoice_terms: showInvoiceTerms,
        show_po_number: showPONumber,
        show_project_name: showProjectName,
        include_line_items: includeLineItems,
        include_time_detail: includeTimeDetail,
        include_expense_detail: includeExpenseDetail,
        include_budget_status: includeBudgetStatus,
        include_receipts: includeReceipts,
        receipts_per_page: receiptsPerPage,
        font_name: fontName,
        font_size: fontSize,
        color_scheme: colorScheme,
      };

      if (template) {
        await supabase
          .from('invoice_pdf_templates')
          .update(templateData)
          .eq('id', template.id);
      } else {
        await supabase
          .from('invoice_pdf_templates')
          .insert(templateData);
      }

      onSave();
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(err?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900">
            {template ? 'Edit PDF Template' : 'Create PDF Template'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-neutral-100 flex gap-1 bg-neutral-50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm mb-4">{error}</div>
          )}

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Template Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Detailed Invoice with Time"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of when to use this template..."
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 outline-none resize-none h-20"
                />
              </div>
            </div>
          )}

          {/* Header Tab */}
          {activeTab === 'header' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Show Company Logo</p>
                  <p className="text-sm text-neutral-500">Display your logo on the invoice</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {showLogo && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Logo Position</label>
                  <div className="flex gap-3">
                    {['left', 'center', 'right'].map((pos) => (
                      <label key={pos} className={`flex-1 px-4 py-3 border rounded-xl cursor-pointer text-center transition-colors ${logoPosition === pos ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
                        }`}>
                        <input type="radio" name="logoPos" value={pos} checked={logoPosition === pos} onChange={() => setLogoPosition(pos)} className="sr-only" />
                        <span className="text-sm font-medium capitalize">{pos}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Show Company Address</p>
                  <p className="text-sm text-neutral-500">Display your company address in the header</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={showCompanyAddress} onChange={(e) => setShowCompanyAddress(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Show Client Address</p>
                  <p className="text-sm text-neutral-500">Display client billing address</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={showClientAddress} onChange={(e) => setShowClientAddress(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
            </div>
          )}

          {/* Fields Tab */}
          {activeTab === 'fields' && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-500 mb-4">Choose which fields to display on the invoice</p>
              {[
                { label: 'Total Amount Due', state: showTotalAmountDue, setState: setShowTotalAmountDue },
                { label: 'Invoice Number', state: showInvoiceNumber, setState: setShowInvoiceNumber },
                { label: 'Invoice Date', state: showInvoiceDate, setState: setShowInvoiceDate },
                { label: 'Due Date', state: showDueDate, setState: setShowDueDate },
                { label: 'Invoice Terms', state: showInvoiceTerms, setState: setShowInvoiceTerms },
                { label: 'PO Number', state: showPONumber, setState: setShowPONumber },
                { label: 'Project Name', state: showProjectName, setState: setShowProjectName },
              ].map((field) => (
                <div key={field.label} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                  <span className="text-sm font-medium text-neutral-700">{field.label}</span>
                  <input
                    type="checkbox"
                    checked={field.state}
                    onChange={(e) => field.setState(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-500 mb-4">Configure what details to include in the invoice body</p>

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Line Items</p>
                  <p className="text-sm text-neutral-500">Show invoice line items with descriptions and amounts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={includeLineItems} onChange={(e) => setIncludeLineItems(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Time Detail</p>
                  <p className="text-sm text-neutral-500">Include detailed time entries with staff, hours, rates</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={includeTimeDetail} onChange={(e) => setIncludeTimeDetail(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Expense Detail</p>
                  <p className="text-sm text-neutral-500">Include detailed expense entries</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={includeExpenseDetail} onChange={(e) => setIncludeExpenseDetail(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Budget Status</p>
                  <p className="text-sm text-neutral-500">Show project budget progress and remaining amounts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={includeBudgetStatus} onChange={(e) => setIncludeBudgetStatus(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <p className="font-medium text-neutral-900">Receipts</p>
                  <p className="text-sm text-neutral-500">Include receipt images as additional pages</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={includeReceipts} onChange={(e) => setIncludeReceipts(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-checked:bg-[#476E66] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {includeReceipts && (
                <div className="ml-4 p-4 border border-neutral-200 rounded-xl">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Receipts Per Page</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setReceiptsPerPage(num)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${receiptsPerPage === num ? 'bg-[#476E66] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Font Family</label>
                <select
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 outline-none"
                >
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Courier New">Courier New</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Font Size</label>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 outline-none"
                >
                  {[8, 9, 10, 11, 12, 14].map((size) => (
                    <option key={size} value={size}>{size}pt</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Color Scheme</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'default', label: 'Default', colors: ['#000000', '#666666'] },
                    { id: 'professional', label: 'Professional', colors: ['#1a365d', '#2b6cb0'] },
                    { id: 'modern', label: 'Modern', colors: ['#171717', '#737373'] },
                  ].map((scheme) => (
                    <label key={scheme.id} className={`p-4 border rounded-xl cursor-pointer transition-colors ${colorScheme === scheme.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
                      }`}>
                      <input type="radio" name="colorScheme" value={scheme.id} checked={colorScheme === scheme.id} onChange={() => setColorScheme(scheme.id)} className="sr-only" />
                      <div className="flex gap-1 mb-2">
                        {scheme.colors.map((color, i) => (
                          <div key={i} className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      <span className="text-sm font-medium">{scheme.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </form>

        <div className="p-6 border-t border-neutral-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}


// Unified Codes & Fields Tab Component
function CodesAndFieldsTab({ companyId }: { companyId: string }) {
  type CategoryType = 'basic' | 'field-values' | 'status' | 'cost-centers';
  type SubTabType = string;

  const [activeCategory, setActiveCategory] = useState<CategoryType>('basic');
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('categories');
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const categories = [
    { id: 'basic', label: 'Catalog Settings', description: 'Service categories, expense types, payment terms' },
    { id: 'field-values', label: 'Custom Fields', description: 'Contact labels, departments, roles, locations' },
    { id: 'status', label: 'Workflow Statuses', description: 'Track project and team status workflows' },
    { id: 'cost-centers', label: 'Cost Tracking', description: 'Cost groups, functions, locations' },
  ];

  const subTabsMap: Record<CategoryType, { id: string; label: string }[]> = {
    'basic': [
      { id: 'categories', label: 'Service Categories' },
      { id: 'expense_codes', label: 'Expense Types' },
      { id: 'invoice_terms', label: 'Payment Terms' },
    ],
    'field-values': [
      { id: 'contact_types', label: 'Contact Labels' },
      { id: 'departments', label: 'Departments' },
      { id: 'team_roles', label: 'Roles' },
      { id: 'locations', label: 'Locations' },
      { id: 'task_types', label: 'Task Types' },
      { id: 'project_types', label: 'Project Types' },
    ],
    'status': [
      { id: 'project_statuses', label: 'Project' },
      { id: 'billing_statuses', label: 'Billing' },
      { id: 'staff_statuses', label: 'Team' },
    ],
    'cost-centers': [
      { id: 'cost_center_groups', label: 'Groups' },
      { id: 'cost_center_functions', label: 'Functions' },
      { id: 'cost_center_locations', label: 'Locations' },
    ],
  };

  useEffect(() => {
    setActiveSubTab(subTabsMap[activeCategory][0].id);
    setSelectedItem(null);
  }, [activeCategory]);

  useEffect(() => {
    loadItems();
  }, [companyId, activeCategory, activeSubTab, includeInactive]);

  async function loadItems() {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      let data: any[] = [];
      if (activeCategory === 'basic') {
        if (activeSubTab === 'categories') data = await settingsApi.getCategories(companyId, includeInactive);
        else if (activeSubTab === 'expense_codes') data = await settingsApi.getExpenseCodes(companyId, includeInactive);
        else if (activeSubTab === 'invoice_terms') data = await settingsApi.getInvoiceTerms(companyId, includeInactive);
      } else if (activeCategory === 'field-values') {
        data = await settingsApi.getFieldValues(activeSubTab, companyId, includeInactive);
      } else if (activeCategory === 'status') {
        data = await settingsApi.getStatusCodes(activeSubTab, companyId, includeInactive);
      } else if (activeCategory === 'cost-centers') {
        data = await settingsApi.getCostCenters(activeSubTab, companyId, includeInactive);
      }
      setItems(data);
      if (data.length > 0 && !selectedItem) setSelectedItem(data[0]);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const itemData = { ...selectedItem, company_id: companyId };
      if (activeCategory === 'basic') {
        if (selectedItem.id) {
          if (activeSubTab === 'categories') await settingsApi.updateCategory(selectedItem.id, itemData);
          else if (activeSubTab === 'expense_codes') await settingsApi.updateExpenseCode(selectedItem.id, itemData);
          else if (activeSubTab === 'invoice_terms') await settingsApi.updateInvoiceTerm(selectedItem.id, itemData);
        } else {
          if (activeSubTab === 'categories') await settingsApi.createCategory(itemData);
          else if (activeSubTab === 'expense_codes') await settingsApi.createExpenseCode(itemData);
          else if (activeSubTab === 'invoice_terms') await settingsApi.createInvoiceTerm(itemData);
        }
      } else if (activeCategory === 'field-values') {
        if (selectedItem.id) await settingsApi.updateFieldValue(activeSubTab, selectedItem.id, itemData);
        else await settingsApi.createFieldValue(activeSubTab, itemData);
      } else if (activeCategory === 'status') {
        if (selectedItem.id) await settingsApi.updateStatusCode(activeSubTab, selectedItem.id, itemData);
        else await settingsApi.createStatusCode(activeSubTab, itemData);
      } else if (activeCategory === 'cost-centers') {
        if (selectedItem.id) await settingsApi.updateCostCenter(activeSubTab, selectedItem.id, itemData);
        else await settingsApi.createCostCenter(activeSubTab, itemData);
      }
      loadItems();
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedItem?.id) return;
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      if (activeCategory === 'basic') {
        if (activeSubTab === 'categories') await settingsApi.deleteCategory(selectedItem.id);
        else if (activeSubTab === 'expense_codes') await settingsApi.deleteExpenseCode(selectedItem.id);
        else if (activeSubTab === 'invoice_terms') await settingsApi.deleteInvoiceTerm(selectedItem.id);
      } else if (activeCategory === 'field-values') {
        await settingsApi.deleteFieldValue(activeSubTab, selectedItem.id);
      } else if (activeCategory === 'status') {
        await settingsApi.deleteStatusCode(activeSubTab, selectedItem.id);
      } else if (activeCategory === 'cost-centers') {
        await settingsApi.deleteCostCenter(activeSubTab, selectedItem.id);
      }
      setSelectedItem(null);
      loadItems();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  function addNewItem() {
    if (activeCategory === 'basic') {
      if (activeSubTab === 'categories') setSelectedItem({ name: '', code: '', description: '', is_inactive: false });
      else if (activeSubTab === 'expense_codes') setSelectedItem({ name: '', code: '', description: '', is_inactive: false });
      else if (activeSubTab === 'invoice_terms') setSelectedItem({ name: '', days_out: 30, is_default: false, is_inactive: false });
    } else if (activeCategory === 'field-values') {
      setSelectedItem({ value: '', description: '', is_inactive: false });
    } else if (activeCategory === 'status') {
      setSelectedItem({ value: '', description: '', is_inactive: false });
    } else if (activeCategory === 'cost-centers') {
      setSelectedItem({ name: '', abbreviation: '', description: '', is_inactive: false });
    }
  }

  const filteredItems = items.filter(item => {
    const name = item.name || item.value || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const currentSubTabs = subTabsMap[activeCategory];

  return (
    <div className="space-y-2.5">
      {/* Category Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as CategoryType)}
            className={`p-3 rounded-sm border text-left transition-all ${activeCategory === cat.id
              ? 'border-neutral-900 bg-neutral-50'
              : 'border-neutral-200 hover:border-neutral-300 bg-white'
              }`}
          >
            <p className={`font-bold text-[11px] uppercase tracking-wide leading-tight ${activeCategory === cat.id ? 'text-neutral-900' : 'text-neutral-600'}`}>
              {cat.label}
            </p>
            <p className="text-[10px] text-neutral-500 mt-1 leading-tight">{cat.description}</p>
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-6 border-b border-neutral-200 pb-0.5 mb-4 overflow-x-auto scrollbar-hide">
        {currentSubTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === tab.id
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-2.5">
        {/* Left Panel - List */}
        <div className="w-full lg:w-64 bg-white rounded-lg border border-neutral-100 flex flex-col">
          <div className="p-2 border-b border-neutral-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <button onClick={addNewItem} className="flex items-center gap-1 px-2 py-1.5 bg-[#476E66] text-white text-[11px] font-medium rounded-lg hover:bg-[#3A5B54] transition-colors">
                <Plus className="w-3 h-3" /> Add New
              </button>
              <label className="flex items-center gap-1 text-[11px] text-neutral-600 cursor-pointer">
                <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="w-3 h-3 rounded border-neutral-300" />
                <span className="hidden sm:inline">Inactive</span>
              </label>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-2.5 pr-2.5 py-1.5 text-[11px] border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[350px] divide-y divide-neutral-100">
            {loading ? (
              <div className="p-3 text-center text-neutral-500 text-xs">Loading...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-3 text-center text-neutral-500 text-xs">No items found</div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full p-2 text-left hover:bg-neutral-50 transition-colors ${selectedItem?.id === item.id ? 'bg-neutral-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-medium text-xs leading-tight truncate ${item.is_inactive ? 'text-neutral-400' : 'text-neutral-900'}`}>
                      {item.name || item.value}
                    </span>
                    {item.is_inactive && <span className="text-[10px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded flex-shrink-0">Inactive</span>}
                  </div>
                  {item.description && <p className="text-[10px] text-neutral-500 truncate mt-0.5">{item.description}</p>}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Details */}
        <div className="flex-1 bg-white rounded-lg border border-neutral-100 p-3">
          {selectedItem ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">{selectedItem.id ? 'Edit' : 'New'} Item</h3>
                {selectedItem.id && (
                  <button onClick={handleDelete} className="p-1.5 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dynamic Fields based on category */}
              <div className="space-y-2.5">
                {(activeCategory === 'basic' || activeCategory === 'cost-centers') && (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={selectedItem.name || ''}
                      onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                    />
                  </div>
                )}
                {(activeCategory === 'field-values' || activeCategory === 'status') && (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">Value *</label>
                    <input
                      type="text"
                      value={selectedItem.value || ''}
                      onChange={(e) => setSelectedItem({ ...selectedItem, value: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                    />
                  </div>
                )}
                {activeCategory === 'basic' && activeSubTab !== 'invoice_terms' && (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={selectedItem.code || ''}
                      onChange={(e) => setSelectedItem({ ...selectedItem, code: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                    />
                  </div>
                )}
                {activeCategory === 'cost-centers' && (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">Abbreviation</label>
                    <input
                      type="text"
                      value={selectedItem.abbreviation || ''}
                      onChange={(e) => setSelectedItem({ ...selectedItem, abbreviation: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                    />
                  </div>
                )}
                {activeCategory === 'basic' && activeSubTab === 'invoice_terms' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-700 mb-1">Days Out</label>
                      <input
                        type="number"
                        value={selectedItem.days_out || 0}
                        onChange={(e) => setSelectedItem({ ...selectedItem, days_out: parseInt(e.target.value) || 0 })}
                        className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedItem.is_default || false}
                        onChange={(e) => setSelectedItem({ ...selectedItem, is_default: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-neutral-300"
                      />
                      Default Term
                    </label>
                  </>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">Description</label>
                  <textarea
                    value={selectedItem.description || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })}
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none resize-none"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedItem.is_inactive || false}
                    onChange={(e) => setSelectedItem({ ...selectedItem, is_inactive: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-neutral-300"
                  />
                  Inactive
                </label>
              </div>

              <div className="flex gap-2 pt-2.5 border-t border-neutral-100">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-500 p-4">
              <p className="text-xs text-center">Select an item to edit or click "Add New" to create one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// Basic Codes Tab Component (Legacy - kept for reference)
function BasicCodesTab({ companyId }: { companyId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<'categories' | 'expense_codes' | 'invoice_terms'>('categories');
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (companyId) {
      loadItems();
    } else {
      setLoading(false);
      setItems([]);
    }
  }, [companyId, activeSubTab, includeInactive]);

  async function loadItems() {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let data: any[] = [];
      if (activeSubTab === 'categories') {
        data = await settingsApi.getCategories(companyId, includeInactive);
      } else if (activeSubTab === 'expense_codes') {
        data = await settingsApi.getExpenseCodes(companyId, includeInactive);
      } else if (activeSubTab === 'invoice_terms') {
        data = await settingsApi.getInvoiceTerms(companyId, includeInactive);
      }
      setItems(data);
      if (data.length > 0 && !selectedItem) setSelectedItem(data[0]);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedItem) return;
    setSaving(true);
    try {
      if (selectedItem.id) {
        if (activeSubTab === 'categories') {
          await settingsApi.updateCategory(selectedItem.id, selectedItem);
        } else if (activeSubTab === 'expense_codes') {
          await settingsApi.updateExpenseCode(selectedItem.id, selectedItem);
        } else if (activeSubTab === 'invoice_terms') {
          await settingsApi.updateInvoiceTerm(selectedItem.id, selectedItem);
        }
      } else {
        const newItem = { ...selectedItem, company_id: companyId };
        if (activeSubTab === 'categories') {
          await settingsApi.createCategory(newItem);
        } else if (activeSubTab === 'expense_codes') {
          await settingsApi.createExpenseCode(newItem);
        } else if (activeSubTab === 'invoice_terms') {
          await settingsApi.createInvoiceTerm(newItem);
        }
      }
      loadItems();
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedItem?.id) return;
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      if (activeSubTab === 'categories') {
        await settingsApi.deleteCategory(selectedItem.id);
      } else if (activeSubTab === 'expense_codes') {
        await settingsApi.deleteExpenseCode(selectedItem.id);
      } else if (activeSubTab === 'invoice_terms') {
        await settingsApi.deleteInvoiceTerm(selectedItem.id);
      }
      setSelectedItem(null);
      loadItems();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  function addNewItem() {
    if (activeSubTab === 'categories') {
      setSelectedItem({ name: '', code: '', service_item: '', tax_rate: 0, description: '', is_non_billable: false, is_inactive: false });
    } else if (activeSubTab === 'expense_codes') {
      setSelectedItem({ name: '', code: '', service_item: '', description: '', markup_percent: 0, is_taxable: false, is_inactive: false });
    } else if (activeSubTab === 'invoice_terms') {
      setSelectedItem({ name: '', days_out: 30, quickbooks_link: '', is_default: false, is_inactive: false });
    }
  }

  const filteredItems = items.filter(item => {
    const name = item.name || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const subTabs = [
    { id: 'categories', label: 'CATEGORIES' },
    { id: 'expense_codes', label: 'Expense Codes' },
    { id: 'invoice_terms', label: 'Invoice Terms' },
  ];

  if (!companyId) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-neutral-100 text-center">
        <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Tag className="w-8 h-8 text-neutral-400" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-2">Company Setup Required</h3>
        <p className="text-neutral-500">Please set up your company profile first to manage basic codes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id as any); setSelectedItem(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel - List */}
        <div className="w-full lg:w-80 bg-white rounded-2xl border border-neutral-100 flex flex-col">
          <div className="p-4 border-b border-neutral-100 space-y-3">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-neutral-400 outline-none"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={addNewItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#476E66] text-white text-sm rounded-lg hover:bg-[#3A5B54]"
              >
                <Plus className="w-4 h-4" /> Add New Value
              </button>
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                Include Inactive
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No items found</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${selectedItem?.id === item.id ? 'bg-neutral-100' : ''
                      }`}
                  >
                    <p className={`font-medium ${item.is_inactive ? 'text-neutral-400' : 'text-neutral-900'}`}>
                      {item.name}
                    </p>
                    {item.code && <p className="text-xs text-neutral-500">{item.code}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Edit Form */}
        <div className="flex-1 bg-white rounded-2xl border border-neutral-100 p-6">
          {selectedItem ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {selectedItem.id ? 'Edit' : 'New'} {activeSubTab === 'categories' ? 'Category' : activeSubTab === 'expense_codes' ? 'Expense Code' : 'Invoice Term'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={selectedItem.name || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                  />
                </div>

                {(activeSubTab === 'categories' || activeSubTab === 'expense_codes') && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={selectedItem.code || ''}
                      onChange={(e) => setSelectedItem({ ...selectedItem, code: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                    />
                  </div>
                )}

                {activeSubTab === 'invoice_terms' && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Days Out</label>
                    <input
                      type="number"
                      value={selectedItem.days_out || 30}
                      onChange={(e) => setSelectedItem({ ...selectedItem, days_out: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                    />
                  </div>
                )}
              </div>

              {(activeSubTab === 'categories' || activeSubTab === 'expense_codes') && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Service Item</label>
                  <input
                    type="text"
                    value={selectedItem.service_item || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, service_item: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                  />
                </div>
              )}

              {activeSubTab === 'categories' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedItem.tax_rate || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, tax_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                  />
                </div>
              )}

              {activeSubTab === 'expense_codes' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Markup Percent (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedItem.markup_percent || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, markup_percent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                  />
                </div>
              )}

              {(activeSubTab === 'categories' || activeSubTab === 'expense_codes' || activeSubTab === 'invoice_terms') && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    {activeSubTab === 'invoice_terms' ? 'QuickBooks Link' : 'Description'}
                  </label>
                  <textarea
                    value={activeSubTab === 'invoice_terms' ? (selectedItem.quickbooks_link || '') : (selectedItem.description || '')}
                    onChange={(e) => setSelectedItem({
                      ...selectedItem,
                      [activeSubTab === 'invoice_terms' ? 'quickbooks_link' : 'description']: e.target.value
                    })}
                    rows={3}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none resize-none"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                {activeSubTab === 'categories' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItem.is_non_billable || false}
                      onChange={(e) => setSelectedItem({ ...selectedItem, is_non_billable: e.target.checked })}
                      className="w-4 h-4 rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-700">Non-Billable</span>
                  </label>
                )}

                {activeSubTab === 'expense_codes' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItem.is_taxable || false}
                      onChange={(e) => setSelectedItem({ ...selectedItem, is_taxable: e.target.checked })}
                      className="w-4 h-4 rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-700">Taxable</span>
                  </label>
                )}

                {activeSubTab === 'invoice_terms' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItem.is_default || false}
                      onChange={(e) => setSelectedItem({ ...selectedItem, is_default: e.target.checked })}
                      className="w-4 h-4 rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-700">Default</span>
                  </label>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedItem.is_inactive || false}
                    onChange={(e) => setSelectedItem({ ...selectedItem, is_inactive: e.target.checked })}
                    className="w-4 h-4 rounded border-neutral-300"
                  />
                  <span className="text-sm text-neutral-700">Inactive</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-neutral-100">
                {selectedItem.id && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedItem.name}
                  className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              Select an item to edit or click "Add New Value" to create one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Field Values Tab Component
function FieldValuesTab({ companyId }: { companyId: string }) {
  const [activeSubTab, setActiveSubTab] = useState('project_types');
  const [items, setItems] = useState<FieldValue[]>([]);
  const [selectedItem, setSelectedItem] = useState<FieldValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const subTabs = [
    { id: 'project_types', label: 'Project Type' },
    { id: 'contact_types', label: 'Contact Type' },
    { id: 'team_roles', label: 'Team Role' },
    { id: 'staff_departments', label: 'Staff Dept' },
    { id: 'staff_teams', label: 'Staff Team' },
    { id: 'merchants', label: 'Merchant' },
    { id: 'locations', label: 'Location' },
    { id: 'credit_cards', label: 'Credit Cards' },
    { id: 'client_types', label: 'Client Type' },
  ];

  useEffect(() => {
    if (companyId) {
      loadItems();
    } else {
      setLoading(false);
      setItems([]);
    }
  }, [companyId, activeSubTab, includeInactive]);

  async function loadItems() {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await settingsApi.getFieldValues(activeSubTab, companyId, includeInactive);
      setItems(data);
      if (data.length > 0 && !selectedItem) setSelectedItem(data[0]);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedItem) return;
    setSaving(true);
    try {
      if (selectedItem.id) {
        await settingsApi.updateFieldValue(activeSubTab, selectedItem.id, selectedItem);
      } else {
        await settingsApi.createFieldValue(activeSubTab, { ...selectedItem, company_id: companyId });
      }
      loadItems();
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedItem?.id) return;
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await settingsApi.deleteFieldValue(activeSubTab, selectedItem.id);
      setSelectedItem(null);
      loadItems();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  function addNewItem() {
    setSelectedItem({ company_id: companyId, value: '', description: '', is_inactive: false } as any);
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-6 border-b border-neutral-200 pb-0.5 overflow-x-auto scrollbar-hide">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === tab.id
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel - List */}
        <div className="w-full lg:w-80 bg-white rounded-lg border border-neutral-100 flex flex-col">
          <div className="p-4 border-b border-neutral-100 space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={addNewItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#476E66] text-white text-sm rounded-lg hover:bg-[#3A5B54]"
              >
                <Plus className="w-4 h-4" /> Add New Value
              </button>
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                Inactive
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No items found</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors flex items-center gap-2 ${selectedItem?.id === item.id ? 'bg-neutral-100' : ''
                      }`}
                  >
                    <GripVertical className="w-4 h-4 text-neutral-300" />
                    <span className={`flex-1 ${item.is_inactive ? 'text-neutral-400' : 'text-neutral-900'}`}>
                      {item.value}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Edit Form */}
        <div className="flex-1 bg-white rounded-lg border border-neutral-100 p-6">
          {selectedItem ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {selectedItem.id ? 'Edit' : 'New'} {subTabs.find(t => t.id === activeSubTab)?.label}
              </h3>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Value *</label>
                <input
                  type="text"
                  value={selectedItem.value || ''}
                  onChange={(e) => setSelectedItem({ ...selectedItem, value: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  value={selectedItem.description || ''}
                  onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedItem.is_inactive || false}
                  onChange={(e) => setSelectedItem({ ...selectedItem, is_inactive: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                <span className="text-sm text-neutral-700">Inactive</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-neutral-100">
                {selectedItem.id && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedItem.value}
                  className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              Select an item to edit or click "Add New Value" to create one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Status Codes Tab Component
function StatusCodesTab({ companyId }: { companyId: string }) {
  const [activeSubTab, setActiveSubTab] = useState('project_statuses');
  const [items, setItems] = useState<StatusCode[]>([]);
  const [selectedItem, setSelectedItem] = useState<StatusCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const subTabs = [
    { id: 'project_statuses', label: 'Project' },
    { id: 'billing_statuses', label: 'Project (Billing)' },
    { id: 'staff_statuses', label: 'Staff Member' },
  ];

  useEffect(() => {
    loadItems();
  }, [companyId, activeSubTab, includeInactive]);

  async function loadItems() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await settingsApi.getStatusCodes(activeSubTab, companyId, includeInactive);
      setItems(data);
      if (data.length > 0 && !selectedItem) setSelectedItem(data[0]);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedItem) return;
    setSaving(true);
    try {
      if (selectedItem.id) {
        await settingsApi.updateStatusCode(activeSubTab, selectedItem.id, selectedItem);
      } else {
        await settingsApi.createStatusCode(activeSubTab, { ...selectedItem, company_id: companyId });
      }
      loadItems();
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedItem?.id) return;
    if (!confirm('Are you sure you want to delete this status?')) return;
    try {
      await settingsApi.deleteStatusCode(activeSubTab, selectedItem.id);
      setSelectedItem(null);
      loadItems();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  function addNewItem() {
    setSelectedItem({ company_id: companyId, value: '', description: '', items_inactive: false, is_inactive: false } as any);
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-6 border-b border-neutral-200 pb-0.5 w-full">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === tab.id
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel - List */}
        <div className="w-full lg:w-80 bg-white rounded-lg border border-neutral-100 flex flex-col">
          <div className="p-4 border-b border-neutral-100 space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={addNewItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#476E66] text-white text-sm rounded-lg hover:bg-[#3A5B54]"
              >
                <Plus className="w-4 h-4" /> Add Status
              </button>
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                Inactive
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No statuses found</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${selectedItem?.id === item.id ? 'bg-neutral-100' : ''
                      }`}
                  >
                    <span className={item.is_inactive ? 'text-neutral-400' : 'text-neutral-900'}>
                      {item.value}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Edit Form */}
        <div className="flex-1 bg-white rounded-lg border border-neutral-100 p-6">
          {selectedItem ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {selectedItem.id ? 'Edit' : 'New'} Status
              </h3>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Value *</label>
                <input
                  type="text"
                  value={selectedItem.value || ''}
                  onChange={(e) => setSelectedItem({ ...selectedItem, value: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  value={selectedItem.description || ''}
                  onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedItem.items_inactive || false}
                  onChange={(e) => setSelectedItem({ ...selectedItem, items_inactive: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                <span className="text-sm text-neutral-700">Items attached to this status are inactive</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedItem.is_inactive || false}
                  onChange={(e) => setSelectedItem({ ...selectedItem, is_inactive: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                <span className="text-sm text-neutral-700">Inactive (hide from lists)</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-neutral-100">
                {selectedItem.id && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedItem.value}
                  className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              Select a status to edit or click "Add Status" to create one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Cost Centers Tab Component
function CostCentersTab({ companyId }: { companyId: string }) {
  const [activeSubTab, setActiveSubTab] = useState('cost_center_groups');
  const [items, setItems] = useState<CostCenter[]>([]);
  const [selectedItem, setSelectedItem] = useState<CostCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const subTabs = [
    { id: 'cost_center_groups', label: 'GROUP' },
    { id: 'cost_center_functions', label: 'FUNCTION' },
    { id: 'cost_center_locations', label: 'LOCATION' },
  ];

  useEffect(() => {
    loadItems();
  }, [companyId, activeSubTab, includeInactive]);

  async function loadItems() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await settingsApi.getCostCenters(activeSubTab, companyId, includeInactive);
      setItems(data);
      if (data.length > 0 && !selectedItem) setSelectedItem(data[0]);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedItem) return;
    setSaving(true);
    try {
      if (selectedItem.id) {
        await settingsApi.updateCostCenter(activeSubTab, selectedItem.id, selectedItem);
      } else {
        await settingsApi.createCostCenter(activeSubTab, { ...selectedItem, company_id: companyId });
      }
      loadItems();
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedItem?.id) return;
    if (!confirm('Are you sure you want to delete this cost center?')) return;
    try {
      await settingsApi.deleteCostCenter(activeSubTab, selectedItem.id);
      setSelectedItem(null);
      loadItems();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  function addNewItem() {
    setSelectedItem({ company_id: companyId, name: '', abbreviation: '', description: '', is_inactive: false } as any);
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-6 border-b border-neutral-200 pb-0.5 w-full">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`pb-2 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeSubTab === tab.id
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel - List */}
        <div className="w-full lg:w-80 bg-white rounded-lg border border-neutral-100 flex flex-col">
          <div className="p-4 border-b border-neutral-100 space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={addNewItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#476E66] text-white text-sm rounded-lg hover:bg-[#3A5B54]"
              >
                <Plus className="w-4 h-4" /> Add Cost Center
              </button>
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                Inactive
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">No cost centers found</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${selectedItem?.id === item.id ? 'bg-neutral-100' : ''
                      }`}
                  >
                    <p className={item.is_inactive ? 'text-neutral-400' : 'text-neutral-900'}>
                      {item.name}
                    </p>
                    {item.abbreviation && <p className="text-xs text-neutral-500">{item.abbreviation}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Edit Form */}
        <div className="flex-1 bg-white rounded-lg border border-neutral-100 p-6">
          {selectedItem ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {selectedItem.id ? 'Edit' : 'New'} Cost Center
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={selectedItem.name || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Abbreviation</label>
                  <input
                    type="text"
                    value={selectedItem.abbreviation || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, abbreviation: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  value={selectedItem.description || ''}
                  onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-400 outline-none resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedItem.is_inactive || false}
                  onChange={(e) => setSelectedItem({ ...selectedItem, is_inactive: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-300"
                />
                <span className="text-sm text-neutral-700">Inactive</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-neutral-100">
                {selectedItem.id && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedItem.name}
                  className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              Select a cost center to edit or click "Add Cost Center" to create one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// Integrations Tab Component - Stripe Connect
function IntegrationsTab({ companyId }: { companyId: string }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    loadStripeStatus();
    // Check for Stripe Connect callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_connected') === 'true') {
      showToast('Stripe account connected successfully!', 'success');
      window.history.replaceState({}, '', `${window.location.pathname}?tab=integrations`);
    } else if (params.get('stripe_refresh') === 'true') {
      showToast('Please complete Stripe onboarding to enable payments.', 'info');
      window.history.replaceState({}, '', `${window.location.pathname}?tab=integrations`);
    }
  }, [companyId]);

  async function loadStripeStatus() {
    setLoading(true);
    try {
      const settings = await api.getCompanySettings(companyId);
      setStripeAccountId(settings?.stripe_account_id || null);
    } catch (error) {
      console.error('Failed to load Stripe status:', error);
    }
    setLoading(false);
  }



  async function handleConnectStripe() {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-connect-oauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ action: 'get_oauth_link', company_id: companyId })
      });
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }
      // Redirect to Stripe OAuth
      window.location.href = result.data.url;
    } catch (error: any) {
      console.error('Connect Stripe error:', error);
      showToast(error.message || 'Failed to initiate Stripe connection', 'error');
      setConnecting(false);
    }
  }

  async function handleDisconnectStripe() {
    if (!confirm('Are you sure you want to disconnect your Stripe account? Clients will no longer be able to pay invoices online.')) {
      return;
    }
    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-connect-oauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ action: 'disconnect', company_id: companyId })
      });
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }
      setStripeAccountId(null);
      showToast('Stripe account disconnected', 'success');
    } catch (error: any) {
      console.error('Disconnect Stripe error:', error);
      showToast(error.message || 'Failed to disconnect Stripe account', 'error');
    }
    setDisconnecting(false);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 border border-neutral-100">
        <div className="flex justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-3">Payment Integrations</h2>

        {/* Stripe Connect Card */}
        <div className="border border-neutral-200 rounded-lg p-4 bg-white">
          <div className="flex items-start gap-3">
            {/* Stripe Logo */}
            <div className="w-10 h-10 bg-[#635BFF] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Stripe</h3>
                {stripeAccountId ? (
                  <span className="px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[10px] font-bold uppercase tracking-wider">
                    Connected
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[10px] font-bold uppercase tracking-wider">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-neutral-500 text-xs mb-3">
                Accept credit/debit card payments on invoices automatically
              </p>

              {stripeAccountId ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                    <Check className="w-3 h-3 text-[#476E66]" />
                    <span className="truncate">ID: {stripeAccountId}</span>
                  </div>
                  <button
                    onClick={handleDisconnectStripe}
                    disabled={disconnecting}
                    className="mt-2 text-xs font-bold text-neutral-500 hover:text-red-600 underline uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect Account'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectStripe}
                  disabled={connecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#635BFF] text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-[#5851DB] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {connecting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="w-3 h-3" />
                      Connect Stripe
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-3 p-3 bg-neutral-50 border border-neutral-100 rounded-lg">
          <h4 className="font-bold text-neutral-900 text-[10px] uppercase tracking-wide mb-1.5">How it works</h4>
          <ol className="text-[10px] text-neutral-600 space-y-0.5 list-decimal list-inside ml-1">
            <li>Connect your Stripe account</li>
            <li>Clients see "Pay Now" on invoices</li>
            <li>Payments sync automatically</li>
          </ol>
        </div>
      </div>

      <BigTimeIntegrationCard companyId={companyId} />
    </div>
  );
}

// BigTime Integration Component
function BigTimeIntegrationCard({ companyId }: { companyId: string }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; type: string } | null>(null);

  // Credentials
  const [apiToken, setApiToken] = useState('');
  const [firmId, setFirmId] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Import options
  const [importClients, setImportClients] = useState(true);
  const [importProjects, setImportProjects] = useState(true);
  const [importTasks, setImportTasks] = useState(true);
  const [importStaff, setImportStaff] = useState(true);
  const [importTimeEntries, setImportTimeEntries] = useState(false);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    loadBigTimeStatus();
  }, [companyId]);

  async function loadBigTimeStatus() {
    setLoading(true);
    try {
      const settings = await api.getCompanySettings(companyId);
      if (settings?.bigtime_api_token && settings?.bigtime_firm_id) {
        setApiToken(settings.bigtime_api_token);
        setFirmId(settings.bigtime_firm_id);
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Failed to load BigTime status:', error);
    }
    setLoading(false);
  }

  async function handleConnect() {
    if (!apiToken.trim() || !firmId.trim()) {
      showToast('Please enter both API Token and Firm ID', 'error');
      return;
    }
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Validate credentials by testing the API
      const testResponse = await fetch(`${SUPABASE_URL}/functions/v1/bigtime-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          action: 'validate',
          company_id: companyId,
          api_token: apiToken,
          firm_id: firmId
        })
      });
      const result = await testResponse.json();
      if (result.error) {
        throw new Error(result.error.message || 'Invalid credentials');
      }
      // Save credentials
      await api.upsertCompanySettings({
        company_id: companyId,
        bigtime_api_token: apiToken,
        bigtime_firm_id: firmId
      });
      setIsConnected(true);
      showToast('BigTime connected successfully!', 'success');
    } catch (error: any) {
      console.error('BigTime connect error:', error);
      showToast(error.message || 'Failed to connect to BigTime', 'error');
    }
    setConnecting(false);
  }

  async function handleDisconnect() {
    if (!confirm('Are you sure you want to disconnect BigTime? Your imported data will remain.')) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.upsertCompanySettings({
        company_id: companyId,
        bigtime_api_token: null,
        bigtime_firm_id: null
      });
      setApiToken('');
      setFirmId('');
      setIsConnected(false);
      showToast('BigTime disconnected', 'success');
    } catch (error: any) {
      console.error('BigTime disconnect error:', error);
      showToast(error.message || 'Failed to disconnect BigTime', 'error');
    }
    setDisconnecting(false);
  }

  async function handleStartImport() {
    const selectedTypes = [];
    if (importClients) selectedTypes.push('clients');
    if (importProjects) selectedTypes.push('projects');
    if (importTasks) selectedTypes.push('tasks');
    if (importStaff) selectedTypes.push('staff');
    if (importTimeEntries) selectedTypes.push('time_entries');

    if (selectedTypes.length === 0) {
      showToast('Please select at least one data type to import', 'error');
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: selectedTypes.length, type: selectedTypes[0] });

    try {
      const { data: { session } } = await supabase.auth.getSession();

      for (let i = 0; i < selectedTypes.length; i++) {
        const dataType = selectedTypes[i];
        setImportProgress({ current: i, total: selectedTypes.length, type: dataType });

        const response = await fetch(`${SUPABASE_URL}/functions/v1/bigtime-import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            action: 'import',
            company_id: companyId,
            api_token: apiToken,
            firm_id: firmId,
            data_type: dataType
          })
        });

        const result = await response.json();
        if (result.error) {
          throw new Error(`Failed to import ${dataType}: ${result.error.message}`);
        }
      }

      setImportProgress({ current: selectedTypes.length, total: selectedTypes.length, type: 'complete' });
      showToast('Import completed successfully!', 'success');
    } catch (error: any) {
      console.error('Import error:', error);
      showToast(error.message || 'Import failed', 'error');
    }

    setTimeout(() => {
      setImporting(false);
      setImportProgress(null);
    }, 2000);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex justify-center py-3">
          <div className="animate-spin w-4 h-4 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 rounded-lg p-4 bg-white mt-6">
      <h2 className="text-xs font-semibold text-neutral-900 mb-2 sr-only">Data Import</h2>

      <div className="flex items-start gap-3">
        {/* BigTime Logo */}
        <div className="w-10 h-10 bg-[#0066CC] rounded-lg flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">BigTime</h3>
            {isConnected ? (
              <span className="px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[10px] font-bold uppercase tracking-wider">
                Connected
              </span>
            ) : (
              <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[10px] font-bold uppercase tracking-wider">
                Not Connected
              </span>
            )}
          </div>
          <p className="text-neutral-500 text-xs mb-3">
            Import clients, projects, tasks & time from BigTime
          </p>

          {isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                <Check className="w-3 h-3 text-[#476E66]" />
                <span>Firm: {firmId}</span>
              </div>

              {/* Import Options */}
              <div className="border-t border-neutral-100 pt-3">
                <h4 className="font-bold text-neutral-900 text-[10px] uppercase tracking-wide mb-2">Select data to import:</h4>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { id: 'clients', label: 'Clients', checked: importClients, onChange: setImportClients },
                    { id: 'projects', label: 'Projects', checked: importProjects, onChange: setImportProjects },
                    { id: 'tasks', label: 'Tasks', checked: importTasks, onChange: setImportTasks },
                    { id: 'staff', label: 'Staff', checked: importStaff, onChange: setImportStaff },
                    { id: 'timeEntries', label: 'Time', checked: importTimeEntries, onChange: setImportTimeEntries },
                  ].map(opt => (
                    <label key={opt.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opt.checked}
                        onChange={(e) => opt.onChange(e.target.checked)}
                        disabled={importing}
                        className="w-3.5 h-3.5 rounded border-neutral-300 text-[#0066CC] focus:ring-[#0066CC]"
                      />
                      <span className="text-[11px] text-neutral-700">{opt.label}</span>
                    </label>
                  ))}
                </div>

                {/* Import Progress */}
                {importing && importProgress && (
                  <div className="bg-[#0066CC]/5 border border-[#0066CC]/10 rounded-md p-2 mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="animate-spin w-3 h-3 border-2 border-[#0066CC] border-t-transparent rounded-full" />
                      <span className="text-[10px] font-bold text-[#0066CC] uppercase tracking-wide">
                        {importProgress.type === 'complete' ? 'Complete!' : `Importing ${importProgress.type}...`}
                      </span>
                    </div>
                    <div className="w-full bg-[#0066CC]/20 rounded-full h-1.5">
                      <div
                        className="bg-[#0066CC] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartImport}
                    disabled={importing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0066CC] text-white text-[10px] font-bold uppercase tracking-wider rounded hover:bg-[#0052A3] transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {importing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3 h-3" />
                        Import Data
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting || importing}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600 border border-neutral-200 rounded hover:bg-neutral-50 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? '...' : 'Disconnect'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-w-md">
              {/* Credentials Form */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                    API Token
                  </label>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Enter token"
                    className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-[#0066CC] focus:border-[#0066CC] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                    Firm ID
                  </label>
                  <input
                    type="text"
                    value={firmId}
                    onChange={(e) => setFirmId(e.target.value)}
                    placeholder="Enter ID"
                    className="w-full px-2.5 py-1.5 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-[#0066CC] focus:border-[#0066CC] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0066CC] text-white text-[10px] font-bold uppercase tracking-wider rounded hover:bg-[#0052A3] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {connecting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="w-3 h-3" />
                      Connect BigTime
                    </>
                  )}
                </button>

                <p className="text-[10px] text-neutral-400">
                  Find credentials: My Account → API Settings
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// Email Templates Tab Component
function EmailTemplatesTab({ companyId }: { companyId: string }) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  const placeholders = [
    { key: '{{ client_name }}', description: 'Client company or contact name' },
    { key: '{{ invoice_number }}', description: 'Invoice number (e.g., INV-001)' },
    { key: '{{ amount_due }}', description: 'Total amount due on invoice' },
    { key: '{{ due_date }}', description: 'Invoice due date' },
    { key: '{{ company_name }}', description: 'Your company name' },
  ];

  useEffect(() => {
    let mounted = true;
    async function loadTemplates() {
      setLoading(true);
      try {
        const data = await emailTemplatesApi.getTemplates(companyId);
        if (mounted) {
          setTemplates(data);
          if (data.length > 0) {
            selectTemplate(data[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
        if (mounted) showToast('Failed to load email templates', 'error');
      }
      if (mounted) setLoading(false);
    }
    loadTemplates();
    return () => { mounted = false; };
  }, [companyId]);

  function selectTemplate(template: EmailTemplate) {
    setSelectedTemplate(template);
    setEditSubject(template.subject || '');
    setEditBody(template.body || '');
  }

  async function handleSave() {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await emailTemplatesApi.updateTemplate(selectedTemplate.id, {
        subject: editSubject,
        body: editBody,
      });
      showToast('Template saved successfully', 'success');
      // Reload templates
      const data = await emailTemplatesApi.getTemplates(companyId);
      setTemplates(data);
    } catch (error) {
      console.error('Failed to save template:', error);
      showToast('Failed to save template', 'error');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 border border-neutral-100">
        <div className="flex justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Email Templates</h2>
        <p className="text-neutral-500 text-xs">Customize the emails sent to your clients for payment reminders and other notifications.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Template List */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3 border-b border-neutral-100 pb-2">Templates</h3>
          <div className="space-y-1">
            {templates.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No templates found.</p>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => selectTemplate(template)}
                  className={`w-full text-left px-3 py-2.5 rounded-sm border transition-all ${selectedTemplate?.id === template.id
                    ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                    : 'border-transparent hover:bg-white hover:border-neutral-200'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Mail className={`w-3.5 h-3.5 flex-shrink-0 ${selectedTemplate?.id === template.id ? 'text-neutral-900' : 'text-neutral-400'}`} />
                    <span className={`font-bold text-xs capitalize tracking-tight ${selectedTemplate?.id === template.id ? 'text-neutral-900' : 'text-neutral-600'}`}>
                      {template.template_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Edit Form */}
        <div className="flex-1 bg-white border border-neutral-200 rounded-lg p-5">
          {selectedTemplate ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Subject Line</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-sm border border-neutral-200 text-sm focus:ring-1 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition-all placeholder:text-neutral-400"
                  placeholder="Email subject line..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Email Body</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 rounded-sm border border-neutral-200 text-sm focus:ring-1 focus:ring-neutral-900 focus:border-neutral-900 outline-none resize-none font-mono placeholder:text-neutral-400 text-neutral-700 leading-relaxed"
                  placeholder="Email body content..."
                />
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
                <div className="text-[10px] text-neutral-400 italic">
                  Changes are applied to future emails only.
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[#476E66] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
              <Mail className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-xs font-medium">Select a template to start editing</p>
            </div>
          )}
        </div>
      </div>

      {/* Placeholders Reference */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
        <h3 className="font-bold text-neutral-900 text-[10px] uppercase tracking-wide mb-3">Available Variables</h3>
        <p className="text-[11px] text-neutral-500 mb-4 max-w-2xl">
          Copy and paste these variables into your subject or body. They will be automatically replaced with the actual invoice details when sent.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {placeholders.map((p) => (
            <div key={p.key} className="flex flex-col gap-1 p-2 bg-white border border-neutral-100 rounded-sm">
              <code className="text-[10px] font-mono font-bold text-[#476E66]">{p.key}</code>
              <span className="text-[10px] text-neutral-500">{p.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// Subscription Tab Component
function SubscriptionTab() {
  const { subscription, currentPlan, plans, loading, isPro, isStarter } = useSubscription();
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [usage, setUsage] = useState({ projects: 0, teamMembers: 0, clients: 0, invoices: 0 });
  const [usageLoading, setUsageLoading] = useState(true);

  // Fetch real usage data
  useEffect(() => {
    let mounted = true;
    async function fetchUsage() {
      if (!profile?.company_id) return;

      try {
        // Get current month date range for invoices count
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        // Fetch counts in parallel
        const [projectsRes, clientsRes, teamRes, invoicesRes] = await Promise.all([
          supabase.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).neq('status', 'archived'),
          supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).neq('is_archived', true),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).eq('is_active', true),
          supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).gte('created_at', firstDayOfMonth).lte('created_at', lastDayOfMonth),
        ]);

        if (mounted) {
          setUsage({
            projects: projectsRes.count || 0,
            clients: clientsRes.count || 0,
            teamMembers: teamRes.count || 0,
            invoices: invoicesRes.count || 0,
          });
        }
      } catch (err) {
        console.error('Failed to fetch usage:', err);
      } finally {
        if (mounted) setUsageLoading(false);
      }
    }

    fetchUsage();
    return () => { mounted = false; };
  }, [profile?.company_id]);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const PRICE_IDS = {
    monthly: 'price_1SmkmUGi0VDXirSGgQBI28x7',
    yearly: 'price_1SmkmwGi0VDXirSG193ADu99',
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  async function handleUpgrade() {
    const priceId = billingCycle === 'yearly' ? PRICE_IDS.yearly : PRICE_IDS.monthly;

    setCheckoutLoading(billingCycle);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showToast('Please log in to upgrade', 'error');
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-subscription-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          price_id: priceId,
          user_id: profile?.id,
          success_url: `${window.location.origin}/dashboard?subscription=success`,
          cancel_url: `${window.location.origin}/settings?subscription=canceled`,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message || result.error);
      }

      if (result.url) {
        window.location.href = result.url;
      } else if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Upgrade error:', err);
      showToast(err.message || 'Failed to start upgrade', 'error');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showToast('Please log in to manage subscription', 'error');
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-customer-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: profile?.id,
          return_url: `${window.location.origin}/settings?tab=subscription`,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message || result.error);
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (err: any) {
      console.error('Manage subscription error:', err);
      showToast(err.message || 'Failed to open billing portal', 'error');
    } finally {
      setPortalLoading(false);
    }
  }

  // Progress bar component - compact design
  const UsageBar = ({ used, limit, label, isLoading }: { used: number; limit: number | null; label: string; isLoading?: boolean }) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-500">{label}</span>
          <span className="w-8 h-3 bg-neutral-200 animate-pulse rounded" />
        </div>
      );
    }
    if (limit === null) {
      return (
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-500">{label}</span>
          <span className="text-xs font-medium text-emerald-600">{used} / ∞</span>
        </div>
      );
    }
    const percentage = Math.min((used / limit) * 100, 100);
    const isAtLimit = percentage >= 100;

    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-neutral-500">{label}</span>
        <span className={`text-xs font-medium ${isAtLimit ? 'text-red-600' : 'text-neutral-700'}`}>
          {used} / {limit}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-8 shadow-sm border border-neutral-100">
        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  const features = [
    { name: 'Projects', starter: '3', pro: 'Unlimited' },
    { name: 'Team Members', starter: '2', pro: '50' },
    { name: 'Clients', starter: '5', pro: 'Unlimited' },
    { name: 'Invoices per Month', starter: '10', pro: 'Unlimited' },
    { name: 'Time Tracking', starter: true, pro: true },
    { name: 'Expense Tracking', starter: true, pro: true },
    { name: 'Invoice Generation', starter: true, pro: true },
    { name: 'Custom Branding', starter: false, pro: true },
    { name: 'Advanced Reports', starter: false, pro: true },
    { name: 'Priority Support', starter: false, pro: true },
    { name: 'API Access', starter: false, pro: true },
  ];

  return (
    <div className="space-y-12 max-w-5xl">
      {/* Current Plan & Usage */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Subscription & Usage</h2>
            <p className="text-neutral-500 text-xs">Manage your plan and monitor usage limits</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-md border border-neutral-200">
              <CreditCard className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">{currentPlan?.name || 'Starter'}</span>
              {isPro && <span className="px-1.5 py-0.5 bg-[#476E66] text-white text-[9px] font-bold rounded uppercase tracking-widest">PRO</span>}
            </div>

            {isPro && subscription ? (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="flex items-center gap-2 px-4 py-1.5 border border-neutral-200 text-neutral-900 text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-50 transition-all disabled:opacity-50"
              >
                {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
                <span>Manage Billing</span>
              </button>
            ) : isStarter ? (
              <button
                onClick={handleUpgrade}
                disabled={!!checkoutLoading}
                className="flex items-center gap-2 px-4 py-1.5 bg-neutral-900 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-all disabled:opacity-50"
              >
                {checkoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                <span>Upgrade Plan</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Usage Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 border border-neutral-200 rounded-lg bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Projects</span>
              <span className="text-xs font-medium text-neutral-900">{usage.projects} / {currentPlan?.limits?.projects === -1 ? '∞' : (currentPlan?.limits?.projects ?? 3)}</span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${usage.projects >= (currentPlan?.limits?.projects ?? 3) && currentPlan?.limits?.projects !== -1 ? 'bg-red-500' : 'bg-neutral-900'}`}
                style={{ width: `${currentPlan?.limits?.projects === -1 ? 0 : Math.min((usage.projects / (currentPlan?.limits?.projects ?? 3)) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-4 border border-neutral-200 rounded-lg bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Team</span>
              <span className="text-xs font-medium text-neutral-900">{usage.teamMembers} / {currentPlan?.limits?.team_members === -1 ? '∞' : (currentPlan?.limits?.team_members ?? 2)}</span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${usage.teamMembers >= (currentPlan?.limits?.team_members ?? 2) && currentPlan?.limits?.team_members !== -1 ? 'bg-red-500' : 'bg-neutral-900'}`}
                style={{ width: `${currentPlan?.limits?.team_members === -1 ? 0 : Math.min((usage.teamMembers / (currentPlan?.limits?.team_members ?? 2)) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-4 border border-neutral-200 rounded-lg bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Clients</span>
              <span className="text-xs font-medium text-neutral-900">{usage.clients} / {currentPlan?.limits?.clients === -1 ? '∞' : (currentPlan?.limits?.clients ?? 5)}</span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${usage.clients >= (currentPlan?.limits?.clients ?? 5) && currentPlan?.limits?.clients !== -1 ? 'bg-red-500' : 'bg-neutral-900'}`}
                style={{ width: `${currentPlan?.limits?.clients === -1 ? 0 : Math.min((usage.clients / (currentPlan?.limits?.clients ?? 5)) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-4 border border-neutral-200 rounded-lg bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Invoices (Mo)</span>
              <span className="text-xs font-medium text-neutral-900">{usage.invoices} / {currentPlan?.limits?.invoices_per_month === -1 ? '∞' : (currentPlan?.limits?.invoices_per_month ?? 10)}</span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${usage.invoices >= (currentPlan?.limits?.invoices_per_month ?? 10) && currentPlan?.limits?.invoices_per_month !== -1 ? 'bg-red-500' : 'bg-neutral-900'}`}
                style={{ width: `${currentPlan?.limits?.invoices_per_month === -1 ? 0 : Math.min((usage.invoices / (currentPlan?.limits?.invoices_per_month ?? 10)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Card - Only for Starter users */}
      {isStarter && (
        <div className="bg-neutral-900 rounded-lg p-6 sm:p-8 text-white shadow-xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row gap-8 sm:gap-12">
            {/* Left side - Features */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[9px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5">
                  <Star className="w-3 h-3" fill="currentColor" />
                  Recommended
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3 tracking-tight">Upgrade to Professional</h3>
              <p className="text-neutral-400 mb-6 text-sm leading-relaxed max-w-md">
                Unlock your full potential with unlimited projects, advanced analytics, custom branding, and priority support.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  'Unlimited projects & clients',
                  'Up to 50 team members',
                  'Advanced reporting',
                  'Custom branding',
                  'Priority support',
                  'API access',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 text-emerald-400">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    <span className="text-xs font-medium text-neutral-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side - Pricing */}
            <div className="lg:w-80">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                {/* Billing Toggle */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  <span className={`text-xs font-bold uppercase tracking-wide cursor-pointer ${billingCycle === 'monthly' ? 'text-white' : 'text-neutral-500'}`} onClick={() => setBillingCycle('monthly')}>
                    Monthly
                  </span>
                  <button
                    onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                    className="relative w-10 h-5 rounded-full bg-white/20 transition-colors focus:outline-none"
                  >
                    <span
                      className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-transform"
                      style={{ left: billingCycle === 'yearly' ? '23px' : '4px' }}
                    />
                  </button>
                  <span className={`text-xs font-bold uppercase tracking-wide cursor-pointer ${billingCycle === 'yearly' ? 'text-white' : 'text-neutral-500'}`} onClick={() => setBillingCycle('yearly')}>
                    Yearly
                  </span>
                </div>

                <div className="text-center mb-6">
                  {billingCycle === 'monthly' ? (
                    <>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-bold tracking-tight text-white">$22</span>
                        <span className="text-neutral-400 text-sm font-medium">/mo</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-bold tracking-tight text-white">$17.60</span>
                        <span className="text-neutral-400 text-sm font-medium">/mo</span>
                      </div>
                      <p className="text-emerald-400 text-xs mt-2 font-medium">Save $52.80 per year</p>
                    </>
                  )}
                </div>

                <button
                  onClick={handleUpgrade}
                  disabled={!!checkoutLoading}
                  className="w-full py-3 bg-white text-neutral-900 text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <span>Get Professional</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                <p className="text-center text-white/40 text-[10px] mt-4">
                  Cancel anytime. No questions asked.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Warning */}
      {subscription?.cancel_at_period_end && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-amber-900 text-xs uppercase tracking-wide mb-1">Subscription Ending</h3>
              <p className="text-amber-800 text-xs">
                Your subscription is set to cancel on {formatDate(subscription.current_period_end)}.
                You will lose access to Professional features after this date.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Comparison */}
      <div className="pt-8 border-t border-neutral-200">
        <div className="flex flex-col gap-1 mb-6">
          <h3 className="text-base font-bold text-neutral-900 uppercase tracking-widest">Plan Comparison</h3>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Detailed feature breakdown</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-neutral-200">
                <th className="py-4 pr-4 text-xs font-bold text-neutral-900 uppercase tracking-wider w-1/2">Features</th>
                <th className="py-4 px-4 text-center text-xs font-bold text-neutral-900 uppercase tracking-wider w-1/4">Starter</th>
                <th className="py-4 px-4 text-center text-xs font-bold text-neutral-900 uppercase tracking-wider w-1/4">
                  Professional
                  {billingCycle === 'yearly' && <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] rounded font-bold">SAVE 20%</span>}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {features.map((feature, idx) => (
                <tr key={feature.name} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="py-3 pr-4 text-xs font-medium text-neutral-700">{feature.name}</td>
                  <td className="py-3 px-4 text-center">
                    {typeof feature.starter === 'boolean' ? (
                      feature.starter ? (
                        <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600">
                          <Check className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-neutral-400">
                          <X className="w-3 h-3" />
                        </div>
                      )
                    ) : (
                      <span className="text-xs font-bold text-neutral-900">{feature.starter}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {typeof feature.pro === 'boolean' ? (
                      feature.pro ? (
                        <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600">
                          <Check className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-neutral-400">
                          <X className="w-3 h-3" />
                        </div>
                      )
                    ) : (
                      <span className={`text-xs font-bold ${feature.pro === 'Unlimited' ? 'text-[#476E66]' : 'text-neutral-900'}`}>{feature.pro}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COLLABORATOR CATEGORIES TAB
// ============================================================
function CollaboratorCategoriesTab({ companyId }: { companyId: string }) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<CollaboratorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CollaboratorCategory | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', description: '', color: '#476E66' });

  useEffect(() => {
    let mounted = true;
    async function loadCategories() {
      setLoading(true);
      try {
        const data = await collaboratorCategoryApi.getCategories(companyId);
        if (mounted) setCategories(data);
      } catch (error) {
        console.error('Failed to load collaborator categories:', error);
        if (mounted) showToast?.('Failed to load categories', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadCategories();
    return () => { mounted = false; };
  }, [companyId]);

  async function handleSave() {
    if (!newCategory.name.trim()) {
      showToast?.('Category name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await collaboratorCategoryApi.updateCategory(editingCategory.id, {
          name: newCategory.name,
          description: newCategory.description,
          color: newCategory.color
        });
        showToast?.('Category updated', 'success');
      } else {
        await collaboratorCategoryApi.createCategory({
          company_id: companyId,
          name: newCategory.name,
          description: newCategory.description,
          color: newCategory.color
        });
        showToast?.('Category created', 'success');
      }
      setShowAddModal(false);
      setEditingCategory(null);
      setNewCategory({ name: '', description: '', color: '#476E66' });
      // Reload categories
      const data = await collaboratorCategoryApi.getCategories(companyId);
      setCategories(data);
    } catch (error: any) {
      showToast?.(error.message || 'Failed to save category', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category? This action cannot be undone.')) return;
    try {
      await collaboratorCategoryApi.deleteCategory(id);
      showToast?.('Category deleted', 'success');
      // Reload categories
      const data = await collaboratorCategoryApi.getCategories(companyId);
      setCategories(data);
    } catch (error: any) {
      showToast?.(error.message || 'Failed to delete category', 'error');
    }
  }

  const PRESET_COLORS = [
    '#476E66', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
    '#10B981', '#EF4444', '#6366F1', '#14B8A6', '#F97316'
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-neutral-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-sm p-6 border border-neutral-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-bold text-neutral-900 uppercase tracking-wide">Collaborator Categories</h2>
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mt-1">
              Define categories for the types of collaborators you work with
            </p>
          </div>
          <button
            onClick={() => {
              setEditingCategory(null);
              setNewCategory({ name: '', description: '', color: '#476E66' });
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Category
          </button>
        </div>

        {/* Categories List */}
        {categories.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-sm bg-neutral-50/50">
            <Users className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-[13px] font-bold text-neutral-900 uppercase tracking-wide mb-1">No Categories Yet</h3>
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium mb-4">
              Create categories to organize your collaborators by specialty
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors text-[10px] font-bold uppercase tracking-widest"
            >
              Create First Category
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-4 bg-white rounded-sm border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-8 h-8 rounded-sm flex items-center justify-center border border-neutral-200"
                    style={{ backgroundColor: `${cat.color}15` }}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  </div>
                  <div>
                    <h4 className="font-bold text-neutral-900 text-xs uppercase tracking-wide">{cat.name}</h4>
                    {cat.description && (
                      <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-0.5">{cat.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditingCategory(cat);
                      setNewCategory({
                        name: cat.name,
                        description: cat.description || '',
                        color: cat.color || '#476E66'
                      });
                      setShowAddModal(true);
                    }}
                    className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-sm transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-sm transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-md shadow-2xl border border-neutral-200">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-neutral-900 uppercase tracking-wide">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-neutral-100 rounded-sm text-neutral-400 hover:text-neutral-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Surveying, Engineering"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-sm focus:ring-0 focus:border-neutral-900 text-[13px] bg-neutral-50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                  Description
                </label>
                <textarea
                  value={newCategory.description}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this category..."
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-sm focus:ring-0 focus:border-neutral-900 text-[13px] bg-neutral-50 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">
                  Color Tag
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewCategory(prev => ({ ...prev, color }))}
                      className={`w-6 h-6 rounded-sm transition-all ${newCategory.color === color ? 'ring-2 ring-offset-2 ring-neutral-900 scale-110' : 'hover:scale-110'
                        }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-neutral-100 flex gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingCategory(null);
                  setNewCategory({ name: '', description: '', color: '#476E66' });
                }}
                className="flex-1 px-4 py-2 text-neutral-600 hover:bg-neutral-50 rounded-sm transition-colors border border-neutral-200 text-[10px] font-bold uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !newCategory.name.trim()}
                className="flex-1 px-4 py-2 bg-[#476E66] text-white rounded-sm hover:bg-[#3A5B54] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {editingCategory ? 'Save Changes' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// NOTIFICATIONS TAB
// ============================================================
function NotificationsTab() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    team_invitation: true,
    invoice_sent: true,
    invoice_paid: true,
    invoice_overdue: true,
    proposal_signed: true,
    password_reset: true,
  });

  const EMAIL_NOTIFICATIONS = [
    {
      key: 'team_invitation',
      title: 'Team Invitations',
      description: 'When you are invited to join a company or team',
      category: 'Account'
    },
    {
      key: 'password_reset',
      title: 'Password Reset',
      description: 'Password reset and security-related emails',
      category: 'Account'
    },
    {
      key: 'invoice_sent',
      title: 'Invoice Sent',
      description: 'When an invoice is sent to a client',
      category: 'Invoicing'
    },
    {
      key: 'invoice_paid',
      title: 'Invoice Paid',
      description: 'When a client pays an invoice',
      category: 'Invoicing'
    },
    {
      key: 'invoice_overdue',
      title: 'Invoice Overdue',
      description: 'Reminders for overdue invoices',
      category: 'Invoicing'
    },
    {
      key: 'proposal_signed',
      title: 'Proposal Signed',
      description: 'When a client signs a proposal',
      category: 'Proposals'
    },
  ];

  useEffect(() => {
    let mounted = true;
    async function loadPreferences() {
      if (!profile?.id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('email_preferences')
          .eq('id', profile.id)
          .single();

        if (error) throw error;
        if (mounted && data?.email_preferences) {
          setPreferences(prev => ({ ...prev, ...data.email_preferences }));
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
      if (mounted) setLoading(false);
    }
    loadPreferences();
    return () => { mounted = false; };
  }, [profile?.id]);

  async function handleToggle(key: string, value: boolean) {
    if (!profile?.id) return;

    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email_preferences: newPreferences })
        .eq('id', profile.id);

      if (error) throw error;
      showToast('Preferences saved', 'success');
    } catch (error) {
      console.error('Failed to save preferences:', error);
      showToast('Failed to save preferences', 'error');
      // Revert on error
      setPreferences(prev => ({ ...prev, [key]: !value }));
    }
    setSaving(false);
  }

  const categories = [...new Set(EMAIL_NOTIFICATIONS.map(n => n.category))];

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-8 border border-neutral-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Email Notifications</h2>
        <p className="text-neutral-500 text-xs">Choose which emails you'd like to receive</p>
      </div>

      <div className="space-y-8">
        {categories.map(category => (
          <div key={category}>
            <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3 border-b border-neutral-100 pb-2">{category}</h3>
            <div className="space-y-1">
              {EMAIL_NOTIFICATIONS.filter(n => n.category === category).map(notification => (
                <div key={notification.key} className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-bold text-neutral-900 uppercase tracking-tight">{notification.title}</p>
                    <p className="text-[11px] text-neutral-500 truncate">{notification.description}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={preferences[notification.key as keyof typeof preferences]}
                      onChange={(e) => handleToggle(notification.key, e.target.checked)}
                      disabled={saving}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#476E66]"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 flex gap-3">
        <Bell className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">In-App Notifications</h3>
          <p className="text-[11px] text-neutral-500 mt-1">
            In-app notifications are always enabled and appear in your notification center.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// IMPORT/EXPORT TAB
// ============================================
function ImportExportTab({ companyId, showToast }: { companyId: string; showToast: (msg: string, type: 'success' | 'error') => void }) {
  const [importingProjects, setImportingProjects] = useState(false);
  const [importingClients, setImportingClients] = useState(false);
  const [importingTasks, setImportingTasks] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const projectsCsvInputRef = useRef<HTMLInputElement>(null);
  const clientsCsvInputRef = useRef<HTMLInputElement>(null);
  const tasksCsvInputRef = useRef<HTMLInputElement>(null);

  // Load clients and projects for matching
  useEffect(() => {
    api.getClients(companyId).then(data => {
      setClients(data.map(c => ({ id: c.id, name: c.name })));
    }).catch(console.error);
    
    api.getProjects(companyId).then(data => {
      setProjects(data.map(p => ({ id: p.id, name: p.name })));
    }).catch(console.error);
  }, [companyId]);

  // Download CSV Template for Projects
  // Download CSV Template for Projects (without hourly_rate - that's per employee)
  const downloadProjectsTemplate = () => {
    const headers = ['project_name', 'client_name', 'description', 'status', 'budget', 'start_date', 'end_date'];
    const exampleRows = [
      ['Website Redesign', 'Acme Corporation', 'Complete website overhaul with new design', 'active', '15000', '2026-02-01', '2026-04-30'],
      ['Mobile App Development', 'Acme Corporation', 'iOS and Android mobile application', 'active', '45000', '2026-03-01', '2026-08-31'],
      ['Brand Identity', 'TechStart Inc', 'Logo and brand guidelines', 'completed', '5000', '2025-11-01', '2025-12-15'],
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'billdora_projects_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Download CSV Template for Tasks (to add tasks to existing projects)
  const downloadTasksTemplate = () => {
    const headers = ['project_name', 'task_name', 'description', 'status', 'estimated_hours', 'due_date'];
    const exampleRows = [
      ['Website Redesign', 'Design Mockups', 'Create initial design mockups for homepage', 'pending', '16', '2026-02-15'],
      ['Website Redesign', 'Frontend Development', 'Build responsive frontend with React', 'pending', '40', '2026-03-15'],
      ['Website Redesign', 'Backend Integration', 'Connect frontend to API endpoints', 'pending', '24', '2026-04-01'],
      ['Mobile App Development', 'UI/UX Design', 'Design app screens and user flow', 'pending', '32', '2026-03-20'],
      ['Mobile App Development', 'iOS Development', 'Build iOS version with Swift', 'pending', '80', '2026-06-01'],
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'billdora_tasks_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Download CSV Template for Clients
  const downloadClientsTemplate = () => {
    const headers = ['company_name', 'display_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'website', 'primary_contact_name', 'primary_contact_email', 'primary_contact_phone', 'billing_contact_name', 'billing_contact_email'];
    const exampleRows = [
      ['Acme Corporation', 'Acme', 'contact@acme.com', '(555) 123-4567', '123 Main St', 'New York', 'NY', '10001', 'https://acme.com', 'John Smith', 'john@acme.com', '(555) 123-4568', 'Jane Doe', 'billing@acme.com'],
      ['TechStart Inc', 'TechStart', 'info@techstart.io', '(555) 987-6543', '456 Innovation Blvd', 'San Francisco', 'CA', '94102', 'https://techstart.io', 'Mike Johnson', 'mike@techstart.io', '(555) 987-6544', '', ''],
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'billdora_clients_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Parse CSV file
  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  // Import Projects from CSV
  const handleProjectsImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingProjects(true);
    setImportResults(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error('CSV file must have a header row and at least one data row');
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
      const dataRows = rows.slice(1);

      // Map header indices (no hourly_rate - that's per employee, not project)
      const indices = {
        project_name: headers.indexOf('project_name'),
        client_name: headers.indexOf('client_name'),
        description: headers.indexOf('description'),
        status: headers.indexOf('status'),
        budget: headers.indexOf('budget'),
        start_date: headers.indexOf('start_date'),
        end_date: headers.indexOf('end_date'),
      };

      if (indices.project_name === -1) {
        throw new Error('CSV must have a "project_name" column');
      }

      let successCount = 0;
      const errors: string[] = [];
      const newProjects: { id: string; name: string }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2; // +2 because of 0-index and header row

        try {
          const projectName = row[indices.project_name]?.trim();
          if (!projectName) {
            errors.push(`Row ${rowNum}: Missing project name`);
            continue;
          }

          // Find client by name (case-insensitive)
          const clientName = indices.client_name !== -1 ? row[indices.client_name]?.trim() : '';
          let clientId: string | undefined;
          
          if (clientName) {
            const matchedClient = clients.find(c => 
              c.name.toLowerCase() === clientName.toLowerCase()
            );
            if (matchedClient) {
              clientId = matchedClient.id;
            } else {
              errors.push(`Row ${rowNum}: Client "${clientName}" not found - project created without client`);
            }
          }

          // Parse status
          const statusRaw = indices.status !== -1 ? row[indices.status]?.trim().toLowerCase() : 'active';
          const validStatuses = ['active', 'completed', 'on_hold', 'cancelled', 'in_progress'];
          const status = validStatuses.includes(statusRaw) ? statusRaw : 'active';

          // Create project (no hourly_rate - that's set per employee/time entry)
          const newProject = await api.createProject({
            company_id: companyId,
            client_id: clientId,
            name: projectName,
            description: indices.description !== -1 ? row[indices.description]?.trim() : undefined,
            status,
            budget: indices.budget !== -1 && row[indices.budget] ? parseFloat(row[indices.budget]) || undefined : undefined,
            start_date: indices.start_date !== -1 ? row[indices.start_date]?.trim() : undefined,
            end_date: indices.end_date !== -1 ? row[indices.end_date]?.trim() : undefined,
          });
          
          newProjects.push({ id: newProject.id, name: newProject.name });

          successCount++;
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err?.message || 'Failed to create project'}`);
        }
      }

      setImportResults({ success: successCount, errors });
      
      // Add newly created projects to the local list (for task imports)
      if (newProjects.length > 0) {
        setProjects(prev => [...prev, ...newProjects]);
      }
      
      if (successCount > 0) {
        showToast(`Successfully imported ${successCount} project${successCount !== 1 ? 's' : ''}`, 'success');
      }
      if (errors.length > 0 && successCount === 0) {
        showToast('Import failed - check errors below', 'error');
      }

    } catch (err: any) {
      showToast(err?.message || 'Failed to import projects', 'error');
      setImportResults({ success: 0, errors: [err?.message || 'Unknown error'] });
    } finally {
      setImportingProjects(false);
      // Reset file input
      if (projectsCsvInputRef.current) {
        projectsCsvInputRef.current.value = '';
      }
    }
  };

  // Import Tasks from CSV
  const handleTasksImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingTasks(true);
    setImportResults(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error('CSV file must have a header row and at least one data row');
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
      const dataRows = rows.slice(1);

      // Map header indices
      const indices = {
        project_name: headers.indexOf('project_name'),
        task_name: headers.indexOf('task_name'),
        description: headers.indexOf('description'),
        status: headers.indexOf('status'),
        estimated_hours: headers.indexOf('estimated_hours'),
        due_date: headers.indexOf('due_date'),
      };

      if (indices.project_name === -1) {
        throw new Error('CSV must have a "project_name" column');
      }
      if (indices.task_name === -1) {
        throw new Error('CSV must have a "task_name" column');
      }

      // Re-fetch projects to ensure we have the latest
      const latestProjects = await api.getProjects(companyId);
      const projectsMap = latestProjects.map(p => ({ id: p.id, name: p.name }));

      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2;

        try {
          const projectName = row[indices.project_name]?.trim();
          const taskName = row[indices.task_name]?.trim();
          
          if (!projectName) {
            errors.push(`Row ${rowNum}: Missing project name`);
            continue;
          }
          if (!taskName) {
            errors.push(`Row ${rowNum}: Missing task name`);
            continue;
          }

          // Find project by name (case-insensitive)
          const matchedProject = projectsMap.find(p => 
            p.name.toLowerCase() === projectName.toLowerCase()
          );
          
          if (!matchedProject) {
            errors.push(`Row ${rowNum}: Project "${projectName}" not found - task skipped`);
            continue;
          }

          // Parse status
          const statusRaw = indices.status !== -1 ? row[indices.status]?.trim().toLowerCase() : 'pending';
          const validStatuses = ['pending', 'in_progress', 'completed', 'on_hold'];
          const status = validStatuses.includes(statusRaw) ? statusRaw : 'pending';

          // Create task
          await api.createTask({
            project_id: matchedProject.id,
            name: taskName,
            description: indices.description !== -1 ? row[indices.description]?.trim() : undefined,
            status,
            estimated_hours: indices.estimated_hours !== -1 && row[indices.estimated_hours] ? parseFloat(row[indices.estimated_hours]) || undefined : undefined,
            due_date: indices.due_date !== -1 ? row[indices.due_date]?.trim() : undefined,
          });

          successCount++;
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err?.message || 'Failed to create task'}`);
        }
      }

      setImportResults({ success: successCount, errors });
      
      if (successCount > 0) {
        showToast(`Successfully imported ${successCount} task${successCount !== 1 ? 's' : ''}`, 'success');
      }
      if (errors.length > 0 && successCount === 0) {
        showToast('Import failed - check errors below', 'error');
      }

    } catch (err: any) {
      showToast(err?.message || 'Failed to import tasks', 'error');
      setImportResults({ success: 0, errors: [err?.message || 'Unknown error'] });
    } finally {
      setImportingTasks(false);
      if (tasksCsvInputRef.current) {
        tasksCsvInputRef.current.value = '';
      }
    }
  };

  // Import Clients from CSV
  const handleClientsImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingClients(true);
    setImportResults(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error('CSV file must have a header row and at least one data row');
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
      const dataRows = rows.slice(1);

      // Map header indices
      const indices = {
        company_name: headers.indexOf('company_name'),
        display_name: headers.indexOf('display_name'),
        email: headers.indexOf('email'),
        phone: headers.indexOf('phone'),
        address: headers.indexOf('address'),
        city: headers.indexOf('city'),
        state: headers.indexOf('state'),
        zip: headers.indexOf('zip'),
        website: headers.indexOf('website'),
        primary_contact_name: headers.indexOf('primary_contact_name'),
        primary_contact_email: headers.indexOf('primary_contact_email'),
        primary_contact_phone: headers.indexOf('primary_contact_phone'),
        billing_contact_name: headers.indexOf('billing_contact_name'),
        billing_contact_email: headers.indexOf('billing_contact_email'),
      };

      if (indices.company_name === -1) {
        throw new Error('CSV must have a "company_name" column');
      }

      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2;

        try {
          const companyName = row[indices.company_name]?.trim();
          if (!companyName) {
            errors.push(`Row ${rowNum}: Missing company name`);
            continue;
          }

          // Check for duplicate client
          const existingClient = clients.find(c => c.name.toLowerCase() === companyName.toLowerCase());
          if (existingClient) {
            errors.push(`Row ${rowNum}: Client "${companyName}" already exists - skipped`);
            continue;
          }

          const newClient = await api.createClient({
            company_id: companyId,
            name: companyName,
            display_name: indices.display_name !== -1 ? row[indices.display_name]?.trim() || companyName : companyName,
            email: indices.email !== -1 ? row[indices.email]?.trim() : undefined,
            phone: indices.phone !== -1 ? row[indices.phone]?.trim() : undefined,
            address: indices.address !== -1 ? row[indices.address]?.trim() : undefined,
            city: indices.city !== -1 ? row[indices.city]?.trim() : undefined,
            state: indices.state !== -1 ? row[indices.state]?.trim() : undefined,
            zip: indices.zip !== -1 ? row[indices.zip]?.trim() : undefined,
            website: indices.website !== -1 ? row[indices.website]?.trim() : undefined,
            primary_contact_name: indices.primary_contact_name !== -1 ? row[indices.primary_contact_name]?.trim() : undefined,
            primary_contact_email: indices.primary_contact_email !== -1 ? row[indices.primary_contact_email]?.trim() : undefined,
            primary_contact_phone: indices.primary_contact_phone !== -1 ? row[indices.primary_contact_phone]?.trim() : undefined,
            billing_contact_name: indices.billing_contact_name !== -1 ? row[indices.billing_contact_name]?.trim() : undefined,
            billing_contact_email: indices.billing_contact_email !== -1 ? row[indices.billing_contact_email]?.trim() : undefined,
          });

          // Add to local clients list for project matching
          setClients(prev => [...prev, { id: newClient.id, name: newClient.name }]);
          successCount++;
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err?.message || 'Failed to create client'}`);
        }
      }

      setImportResults({ success: successCount, errors });
      
      if (successCount > 0) {
        showToast(`Successfully imported ${successCount} client${successCount !== 1 ? 's' : ''}`, 'success');
      }
      if (errors.length > 0 && successCount === 0) {
        showToast('Import failed - check errors below', 'error');
      }

    } catch (err: any) {
      showToast(err?.message || 'Failed to import clients', 'error');
      setImportResults({ success: 0, errors: [err?.message || 'Unknown error'] });
    } finally {
      setImportingClients(false);
      if (clientsCsvInputRef.current) {
        clientsCsvInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-1">Import / Export</h2>
        <p className="text-neutral-500 text-xs">Bulk import clients and projects using CSV files</p>
      </div>

      {/* Import Results */}
      {importResults && (
        <div className={`p-4 rounded-lg border ${importResults.success > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {importResults.success > 0 ? (
              <Check className="w-5 h-5 text-green-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${importResults.success > 0 ? 'text-green-800' : 'text-red-800'}`}>
              {importResults.success > 0 ? `${importResults.success} items imported successfully` : 'Import failed'}
            </span>
          </div>
          {importResults.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-neutral-700">Errors:</p>
              <div className="max-h-32 overflow-y-auto">
                {importResults.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-700">{err}</p>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => setImportResults(null)}
            className="mt-3 text-xs text-neutral-500 hover:text-neutral-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Import Clients */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-neutral-900">Import Clients</h3>
            <p className="text-xs text-neutral-500 mt-1 mb-4">
              Upload a CSV file to bulk import clients. Download the template to see the required format.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadClientsTemplate}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
              <label className={`flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3A5B54] transition-colors cursor-pointer ${importingClients ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="w-4 h-4" />
                {importingClients ? 'Importing...' : 'Upload CSV'}
                <input
                  ref={clientsCsvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleClientsImport}
                  disabled={importingClients}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Import Projects */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-neutral-900">Import Projects</h3>
            <p className="text-xs text-neutral-500 mt-1 mb-4">
              Upload a CSV file to bulk import projects. Use the client name to automatically link projects to clients.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadProjectsTemplate}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
              <label className={`flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3A5B54] transition-colors cursor-pointer ${importingProjects ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="w-4 h-4" />
                {importingProjects ? 'Importing...' : 'Upload CSV'}
                <input
                  ref={projectsCsvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleProjectsImport}
                  disabled={importingProjects}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Import Tasks */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <List className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-neutral-900">Import Tasks</h3>
            <p className="text-xs text-neutral-500 mt-1 mb-4">
              Upload a CSV file to bulk import tasks for your projects. Use the project name to link tasks to existing projects.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadTasksTemplate}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
              <label className={`flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3A5B54] transition-colors cursor-pointer ${importingTasks ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="w-4 h-4" />
                {importingTasks ? 'Importing...' : 'Upload CSV'}
                <input
                  ref={tasksCsvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleTasksImport}
                  disabled={importingTasks}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Import Order & Tips</h4>
        <ul className="text-xs text-amber-700 space-y-1.5">
          <li>• <strong>Step 1: Import Clients</strong> - Create your clients first</li>
          <li>• <strong>Step 2: Import Projects</strong> - Use client name to auto-link projects</li>
          <li>• <strong>Step 3: Import Tasks</strong> - Use project name to auto-link tasks</li>
          <li className="pt-2 border-t border-amber-200 mt-2">• Names must <strong>exactly match</strong> existing records (case-insensitive)</li>
          <li>• Dates should be in <strong>YYYY-MM-DD</strong> format (e.g., 2026-02-15)</li>
          <li>• Project status: <strong>active, completed, on_hold, cancelled, in_progress</strong></li>
          <li>• Task status: <strong>pending, in_progress, completed, on_hold</strong></li>
          <li>• Duplicate clients (same name) will be skipped</li>
          <li>• <strong>Hourly rates</strong> are set per employee, not per project</li>
        </ul>
      </div>
    </div>
  );
}
