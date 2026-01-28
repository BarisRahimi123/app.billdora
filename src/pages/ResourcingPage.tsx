import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Mail, Phone, Edit2, X, UserCheck, UserX, Clock, DollarSign, Activity, UsersRound, Shield, User, ChevronRight, Calendar, Briefcase, CheckCircle2, MoreVertical, Trash2, UserPlus, Send, ArrowLeft, LogOut, ListTodo, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, userManagementApi, UserProfile, Role, TimeEntry, Expense, Task } from '../lib/api';
import { supabase } from '../lib/supabase';

type TabType = 'activity' | 'tasks' | 'time' | 'performance' | 'personal' | 'compensation' | 'billing';

export default function ResourcingPage() {
  const navigate = useNavigate();
  const { profile, signOut, loading: authLoading } = useAuth();
  const [staff, setStaff] = useState<UserProfile[]>([]);
  // CRITICAL: Start with loading=false to prevent spinner on iOS resume
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('activity');
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    loadStaff();
  }, [profile?.company_id]);

  async function loadStaff() {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    try {
      const data = await userManagementApi.getCompanyUsers(profile.company_id);
      setStaff(data || []);
      if (data && data.length > 0 && !selectedStaff) {
        setSelectedStaff(data[0]);
      }
    } catch (error) {
      console.error('Failed to load staff:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredStaff = staff.filter(s => {
    if (!showInactive && s.is_active === false) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return s.full_name?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term);
    }
    return true;
  });

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'activity', label: 'Activity Feed', icon: <Activity className="w-4 h-4" /> },
    { id: 'tasks', label: 'Current Tasks', icon: <ListTodo className="w-4 h-4" /> },
    { id: 'time', label: 'Time Tracking', icon: <Clock className="w-4 h-4" /> },
    { id: 'performance', label: 'Performance', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'personal', label: 'Personal Details', icon: <User className="w-4 h-4" /> },
    { id: 'compensation', label: 'Compensation & Rates', icon: <Wallet className="w-4 h-4" /> },
  ];

  // Only show loading spinner briefly - don't wait forever
  if (authLoading && loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile?.company_id) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500">Unable to load team. Please log in again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-neutral-900">Team</h1>
          <p className="text-neutral-500 text-xs sm:text-sm mt-0.5">Manage staff members and their assignments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Invite</span>
          </button>
          <button
            onClick={() => { setEditingStaff(null); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Staff</span>
          </button>
        </div>
      </div>

      {/* Staff Selector Bar */}
      <div className="bg-white rounded-lg border border-neutral-200 p-2.5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-28 sm:w-36 h-8 px-2.5 py-1.5 text-sm rounded-lg bg-neutral-50 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66]"
            />
            <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#476E66] focus:ring-[#476E66]"
              />
              <span className="hidden sm:inline">Inactive</span>
            </label>
          </div>
          <div className="h-5 w-px bg-neutral-200" />
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-1.5">
              {filteredStaff.map((member) => (
                <button
                  key={member.id}
                  onClick={() => { setSelectedStaff(member); setActiveTab('activity'); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap text-sm ${
                    selectedStaff?.id === member.id 
                      ? 'bg-[#476E66]/10 text-[#476E66] ring-1 ring-[#476E66]' 
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                      selectedStaff?.id === member.id ? 'bg-[#476E66]/20 text-[#476E66]' : 'bg-[#476E66]/10 text-[#476E66]'
                    }`}>
                      {member.full_name?.charAt(0) || '?'}
                    </div>
                  )}
                  <span className="text-sm font-medium">{member.full_name?.split(' ')[0] || 'Staff'}</span>
                  {member.is_active === false && (
                    <span className={`px-1 py-0.5 text-[10px] rounded ${
                      selectedStaff?.id === member.id ? 'bg-[#476E66]/20 text-[#476E66]' : 'bg-neutral-200'
                    }`}>Off</span>
                  )}
                </button>
              ))}
              {filteredStaff.length === 0 && (
                <span className="text-neutral-400 text-sm">No staff found</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Staff Details */}
      <div className="bg-white rounded-lg border border-neutral-200 flex flex-col min-h-[calc(100vh-300px)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          {selectedStaff ? (
            <>
              {/* Tab Bar */}
              <div className="border-b border-neutral-100">
                <div className="flex items-center gap-0.5 px-2 pt-1.5 overflow-x-auto scrollbar-hide">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-[#476E66]/10 text-[#476E66] border border-neutral-200 border-b-white -mb-px'
                          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-3.5 h-3.5">{tab.icon}</span>
                      <span className="hidden lg:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                <div className="mb-2.5">
                  <h2 className="text-sm sm:text-base font-semibold text-neutral-900">{selectedStaff.full_name}</h2>
                </div>
                
                {activeTab === 'activity' && <ActivityTab staff={selectedStaff} companyId={profile?.company_id || ''} />}
                {activeTab === 'tasks' && <CurrentTasksTab staff={selectedStaff} companyId={profile?.company_id || ''} />}
                {activeTab === 'time' && <TimeTab staff={selectedStaff} companyId={profile?.company_id || ''} />}
                {activeTab === 'performance' && <PerformanceTab staff={selectedStaff} companyId={profile?.company_id || ''} />}
                {activeTab === 'personal' && <PersonalDetailsTab staff={selectedStaff} onEdit={() => { setEditingStaff(selectedStaff); setShowModal(true); }} onDelete={async () => { await userManagementApi.updateUserProfile(selectedStaff.id, { is_active: false }); loadStaff(); }} onToggleActive={async () => { await userManagementApi.updateUserProfile(selectedStaff.id, { is_active: !selectedStaff.is_active }); loadStaff(); }} />}
                {activeTab === 'compensation' && <CompensationTab staff={selectedStaff} companyId={profile?.company_id || ''} onUpdate={loadStaff} />}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-400">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Select a staff member to view details</p>
              </div>
            </div>
          )}
      </div>

      {/* Modal */}
      {showModal && (
        <StaffModal
          staff={editingStaff}
          companyId={profile?.company_id || ''}
          onClose={() => { setShowModal(false); setEditingStaff(null); }}
          onSave={() => { loadStaff(); setShowModal(false); setEditingStaff(null); }}
        />
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          companyId={profile?.company_id || ''}
          currentUserId={profile?.id || ''}
          onClose={() => setShowInviteModal(false)}
          onSent={() => { setShowInviteModal(false); }}
        />
      )}
    </div>
  );
}

// Basic Info Tab
function PersonalDetailsTab({ staff, onEdit, onDelete, onToggleActive }: { staff: UserProfile; onEdit: () => void; onDelete: () => void; onToggleActive: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#476E66]/20 flex items-center justify-center text-neutral-900-700 text-2xl font-medium">
              {staff.full_name?.charAt(0) || '?'}
            </div>
          )}
          <div>
            <h3 className="text-xl font-semibold text-neutral-900">{staff.full_name || 'No Name'}</h3>
            <p className="text-neutral-500">{staff.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-lg text-sm capitalize">
                {staff.role || 'Staff'}
              </span>
              {staff.is_active !== false ? (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">Active</span>
              ) : (
                <span className="px-2.5 py-1 bg-neutral-100 text-neutral-500 rounded-lg text-xs font-medium">Inactive</span>
              )}
            </div>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)} 
            className="p-2 text-neutral-600 hover:bg-neutral-100 rounded-lg"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10">
              <button 
                onClick={() => { setShowMenu(false); onEdit(); }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Edit2 className="w-4 h-4" />
                Edit Details
              </button>
              <button 
                onClick={() => { setShowMenu(false); onToggleActive(); }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {staff.is_active !== false ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                {staff.is_active !== false ? 'Deactivate' : 'Activate'}
              </button>
              <hr className="my-1 border-neutral-100" />
              <button 
                onClick={() => { setShowMenu(false); onDelete(); }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-100"
              >
                <Trash2 className="w-4 h-4" />
                Remove Staff
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Personal Information */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-neutral-800 border-b pb-1.5">PERSONAL INFORMATION</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500">Full Name</label>
              <p className="text-neutral-900 font-medium">{staff.full_name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Employee ID</label>
              <p className="text-neutral-900">{(staff as any).employee_id || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Phone</label>
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-neutral-400" />
                <p className="text-neutral-900">{(staff as any).phone || '-'}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Date of Birth</label>
              <p className="text-neutral-900">{(staff as any).date_of_birth ? new Date((staff as any).date_of_birth).toLocaleDateString() : '-'}</p>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Address</label>
            <p className="text-neutral-900">{(staff as any).address || '-'}</p>
            {((staff as any).city || (staff as any).state || (staff as any).zip_code) && (
              <p className="text-neutral-700 text-sm">
                {[(staff as any).city, (staff as any).state, (staff as any).zip_code].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Employment Details */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-neutral-800 border-b pb-1.5">EMPLOYMENT DETAILS</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500">Hire Date</label>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                <p className="text-neutral-900">{(staff as any).hire_date ? new Date((staff as any).hire_date).toLocaleDateString() : '-'}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Job Title</label>
              <p className="text-neutral-900">{(staff as any).job_title || staff.role || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Department</label>
              <p className="text-neutral-900">{(staff as any).department || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Employment Type</label>
              <p className="text-neutral-900 capitalize">{(staff as any).employment_type || 'Full-time'}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Hourly Rate</label>
              <p className="text-neutral-900 font-medium">${staff.hourly_rate?.toFixed(2) || '0.00'}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Billable</label>
              <p className="text-neutral-900">{staff.is_billable !== false ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-neutral-800 border-b pb-1.5">EMERGENCY CONTACT</h4>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-neutral-500">Contact Name</label>
            <p className="text-neutral-900">{(staff as any).emergency_contact_name || '-'}</p>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Relationship</label>
            <p className="text-neutral-900">{(staff as any).emergency_contact_relationship || '-'}</p>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Phone</label>
            <p className="text-neutral-900">{(staff as any).emergency_contact_phone || '-'}</p>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Email</label>
            <p className="text-neutral-900">{(staff as any).emergency_contact_email || '-'}</p>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-neutral-800 border-b pb-1.5">ADDITIONAL INFORMATION</h4>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-neutral-500">Reports To</label>
            <p className="text-neutral-900">{(staff as any).reports_to || '-'}</p>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Work Location</label>
            <p className="text-neutral-900">{(staff as any).work_location || '-'}</p>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Start Time</label>
            <p className="text-neutral-900">{(staff as any).work_start_time || '-'}</p>
          </div>
          <div>
            <label className="text-xs text-neutral-500">End Time</label>
            <p className="text-neutral-900">{(staff as any).work_end_time || '-'}</p>
          </div>
        </div>
        {(staff as any).notes && (
          <div>
            <label className="text-xs text-neutral-500">Notes</label>
            <p className="text-neutral-700 text-sm">{(staff as any).notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// User Rights Tab
function UserRightsTab({ staff, companyId, onUpdate }: { staff: UserProfile; companyId: string; onUpdate?: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [staffTeamsList, setStaffTeamsList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<'groups' | 'departments' | 'teams' | null>(null);
  const [openMenu, setOpenMenu] = useState<'groups' | 'departments' | 'teams' | null>(null);
  
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(staff.user_groups || []);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(staff.management_departments || []);
  const [selectedTeams, setSelectedTeams] = useState<string[]>(staff.staff_teams || []);

  useEffect(() => {
    loadData();
  }, [companyId]);

  useEffect(() => {
    setSelectedRoleIds(staff.user_groups || []);
    setSelectedDepartments(staff.management_departments || []);
    setSelectedTeams(staff.staff_teams || []);
  }, [staff]);

  async function loadData() {
    try {
      const [rolesData, deptData, teamsData] = await Promise.all([
        userManagementApi.getRoles(companyId),
        userManagementApi.getDepartments(companyId),
        userManagementApi.getStaffTeams(companyId),
      ]);
      setRoles(rolesData || []);
      setDepartments(deptData || []);
      setStaffTeamsList(teamsData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSection(section: 'groups' | 'departments' | 'teams') {
    setSaving(true);
    try {
      const updates: Partial<UserProfile> = {};
      if (section === 'groups') updates.user_groups = selectedRoleIds;
      if (section === 'departments') updates.management_departments = selectedDepartments;
      if (section === 'teams') updates.staff_teams = selectedTeams;
      
      await userManagementApi.updateUserProfile(staff.id, updates);
      setEditingSection(null);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  }

  // Default security groups if no roles loaded
  const defaultGroups = [
    { id: 'system_admin', name: 'System Administrators' },
    { id: 'everyone', name: 'Everyone' },
    { id: 'project_manager', name: 'Project Manager' },
  ];

  // Default departments if none in database
  const defaultDepartments = [
    { id: 'account_services', name: 'Account Services' },
    { id: 'creative', name: 'Creative' },
    { id: 'media', name: 'Media' },
    { id: 'production', name: 'Production' },
    { id: 'admin_it', name: 'Admin/IT' },
    { id: 'land_development', name: 'Land Development' },
    { id: 'plot_plan', name: 'Plot-Plan' },
    { id: 'as_built_survey', name: 'As-Built Survey' },
    { id: 'ag_department', name: 'Ag-Department' },
  ];

  // Default teams if none in database
  const defaultTeams = [
    { id: 'design_team', name: 'Design Team' },
    { id: 'development_team', name: 'Development Team' },
    { id: 'marketing_team', name: 'Marketing Team' },
    { id: 'operations_team', name: 'Operations Team' },
  ];

  const securityGroups = roles.length > 0 ? roles : defaultGroups;
  const departmentList = departments.length > 0 ? departments : defaultDepartments;
  const teamList = staffTeamsList.length > 0 ? staffTeamsList : defaultTeams;

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* User Rights / Security Groups Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-neutral-800">USER RIGHTS</h4>
          {editingSection === 'groups' ? (
            <div className="flex gap-2">
              <button 
                onClick={() => { setEditingSection(null); setSelectedRoleIds(staff.user_groups || []); }} 
                className="px-3 py-1 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => saveSection('groups')} 
                disabled={saving}
                className="px-3 py-1 text-sm bg-[#476E66] text-white rounded-lg hover:bg-black disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="relative">
              <button 
                onClick={() => setOpenMenu(openMenu === 'groups' ? null : 'groups')} 
                className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {openMenu === 'groups' && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10">
                  <button 
                    onClick={() => { setOpenMenu(null); setEditingSection('groups'); }} 
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Security in Billdora is managed with the set of user <span className="text-neutral-500 underline cursor-pointer">groups</span>, listed below. Groups work just like a set of keys, permitting any team member that has them access to various areas within the program.
        </p>
        <div className="grid grid-cols-3 gap-x-8 gap-y-3">
          {securityGroups.map((group) => (
            <label key={group.id} className={`flex items-center gap-2 ${editingSection === 'groups' ? 'cursor-pointer' : 'cursor-default'}`}>
              <input
                type="checkbox"
                checked={selectedRoleIds.includes(group.id)}
                disabled={editingSection !== 'groups'}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedRoleIds([...selectedRoleIds, group.id]);
                  } else {
                    setSelectedRoleIds(selectedRoleIds.filter(id => id !== group.id));
                  }
                }}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-500 disabled:opacity-60"
              />
              <span className="text-sm text-neutral-700">{group.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Management Authority Section */}
      <div className="pt-4 border-t border-neutral-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-neutral-800">MANAGEMENT AUTHORITY</h4>
          {editingSection === 'departments' ? (
            <div className="flex gap-2">
              <button 
                onClick={() => { setEditingSection(null); setSelectedDepartments(staff.management_departments || []); }} 
                className="px-3 py-1 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => saveSection('departments')} 
                disabled={saving}
                className="px-3 py-1 text-sm bg-[#476E66] text-white rounded-lg hover:bg-black disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="relative">
              <button 
                onClick={() => setOpenMenu(openMenu === 'departments' ? null : 'departments')} 
                className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {openMenu === 'departments' && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10">
                  <button 
                    onClick={() => { setOpenMenu(null); setEditingSection('departments'); }} 
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Below is a list of the departments {staff.full_name} manages (giving this manager authority to view/edit or approve time/expenses logged by team members in those departments).
        </p>
        <div className="grid grid-cols-3 gap-x-8 gap-y-3">
          {departmentList.map((dept) => (
            <label key={dept.id} className={`flex items-center gap-2 ${editingSection === 'departments' ? 'cursor-pointer' : 'cursor-default'}`}>
              <input
                type="checkbox"
                checked={selectedDepartments.includes(dept.id)}
                disabled={editingSection !== 'departments'}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedDepartments([...selectedDepartments, dept.id]);
                  } else {
                    setSelectedDepartments(selectedDepartments.filter(id => id !== dept.id));
                  }
                }}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-500 disabled:opacity-60"
              />
              <span className="text-sm text-neutral-700">{dept.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Staff Teams Section */}
      <div className="pt-4 border-t border-neutral-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-neutral-800">STAFF TEAMS</h4>
          {editingSection === 'teams' ? (
            <div className="flex gap-2">
              <button 
                onClick={() => { setEditingSection(null); setSelectedTeams(staff.staff_teams || []); }} 
                className="px-3 py-1 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => saveSection('teams')} 
                disabled={saving}
                className="px-3 py-1 text-sm bg-[#476E66] text-white rounded-lg hover:bg-black disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="relative">
              <button 
                onClick={() => setOpenMenu(openMenu === 'teams' ? null : 'teams')} 
                className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded-lg"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {openMenu === 'teams' && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10">
                  <button 
                    onClick={() => { setOpenMenu(null); setEditingSection('teams'); }} 
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Below is a list of available staff teams. These can be used to assign a group of team members to a project. Check off the teams you would like this team member to be a part of.
        </p>
        <div className="grid grid-cols-3 gap-x-8 gap-y-3">
          {teamList.map((team) => (
            <label key={team.id} className={`flex items-center gap-2 ${editingSection === 'teams' ? 'cursor-pointer' : 'cursor-default'}`}>
              <input
                type="checkbox"
                checked={selectedTeams.includes(team.id)}
                disabled={editingSection !== 'teams'}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTeams([...selectedTeams, team.id]);
                  } else {
                    setSelectedTeams(selectedTeams.filter(id => id !== team.id));
                  }
                }}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-500 disabled:opacity-60"
              />
              <span className="text-sm text-neutral-700">{team.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Contact Info Tab
function ContactInfoTab({ staff }: { staff: UserProfile }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-neutral-700 border-b pb-2 mb-4">Contact Information</h4>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-500">Email</label>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="w-4 h-4 text-neutral-400" />
                <p className="text-neutral-900">{staff.email}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Phone</label>
              <div className="flex items-center gap-2 mt-1">
                <Phone className="w-4 h-4 text-neutral-400" />
                <p className="text-neutral-500">Not provided</p>
              </div>
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-neutral-700 border-b pb-2 mb-4">Address</h4>
          <p className="text-neutral-500">No address on file</p>
        </div>
      </div>
    </div>
  );
}

// Time Tab
function TimeTab({ staff, companyId }: { staff: UserProfile; companyId: string }) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    loadTimeEntries();
  }, [staff.id, companyId]);

  async function loadTimeEntries() {
    try {
      const data = await api.getTimeEntries(companyId, staff.id);
      setTimeEntries(data || []);
    } catch (error) {
      console.error('Failed to load time entries:', error);
    } finally {
      setLoading(false);
    }
  }

  // Group by month
  const groupedByMonth = timeEntries.reduce((acc, entry) => {
    const month = entry.date.substring(0, 7); // YYYY-MM
    if (!acc[month]) acc[month] = [];
    acc[month].push(entry);
    return acc;
  }, {} as Record<string, TimeEntry[]>);

  const monthlyTotals = Object.entries(groupedByMonth).map(([month, entries]) => {
    const inputHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0);
    const inputCharges = entries.reduce((sum, e) => sum + e.hours * (e.hourly_rate || 0), 0);
    const billableCharges = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours * (e.hourly_rate || 0), 0);
    return { month, inputHours, inputCharges, billableHours, billableCharges };
  }).sort((a, b) => b.month.localeCompare(a.month));

  const overallTotals = monthlyTotals.reduce(
    (acc, m) => ({
      inputHours: acc.inputHours + m.inputHours,
      inputCharges: acc.inputCharges + m.inputCharges,
      billableHours: acc.billableHours + m.billableHours,
      billableCharges: acc.billableCharges + m.billableCharges,
    }),
    { inputHours: 0, inputCharges: 0, billableHours: 0, billableCharges: 0 }
  );

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['week', 'month', 'quarter', 'year'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 text-sm rounded-lg capitalize ${
              viewMode === mode ? 'bg-[#476E66] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-0">
          <thead className="bg-neutral-50">
            <tr>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-neutral-600 whitespace-nowrap">Date Range</th>
              <th colSpan={2} className="text-center px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-neutral-600 border-l border-neutral-200">Input</th>
              <th colSpan={2} className="text-center px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-neutral-600 border-l border-neutral-200">Billable</th>
            </tr>
            <tr className="border-t border-neutral-200 bg-neutral-50">
              <th className="px-2 sm:px-4 py-1 sm:py-2"></th>
              <th className="text-right px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-xs font-medium text-neutral-500">Hours</th>
              <th className="text-right px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-xs font-medium text-neutral-500">Charges</th>
              <th className="text-right px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-xs font-medium text-neutral-500 border-l border-neutral-200">Hours</th>
              <th className="text-right px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-xs font-medium text-neutral-500">Charges</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {monthlyTotals.slice(0, 12).map((row) => (
              <tr key={row.month} className="hover:bg-neutral-50">
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-neutral-600 whitespace-nowrap">{formatMonthRange(row.month)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900">{row.inputHours.toFixed(2)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900">${row.inputCharges.toLocaleString()}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900 border-l border-neutral-100">{row.billableHours.toFixed(2)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900">${row.billableCharges.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 border-t border-neutral-200">
            <tr className="font-medium">
              <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-neutral-700 whitespace-nowrap">OVERALL TOTALS</td>
              <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-600">{overallTotals.inputHours.toFixed(2)}</td>
              <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900">${overallTotals.inputCharges.toLocaleString()}</td>
              <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900 border-l border-neutral-100">{overallTotals.billableHours.toFixed(2)}</td>
              <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-neutral-900">${overallTotals.billableCharges.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {timeEntries.length === 0 && (
        <div className="text-center py-8 text-neutral-400">
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No time entries found</p>
        </div>
      )}
    </div>
  );
}

function formatMonthRange(month: string): string {
  const [year, m] = month.split('-');
  const start = new Date(parseInt(year), parseInt(m) - 1, 1);
  const end = new Date(parseInt(year), parseInt(m), 0);
  return `${start.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`;
}

// Expenses Tab
function ExpensesTab({ staff, companyId }: { staff: UserProfile; companyId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpenses();
  }, [staff.id, companyId]);

  async function loadExpenses() {
    try {
      const data = await api.getExpenses(companyId, staff.id);
      setExpenses(data || []);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-50">
            <tr>
              <th className="w-10 px-4 py-3"></th>
              <th className="text-left px-4 py-3 text-sm font-medium text-neutral-600">Expense Report</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-neutral-600">Submitted Date</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-neutral-600">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-neutral-600">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <input type="checkbox" className="w-4 h-4 rounded border-neutral-300" />
                </td>
                <td className="px-4 py-3 text-sm text-neutral-900">{expense.description}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{new Date(expense.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    expense.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    expense.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-neutral-100 text-neutral-600'
                  }`}>
                    {expense.status || 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium text-neutral-900">${expense.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {expenses.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No expenses found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Activity Tab
function ActivityTab({ staff, companyId }: { staff: UserProfile; companyId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    loadTasks();
  }, [staff.id, companyId]);

  async function loadTasks() {
    try {
      const data = await api.getStaffTasks(companyId, staff.id);
      setTasks(data || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredTasks = showCompleted ? tasks : tasks.filter(t => t.status !== 'completed');

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="px-3 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors font-medium">Add Activity</button>
          <button className="px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors font-medium">Bulk Actions</button>
          <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
            />
            <span className="text-xs sm:text-sm">Show completed</span>
          </label>
        </div>
        <button className="px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors font-medium hidden sm:block">Export</button>
      </div>

      <div className="rounded-lg overflow-hidden overflow-x-auto" style={{ boxShadow: 'var(--shadow-card)' }}>
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-100">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Due Date</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Assigned To</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Project</th>
              <th className="hidden md:table-cell text-left px-3 py-2 text-xs font-medium text-neutral-600">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {filteredTasks.map((task) => (
              <tr key={task.id} className="hover:bg-neutral-50/50">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]" />
                    <span className="text-xs text-neutral-600">{task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sm text-neutral-900">{staff.full_name}</td>
                <td className="px-3 py-2.5 text-sm text-neutral-600">{task.project?.name || '-'}</td>
                <td className="hidden md:table-cell px-3 py-2.5 text-sm text-neutral-600 max-w-md truncate">{task.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTasks.length === 0 && (
          <div className="text-center py-8 text-neutral-400">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Teams Tab
function TeamsTab({ staff }: { staff: UserProfile }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, [staff.id]);

  async function loadProjects() {
    try {
      const data = await api.getStaffProjects(staff.id);
      setProjects(data || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Projects and teams that {staff.full_name} is assigned to.
      </p>
      
      <div className="grid gap-4">
        {projects.map((pm) => (
          <div key={pm.id} className="border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#476E66]/20 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-neutral-600" />
                </div>
                <div>
                  <h4 className="font-medium text-neutral-900">{pm.project?.name}</h4>
                  <p className="text-sm text-neutral-500">{pm.project?.client?.name || 'No Client'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded text-sm">{pm.role || 'Team Member'}</span>
                {pm.is_lead && <span className="px-2.5 py-1 bg-[#476E66]/20 text-neutral-900-700 rounded text-sm">Lead</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <UsersRound className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Not assigned to any teams</p>
        </div>
      )}
    </div>
  );
}

// Current Tasks Tab
function CurrentTasksTab({ staff, companyId }: { staff: UserProfile; companyId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [staff.id]);

  async function loadTasks() {
    try {
      const { data } = await supabase
        .from('tasks')
        .select('*, project:projects(name)')
        .eq('company_id', companyId)
        .eq('assigned_to', staff.id)
        .in('status', ['todo', 'in_progress'])
        .order('due_date', { ascending: true });
      setTasks(data || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Active tasks assigned to {staff.full_name}</p>
        <span className="px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded text-sm font-medium">{tasks.length} tasks</span>
      </div>
      
      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-neutral-900">{task.name}</h4>
                <p className="text-sm text-neutral-500">{(task as any).project?.name || 'No Project'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-600'
                }`}>
                  {task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                </span>
                {task.due_date && (
                  <span className="text-xs text-neutral-500">Due: {new Date(task.due_date).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <ListTodo className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No active tasks assigned</p>
        </div>
      )}
    </div>
  );
}

// Performance Tab
function PerformanceTab({ staff, companyId }: { staff: UserProfile; companyId: string }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [staff.id]);

  async function loadStats() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('hours, billable')
        .eq('company_id', companyId)
        .eq('user_id', staff.id)
        .gte('date', startOfMonth);

      const totalHours = timeEntries?.reduce((sum, t) => sum + (t.hours || 0), 0) || 0;
      const billableHours = timeEntries?.filter(t => t.billable).reduce((sum, t) => sum + (t.hours || 0), 0) || 0;
      const utilization = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;
      const revenueGenerated = billableHours * (staff.hourly_rate || 0);

      setStats({ totalHours, billableHours, utilization, revenueGenerated });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500">Performance metrics for {staff.full_name} (This Month)</p>
      
      <div className="space-y-1">
        <div className="flex justify-between items-center py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-600">Total Hours</span>
          <span className="text-sm font-medium text-neutral-900">{stats?.totalHours?.toFixed(1) || '0'}h</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-600">Billable Hours</span>
          <span className="text-sm font-medium text-neutral-900">{stats?.billableHours?.toFixed(1) || '0'}h</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-600">Revenue Generated</span>
          <span className="text-sm font-medium text-emerald-600">${(stats?.revenueGenerated || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-600">Utilization Rate</span>
          <span className="text-sm font-medium text-neutral-900">{stats?.utilization || 0}%</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-600">Target Utilization</span>
          <span className="text-sm font-medium text-neutral-900">75%</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-neutral-600">Status</span>
          <span className="text-sm text-neutral-900">{stats?.utilization >= 75 ? 'Meeting target' : `${75 - (stats?.utilization || 0)}% below target`}</span>
        </div>
      </div>
    </div>
  );
}

// Compensation & Costs Tab
function CompensationTab({ staff, companyId, onUpdate }: { staff: UserProfile; companyId: string; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [billableRevenue, setBillableRevenue] = useState<{ monthly: number; total: number; hours: number } | null>(null);
  const [formData, setFormData] = useState({
    hourly_pay_rate: (staff as any).hourly_pay_rate?.toString() || '',
    salary_type: (staff as any).salary_type || 'hourly',
    annual_salary: (staff as any).annual_salary?.toString() || '',
    health_insurance_cost: (staff as any).health_insurance_cost?.toString() || '',
    retirement_contribution: (staff as any).retirement_contribution?.toString() || '',
    other_benefits_cost: (staff as any).other_benefits_cost?.toString() || '',
    additional_expenses: (staff as any).additional_expenses?.toString() || '',
    // Client billing fields
    hourly_rate: staff.hourly_rate?.toString() || '',
    is_billable: staff.is_billable !== false,
  });

  // Load billable revenue from time entries
  useEffect(() => {
    async function loadBillableRevenue() {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        
        // Get this month's billable hours
        const { data: monthlyEntries } = await supabase
          .from('time_entries')
          .select('hours')
          .eq('company_id', companyId)
          .eq('user_id', staff.id)
          .eq('billable', true)
          .gte('date', startOfMonth);
        
        // Get all-time billable hours
        const { data: allEntries } = await supabase
          .from('time_entries')
          .select('hours')
          .eq('company_id', companyId)
          .eq('user_id', staff.id)
          .eq('billable', true);
        
        const monthlyHours = monthlyEntries?.reduce((sum, t) => sum + (t.hours || 0), 0) || 0;
        const totalHours = allEntries?.reduce((sum, t) => sum + (t.hours || 0), 0) || 0;
        const billingRate = staff.hourly_rate || 0;
        
        setBillableRevenue({
          monthly: monthlyHours * billingRate,
          total: totalHours * billingRate,
          hours: monthlyHours
        });
      } catch (error) {
        console.error('Failed to load billable revenue:', error);
      }
    }
    loadBillableRevenue();
  }, [staff.id, companyId, staff.hourly_rate]);

  // Update form when staff changes
  useEffect(() => {
    setFormData({
      hourly_pay_rate: (staff as any).hourly_pay_rate?.toString() || '',
      salary_type: (staff as any).salary_type || 'hourly',
      annual_salary: (staff as any).annual_salary?.toString() || '',
      health_insurance_cost: (staff as any).health_insurance_cost?.toString() || '',
      retirement_contribution: (staff as any).retirement_contribution?.toString() || '',
      other_benefits_cost: (staff as any).other_benefits_cost?.toString() || '',
      additional_expenses: (staff as any).additional_expenses?.toString() || '',
      hourly_rate: staff.hourly_rate?.toString() || '',
      is_billable: staff.is_billable !== false,
    });
  }, [staff.id]);

  const calculateMonthlyCost = () => {
    let monthlySalary = 0;
    if (formData.salary_type === 'hourly' && formData.hourly_pay_rate) {
      monthlySalary = parseFloat(formData.hourly_pay_rate) * 160;
    } else if (formData.annual_salary) {
      monthlySalary = parseFloat(formData.annual_salary) / 12;
    }
    
    const benefits = (parseFloat(formData.health_insurance_cost) || 0) +
                     (parseFloat(formData.retirement_contribution) || 0) +
                     (parseFloat(formData.other_benefits_cost) || 0) +
                     (parseFloat(formData.additional_expenses) || 0);
    
    return monthlySalary + benefits;
  };

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          hourly_pay_rate: formData.hourly_pay_rate ? parseFloat(formData.hourly_pay_rate) : null,
          salary_type: formData.salary_type,
          annual_salary: formData.annual_salary ? parseFloat(formData.annual_salary) : null,
          health_insurance_cost: formData.health_insurance_cost ? parseFloat(formData.health_insurance_cost) : null,
          retirement_contribution: formData.retirement_contribution ? parseFloat(formData.retirement_contribution) : null,
          other_benefits_cost: formData.other_benefits_cost ? parseFloat(formData.other_benefits_cost) : null,
          additional_expenses: formData.additional_expenses ? parseFloat(formData.additional_expenses) : null,
          hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
          is_billable: formData.is_billable,
          updated_at: new Date().toISOString(),
        })
        .eq('id', staff.id);
      
      if (error) throw error;
      
      setEditing(false);
      onUpdate();
    } catch (error: any) {
      console.error('Failed to save compensation:', error);
      setSaveError(error?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Compensation, costs and billing rates for {staff.full_name}</p>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{saveError}</div>
      )}

      {/* Summary - Cost vs Revenue */}
      <div className="grid grid-cols-2 gap-4 border-b border-neutral-200 pb-3">
        <div>
          <p className="text-xs text-neutral-500">Total Monthly Cost</p>
          <p className="text-base font-semibold text-neutral-900 mt-0.5">${calculateMonthlyCost().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Revenue Generated (This Month)</p>
          <p className={`text-base font-semibold mt-0.5 ${(billableRevenue?.monthly || 0) >= calculateMonthlyCost() ? 'text-emerald-600' : 'text-neutral-900'}`}>
            ${(billableRevenue?.monthly || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-400">{billableRevenue?.hours?.toFixed(1) || 0}h × ${formData.hourly_rate || 0}/hr</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Salary Section */}
        <div className="border border-neutral-200 rounded-lg p-3">
          <h3 className="text-sm font-medium text-neutral-900 mb-2">Salary / Pay Rate</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Pay Type</label>
              {editing ? (
                <select 
                  value={formData.salary_type} 
                  onChange={(e) => setFormData({...formData, salary_type: e.target.value})}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                >
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="contract">Contract</option>
                </select>
              ) : (
                <p className="text-neutral-900 capitalize">{formData.salary_type}</p>
              )}
            </div>
            {formData.salary_type === 'hourly' ? (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">Hourly Pay Rate</label>
                {editing ? (
                  <input type="number" value={formData.hourly_pay_rate} onChange={(e) => setFormData({...formData, hourly_pay_rate: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
                ) : (
                  <p className="text-neutral-900">{formData.hourly_pay_rate ? `$${formData.hourly_pay_rate}/hr` : '-'}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">Annual Salary</label>
                {editing ? (
                  <input type="number" value={formData.annual_salary} onChange={(e) => setFormData({...formData, annual_salary: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
                ) : (
                  <p className="text-neutral-900">{formData.annual_salary ? `$${parseFloat(formData.annual_salary).toLocaleString()}/yr` : '-'}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Benefits Section */}
        <div className="border border-neutral-200 rounded-lg p-3">
          <h3 className="text-sm font-medium text-neutral-900 mb-2">Benefits & Expenses (Monthly)</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Health Insurance</label>
              {editing ? (
                <input type="number" value={formData.health_insurance_cost} onChange={(e) => setFormData({...formData, health_insurance_cost: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
              ) : (
                <p className="text-neutral-900">{formData.health_insurance_cost ? `$${formData.health_insurance_cost}` : '-'}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-neutral-600 mb-1">401k / Retirement</label>
              {editing ? (
                <input type="number" value={formData.retirement_contribution} onChange={(e) => setFormData({...formData, retirement_contribution: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
              ) : (
                <p className="text-neutral-900">{formData.retirement_contribution ? `$${formData.retirement_contribution}` : '-'}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Other Benefits</label>
              {editing ? (
                <input type="number" value={formData.other_benefits_cost} onChange={(e) => setFormData({...formData, other_benefits_cost: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
              ) : (
                <p className="text-neutral-900">{formData.other_benefits_cost ? `$${formData.other_benefits_cost}` : '-'}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Additional Expenses</label>
              {editing ? (
                <input type="number" value={formData.additional_expenses} onChange={(e) => setFormData({...formData, additional_expenses: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
              ) : (
                <p className="text-neutral-900">{formData.additional_expenses ? `$${formData.additional_expenses}` : '-'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Client Billing Rate Section */}
        <div className="border border-neutral-200 rounded-lg p-3">
          <h3 className="text-sm font-medium text-neutral-900 mb-2">Client Billing Rate</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Billable Status</label>
              {editing ? (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={formData.is_billable} onChange={(e) => setFormData({...formData, is_billable: e.target.checked})} className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#476E66] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  <span className="ml-2 text-sm text-neutral-600">{formData.is_billable ? 'Billable' : 'Non-Billable'}</span>
                </label>
              ) : (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${formData.is_billable ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                  {formData.is_billable ? 'Billable' : 'Non-Billable'}
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Hourly Rate (Client)</label>
              <p className="text-xs text-neutral-400 mb-2">Rate charged to clients for billable time</p>
              {editing ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
                  <input type="number" value={formData.hourly_rate} onChange={(e) => setFormData({...formData, hourly_rate: e.target.value})} className="w-full pl-7 pr-3 py-2 border border-neutral-200 rounded-lg" placeholder="0.00" />
                </div>
              ) : (
                <p className="text-neutral-900 text-sm font-medium">{formData.hourly_rate ? `$${formData.hourly_rate}/hr` : '-'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Staff Modal
function StaffModal({ staff, companyId, onClose, onSave }: {
  staff: UserProfile | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [activeSection, setActiveSection] = useState<'personal' | 'employment' | 'emergency'>('personal');
  const [fullName, setFullName] = useState(staff?.full_name || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [role, setRole] = useState(staff?.role || 'staff');
  const [hourlyRate, setHourlyRate] = useState(staff?.hourly_rate?.toString() || '');
  const [isBillable, setIsBillable] = useState(staff?.is_billable !== false);
  const [isActive, setIsActive] = useState(staff?.is_active !== false);
  
  // New fields
  const [phone, setPhone] = useState((staff as any)?.phone || '');
  const [address, setAddress] = useState((staff as any)?.address || '');
  const [city, setCity] = useState((staff as any)?.city || '');
  const [state, setState] = useState((staff as any)?.state || '');
  const [zipCode, setZipCode] = useState((staff as any)?.zip_code || '');
  const [dateOfBirth, setDateOfBirth] = useState((staff as any)?.date_of_birth || '');
  const [hireDate, setHireDate] = useState((staff as any)?.hire_date || '');
  const [jobTitle, setJobTitle] = useState((staff as any)?.job_title || '');
  const [department, setDepartment] = useState((staff as any)?.department || '');
  const [employmentType, setEmploymentType] = useState((staff as any)?.employment_type || 'full-time');
  const [employeeId, setEmployeeId] = useState((staff as any)?.employee_id || '');
  const [reportsTo, setReportsTo] = useState((staff as any)?.reports_to || '');
  const [workLocation, setWorkLocation] = useState((staff as any)?.work_location || '');
  
  // Emergency contact
  const [emergencyContactName, setEmergencyContactName] = useState((staff as any)?.emergency_contact_name || '');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState((staff as any)?.emergency_contact_relationship || '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState((staff as any)?.emergency_contact_phone || '');
  const [emergencyContactEmail, setEmergencyContactEmail] = useState((staff as any)?.emergency_contact_email || '');
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!fullName || (!staff && !email)) return;
    setSaving(true);
    setError(null);

    try {
      if (staff) {
        await userManagementApi.updateUserProfile(staff.id, {
          full_name: fullName,
          role,
          hourly_rate: parseFloat(hourlyRate) || 0,
          is_billable: isBillable,
          is_active: isActive,
          phone,
          address,
          city,
          state,
          zip_code: zipCode,
          date_of_birth: dateOfBirth || null,
          hire_date: hireDate || null,
          job_title: jobTitle,
          department,
          employment_type: employmentType,
          employee_id: employeeId,
          reports_to: reportsTo,
          work_location: workLocation,
          emergency_contact_name: emergencyContactName,
          emergency_contact_relationship: emergencyContactRelationship,
          emergency_contact_phone: emergencyContactPhone,
          emergency_contact_email: emergencyContactEmail,
        } as any);
      } else {
        // Check if email already exists
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        
        if (existingUser) {
          setError('A user with this email already exists');
          setSaving(false);
          return;
        }
        
        // Create staff profile
        await userManagementApi.createStaffProfile({
          company_id: companyId,
          email: email.toLowerCase(),
          full_name: fullName,
          role: role,
          hourly_rate: parseFloat(hourlyRate) || 0,
          is_billable: isBillable,
          phone,
          address,
          city,
          state,
          zip_code: zipCode,
          date_of_birth: dateOfBirth || null,
          hire_date: hireDate || null,
          job_title: jobTitle,
          department,
          employment_type: employmentType,
          employee_id: employeeId,
          reports_to: reportsTo,
          work_location: workLocation,
          emergency_contact_name: emergencyContactName,
          emergency_contact_relationship: emergencyContactRelationship,
          emergency_contact_phone: emergencyContactPhone,
          emergency_contact_email: emergencyContactEmail,
        } as any);
        
        // Send invitation email
        const { data: companyData } = await supabase.from('companies').select('name').eq('id', companyId).single();
        
        await supabase.functions.invoke('send-email', {
          body: {
            to: email.toLowerCase(),
            subject: `You've been added to ${companyData?.name || 'a company'} on Billdora`,
            type: 'invitation',
            data: {
              inviterName: 'Your administrator',
              companyName: companyData?.name || 'a company',
              roleName: role,
              signupUrl: `${window.location.origin}/login?email=${encodeURIComponent(email.toLowerCase())}&signup=true`,
            },
          },
        });
        
        setError(null);
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save staff:', err);
      setError(err?.message || 'Failed to save staff member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" style={{ boxShadow: 'var(--shadow-elevated)' }}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-neutral-100 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-neutral-900">
            {staff ? 'Edit Staff Member' : 'Add Staff Member'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-neutral-100 px-3 sm:px-4 overflow-x-auto scrollbar-hide flex-shrink-0">
          {[
            { id: 'personal', label: 'Personal Info' },
            { id: 'employment', label: 'Employment' },
            { id: 'emergency', label: 'Emergency Contact' },
          ].map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id as any)}
              className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeSection === section.id
                  ? 'border-[#476E66] text-[#476E66]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3" style={{ minHeight: 0 }}>
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {activeSection === 'personal' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Email {!staff && '*'}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!!staff}
                    className={`w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm ${staff ? 'bg-neutral-50 text-neutral-500' : ''}`}
                    required={!staff}
                    placeholder={!staff ? 'user@email.com' : ''}
                  />
                  {staff && <p className="text-xs text-neutral-400 mt-0.5">Email cannot be changed</p>}
                  {!staff && <p className="text-xs text-neutral-400 mt-0.5">Staff member's email address</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  placeholder="123 Main Street"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {activeSection === 'employment' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="EMP-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Hire Date</label>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="Senior Developer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="Engineering"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                    <option value="contractor">Contractor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  >
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Reports To</label>
                  <input
                    type="text"
                    value={reportsTo}
                    onChange={(e) => setReportsTo(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="Manager Name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Work Location</label>
                  <input
                    type="text"
                    value={workLocation}
                    onChange={(e) => setWorkLocation(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="Remote / Office"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Hourly Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-end gap-4 pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBillable}
                      onChange={(e) => setIsBillable(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                    />
                    <span className="text-xs sm:text-sm text-neutral-700">Billable</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]"
                    />
                    <span className="text-xs sm:text-sm text-neutral-700">Active</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {activeSection === 'emergency' && (
            <>
              <p className="text-xs text-neutral-500 mb-2">
                Provide emergency contact information for this staff member.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Relationship</label>
                  <select
                    value={emergencyContactRelationship}
                    onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Partner">Partner</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Child">Child</option>
                    <option value="Friend">Friend</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={emergencyContactEmail}
                    onChange={(e) => setEmergencyContactEmail(e.target.value)}
                    className="w-full h-11 px-3 py-2 rounded-lg border border-neutral-200 focus:ring-1 focus:ring-[#476E66] focus:border-[#476E66] outline-none text-sm"
                    placeholder="contact@email.com"
                  />
                </div>
              </div>
            </>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-neutral-100 flex-shrink-0 bg-neutral-50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-white transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !fullName || (!staff && !email)}
            className="flex-1 sm:flex-none px-6 py-2 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : staff ? 'Save Changes' : 'Add Staff'}
          </button>
        </div>
      </div>
    </div>
  );
}


// Invite Modal
function InviteModal({ companyId, currentUserId, onClose, onSent }: {
  companyId: string;
  currentUserId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!email) {
      setError('Please enter an email address');
      return;
    }
    setSending(true);
    setError(null);

    // Timeout after 15 seconds
    const timeoutId = setTimeout(() => {
      setSending(false);
      setError('Request timed out. Please try again.');
    }, 15000);

    try {
      await userManagementApi.createInvitation({
        company_id: companyId,
        email: email.toLowerCase(),
      });
      
      // Send invitation email via edge function
      const { data: companyData } = await supabase.from('companies').select('name').eq('id', companyId).single();
      const { data: inviterData } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).single();
      
      const emailResult = await supabase.functions.invoke('send-email', {
        body: {
          to: email.toLowerCase(),
          subject: `You've been invited to join ${companyData?.name || 'a company'} on Billdora`,
          type: 'invitation',
          data: {
            inviterName: inviterData?.full_name || 'A team member',
            companyName: companyData?.name || 'a company',
            roleName: role,
            signupUrl: `${window.location.origin}/login?email=${encodeURIComponent(email.toLowerCase())}&signup=true`,
          },
        },
      });
      
      clearTimeout(timeoutId);
      
      if (emailResult.error) {
        console.error('Email send failed:', emailResult.error);
        setError('Invitation created but email failed to send. Please notify the user manually.');
        setSending(false);
        return;
      }
      
      setSuccess(true);
      setTimeout(() => {
        onSent();
      }, 1500);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Failed to send invitation:', err);
      setError(err?.message || 'Failed to send invitation. You may need Admin permissions.');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#476E66]/20 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-neutral-600" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">Invite Team Member</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-neutral-900" />
              </div>
              <h3 className="text-lg font-medium text-neutral-900 mb-1">Invitation Sent!</h3>
              <p className="text-neutral-500">An invitation email has been sent to {email}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-neutral-500">
                Send an invitation to join your team. They'll receive an email with a link to create their account.
              </p>

              {error && (
                <div className="p-3 bg-neutral-100 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="colleague@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                  <option value="contractor">Contractor</option>
                </select>
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !email}
              className="px-4 py-2 bg-[#476E66] text-white rounded-xl hover:bg-black transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? 'Sending...' : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitation
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
