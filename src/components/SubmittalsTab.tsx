import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, X, ChevronRight, ChevronDown, Building2, AlertCircle, FileText, Trash2, Edit2, Clock, Bell, Check, MessageSquare, Save, ArrowRight, Mail, LayoutGrid, List, Calendar, ExternalLink, MoreHorizontal, Filter, Send } from 'lucide-react';
import { submittalsApi, Agency, SubmittalPackage, SubmittalItem, SubmittalStatus, SubmittalActivity } from '../lib/api';
import { SubmittalTracker } from './SubmittalTracker';

// ==================== Animations ====================
const STYLES = `
@keyframes overdueFlash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.overdue-flash { animation: overdueFlash 1.5s ease-in-out infinite; }
@keyframes overduePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}
.overdue-pulse { animation: overduePulse 2s ease-in-out infinite; }
`;

const ALL_STATUSES: SubmittalStatus[] = [
  'not_submitted', 'submitted', 'under_review', 'approved',
  'rejected', 'revisions_required', 'resubmitted', 'not_applicable',
];

const PENDING_STATUSES = ['submitted', 'under_review', 'resubmitted'];

const STATUS_LABELS: Record<string, string> = {
  not_submitted: 'Not Submitted',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  revisions_required: 'Revisions Required',
  resubmitted: 'Resubmitted',
  not_applicable: 'N/A',
};

const STATUS_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  not_submitted: { bg: 'bg-neutral-100', text: 'text-neutral-500', border: 'border-neutral-200' },
  submitted: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  under_review: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  revisions_required: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  resubmitted: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  not_applicable: { bg: 'bg-neutral-50', text: 'text-neutral-400', border: 'border-neutral-100' },
};

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysFromNow(d: string): number {
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
}

function isOverdue(item: SubmittalItem): boolean {
  if (!item.expected_response_date) return false;
  return daysFromNow(item.expected_response_date) < 0 && PENDING_STATUSES.includes(item.status);
}

function needsFollowUp(item: SubmittalItem): boolean {
  if (!item.expected_response_date) return false;
  const days = daysFromNow(item.expected_response_date);
  // Needs follow-up if 3+ days past expected and still pending
  return days <= -3 && PENDING_STATUSES.includes(item.status);
}


// ==================== Board Column Config ====================

interface BoardItem extends SubmittalItem {
  packageName: string;
  packageId: string;
  isOverdue: boolean;
  daysLeft: number | null;
}

const BOARD_COLUMNS = [
  { key: 'not_submitted', label: 'Not Submitted', borderColor: 'border-neutral-200', headerBg: 'bg-neutral-50', dotColor: 'bg-neutral-400' },
  { key: 'submitted', label: 'Submitted', borderColor: 'border-neutral-200', headerBg: 'bg-neutral-50', dotColor: 'bg-amber-500' },
  { key: 'under_review', label: 'Under Review', borderColor: 'border-neutral-200', headerBg: 'bg-neutral-50', dotColor: 'bg-blue-500' },
  { key: 'approved', label: 'Approved', borderColor: 'border-neutral-200', headerBg: 'bg-neutral-50', dotColor: 'bg-emerald-500' },
  { key: 'needs_action', label: 'Needs Action', borderColor: 'border-neutral-200', headerBg: 'bg-neutral-50', dotColor: 'bg-red-500' },
] as const;

type BoardColumnKey = typeof BOARD_COLUMNS[number]['key'];

function getBoardColumn(item: SubmittalItem): BoardColumnKey {
  if (item.status === 'not_applicable') return 'not_submitted';
  if (item.status === 'not_submitted') return 'not_submitted';
  if (item.status === 'submitted') return 'submitted';
  if (item.status === 'resubmitted') return 'submitted';
  if (item.status === 'under_review') return 'under_review';
  if (item.status === 'approved') return 'approved';
  if (item.status === 'rejected' || item.status === 'revisions_required') return 'needs_action';
  // Fallback for overdue pending items
  if (PENDING_STATUSES.includes(item.status) && isOverdue(item)) return 'needs_action';
  return 'not_submitted';
}

// ==================== Board Card ====================

function BoardCard({ item, onClickItem }: { item: BoardItem; onClickItem?: (item: BoardItem) => void }) {
  return (
    <div
      onClick={() => onClickItem?.(item)}
      className={`group bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-sm ${item.isOverdue ? 'border-red-200 overdue-pulse' : 'border-neutral-200 hover:border-neutral-300'
        }`}
    >
      {/* Submittal (package) name */}
      <p className="text-xs font-semibold text-neutral-800 truncate">{item.packageName}</p>

      {/* Agency name */}
      <div className="flex items-center gap-1.5 mt-1">
        {item.isOverdue && <div className="w-1.5 h-1.5 rounded-full bg-red-500 overdue-flash shrink-0" />}
        <p className={`text-[11px] truncate ${item.isOverdue ? 'text-red-600 font-medium' : 'text-neutral-500'}`}>
          {item.agency_name}
        </p>
      </div>

      {/* Date + days indicator row */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-2 text-[10px] text-neutral-400">
          {item.submitted_date && (
            <span>{fmtShort(item.submitted_date)}</span>
          )}
          {item.expected_response_date && item.submitted_date && (
            <span className="text-neutral-300">→</span>
          )}
          {item.expected_response_date && (
            <span className={item.isOverdue ? 'text-red-500' : ''}>{fmtShort(item.expected_response_date)}</span>
          )}
        </div>

        {item.daysLeft !== null && PENDING_STATUSES.includes(item.status) && (
          <span className={`text-[10px] font-medium ${item.isOverdue ? 'text-red-500' : item.daysLeft <= 3 ? 'text-amber-500' : 'text-neutral-400'
            }`}>
            {item.isOverdue ? `${Math.abs(item.daysLeft)}d overdue` : item.daysLeft === 0 ? 'Due today' : `${item.daysLeft}d left`}
          </span>
        )}
      </div>

      {/* Follow-up line */}
      {needsFollowUp(item) && (
        <p className="mt-1.5 text-[10px] text-red-500 font-medium">Follow up required</p>
      )}
    </div>
  );
}

// ==================== Board View ====================

interface SubmittalBoardProps {
  packages: SubmittalPackage[];
  searchQuery: string;
  boardFilter: 'all' | 'overdue' | string;
  onClickItem: (item: BoardItem) => void;
}

function SubmittalBoard({ packages, searchQuery, boardFilter, onClickItem }: SubmittalBoardProps) {
  // Flatten all items with package context
  const allItems: BoardItem[] = useMemo(() => {
    const items: BoardItem[] = [];
    for (const pkg of packages) {
      for (const item of (pkg.items || [])) {
        if (item.status === 'not_applicable') continue;
        const dl = item.expected_response_date ? daysFromNow(item.expected_response_date) : null;
        items.push({
          ...item,
          packageName: pkg.name,
          packageId: pkg.id,
          isOverdue: isOverdue(item),
          daysLeft: dl,
        });
      }
    }
    return items;
  }, [packages]);

  // Apply filters
  const filteredItems = useMemo(() => {
    let items = allItems;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.agency_name.toLowerCase().includes(q) ||
        i.packageName.toLowerCase().includes(q) ||
        (i.tracking_number || '').toLowerCase().includes(q)
      );
    }

    // Board-specific filter
    if (boardFilter === 'overdue') {
      items = items.filter(i => i.isOverdue);
    } else if (boardFilter !== 'all') {
      // Filter by package ID
      items = items.filter(i => i.packageId === boardFilter);
    }

    return items;
  }, [allItems, searchQuery, boardFilter]);

  // Group into columns
  const columns = useMemo(() => {
    const grouped: Record<BoardColumnKey, BoardItem[]> = {
      not_submitted: [],
      submitted: [],
      under_review: [],
      approved: [],
      needs_action: [],
    };
    for (const item of filteredItems) {
      const col = getBoardColumn(item);
      grouped[col].push(item);
    }
    // Sort: overdue first, then by expected date
    for (const key of Object.keys(grouped) as BoardColumnKey[]) {
      grouped[key].sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.expected_response_date && b.expected_response_date) {
          return new Date(a.expected_response_date).getTime() - new Date(b.expected_response_date).getTime();
        }
        return 0;
      });
    }
    return grouped;
  }, [filteredItems]);

  if (allItems.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-neutral-200 rounded-xl">
        <LayoutGrid className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h4 className="text-lg font-semibold text-neutral-700 mb-2">No Submittals Yet</h4>
        <p className="text-sm text-neutral-500">Create packages and add agencies to see them on the board.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-0 min-h-[400px]">
      {BOARD_COLUMNS.map((col, index) => {
        const items = columns[col.key];
        const count = items.length;
        const isFirst = index === 0;
        const isLast = index === BOARD_COLUMNS.length - 1;

        // Icon Mapping
        let Icon = FileText;
        if (col.key === 'submitted') Icon = Send;
        if (col.key === 'under_review') Icon = Clock;
        if (col.key === 'approved') Icon = Check;
        if (col.key === 'needs_action') Icon = AlertCircle;

        // Theme Mapping
        let theme = "border-neutral-200 text-neutral-400 bg-white";
        if (count > 0 || col.key === 'not_submitted') {
          if (col.key === 'not_submitted') theme = "border-neutral-300 text-neutral-500 bg-white";
          if (col.key === 'submitted') theme = "border-amber-200 text-amber-600 bg-amber-50";
          if (col.key === 'under_review') theme = "border-blue-200 text-blue-600 bg-blue-50";
          if (col.key === 'approved') theme = "border-emerald-200 text-emerald-600 bg-emerald-50";
          if (col.key === 'needs_action') theme = "border-red-200 text-red-600 bg-red-50";
        }

        return (
          <div key={col.key} className="flex flex-col relative h-full">

            {/* Timeline Header */}
            <div className="relative flex flex-col items-center pt-2 pb-6 z-10">
              {/* Connecting Line */}
              <div className={`absolute top-[30px] h-[3px] bg-neutral-100 -z-10
                  ${isFirst ? 'left-1/2 w-1/2 rounded-l-full' : ''}
                  ${isLast ? 'left-0 w-1/2 rounded-r-full' : ''}
                  ${!isFirst && !isLast ? 'left-0 w-full' : ''}
               `} />

              {/* Circle Node */}
              <div className={`
                  relative z-10 w-11 h-11 rounded-full border-[3px] flex items-center justify-center shadow-sm transition-all duration-300 group
                  ${theme}
                  ${col.key !== 'not_submitted' && count === 0 ? 'opacity-50 grayscale' : ''}
               `}>
                <Icon className="w-5 h-5" />

                {/* Count Badge */}
                {count > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
                    {count}
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="mt-3 text-center">
                <h4 className={`text-[11px] font-bold uppercase tracking-wider ${count > 0 ? 'text-neutral-800' : 'text-neutral-400'}`}>{col.label}</h4>
              </div>
            </div>

            {/* Cards */}
            <div className={`flex-1 space-y-3 overflow-y-auto px-2 ${index !== 0 ? 'border-l border-dashed border-neutral-100' : ''}`}>
              {items.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center opacity-40">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 mb-2" />
                </div>
              ) : (
                items.map(item => (
                  <BoardCard key={item.id} item={item} onClickItem={onClickItem} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== Main Component ====================

interface SubmittalsTabProps {
  projectId: string;
  companyId: string;
  userId?: string;
}

export function SubmittalsTab({ projectId, companyId, userId }: SubmittalsTabProps) {
  const [packages, setPackages] = useState<SubmittalPackage[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [boardFilter, setBoardFilter] = useState<'all' | 'overdue' | string>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Inline editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SubmittalItem>>({});
  const [showNoteInput, setShowNoteInput] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [activityMap, setActivityMap] = useState<Record<string, SubmittalActivity[]>>({});
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);

  // Modals
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [showAddAgency, setShowAddAgency] = useState(false);

  // Create Package form
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgDescription, setNewPkgDescription] = useState('');
  const [newPkgVersion, setNewPkgVersion] = useState('');
  const [newPkgSubmittedDate, setNewPkgSubmittedDate] = useState('');
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());
  const [customAgencyName, setCustomAgencyName] = useState('');

  // Add agency within package
  const [addingAgencyToPkg, setAddingAgencyToPkg] = useState<string | null>(null);
  const [newItemAgencyId, setNewItemAgencyId] = useState('');
  const [newItemCustomName, setNewItemCustomName] = useState('');

  // Add Agency form
  const [agencyForm, setAgencyForm] = useState({ name: '', contact_name: '', email: '', phone: '', typical_response_days: 30 });

  const loadData = useCallback(async () => {
    try {
      const [pkgs, ags] = await Promise.all([
        submittalsApi.getPackages(projectId),
        submittalsApi.getAgencies(companyId),
      ]);
      setPackages(pkgs);
      setAgencies(ags);
      if (expandedPackages.size === 0 && pkgs.length > 0) {
        setExpandedPackages(new Set(pkgs.map(p => p.id)));
      }
    } catch (err) {
      console.error('Failed to load submittals:', err);
    }
    setLoading(false);
  }, [projectId, companyId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Stats
  const stats = useMemo(() => {
    let total = 0, pending = 0, approved = 0, rejected = 0, overdue = 0;
    for (const pkg of packages) {
      for (const item of (pkg.items || [])) {
        if (item.status === 'not_applicable') continue;
        total++;
        if (PENDING_STATUSES.includes(item.status)) { pending++; if (isOverdue(item)) overdue++; }
        if (item.status === 'approved') approved++;
        if (item.status === 'rejected' || item.status === 'revisions_required') rejected++;
      }
    }
    return { total, pending, approved, rejected, overdue };
  }, [packages]);

  // Overdue items
  const overdueItems = useMemo(() => {
    const items: (SubmittalItem & { packageName: string })[] = [];
    for (const pkg of packages) {
      for (const item of (pkg.items || [])) {
        if (isOverdue(item)) items.push({ ...item, packageName: pkg.name });
      }
    }
    return items.sort((a, b) => daysFromNow(a.expected_response_date!) - daysFromNow(b.expected_response_date!));
  }, [packages]);

  const filteredPackages = useMemo(() => {
    if (!searchQuery.trim()) return packages;
    const q = searchQuery.toLowerCase();
    return packages.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.items || []).some(i => i.agency_name.toLowerCase().includes(q))
    );
  }, [packages, searchQuery]);

  const togglePackage = (pkgId: string) => {
    const next = new Set(expandedPackages);
    next.has(pkgId) ? next.delete(pkgId) : next.add(pkgId);
    setExpandedPackages(next);
  };

  const handleStatusChange = async (itemId: string, newStatus: SubmittalStatus) => {
    try { await submittalsApi.updateItemStatus(itemId, newStatus, companyId, userId); loadData(); } catch (err) { console.error(err); }
  };

  const handleSaveEdit = async (itemId: string) => {
    try {
      await submittalsApi.updateItem(itemId, {
        submitted_date: editForm.submitted_date || undefined,
        expected_response_date: editForm.expected_response_date || undefined,
        received_date: editForm.received_date || undefined,
        follow_up_date: editForm.follow_up_date || undefined,
        tracking_number: editForm.tracking_number || undefined,
        response_notes: editForm.response_notes || undefined,
      });
      setEditingItemId(null); setEditForm({}); loadData();
    } catch (err) { console.error(err); }
  };

  const startEdit = (item: SubmittalItem) => {
    setEditingItemId(item.id);
    setEditForm({
      submitted_date: item.submitted_date || '',
      expected_response_date: item.expected_response_date || '',
      received_date: item.received_date || '',
      follow_up_date: item.follow_up_date || '',
      tracking_number: item.tracking_number || '',
      response_notes: item.response_notes || '',
    });
  };

  const handleAddNote = async (itemId: string) => {
    if (!noteText.trim()) return;
    try {
      await submittalsApi.logActivity({ submittal_item_id: itemId, company_id: companyId, action: 'Note added', notes: noteText.trim(), created_by: userId });
      setNoteText(''); setShowNoteInput(null);
      if (expandedActivity === itemId) { const acts = await submittalsApi.getActivity(itemId); setActivityMap(prev => ({ ...prev, [itemId]: acts })); }
    } catch (err) { console.error(err); }
  };

  const toggleActivity = async (itemId: string) => {
    if (expandedActivity === itemId) { setExpandedActivity(null); return; }
    setExpandedActivity(itemId);
    if (!activityMap[itemId]) { const acts = await submittalsApi.getActivity(itemId); setActivityMap(prev => ({ ...prev, [itemId]: acts })); }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Remove this agency?')) return;
    try { await submittalsApi.deleteItem(itemId); loadData(); } catch (err) { console.error(err); }
  };

  const handleDeletePackage = async (pkgId: string) => {
    if (!confirm('Delete this package and all items?')) return;
    try { await submittalsApi.deletePackage(pkgId); loadData(); } catch (err) { console.error(err); }
  };

  const handleCreatePackage = async () => {
    if (!newPkgName.trim()) return;
    try {
      const sub = newPkgSubmittedDate || undefined;
      const pkg = await submittalsApi.createPackage({ project_id: projectId, company_id: companyId, name: newPkgName.trim(), description: newPkgDescription.trim() || undefined, version: newPkgVersion.trim() || undefined, submitted_date: sub, created_by: userId });
      const items: any[] = [];
      for (const agId of selectedAgencyIds) {
        const ag = agencies.find(a => a.id === agId);
        if (ag) {
          const base = sub ? new Date(sub) : new Date();
          items.push({ package_id: pkg.id, company_id: companyId, agency_name: ag.name, agency_id: ag.id, status: sub ? 'submitted' : 'not_submitted', submitted_date: sub, expected_response_date: ag.typical_response_days ? new Date(base.getTime() + ag.typical_response_days * 86400000).toISOString().split('T')[0] : undefined });
        }
      }
      if (customAgencyName.trim()) items.push({ package_id: pkg.id, company_id: companyId, agency_name: customAgencyName.trim(), status: sub ? 'submitted' : 'not_submitted', submitted_date: sub });
      if (items.length > 0) await submittalsApi.createItems(items);
      setShowCreatePackage(false); setNewPkgName(''); setNewPkgDescription(''); setNewPkgVersion(''); setNewPkgSubmittedDate(''); setSelectedAgencyIds(new Set()); setCustomAgencyName('');
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleAddAgencyToPackage = async (pkgId: string) => {
    const agName = newItemAgencyId ? agencies.find(a => a.id === newItemAgencyId)?.name : newItemCustomName.trim();
    if (!agName) return;
    try {
      const ag = agencies.find(a => a.id === newItemAgencyId);
      await submittalsApi.createItem({ package_id: pkgId, company_id: companyId, agency_name: agName, agency_id: ag?.id, status: 'not_submitted', expected_response_date: ag?.typical_response_days ? new Date(Date.now() + ag.typical_response_days * 86400000).toISOString().split('T')[0] : undefined });
      setAddingAgencyToPkg(null); setNewItemAgencyId(''); setNewItemCustomName(''); loadData();
    } catch (err) { console.error(err); }
  };

  const handleAddAgency = async () => {
    if (!agencyForm.name.trim()) return;
    try {
      await submittalsApi.createAgency({ company_id: companyId, name: agencyForm.name.trim(), contact_name: agencyForm.contact_name || undefined, email: agencyForm.email || undefined, phone: agencyForm.phone || undefined, typical_response_days: agencyForm.typical_response_days || 30 });
      setShowAddAgency(false); setAgencyForm({ name: '', contact_name: '', email: '', phone: '', typical_response_days: 30 }); loadData();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <style>{STYLES}</style>

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
        <div>
          <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Submittals</h3>
          <p className="text-sm text-neutral-500 mt-1">Manage agency submissions and track approvals</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          {packages.length > 0 && (
            <div className="flex items-center bg-neutral-100/80 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === 'board' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Board
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
            </div>
          )}
          <div className="h-6 w-px bg-neutral-200 mx-2" />
          <button onClick={() => setShowAddAgency(true)} className="px-3 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 hover:border-neutral-300 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
            <Building2 className="w-3.5 h-3.5" /> Add Agency
          </button>
          <button onClick={() => setShowCreatePackage(true)} className="px-3 py-2 text-xs font-semibold bg-[#476E66] text-white rounded-lg hover:bg-[#3a5b54] shadow-md shadow-[#476E66]/20 transition-all flex items-center gap-1.5 hover:translate-y-px">
            <Plus className="w-3.5 h-3.5" /> New Package
          </button>
        </div>
      </div>

      {/* Search + Board Filters */}
      {packages.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search packages, agencies..."
              className="w-full pl-10 pr-10 py-2.5 text-sm border border-neutral-200 rounded-lg bg-white focus:ring-1 focus:ring-[#476E66]/30 focus:border-[#476E66] outline-none" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>}
          </div>

          {/* Board quick-filters */}
          {viewMode === 'board' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setBoardFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${boardFilter === 'all' ? 'bg-[#476E66] text-white border-[#476E66]' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                  }`}
              >
                All
              </button>
              {stats.overdue > 0 && (
                <button
                  onClick={() => setBoardFilter('overdue')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${boardFilter === 'overdue' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                    }`}
                >
                  <AlertCircle className="w-3 h-3" /> Overdue ({stats.overdue})
                </button>
              )}
              {packages.length > 1 && (
                <>
                  <span className="w-px h-5 bg-neutral-200" />
                  {packages.map(pkg => (
                    <button
                      key={pkg.id}
                      onClick={() => setBoardFilter(boardFilter === pkg.id ? 'all' : pkg.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${boardFilter === pkg.id ? 'bg-[#476E66] text-white border-[#476E66]' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                        }`}
                    >
                      {pkg.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== BOARD VIEW ========== */}
      {viewMode === 'board' && packages.length > 0 && (
        <SubmittalBoard
          packages={filteredPackages}
          searchQuery={searchQuery}
          boardFilter={boardFilter}
          onClickItem={(item) => {
            setSelectedItemId(item.id);
          }}
        />
      )}

      {/* ========== SUBMITTAL DETAIL PANEL (slide-in) ========== */}
      {selectedItemId && (() => {
        let foundItem: SubmittalItem | null = null;
        let foundPkg: SubmittalPackage | null = null;
        for (const pkg of packages) {
          const item = (pkg.items || []).find(i => i.id === selectedItemId);
          if (item) { foundItem = item; foundPkg = pkg; break; }
        }
        if (!foundItem || !foundPkg) return null;
        const item = foundItem;
        const pkg = foundPkg;
        const overdue = isOverdue(item);
        const badge = STATUS_BADGE[item.status] || STATUS_BADGE.not_submitted;
        const daysLeft = item.expected_response_date ? daysFromNow(item.expected_response_date) : null;
        const isEditing = editingItemId === item.id;
        const isActivityOpen = expandedActivity === item.id;

        return (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => { setSelectedItemId(null); setEditingItemId(null); setEditForm({}); }}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative w-full max-w-lg bg-white shadow-2xl border-l border-neutral-200 overflow-y-auto animate-in slide-in-from-right"
              onClick={e => e.stopPropagation()}>
              {/* Panel header */}
              <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-6 py-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {overdue && <div className="w-2.5 h-2.5 rounded-full bg-red-500 overdue-flash shrink-0" />}
                    <h3 className={`text-lg font-bold ${overdue ? 'text-red-800' : 'text-neutral-900'}`}>{item.agency_name}</h3>
                  </div>
                  <button onClick={() => { setSelectedItemId(null); setEditingItemId(null); setEditForm({}); }} className="p-2 hover:bg-neutral-100 rounded-lg">
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400 font-medium bg-neutral-100 px-2 py-0.5 rounded">{pkg.name}{pkg.version ? ` v${pkg.version}` : ''}</span>
                  {item.tracking_number && <span className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">#{item.tracking_number}</span>}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Status dropdown */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-neutral-500 font-medium">Status</label>
                  <select
                    value={item.status}
                    onChange={e => handleStatusChange(item.id, e.target.value as SubmittalStatus)}
                    className="text-sm font-medium text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2 outline-none cursor-pointer hover:border-neutral-300 focus:border-neutral-400 transition-colors"
                  >
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>

                {/* Overdue notice */}
                {needsFollowUp(item) && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Follow up required — {Math.abs(daysLeft!)} days overdue
                  </p>
                )}

                {/* Divider */}
                <div className="border-t border-neutral-100" />

                {/* Details */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-xs text-neutral-500 font-medium">Details</label>
                    {!isEditing ? (
                      <button onClick={() => startEdit(item)} className="text-xs text-neutral-500 hover:text-neutral-700 font-medium flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button onClick={() => { setEditingItemId(null); setEditForm({}); }} className="text-xs text-neutral-400 hover:text-neutral-600">Cancel</button>
                        <button onClick={() => handleSaveEdit(item.id)} className="text-xs text-neutral-800 font-medium hover:underline">Save</button>
                      </div>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-neutral-400">Submitted</span>
                        <span className="text-sm text-neutral-800 font-medium">{item.submitted_date ? fmtDate(item.submitted_date) : '—'}</span>
                      </div>
                      <div className="border-t border-neutral-50" />
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-neutral-400">Expected Response</span>
                        <div className="text-right">
                          <span className={`text-sm font-medium ${overdue ? 'text-red-600' : 'text-neutral-800'}`}>
                            {item.expected_response_date ? fmtDate(item.expected_response_date) : '—'}
                          </span>
                          {daysLeft !== null && PENDING_STATUSES.includes(item.status) && (
                            <p className={`text-[10px] mt-0.5 ${overdue ? 'text-red-500' : 'text-neutral-400'}`}>
                              {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-neutral-50" />
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-neutral-400">Received</span>
                        <span className="text-sm text-neutral-800 font-medium">{item.received_date ? fmtDate(item.received_date) : '—'}</span>
                      </div>
                      <div className="border-t border-neutral-50" />
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-neutral-400">Follow-up</span>
                        <span className="text-sm text-neutral-800 font-medium">{item.follow_up_date ? fmtDate(item.follow_up_date) : '—'}</span>
                      </div>
                      {item.tracking_number && (
                        <>
                          <div className="border-t border-neutral-50" />
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-neutral-400">Tracking #</span>
                            <span className="text-sm text-neutral-800 font-medium">#{item.tracking_number}</span>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-neutral-400 block mb-1">Submitted Date</label>
                        <input type="date" value={editForm.submitted_date || ''} onChange={e => setEditForm({ ...editForm, submitted_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-400 block mb-1">Expected Response</label>
                        <input type="date" value={editForm.expected_response_date || ''} onChange={e => setEditForm({ ...editForm, expected_response_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-400 block mb-1">Date Received</label>
                        <input type="date" value={editForm.received_date || ''} onChange={e => setEditForm({ ...editForm, received_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-400 block mb-1">Follow-up Date</label>
                        <input type="date" value={editForm.follow_up_date || ''} onChange={e => setEditForm({ ...editForm, follow_up_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-400 block mb-1">Tracking #</label>
                        <input type="text" value={editForm.tracking_number || ''} onChange={e => setEditForm({ ...editForm, tracking_number: e.target.value })} placeholder="APP-2026-..." className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-400 block mb-1">Response Notes</label>
                        <input type="text" value={editForm.response_notes || ''} onChange={e => setEditForm({ ...editForm, response_notes: e.target.value })} placeholder="Notes..." className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Response notes */}
                {item.response_notes && !isEditing && (
                  <>
                    <div className="border-t border-neutral-100" />
                    <div>
                      <label className="text-xs text-neutral-500 font-medium block mb-1.5">Notes</label>
                      <p className="text-sm text-neutral-600 leading-relaxed">{item.response_notes}</p>
                    </div>
                  </>
                )}

                {/* Add note */}
                <div className="border-t border-neutral-100 pt-4">
                  <div className="flex gap-2">
                    <input type="text" value={showNoteInput === item.id ? noteText : ''} onChange={e => { setShowNoteInput(item.id); setNoteText(e.target.value); }} onFocus={() => setShowNoteInput(item.id)} placeholder="Add a note..." className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 transition-colors" onKeyDown={e => { if (e.key === 'Enter') handleAddNote(item.id); }} />
                    <button onClick={() => handleAddNote(item.id)} disabled={!noteText.trim() || showNoteInput !== item.id} className="px-3 py-2 text-xs font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg disabled:opacity-30 transition-colors">Add</button>
                  </div>
                </div>

                {/* Activity log */}
                <div>
                  <button onClick={() => toggleActivity(item.id)} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 font-medium transition-colors">
                    <Clock className="w-3 h-3" />
                    Activity
                    {isActivityOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {isActivityOpen && (
                    <div className="mt-2 space-y-1">
                      {(activityMap[item.id] || []).length > 0 ? (
                        (activityMap[item.id] || []).map(act => (
                          <div key={act.id} className="flex gap-3 text-xs py-1.5">
                            <span className="text-neutral-300 shrink-0">{new Date(act.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <span className="text-neutral-600">{act.action}{act.notes ? ` — ${act.notes}` : ''}</span>
                          </div>
                        ))
                      ) : <p className="text-xs text-neutral-300 mt-2">No activity yet</p>}
                    </div>
                  )}
                </div>

                {/* Remove */}
                <div className="border-t border-neutral-100 pt-3">
                  <button onClick={() => { handleDeleteItem(item.id); setSelectedItemId(null); }} className="text-xs text-neutral-400 hover:text-red-500 font-medium flex items-center gap-1.5 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========== LIST VIEW: MODERNIZED ========== */}
      {viewMode === 'list' && filteredPackages.length > 0 ? (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-neutral-50/50 text-[11px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-100">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Package</th>
                    <th className="px-6 py-3 font-semibold">Agency</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 font-semibold">Expected</th>
                    <th className="px-4 py-3 font-semibold">Received</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredPackages.flatMap(pkg => (pkg.items || []).map(item => ({ ...item, pkgName: pkg.name, pkgVersion: pkg.version }))).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-neutral-400 text-xs">
                        <Building2 className="w-8 h-8 mx-auto text-neutral-200 mb-2" />
                        No submittal items found.
                      </td>
                    </tr>
                  ) : (
                    filteredPackages.flatMap(pkg => (pkg.items || []).map(item => ({ ...item, pkgName: pkg.name, pkgVersion: pkg.version }))).map(item => {
                      const isEditing = editingItemId === item.id;
                      const overdue = isOverdue(item);
                      const isActivityOpen = expandedActivity === item.id;
                      const badge = STATUS_BADGE[item.status] || STATUS_BADGE.not_submitted;
                      const hasNotes = !!item.response_notes;
                      const showNotes = showNoteInput === item.id;
                      const showExpanded = isActivityOpen || showNotes || hasNotes || needsFollowUp(item) || isEditing;

                      return (
                        <>
                          <tr key={item.id} className={`group/row transition-colors ${overdue ? 'bg-red-50/20 hover:bg-red-50/40' : 'bg-white hover:bg-neutral-50/50'}`}>
                            {/* Package Name */}
                            <td className="px-6 py-3 align-middle">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-neutral-700">{item.pkgName}</p>
                                {item.pkgVersion && <span className="text-[10px] font-bold bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200">v{item.pkgVersion}</span>}
                              </div>
                            </td>

                            {/* Agency Name */}
                            <td className="px-6 py-3 align-middle">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full hidden group-hover/row:block ${overdue ? 'bg-red-500' : 'bg-neutral-300'}`} />
                                <div>
                                  <p className={`text-sm font-semibold text-neutral-900 ${overdue ? 'text-red-700' : ''}`}>{item.agency_name}</p>
                                  {item.tracking_number && <p className="text-[10px] text-neutral-400 mt-0.5">#{item.tracking_number}</p>}
                                </div>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3 align-middle">
                              <div className="relative inline-block group/status">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border cursor-pointer ${badge.bg} ${badge.text} ${badge.border}`}>
                                  {STATUS_LABELS[item.status]}
                                  <ChevronDown className="w-3 h-3 opacity-50" />
                                </div>
                                <select
                                  value={item.status}
                                  onChange={e => handleStatusChange(item.id, e.target.value as SubmittalStatus)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                >
                                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                              </div>
                            </td>

                            {/* Dates */}
                            <td className="px-4 py-3 align-middle text-xs text-neutral-600">
                              {item.submitted_date ? fmtShort(item.submitted_date) : '—'}
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <span className={`text-xs ${overdue ? 'text-red-600 font-bold' : 'text-neutral-600'}`}>
                                {item.expected_response_date ? fmtShort(item.expected_response_date) : '—'}
                              </span>
                              {item.expected_response_date && overdue && (
                                <span className="block text-[9px] text-red-500 font-medium">Overdue</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-middle text-xs text-neutral-600">
                              {item.received_date ? fmtShort(item.received_date) : '—'}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3 align-middle text-right">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                <button onClick={() => isEditing ? handleSaveEdit(item.id) : startEdit(item)} className="p-1.5 text-neutral-400 hover:text-[#476E66] hover:bg-[#476E66]/10 rounded-lg transition-colors" title="Edit">
                                  {isEditing ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                                </button>
                                <button onClick={() => setShowNoteInput(showNoteInput === item.id ? null : item.id)} className="p-1.5 text-neutral-400 hover:text-[#476E66] hover:bg-[#476E66]/10 rounded-lg transition-colors" title="Add Note">
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                                <button onClick={() => toggleActivity(item.id)} className="p-1.5 text-neutral-400 hover:text-[#476E66] hover:bg-[#476E66]/10 rounded-lg transition-colors" title="History">
                                  <Clock className="w-4 h-4" />
                                </button>
                                <div className="w-px h-3 bg-neutral-200 mx-1" />
                                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Content Row (Inline Edit / Notes / Activity / Alerts) */}
                          {showExpanded && (
                            <tr className="bg-neutral-50/30">
                              <td colSpan={7} className="px-6 py-0">
                                <div className="border-l-2 border-dashed border-neutral-200 ml-3.5 pl-6 py-4 space-y-4">

                                  {/* Overdue Alert */}
                                  {needsFollowUp(item) && (
                                    <div className="flex items-center gap-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100 w-fit">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      <span className="font-semibold">Follow-up Required:</span> No response detected.
                                    </div>
                                  )}

                                  {/* Inline Editor */}
                                  {isEditing && (
                                    <div className="p-4 bg-white rounded-lg border border-neutral-200 shadow-sm max-w-3xl">
                                      <div className="grid grid-cols-4 gap-4 mb-4">
                                        <div>
                                          <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Submitted</label>
                                          <input type="date" value={editForm.submitted_date || ''} onChange={e => setEditForm({ ...editForm, submitted_date: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-neutral-200 rounded outline-none focus:border-[#476E66]" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Expected</label>
                                          <input type="date" value={editForm.expected_response_date || ''} onChange={e => setEditForm({ ...editForm, expected_response_date: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-neutral-200 rounded outline-none focus:border-[#476E66]" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Received</label>
                                          <input type="date" value={editForm.received_date || ''} onChange={e => setEditForm({ ...editForm, received_date: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-neutral-200 rounded outline-none focus:border-[#476E66]" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Tracking #</label>
                                          <input type="text" value={editForm.tracking_number || ''} onChange={e => setEditForm({ ...editForm, tracking_number: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-neutral-200 rounded outline-none focus:border-[#476E66]" />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <button onClick={() => { setEditingItemId(null); setEditForm({}); }} className="text-xs px-3 py-1.5 text-neutral-500 font-medium hover:bg-neutral-50 rounded">Cancel</button>
                                        <button onClick={() => handleSaveEdit(item.id)} className="text-xs px-3 py-1.5 bg-[#476E66] text-white font-medium rounded shadow-sm hover:bg-[#385851]">Save Changes</button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Notes Display */}
                                  {item.response_notes && !isEditing && (
                                    <div className="flex gap-3 max-w-2xl bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                                      <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                      <div className="text-xs text-amber-900 leading-relaxed">
                                        <span className="font-bold text-amber-700 mr-1">Note:</span>
                                        {item.response_notes}
                                      </div>
                                    </div>
                                  )}

                                  {/* Note Input */}
                                  {showNoteInput === item.id && (
                                    <div className="flex items-center gap-2 max-w-lg">
                                      <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Type a note..." className="flex-1 text-xs px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-[#476E66]" autoFocus onKeyDown={e => e.key === 'Enter' && handleAddNote(item.id)} />
                                      <button onClick={() => handleAddNote(item.id)} className="text-xs px-3 py-2 bg-[#476E66] text-white rounded-lg font-medium hover:bg-[#385851]">Post</button>
                                    </div>
                                  )}

                                  {/* Activity History */}
                                  {isActivityOpen && (
                                    <div className="max-w-xl">
                                      <h6 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">History</h6>
                                      <div className="space-y-2 pl-2 border-l border-neutral-200">
                                        {(activityMap[item.id] || []).length > 0 ? (activityMap[item.id] || []).map(act => (
                                          <div key={act.id} className="text-xs pl-2">
                                            <span className="font-medium text-neutral-700">{act.action}</span>
                                            <span className="text-neutral-400 ml-2">{new Date(act.created_at!).toLocaleDateString()}</span>
                                          </div>
                                        )) : <p className="text-xs text-neutral-400 pl-2">No activity recorded.</p>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : viewMode === 'list' && filteredPackages.length === 0 && packages.length > 0 ? (

        <div className="text-center py-10 bg-white border border-neutral-200 rounded-xl">
          <Search className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">No packages match your search.</p>
        </div>
      ) : null}

      {/* Empty state — no packages at all */}
      {packages.length === 0 && (
        <div className="text-center py-16 bg-white border border-neutral-200 rounded-xl">
          <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-neutral-700 mb-2">No Submittal Packages</h4>
          <p className="text-sm text-neutral-500 mb-4 max-w-md mx-auto">Create a submittal package to start tracking plan set submissions to agencies.</p>
          <p className="text-xs text-neutral-400 mb-6">Tip: Add agencies in <strong>Settings &gt; Agency Directory</strong> first.</p>
          <button onClick={() => setShowCreatePackage(true)} className="px-4 py-2 bg-[#476E66] text-white rounded-lg text-sm font-medium hover:bg-[#3a5b54] inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create First Package
          </button>
        </div>
      )}

      {/* ===== Create Package Modal ===== */}
      {
        showCreatePackage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                <h3 className="text-lg font-semibold">New Submittal Package</h3>
                <button onClick={() => setShowCreatePackage(false)} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Package Name *</label>
                  <input type="text" value={newPkgName} onChange={e => setNewPkgName(e.target.value)} placeholder="e.g., Plan Set v2.1" className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[#476E66]/30 focus:border-[#476E66]" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs font-medium text-neutral-700 mb-1">Version</label><input type="text" value={newPkgVersion} onChange={e => setNewPkgVersion(e.target.value)} placeholder="2.1" className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                  <div><label className="block text-xs font-medium text-neutral-700 mb-1">Submitted Date</label><input type="date" value={newPkgSubmittedDate} onChange={e => setNewPkgSubmittedDate(e.target.value)} className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                  <div><label className="block text-xs font-medium text-neutral-700 mb-1">Description</label><input type="text" value={newPkgDescription} onChange={e => setNewPkgDescription(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                </div>
                {newPkgSubmittedDate && <p className="text-[10px] text-[#476E66] bg-[#476E66]/5 px-3 py-1.5 rounded-lg">Items auto-marked as &quot;Submitted&quot; with due dates from each agency&apos;s response time.</p>}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-neutral-700">Select Agencies</label>
                    {agencies.length > 0 && <button onClick={() => setSelectedAgencyIds(new Set(agencies.map(a => a.id)))} className="text-[10px] text-[#476E66] font-medium hover:underline">Select all ({agencies.length})</button>}
                  </div>
                  {agencies.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto border border-neutral-200 rounded-lg p-2">
                      {agencies.map(ag => (
                        <label key={ag.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer ${selectedAgencyIds.has(ag.id) ? 'bg-[#476E66]/5 border border-[#476E66]/20' : 'hover:bg-neutral-50 border border-transparent'}`}>
                          <input type="checkbox" checked={selectedAgencyIds.has(ag.id)} onChange={() => { const n = new Set(selectedAgencyIds); n.has(ag.id) ? n.delete(ag.id) : n.add(ag.id); setSelectedAgencyIds(n); }} className="w-4 h-4 rounded border-neutral-300 text-[#476E66]" />
                          <div><p className="text-sm font-medium text-neutral-900">{ag.name}</p>{ag.typical_response_days && <p className="text-[10px] text-neutral-400">~{ag.typical_response_days}d response</p>}</div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed border-neutral-300 rounded-lg p-4 text-center">
                      <p className="text-xs text-neutral-500">No agencies yet. Add in <strong>Settings &gt; Agency Directory</strong> or below.</p>
                      <button onClick={() => { setShowCreatePackage(false); setShowAddAgency(true); }} className="text-xs text-[#476E66] font-medium hover:underline mt-1">+ Add agency</button>
                    </div>
                  )}
                  <input type="text" value={customAgencyName} onChange={e => setCustomAgencyName(e.target.value)} placeholder="Or type a custom agency name..." className="w-full mt-2 px-3 py-2 border border-neutral-200 rounded-lg text-sm outline-none" />
                  {selectedAgencyIds.size > 0 && <p className="text-xs text-[#476E66] font-medium mt-1">{selectedAgencyIds.size} selected</p>}
                </div>
              </div>
              <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex gap-3">
                <button onClick={() => setShowCreatePackage(false)} className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl text-sm">Cancel</button>
                <button onClick={handleCreatePackage} disabled={!newPkgName.trim() || (selectedAgencyIds.size === 0 && !customAgencyName.trim())} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3a5b54] disabled:opacity-50 text-sm font-medium">Create Package</button>
              </div>
            </div>
          </div>
        )
      }

      {/* ===== Add Agency Modal ===== */}
      {
        showAddAgency && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Add Agency</h3>
                  <p className="text-xs text-neutral-500 mt-1">Saved to your company directory. Manage in <strong>Settings &gt; Agency Directory</strong>.</p>
                </div>
                <button onClick={() => setShowAddAgency(false)} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-3">
                <div><label className="block text-xs font-medium text-neutral-700 mb-1">Agency Name *</label><input type="text" value={agencyForm.name} onChange={e => setAgencyForm({ ...agencyForm, name: e.target.value })} placeholder="e.g., Building Department" className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                <div><label className="block text-xs font-medium text-neutral-700 mb-1">Contact Name</label><input type="text" value={agencyForm.contact_name} onChange={e => setAgencyForm({ ...agencyForm, contact_name: e.target.value })} className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-neutral-700 mb-1">Email</label><input type="email" value={agencyForm.email} onChange={e => setAgencyForm({ ...agencyForm, email: e.target.value })} className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                  <div><label className="block text-xs font-medium text-neutral-700 mb-1">Phone</label><input type="tel" value={agencyForm.phone} onChange={e => setAgencyForm({ ...agencyForm, phone: e.target.value })} className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" /></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Typical Response Time (days)</label>
                  <input type="number" value={agencyForm.typical_response_days} onChange={e => setAgencyForm({ ...agencyForm, typical_response_days: parseInt(e.target.value) || 30 })} className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none" />
                  <p className="text-[10px] text-neutral-400 mt-1">Used to auto-calculate expected response dates.</p>
                </div>
              </div>
              <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex gap-3">
                <button onClick={() => setShowAddAgency(false)} className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl text-sm">Cancel</button>
                <button onClick={handleAddAgency} disabled={!agencyForm.name.trim()} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3a5b54] disabled:opacity-50 text-sm font-medium">Add Agency</button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
