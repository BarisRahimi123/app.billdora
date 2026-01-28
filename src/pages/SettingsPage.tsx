import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Settings, Building2, Users, FileText, Bell, Link, Shield, Package, Plus, Edit2, Trash2, X, Upload, Camera, Mail, UserCheck, UserX, MoreVertical, Check, User, Receipt, MapPin, Calculator, FileType, Send, Tag, List, Activity, Target, GripVertical, ArrowLeft, LogOut, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
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
      <div className="flex flex-col gap-1">
        <h1 className="text-lg sm:text-xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-500 text-xs sm:text-sm">Manage your account and company preferences</p>
      </div>

      {/* Settings Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-100">
        {/* Tab Navigation - Mobile: Limited tabs + More dropdown */}
        <div className="border-b border-neutral-100 relative">
          {/* Mobile Tab Bar */}
          <nav className="sm:hidden flex items-center justify-between px-2">
            {/* Visible Tabs */}
            <div className="flex items-center gap-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-[#476E66]/10 text-[#476E66]' 
                      : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                </button>
              ))}
            </div>
            
            {/* More Button - Right aligned */}
            {moreTabs.length > 0 && (
              <button
                onClick={() => setShowMoreTabs(!showMoreTabs)}
                className={`flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-colors ${
                  activeTabInMore 
                    ? 'bg-[#476E66]/10 text-[#476E66]' 
                    : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            )}
          </nav>
          
          {/* More Dropdown Menu - Full width sheet from bottom of tabs */}
          {showMoreTabs && (
            <>
              <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowMoreTabs(false)} />
              <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-neutral-200 py-2 max-h-[60vh] overflow-y-auto">
                <div className="px-3 py-2 border-b border-neutral-100 mb-1">
                  <p className="text-xs font-semibold text-neutral-500 uppercase">More Settings</p>
                </div>
                {moreTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMoreTabs(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm ${
                      activeTab === tab.id 
                        ? 'bg-[#476E66]/10 text-[#476E66]' 
                        : 'text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          
          {/* Desktop Tab Bar - All tabs visible */}
          <nav className="hidden sm:flex min-w-max px-2 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-[#476E66] text-[#476E66]' 
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-3 sm:p-4 max-h-[calc(100vh-200px)] overflow-y-auto">

        {/* Content */}
        <div className="w-full">
          {activeTab === 'profile' && (
            <ProfileTab />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionTab />
          )}

          {activeTab === 'company' && (
            <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-neutral-100">
              <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-3">Company Information</h2>
              
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-neutral-600 border-t-transparent rounded-full" />
                </div>
              ) : (
                <form onSubmit={handleSaveCompanySettings} className="space-y-3">
                  {companyError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                      {companyError}
                    </div>
                  )}
                  {companySuccess && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs">
                      Settings saved successfully!
                    </div>
                  )}

                  {/* Logo Upload */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-2">Company Logo</label>
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden bg-neutral-50 cursor-pointer hover:border-[#476E66] transition-colors flex-shrink-0"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoUrl ? (
                          <img src={logoUrl} alt="Company logo" className="w-full h-full object-contain" />
                        ) : (
                          <Camera className="w-6 h-6 text-neutral-400" />
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
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-xs font-medium disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        </button>
                        <p className="text-[10px] text-neutral-500 mt-1">PNG, JPG up to 5MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Company Name</label>
                      <input 
                        type="text" 
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Your Company Name"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Street Address</label>
                    <input 
                      type="text" 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Business St"
                      className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-neutral-700 mb-1">City</label>
                      <input 
                        type="text" 
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">State</label>
                      <input 
                        type="text" 
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="TX"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">ZIP</label>
                      <input 
                        type="text" 
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        placeholder="75001"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Phone</label>
                      <input 
                        type="tel" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Fax</label>
                      <input 
                        type="tel" 
                        value={fax}
                        onChange={(e) => setFax(e.target.value)}
                        placeholder="(555) 123-4568"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Website</label>
                      <input 
                        type="url" 
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://yourcompany.com"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Email</label>
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="info@yourcompany.com"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none" 
                      />
                    </div>
                  </div>

                  <div className="border-t border-neutral-100 pt-6 mt-6">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-4">Default Settings</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1.5">Default Tax Rate (%)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={defaultTaxRate}
                          onChange={(e) => setDefaultTaxRate(e.target.value)}
                          placeholder="8.25"
                          className="w-full h-12 px-4 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 outline-none" 
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">Default Terms & Conditions</label>
                      <textarea 
                        value={defaultTerms}
                        onChange={(e) => setDefaultTerms(e.target.value)}
                        placeholder="Enter default terms and conditions for quotes and invoices..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 outline-none resize-none" 
                      />
                    </div>
                  </div>

                  <div className="pt-3">
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
            <div className="bg-white rounded-lg shadow-sm border border-neutral-100">
              <div className="p-2.5 sm:p-3 border-b border-neutral-100 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-neutral-900 leading-tight">Products & Services</h2>
                  <p className="text-neutral-500 text-[11px] mt-0.5 truncate">Manage your service catalog for quotes</p>
                </div>
                <button
                  onClick={() => { setEditingService(null); setShowServiceModal(true); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#476E66] text-white text-xs font-medium rounded-lg hover:bg-[#3A5B54] transition-colors flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span className="hidden xs:inline">Add Service</span>
                  <span className="xs:hidden">Add</span>
                </button>
              </div>

              {loading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin w-5 h-5 border-2 border-neutral-600 border-t-transparent rounded-full mx-auto" />
                </div>
              ) : services.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Package className="w-5 h-5 text-neutral-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">No services yet</h3>
                  <p className="text-neutral-500 text-[11px] mb-2.5">Add your first service to start building quotes faster</p>
                  <button
                    onClick={() => { setEditingService(null); setShowServiceModal(true); }}
                    className="px-2.5 py-1.5 border border-[#476E66] text-[#476E66] bg-white text-xs rounded-lg hover:bg-[#476E66]/5 transition-colors"
                  >
                    Add Your First Service
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        <th className="text-left px-2 sm:px-3 py-1.5 text-[10px] font-semibold text-neutral-700 uppercase tracking-wide">Name</th>
                        <th className="text-left px-2 sm:px-3 py-1.5 text-[10px] font-semibold text-neutral-700 uppercase tracking-wide hidden sm:table-cell">Category</th>
                        <th className="text-left px-2 sm:px-3 py-1.5 text-[10px] font-semibold text-neutral-700 uppercase tracking-wide hidden md:table-cell">Pricing</th>
                        <th className="text-left px-2 sm:px-3 py-1.5 text-[10px] font-semibold text-neutral-700 uppercase tracking-wide hidden md:table-cell">Rate</th>
                        <th className="text-left px-2 sm:px-3 py-1.5 text-[10px] font-semibold text-neutral-700 uppercase tracking-wide hidden lg:table-cell">Unit</th>
                        <th className="text-left px-2 sm:px-3 py-1.5 text-[10px] font-semibold text-neutral-700 uppercase tracking-wide">Status</th>
                        <th className="w-12 sm:w-14"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                    {services.map((service) => (
                      <tr key={service.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-2 sm:px-3 py-2">
                          <div>
                            <p className="font-medium text-neutral-900 text-xs leading-tight">{service.name}</p>
                            {service.description && (
                              <p className="text-[11px] text-neutral-500 truncate max-w-[200px] mt-0.5">{service.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-neutral-600 text-xs hidden sm:table-cell">{service.category || '-'}</td>
                        <td className="px-2 sm:px-3 py-2 text-neutral-600 text-[11px] capitalize hidden md:table-cell">
                          {PRICING_TYPES.find(p => p.value === service.pricing_type)?.label || service.pricing_type}
                        </td>
                        <td className="px-2 sm:px-3 py-2 font-medium text-neutral-900 text-xs hidden md:table-cell">{formatRate(service)}</td>
                        <td className="px-2 sm:px-3 py-2 text-neutral-600 text-[11px] hidden lg:table-cell">{service.unit_label || '-'}</td>
                        <td className="px-2 sm:px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            service.is_active !== false ? 'bg-[#476E66]/10 text-[#476E66]' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {service.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-2">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => { setEditingService(service); setShowServiceModal(true); }}
                              className="p-1 text-neutral-400 hover:text-[#476E66] hover:bg-neutral-100 rounded transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteService(service.id)}
                              className="p-1 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 rounded transition-colors"
                            >
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

          {activeTab !== 'profile' && activeTab !== 'subscription' && activeTab !== 'company' && activeTab !== 'services' && activeTab !== 'users' && activeTab !== 'invoicing' && activeTab !== 'codes-fields' && activeTab !== 'integrations' && activeTab !== 'templates' && activeTab !== 'collaborators' && activeTab !== 'notifications' && (
            <div className="bg-white rounded-2xl p-12 border border-neutral-100 text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">{tabs.find(t => t.id === activeTab)?.label}</h3>
              <p className="text-neutral-500">This settings section is under development</p>
            </div>
          )}
        </div>
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
      case 'Admin': return 'bg-purple-100 text-purple-700';
      case 'Manager': return 'bg-blue-100 text-blue-700';
      case 'Staff': return 'bg-emerald-100 text-emerald-700';
      case 'Viewer': return 'bg-neutral-100 text-neutral-700';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

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
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 p-1 bg-neutral-100 rounded-lg overflow-x-auto scrollbar-hide w-full sm:w-auto">
          <button
            onClick={() => setActiveSubTab('users')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'users' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'roles' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Roles ({roles.length})
          </button>
          <button
            onClick={() => setActiveSubTab('invitations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'invitations' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Pending Invites ({invitations.length})
          </button>
        </div>
        <button
          onClick={() => checkAndProceed('team_members', users.length, () => setShowInviteModal(true))}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white text-xs font-medium rounded-lg hover:bg-[#3A5B54] transition-colors self-end sm:self-auto"
        >
          <Mail className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Invite User</span>
          <span className="sm:hidden">Invite</span>
        </button>
      </div>

      {/* Users List */}
      {activeSubTab === 'users' && (
        <div className="bg-white rounded-lg shadow-sm border border-neutral-100 overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead className="bg-neutral-50 border-b border-neutral-50">
              <tr>
                <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">User</th>
                <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider hidden sm:table-cell">Role</th>
                <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">Status</th>
{canViewFinancials && <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider hidden md:table-cell">Hourly Rate</th>}
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-3 sm:px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600 font-medium text-xs flex-shrink-0">
                        {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-neutral-900 text-sm truncate">{user.full_name || 'Unknown'}</p>
                        <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor(getRoleName(user.role_id))}`}>
                      {getRoleName(user.role_id)}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      user.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
{canViewFinancials && <td className="px-3 sm:px-4 py-2.5 text-neutral-600 text-sm hidden md:table-cell">
                    {user.hourly_rate ? `$${user.hourly_rate}/hr` : '-'}
                  </td>}
                  <td className="px-3 sm:px-4 py-2.5 relative">
                    <button
                      onClick={() => setMenuOpen(menuOpen === user.id ? null : user.id)}
                      className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-600"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen === user.id && (
                      <div className="absolute right-3 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-0.5 z-20 min-w-[120px]">
                        <button
                          onClick={() => { setEditingUser(user); setShowEditUserModal(true); setMenuOpen(null); }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50 flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3 h-3" /> Edit User
                        </button>
                        {user.id !== currentUserId && (
                          user.is_active !== false ? (
                            <button
                              onClick={() => handleDeactivateUser(user.id)}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-100 text-neutral-900 flex items-center gap-1.5"
                            >
                              <UserX className="w-3 h-3" /> Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivateUser(user.id)}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-100 text-neutral-900 flex items-center gap-1.5"
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
            <div className="p-8 text-center text-neutral-500 text-sm">No users found</div>
          )}
        </div>
      )}

      {/* Roles List */}
      {activeSubTab === 'roles' && (
        <div className="bg-white rounded-lg shadow-sm border border-neutral-100 overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-neutral-900">Permission Roles</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Define access levels for your team members</p>
            </div>
            <button
              onClick={() => { setEditingRole(null); setShowRoleModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-xs font-medium self-end sm:self-auto flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Role</span><span className="sm:hidden">Add</span>
            </button>
          </div>
          <div className="divide-y divide-neutral-50">
            {roles.map((role) => (
              <div key={role.id} className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-medium text-neutral-900 text-sm">{role.name}</h4>
                      {role.is_system && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600">System</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">{role.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor(role.name)}`}>
                      {users.filter(u => u.role_id === role.id).length} users
                    </span>
                    <div className="relative">
                      <button
                        onClick={() => setRoleMenuOpen(roleMenuOpen === role.id ? null : role.id)}
                        className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-600"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {roleMenuOpen === role.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-0.5 z-20 min-w-[100px]">
                          <button
                            onClick={() => { setEditingRole(role); setShowRoleModal(true); setRoleMenuOpen(null); }}
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50 flex items-center gap-1.5"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          {!role.is_system && (
                            <button
                              onClick={() => handleDeleteRole(role.id)}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-100 text-neutral-900 flex items-center gap-1.5"
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
                        <div key={module} className="bg-neutral-50 rounded-lg p-2">
                          <p className="text-[10px] font-semibold text-neutral-700 uppercase mb-1.5 tracking-wider">{module}</p>
                          <div className="space-y-0.5">
                            {['view', 'create', 'edit', 'delete'].map((action) => (
                              <div key={action} className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${(perms as any)[action] ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
                                <span className="text-[10px] text-neutral-600 capitalize">{action}</span>
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
        <div className="bg-white rounded-lg shadow-sm border border-neutral-100 overflow-hidden">
          {invitations.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-neutral-900 mb-1">No pending invitations</h3>
              <p className="text-neutral-500 text-xs mb-3">Invite team members to join your company</p>
              <button
                onClick={() => checkAndProceed('team_members', users.length, () => setShowInviteModal(true))}
                className="px-3 py-1.5 border border-[#476E66] text-[#476E66] bg-white text-sm rounded-lg hover:bg-[#476E66]/5 transition-colors"
              >
                Send Invitation
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead className="bg-neutral-50 border-b border-neutral-50">
                  <tr>
                  <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">Email</th>
                  <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider hidden sm:table-cell">Role</th>
                  <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider hidden md:table-cell">Sent</th>
                  <th className="text-left px-3 sm:px-4 py-2 text-[10px] font-semibold text-neutral-700 uppercase tracking-wider hidden lg:table-cell">Expires</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {invitations.map((invitation) => (
                  <tr key={invitation.id} className="hover:bg-neutral-50/50">
                    <td className="px-3 sm:px-4 py-2.5 font-medium text-neutral-900 text-sm">{invitation.email}</td>
                    <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor((invitation.role as any)?.name || 'Unknown')}`}>
                        {(invitation.role as any)?.name || 'No Role'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-neutral-600 text-xs hidden md:table-cell">
                      {invitation.created_at ? new Date(invitation.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-neutral-600 text-xs hidden lg:table-cell">
                      {invitation.expires_at ? new Date(invitation.expires_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5">
                      <button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        className="text-neutral-900 hover:text-red-600 text-xs font-medium"
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
      <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Invite User</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
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
              className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
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
      <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Edit User</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
            >
              <option value="">No role assigned</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Hourly Rate ($)</label>
            <input
              type="number"
              step="0.01"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
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
              className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
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
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">
            {role ? 'Edit Role' : 'Create Role'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Role Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={role?.is_system}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none disabled:bg-neutral-100"
                placeholder="e.g. Project Manager"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:border-transparent outline-none"
                placeholder="Brief description of this role"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-neutral-900">Permissions</label>
              <div className="flex gap-2">
                <span className="text-xs text-neutral-500 mr-2">Presets:</span>
                <button type="button" onClick={() => applyPreset('admin')} className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200">
                  Admin
                </button>
                <button type="button" onClick={() => applyPreset('manager')} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                  Manager
                </button>
                <button type="button" onClick={() => applyPreset('team_member')} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200">
                  Team Member
                </button>
                <button type="button" onClick={() => toggleAll(true)} className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200">
                  Grant All
                </button>
                <button type="button" onClick={() => toggleAll(false)} className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded hover:bg-neutral-200">
                  Revoke All
                </button>
              </div>
            </div>
            
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-neutral-600">Module</th>
                    {actions.map(action => (
                      <th key={action} className="text-center px-3 py-3 font-medium text-neutral-600 capitalize w-20">
                        {action}
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 font-medium text-neutral-600 w-16">All</th>
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
                              className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                            />
                          </td>
                        ))}
                        <td className="text-center px-3 py-3">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={() => toggleModule(module, !allChecked)}
                            className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
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
          <div className="p-4 bg-neutral-100 rounded-xl border border-amber-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={canViewFinancials}
                onChange={(e) => setCanViewFinancials(e.target.checked)}
                className="w-5 h-5 rounded border-neutral-300 text-neutral-900 focus:ring-amber-500"
              />
              <div>
                <span className="font-medium text-neutral-900">Can View Financial Data</span>
                <p className="text-sm text-neutral-500">Allow access to dollar amounts, rates, invoicing, and budget information</p>
              </div>
            </label>
          </div>

          {/* Approval Access */}
          <div className="p-4 bg-neutral-100 rounded-xl border border-emerald-200 space-y-3">
            <div className="font-medium text-neutral-900">Approval Permissions</div>
            <p className="text-sm text-neutral-500">Control access to approve time entries and expenses</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canViewApprovals}
                  onChange={(e) => setCanViewApprovals(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-emerald-500"
                />
                <span className="text-sm text-neutral-700">View Pending Approvals</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canApprove}
                  onChange={(e) => setCanApprove(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-emerald-500"
                />
                <span className="text-sm text-neutral-700">Can Approve/Reject</span>
              </label>
            </div>
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
      <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-3">My Profile</h2>
      
      <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
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
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">Basic Information</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-[#476E66] focus:border-[#476E66] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 text-sm"
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
        <div className="space-y-3 pt-3 border-t border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">Address</h3>
          
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
        <div className="space-y-3 pt-3 border-t border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">Emergency Contact</h3>
          
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
        <div className="space-y-3 pt-3 border-t border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">Employment</h3>
          
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
            className="h-10 px-5 bg-[#476E66] text-white text-sm font-medium rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
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
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-0.5 bg-neutral-100 rounded-lg w-fit overflow-x-auto scrollbar-hide">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <tab.icon className="w-3 h-3" />
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Address Info Tab */}
      {activeSubTab === 'address' && (
        <div className="bg-white rounded-lg p-3 border border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900 mb-1 leading-tight">Invoice Address Info</h2>
          <p className="text-neutral-500 text-[11px] mb-3 leading-tight">Configure the company information that appears on your invoices</p>

          <form onSubmit={handleSaveAddressInfo} className="space-y-2.5">
            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[11px]">{error}</div>
            )}
            {success && (
              <div className="p-2.5 bg-[#476E66]/10 border border-[#476E66]/20 text-[#476E66] rounded-lg text-[11px]">
                Settings saved successfully!
              </div>
            )}

            {/* Logo Upload */}
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Invoice Logo</label>
              <div className="flex items-center gap-3">
                <div
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden bg-neutral-50 cursor-pointer hover:border-neutral-400 transition-colors"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {invoiceLogoUrl ? (
                    <img src={invoiceLogoUrl} alt="Invoice logo" className="w-full h-full object-contain" />
                  ) : (
                    <Camera className="w-6 h-6 text-neutral-400" />
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
                    className="flex items-center gap-1.5 px-2.5 py-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-xs font-medium disabled:opacity-50"
                  >
                    <Upload className="w-3 h-3" />
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  <p className="text-[10px] text-neutral-500 mt-1 leading-tight">PNG, JPG up to 5MB. Appears on invoice header.</p>
                </div>
              </div>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1">Company Name</label>
              <input
                type="text"
                value={invoiceCompanyName}
                onChange={(e) => setInvoiceCompanyName(e.target.value)}
                placeholder="Your Company Name"
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1">Street Address</label>
              <input
                type="text"
                value={invoiceAddress}
                onChange={(e) => setInvoiceAddress(e.target.value)}
                placeholder="123 Business St"
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
              />
            </div>

            {/* City, State, Zip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-neutral-700 mb-1">City</label>
                <input
                  type="text"
                  value={invoiceCity}
                  onChange={(e) => setInvoiceCity(e.target.value)}
                  placeholder="City"
                  className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 mb-1">State</label>
                <input
                  type="text"
                  value={invoiceState}
                  onChange={(e) => setInvoiceState(e.target.value)}
                  placeholder="TX"
                  className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 mb-1">ZIP</label>
                <input
                  type="text"
                  value={invoiceZip}
                  onChange={(e) => setInvoiceZip(e.target.value)}
                  placeholder="75001"
                  className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Country */}
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1">Country</label>
              <input
                type="text"
                value={invoiceCountry}
                onChange={(e) => setInvoiceCountry(e.target.value)}
                placeholder="USA"
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
              />
            </div>

            {/* Phone & Website */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={invoicePhone}
                  onChange={(e) => setInvoicePhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 mb-1">Website</label>
                <input
                  type="url"
                  value={invoiceWebsite}
                  onChange={(e) => setInvoiceWebsite(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className="w-full h-9 px-2.5 text-xs rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Address Block Position */}
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Address Block Position</label>
              <p className="text-[10px] text-neutral-500 mb-2 leading-tight">Choose where your company address appears on the invoice</p>
              <div className="flex gap-2">
                <label className={`flex items-center gap-2 px-2.5 py-2 border rounded-lg cursor-pointer transition-colors ${
                  addressBlockPosition === 'left' ? 'border-[#476E66] bg-[#476E66]/5' : 'border-neutral-200 hover:border-neutral-300'
                }`}>
                  <input
                    type="radio"
                    name="addressPosition"
                    value="left"
                    checked={addressBlockPosition === 'left'}
                    onChange={() => setAddressBlockPosition('left')}
                    className="sr-only"
                  />
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    addressBlockPosition === 'left' ? 'border-[#476E66]' : 'border-neutral-300'
                  }`}>
                    {addressBlockPosition === 'left' && <div className="w-1.5 h-1.5 rounded-full bg-[#476E66]" />}
                  </div>
                  <span className="text-xs font-medium text-neutral-700">Left Side</span>
                </label>
                <label className={`flex items-center gap-2 px-2.5 py-2 border rounded-lg cursor-pointer transition-colors ${
                  addressBlockPosition === 'right' ? 'border-[#476E66] bg-[#476E66]/5' : 'border-neutral-200 hover:border-neutral-300'
                }`}>
                  <input
                    type="radio"
                    name="addressPosition"
                    value="right"
                    checked={addressBlockPosition === 'right'}
                    onChange={() => setAddressBlockPosition('right')}
                    className="sr-only"
                  />
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    addressBlockPosition === 'right' ? 'border-[#476E66]' : 'border-neutral-300'
                  }`}>
                    {addressBlockPosition === 'right' && <div className="w-1.5 h-1.5 rounded-full bg-[#476E66]" />}
                  </div>
                  <span className="text-xs font-medium text-neutral-700">Right Side</span>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-4 bg-[#476E66] text-white text-xs font-medium rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Address Info'}
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
      <div className="bg-white rounded-2xl border border-neutral-100 p-12">
        <div className="flex justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-neutral-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 border border-neutral-100">
      <h2 className="text-xl font-semibold text-neutral-900 mb-2">Invoice Calculators</h2>
      <p className="text-neutral-500 text-sm mb-6">Choose which invoice calculation methods are available when creating invoices</p>

      {success && (
        <div className="p-4 bg-neutral-100 border border-emerald-200 text-emerald-700 rounded-xl text-sm mb-6">
          Calculator settings saved successfully!
        </div>
      )}

      <div className="space-y-4 mb-8">
        {CALCULATOR_TYPES.map((calc) => (
          <div
            key={calc.id}
            className={`p-5 rounded-xl border transition-colors ${
              enabledCalculators.includes(calc.id) 
                ? 'border-neutral-200 bg-white' 
                : 'border-neutral-100 bg-neutral-50 opacity-60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-2xl">{calc.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-neutral-900">{calc.name}</h3>
                  {defaultCalculator === calc.id && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-600">{calc.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {enabledCalculators.includes(calc.id) && defaultCalculator !== calc.id && (
                  <button
                    onClick={() => setDefaultCalculator(calc.id)}
                    className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                  >
                    Set as default
                  </button>
                )}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledCalculators.includes(calc.id)}
                    onChange={() => toggleCalculator(calc.id)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-neutral-400 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#476E66]"></div>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="h-12 px-6 bg-[#476E66] text-white font-medium rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Calculator Settings'}
      </button>
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
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
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
                      <label key={pos} className={`flex-1 px-4 py-3 border rounded-xl cursor-pointer text-center transition-colors ${
                        logoPosition === pos ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
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
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          receiptsPerPage === num ? 'bg-[#476E66] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
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
                    <label key={scheme.id} className={`p-4 border rounded-xl cursor-pointer transition-colors ${
                      colorScheme === scheme.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as CategoryType)}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              activeCategory === cat.id
                ? 'border-[#476E66] bg-[#476E66]/5'
                : 'border-neutral-200 hover:border-neutral-300 bg-white'
            }`}
          >
            <p className={`font-semibold text-[11px] leading-tight ${activeCategory === cat.id ? 'text-[#476E66]' : 'text-neutral-900'}`}>
              {cat.label}
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5 leading-tight">{cat.description}</p>
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-0.5 bg-neutral-100 rounded-lg w-fit flex-wrap overflow-x-auto scrollbar-hide">
        {currentSubTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
              activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-2.5">
        {/* Left Panel - List */}
        <div className="w-full lg:w-64 bg-white rounded-lg shadow-sm border border-neutral-100 flex flex-col">
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
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
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
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${
                      selectedItem?.id === item.id ? 'bg-neutral-100' : ''
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
      <div className="flex flex-wrap gap-1 p-1 bg-neutral-100 rounded-xl">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
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
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors flex items-center gap-2 ${
                      selectedItem?.id === item.id ? 'bg-neutral-100' : ''
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
        <div className="flex-1 bg-white rounded-2xl border border-neutral-100 p-6">
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
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
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
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${
                      selectedItem?.id === item.id ? 'bg-neutral-100' : ''
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
        <div className="flex-1 bg-white rounded-2xl border border-neutral-100 p-6">
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
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedItem(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSubTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
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
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${
                      selectedItem?.id === item.id ? 'bg-neutral-100' : ''
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
        <div className="flex-1 bg-white rounded-2xl border border-neutral-100 p-6">
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

  const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY';

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
    <div className="space-y-2">
      <div className="bg-white rounded-lg p-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-semibold text-neutral-900 mb-2">Payment Integrations</h2>
        
        {/* Stripe Connect Card - Compact */}
        <div className="border border-neutral-200 rounded-lg p-2">
          <div className="flex items-start gap-2">
            {/* Stripe Logo - Smaller */}
            <div className="w-8 h-8 bg-[#635BFF] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
              </svg>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h3 className="text-xs font-semibold text-neutral-900">Stripe</h3>
                {stripeAccountId ? (
                  <span className="px-1 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[9px] font-medium">
                    Connected
                  </span>
                ) : (
                  <span className="px-1 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[9px] font-medium">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-neutral-500 text-[10px] mb-2 leading-tight">
                Accept credit/debit card payments on invoices
              </p>
              
              {stripeAccountId ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] text-neutral-600">
                    <Check className="w-2.5 h-2.5 text-[#476E66]" />
                    <span className="truncate">ID: {stripeAccountId.substring(0, 10)}...</span>
                  </div>
                  <button
                    onClick={handleDisconnectStripe}
                    disabled={disconnecting}
                    className="mt-1 px-2 py-1 text-[10px] font-medium text-neutral-600 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectStripe}
                  disabled={connecting}
                  className="flex items-center gap-1 px-2 py-1.5 bg-[#635BFF] text-white text-[10px] font-medium rounded-md hover:bg-[#5851DB] transition-colors disabled:opacity-50"
                >
                  {connecting ? (
                    <>
                      <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="w-2.5 h-2.5" />
                      Connect Stripe
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Info Box - Ultra Compact */}
        <div className="mt-2 p-2 bg-[#635BFF]/5 border border-[#635BFF]/10 rounded-md">
          <h4 className="font-medium text-[#635BFF] text-[10px] mb-1">How it works</h4>
          <ol className="text-[9px] text-neutral-600 space-y-0.5 leading-tight list-decimal list-inside">
            <li>Connect your Stripe account</li>
            <li>Clients see "Pay Now" on invoices</li>
            <li>Payments sync automatically</li>
          </ol>
        </div>
      </div>

      {/* BigTime Integration Card */}
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
  
  const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY';

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
    <div className="bg-white rounded-lg p-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
      <h2 className="text-xs font-semibold text-neutral-900 mb-2">Data Import</h2>
      
      {/* BigTime Card - Compact */}
      <div className="border border-neutral-200 rounded-lg p-2">
        <div className="flex items-start gap-2">
          {/* BigTime Logo - Smaller */}
          <div className="w-8 h-8 bg-[#0066CC] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-xs font-semibold text-neutral-900">BigTime</h3>
              {isConnected ? (
                <span className="px-1 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[9px] font-medium">
                  Connected
                </span>
              ) : (
                <span className="px-1 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[9px] font-medium">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-neutral-500 text-[10px] mb-2 leading-tight">
              Import clients, projects, tasks & time from BigTime
            </p>
            
            {isConnected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-[10px] text-neutral-600">
                  <Check className="w-2.5 h-2.5 text-[#476E66]" />
                  <span>Firm: {firmId}</span>
                </div>
                
                {/* Import Options - Compact */}
                <div className="border-t border-neutral-100 pt-2">
                  <h4 className="font-medium text-neutral-900 text-[10px] mb-1.5">Select data to import:</h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'clients', label: 'Clients', checked: importClients, onChange: setImportClients },
                      { id: 'projects', label: 'Projects', checked: importProjects, onChange: setImportProjects },
                      { id: 'tasks', label: 'Tasks', checked: importTasks, onChange: setImportTasks },
                      { id: 'staff', label: 'Staff', checked: importStaff, onChange: setImportStaff },
                      { id: 'timeEntries', label: 'Time', checked: importTimeEntries, onChange: setImportTimeEntries },
                    ].map(opt => (
                      <label key={opt.id} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={(e) => opt.onChange(e.target.checked)}
                          disabled={importing}
                          className="w-3 h-3 rounded border-neutral-300 text-[#0066CC] focus:ring-[#0066CC]"
                        />
                        <span className="text-[10px] text-neutral-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {/* Import Progress - Compact */}
                {importing && importProgress && (
                  <div className="bg-[#0066CC]/5 border border-[#0066CC]/10 rounded-md p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="animate-spin w-2.5 h-2.5 border-2 border-[#0066CC] border-t-transparent rounded-full" />
                      <span className="text-[10px] font-medium text-[#0066CC]">
                        {importProgress.type === 'complete' ? 'Complete!' : `${importProgress.type}...`}
                      </span>
                    </div>
                    <div className="w-full bg-[#0066CC]/20 rounded-full h-1">
                      <div 
                        className="bg-[#0066CC] h-1 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Action Buttons - Compact */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    onClick={handleStartImport}
                    disabled={importing}
                    className="flex items-center gap-1 px-2 py-1.5 bg-[#0066CC] text-white text-[10px] font-medium rounded-md hover:bg-[#0052A3] transition-colors disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-2.5 h-2.5" />
                        Import
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting || importing}
                    className="px-2 py-1 text-[10px] font-medium text-neutral-600 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? '...' : 'Disconnect'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Credentials Form - Compact */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[9px] font-medium text-neutral-600 mb-0.5 uppercase tracking-wide">
                      API Token
                    </label>
                    <input
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="Enter token"
                      className="w-full px-2 py-1.5 text-[10px] border border-neutral-200 rounded-md focus:ring-1 focus:ring-[#0066CC] focus:border-[#0066CC] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-medium text-neutral-600 mb-0.5 uppercase tracking-wide">
                      Firm ID
                    </label>
                    <input
                      type="text"
                      value={firmId}
                      onChange={(e) => setFirmId(e.target.value)}
                      placeholder="Enter ID"
                      className="w-full px-2 py-1.5 text-[10px] border border-neutral-200 rounded-md focus:ring-1 focus:ring-[#0066CC] focus:border-[#0066CC] outline-none"
                    />
                  </div>
                </div>
                
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-1 px-2 py-1.5 bg-[#0066CC] text-white text-[10px] font-medium rounded-md hover:bg-[#0052A3] transition-colors disabled:opacity-50"
                >
                  {connecting ? (
                    <>
                      <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="w-2.5 h-2.5" />
                      Connect
                    </>
                  )}
                </button>
                
                <p className="text-[9px] text-neutral-500 leading-tight">
                  Find credentials: My Account → API Settings
                </p>
              </div>
            )}
          </div>
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
    { key: '{{client_name}}', description: 'Client company or contact name' },
    { key: '{{invoice_number}}', description: 'Invoice number (e.g., INV-001)' },
    { key: '{{amount_due}}', description: 'Total amount due on invoice' },
    { key: '{{due_date}}', description: 'Invoice due date' },
    { key: '{{company_name}}', description: 'Your company name' },
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
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-neutral-100 p-3">
        <h2 className="text-base font-semibold text-neutral-900 mb-1 leading-tight">Email Templates</h2>
        <p className="text-neutral-500 text-[11px] mb-3 leading-tight">Customize the emails sent to your clients for payment reminders and other notifications.</p>

        <div className="flex flex-col lg:flex-row gap-3">
          {/* Template List */}
          <div className="w-full lg:w-56 flex-shrink-0">
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Templates</h3>
            <div className="space-y-1.5">
              {templates.length === 0 ? (
                <p className="text-xs text-neutral-500">No templates found.</p>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => selectTemplate(template)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'border-[#476E66] bg-[#476E66]/5 text-[#476E66]'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="font-medium text-xs capitalize leading-tight">{template.template_type.replace(/_/g, ' ')}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Edit Form */}
          <div className="flex-1">
            {selectedTemplate ? (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none"
                    placeholder="Email subject line..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">Body</label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={8}
                    className="w-full px-2.5 py-2 rounded-lg border border-neutral-200 text-xs focus:ring-1 focus:ring-[#476E66] focus:border-transparent outline-none resize-none font-mono"
                    placeholder="Email body content..."
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 bg-[#476E66] text-white text-xs font-medium rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-500">
                <p className="text-xs">Select a template to edit</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Placeholders Reference */}
      <div className="bg-[#476E66]/5 border border-[#476E66]/20 rounded-lg p-3">
        <h3 className="font-semibold text-[#476E66] text-xs mb-1.5 leading-tight">Available Placeholders</h3>
        <p className="text-[10px] text-neutral-600 mb-2.5 leading-tight">Use these placeholders in your email subject or body. They will be replaced with actual data when the email is sent.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {placeholders.map((p) => (
            <div key={p.key} className="flex items-start gap-2">
              <code className="px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] rounded text-[10px] font-mono flex-shrink-0">{p.key}</code>
              <span className="text-[10px] text-neutral-600 leading-tight">{p.description}</span>
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

  const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY';

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
    <div className="space-y-3">
      {/* Current Plan Card - Clean compact design */}
      <div className="bg-white rounded-lg border border-neutral-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div 
              className={`w-8 h-8 rounded-md flex items-center justify-center ${isPro ? 'bg-[#476E66]' : 'bg-neutral-100'}`}
            >
              <CreditCard className="w-4 h-4" style={{ color: isPro ? '#fff' : '#6b7280' }} />
            </div>
            
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-neutral-900">
                  {currentPlan?.name || 'Starter'}
                </h3>
                {isPro ? (
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-medium">
                    PRO
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[9px] font-medium">
                    Free
                  </span>
                )}
              </div>
              <p className="text-neutral-400 text-[10px]">
                {isPro ? 'Full access to all features' : 'Basic features for getting started'}
              </p>
                
            </div>
          </div>

          {/* Action Button */}
          {isPro && subscription ? (
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-neutral-200 text-neutral-600 text-xs font-medium rounded-md hover:bg-neutral-50 transition-all disabled:opacity-50"
            >
              {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
              <span>Manage</span>
            </button>
          ) : isStarter ? (
            <button
              onClick={handleUpgrade}
              disabled={!!checkoutLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#476E66] text-white text-xs font-medium rounded-md hover:bg-[#3A5B54] transition-all disabled:opacity-50"
            >
              {checkoutLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
              <span>Upgrade</span>
            </button>
          ) : null}
        </div>

        {/* Usage - Compact list */}
        <div className="mt-2 pt-2 border-t border-neutral-100">
          <div className="grid grid-cols-2 gap-x-4">
              <UsageBar 
                used={usage.projects} 
                limit={currentPlan?.limits?.projects === -1 ? null : (currentPlan?.limits?.projects ?? 3)} 
                label="Projects"
                isLoading={usageLoading}
              />
              <UsageBar 
                used={usage.teamMembers} 
                limit={currentPlan?.limits?.team_members === -1 ? null : (currentPlan?.limits?.team_members ?? 2)} 
                label="Team Members"
                isLoading={usageLoading}
              />
              <UsageBar 
                used={usage.clients} 
                limit={currentPlan?.limits?.clients === -1 ? null : (currentPlan?.limits?.clients ?? 5)} 
                label="Clients"
                isLoading={usageLoading}
              />
              <UsageBar 
                used={usage.invoices} 
                limit={currentPlan?.limits?.invoices_per_month === -1 ? null : (currentPlan?.limits?.invoices_per_month ?? 10)} 
                label="Invoices This Month"
                isLoading={usageLoading}
              />
          </div>
        </div>
      </div>

      {/* Upgrade Card - Only for Starter users */}
      {isStarter && (
        <div className="bg-gradient-to-br from-[#476E66] via-[#4a7a71] to-[#3A5B54] rounded-lg p-4 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Left side - Features */}
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
                </svg>
                <span className="text-white/80 text-[10px] font-medium uppercase tracking-wider">Recommended</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2">Upgrade to Professional</h3>
              <p className="text-white/80 mb-4 text-xs sm:text-sm">
                Unlock your full potential with unlimited projects, advanced analytics, and priority support.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Unlimited projects & clients',
                  'Up to 50 team members',
                  'Advanced reporting',
                  'Custom branding',
                  'Priority support',
                  'API access',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    <span className="text-xs">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side - Pricing */}
            <div className="lg:w-72">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                {/* Billing Toggle */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className={`text-xs font-medium ${billingCycle === 'monthly' ? 'text-white' : 'text-white/60'}`}>
                    Monthly
                  </span>
                  <button
                    onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                    className="relative w-12 h-6 rounded-full bg-white/20 transition-colors"
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                      style={{ left: billingCycle === 'yearly' ? '26px' : '2px' }}
                    />
                  </button>
                  <span className={`text-xs font-medium ${billingCycle === 'yearly' ? 'text-white' : 'text-white/60'}`}>
                    Yearly
                  </span>
                </div>

                {billingCycle === 'yearly' && (
                  <div className="text-center mb-3">
                    <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-semibold rounded-full">
                      Save 20% with yearly billing
                    </span>
                  </div>
                )}

                <div className="text-center mb-4">
                  {billingCycle === 'monthly' ? (
                    <>
                      <span className="text-3xl sm:text-4xl font-bold">$22</span>
                      <span className="text-white/80 text-sm">/month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl sm:text-4xl font-bold">$17.60</span>
                      <span className="text-white/80 text-sm">/month</span>
                      <p className="text-white/60 text-xs mt-1">$211.20 billed annually</p>
                    </>
                  )}
                </div>

                <button
                  onClick={handleUpgrade}
                  disabled={!!checkoutLoading}
                  className="w-full py-3 bg-white text-[#476E66] text-sm font-bold rounded-lg hover:bg-white/95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <span className="hidden xs:inline">Get Professional Now</span>
                      <span className="xs:hidden">Get Pro Now</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-center text-white/60 text-[10px] mt-3">
                  Cancel anytime. No questions asked.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Warning */}
      {subscription?.cancel_at_period_end && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 text-xs mb-0.5">Subscription Ending</h3>
              <p className="text-amber-800 text-xs">
                Your subscription is set to cancel on {formatDate(subscription.current_period_end)}.
                You will lose access to Professional features after this date.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Comparison - Mobile: Swipeable Cards, Desktop: Table */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-neutral-100">
        <div className="p-4 border-b border-neutral-100">
          <h3 className="text-base font-bold text-neutral-900">Choose Your Plan</h3>
          <p className="text-neutral-500 text-xs mt-0.5">Swipe to compare plans</p>
        </div>
        
        {/* Mobile: Muted Current + Highlighted Upgrade */}
        <div className="sm:hidden p-3 space-y-3">
          {/* Current Plan - Muted/Simple */}
          {!isPro ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-neutral-200 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-neutral-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-700">Starter Plan</p>
                    <p className="text-[10px] text-neutral-500">Your current plan</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-neutral-600">Free</span>
              </div>
              <div className="mt-2 pt-2 border-t border-neutral-200 grid grid-cols-4 gap-1 text-center">
                <div><p className="text-xs font-bold text-neutral-700">3</p><p className="text-[9px] text-neutral-500">Projects</p></div>
                <div><p className="text-xs font-bold text-neutral-700">2</p><p className="text-[9px] text-neutral-500">Team</p></div>
                <div><p className="text-xs font-bold text-neutral-700">5</p><p className="text-[9px] text-neutral-500">Clients</p></div>
                <div><p className="text-xs font-bold text-neutral-700">10</p><p className="text-[9px] text-neutral-500">Invoices</p></div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#476E66] flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-700">Professional Plan</p>
                    <p className="text-[10px] text-neutral-500">Your current plan</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-[#476E66]">${billingCycle === 'yearly' ? '17.60' : '22'}/mo</span>
              </div>
            </div>
          )}
          
          {/* Upgrade Card - Prominent (only show if not Pro) */}
          {!isPro && (
            <div className="rounded-xl border-2 border-[#476E66] bg-gradient-to-br from-[#476E66]/10 to-[#476E66]/5 p-4 relative overflow-hidden">
              {/* Recommended Badge */}
              <div className="absolute top-0 right-0 bg-[#476E66] text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                RECOMMENDED
              </div>
              
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-lg font-bold text-neutral-900">Professional</h4>
                  <p className="text-xs text-neutral-600">Unlock all features</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#476E66]">${billingCycle === 'yearly' ? '17.60' : '22'}</p>
                  <p className="text-[10px] text-neutral-500">per month</p>
                </div>
              </div>
              
              {/* Key Benefits */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-xs text-neutral-700">Unlimited projects</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-xs text-neutral-700">50 team members</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-xs text-neutral-700">Custom branding</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#476E66]" />
                  <span className="text-xs text-neutral-700">Advanced reports</span>
                </div>
              </div>
              
              <button
                onClick={handleUpgrade}
                disabled={!!checkoutLoading}
                className="w-full py-3 bg-[#476E66] text-white text-sm font-bold rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                {checkoutLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Upgrade Now</>
                )}
              </button>
              
              {billingCycle === 'yearly' && (
                <p className="text-center text-[10px] text-emerald-600 font-medium mt-2">Save 20% with yearly billing</p>
              )}
            </div>
          )}
        </div>
        
        {/* Desktop: Traditional Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-700 w-1/2">Features</th>
                <th className="text-center py-3 px-4 w-1/4">
                  <div className="inline-flex flex-col items-center">
                    <span className="text-sm font-semibold text-neutral-900">Starter</span>
                    <span className="text-xs text-neutral-500">Free forever</span>
                  </div>
                </th>
                <th className="text-center py-3 px-4 w-1/4">
                  <div className="inline-flex flex-col items-center">
                    <span className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
                      Professional
                      <span className="px-1.5 py-0.5 bg-[#476E66] text-white text-[9px] font-bold rounded">PRO</span>
                    </span>
                    <span className="text-xs text-neutral-500">${billingCycle === 'yearly' ? '17.60' : '22'}/month</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {features.map((feature, idx) => (
                <tr key={feature.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                  <td className="py-3 px-4 text-sm text-neutral-700">{feature.name}</td>
                  <td className="text-center py-3 px-4">
                    {typeof feature.starter === 'boolean' ? (
                      feature.starter ? (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100">
                          <X className="w-3.5 h-3.5 text-neutral-400" />
                        </div>
                      )
                    ) : (
                      <span className="text-sm font-medium text-neutral-900">{feature.starter}</span>
                    )}
                  </td>
                  <td className="text-center py-3 px-4">
                    {typeof feature.pro === 'boolean' ? (
                      feature.pro ? (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100">
                          <X className="w-3.5 h-3.5 text-neutral-400" />
                        </div>
                      )
                    ) : (
                      <span className="text-sm font-semibold text-[#476E66]">{feature.pro}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Desktop Upgrade CTA */}
        {isStarter && (
          <div className="hidden sm:block p-4 bg-gradient-to-r from-[#476E66]/5 to-[#476E66]/10 border-t border-neutral-100">
            <div className="flex items-center justify-between gap-4">
              <p className="text-neutral-700 text-sm font-medium">Ready to unlock all features?</p>
              <button
                onClick={handleUpgrade}
                disabled={!!checkoutLoading}
                className="px-5 py-2.5 bg-[#476E66] text-white text-sm font-semibold rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {checkoutLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Upgrade Now - ${billingCycle === 'yearly' ? '17.60' : '22'}/mo</>
                )}
              </button>
            </div>
          </div>
        )}
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
      <div className="bg-white rounded-2xl p-6 border border-neutral-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Collaborator Categories</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Define categories for the types of collaborators you work with (e.g., Surveying, Engineering, Design)
            </p>
          </div>
          <button
            onClick={() => {
              setEditingCategory(null);
              setNewCategory({ name: '', description: '', color: '#476E66' });
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>

        {/* Categories List */}
        {categories.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-xl">
            <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="font-medium text-neutral-700 mb-1">No Categories Yet</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Create categories to organize your collaborators by specialty
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors"
            >
              Create First Category
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${cat.color}20` }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-neutral-800">{cat.name}</h4>
                    {cat.description && (
                      <p className="text-sm text-neutral-500">{cat.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
                    className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
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
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-neutral-100">
              <h3 className="text-lg font-semibold text-neutral-900">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Surveying, Engineering"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newCategory.description}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this category..."
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66]/20 focus:border-[#476E66]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewCategory(prev => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newCategory.color === color ? 'border-neutral-800 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-neutral-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingCategory(null);
                  setNewCategory({ name: '', description: '', color: '#476E66' });
                }}
                className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !newCategory.name.trim()}
                className="px-4 py-2 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
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
    <div className="space-y-4">
      {/* Email Notifications */}
      <div className="bg-white rounded-lg border border-neutral-100">
        <div className="p-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#476E66]" />
            <h2 className="text-base font-semibold text-neutral-900">Email Notifications</h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">Choose which emails you'd like to receive</p>
        </div>
        
        <div className="divide-y divide-neutral-100">
          {categories.map(category => (
            <div key={category} className="p-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">{category}</h3>
              <div className="space-y-3">
                {EMAIL_NOTIFICATIONS.filter(n => n.category === category).map(notification => (
                  <div key={notification.key} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm font-medium text-neutral-900">{notification.title}</p>
                      <p className="text-xs text-neutral-500 truncate">{notification.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={preferences[notification.key as keyof typeof preferences]}
                        onChange={(e) => handleToggle(notification.key, e.target.checked)}
                        disabled={saving}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#476E66]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#476E66]"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-[#476E66]/5 border border-[#476E66]/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Bell className="w-4 h-4 text-[#476E66] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-[#476E66]">In-App Notifications</h3>
            <p className="text-xs text-neutral-600 mt-0.5">
              In-app notifications are always enabled and appear in your notification center. 
              You can mark them as read or dismiss them at any time.
            </p>
          </div>
        </div>
      </div>

      {/* Future SMS Section Placeholder */}
      <div className="bg-white rounded-lg border border-neutral-100 p-4 opacity-60">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded bg-neutral-200 flex items-center justify-center">
            <span className="text-[10px] text-neutral-500">📱</span>
          </div>
          <h2 className="text-base font-semibold text-neutral-400">SMS Notifications</h2>
          <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 text-[10px] font-medium rounded">Coming Soon</span>
        </div>
        <p className="text-xs text-neutral-400">
          SMS notifications for critical alerts will be available in a future update.
        </p>
      </div>
    </div>
  );
}
