import { supabase } from './supabase';
import { withRetry, formatApiError, ensureValidSession } from './apiUtils';
import { NotificationService } from './notificationService';

// Wrapper for API calls with retry logic and session validation
async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  // Ensure session is valid before making API call (critical for iOS after screen lock)
  const sessionValid = await ensureValidSession();
  if (!sessionValid) {
    console.warn('[API] Session not valid, attempting API call anyway...');
  }
  return withRetry(fn, { maxRetries: 3, baseDelay: 500 });
}

// Types
export interface Lead {
  id: string;
  company_id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  source?: 'referral' | 'website' | 'social_media' | 'cold_call' | 'advertisement' | 'other';
  source_details?: string;
  estimated_value?: number;
  status?: 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'won' | 'lost';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Client {
  id: string;
  company_id: string;
  name: string;
  display_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  website?: string;
  type?: string;
  lifecycle_stage?: string;
  is_archived?: boolean;
  is_favorite?: boolean;
  priority?: number; // 1 = highest, 2 = medium, 3 = lower priority
  created_at?: string;
  // Primary Contact (legacy - kept for backwards compatibility)
  primary_contact_name?: string;
  primary_contact_title?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  // Billing Contact (legacy - kept for backwards compatibility)
  billing_contact_name?: string;
  billing_contact_title?: string;
  billing_contact_email?: string;
  billing_contact_phone?: string;
  // Multiple contacts support
  contacts?: ClientContact[];
}

export type ClientContactRole = 'primary' | 'billing' | 'project_manager' | 'other';

export interface ClientContact {
  id: string;
  client_id: string;
  company_id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  role: ClientContactRole;
  is_default?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Project {
  id: string;
  company_id: string;
  client_id?: string;
  name: string;
  description?: string;
  status?: string;
  budget?: number;
  start_date?: string;
  end_date?: string;
  category?: string;
  created_at?: string;
  updated_at?: string;
  client?: Client;
  // New detail fields
  display_as?: string;
  budget_style?: string;
  project_type_id?: string;
  allow_everyone_billing?: boolean;
  hours_non_billable?: boolean;
  current_status_id?: string;
  status_notes?: string;
  billing_status_id?: string;
  due_date?: string;
  group_id?: string;
  function_id?: string;
  location_id?: string;
  quickbooks_link?: string;
  default_class?: string;
  salesforce_link?: string;
  // Retainer payment fields
  retainer_amount_paid?: number;
  retainer_paid_at?: string;
  retainer_stripe_payment_id?: string;
  total_project_amount?: number;
  retainer_percentage?: number;
  is_favorite?: boolean;
  priority?: number; // 1 = highest, 2 = medium, 3 = lower priority
}

export interface Task {
  id: string;
  company_id: string;
  project_id: string;
  parent_task_id?: string;
  name: string;
  description?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  assignee?: { id: string; full_name?: string; avatar_url?: string; email?: string };
  due_date?: string;
  start_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  estimated_fees?: number;
  actual_fees?: number;
  completion_percentage?: number;
  task_number?: string;
  is_milestone?: boolean;
  is_template?: boolean;
  requires_approval?: boolean;
  created_at?: string;
  created_by?: string;
  project?: Project;
  children?: Task[];
  // Billing tracking fields
  billed_percentage?: number;
  billed_amount?: number;
  total_budget?: number;
  billing_unit?: 'hours' | 'unit';  // 'hours' = time-based, 'unit' = fixed price per unit
  billing_mode?: 'unset' | 'time' | 'percentage' | 'milestone';  // Exclusive billing mode - once set, cannot mix
  // Collaborator fields
  collaborator_company_id?: string;
  collaborator_company_name?: string;
}

export interface ProjectComment {
  id: string;
  project_id: string;
  company_id: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
  content: string;
  visibility: 'all' | 'internal' | 'owner_only';
  parent_id?: string;
  is_resolved?: boolean;
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
  mentions?: string[];
  created_at?: string;
  updated_at?: string;
  // Nested replies
  replies?: ProjectComment[];
}

export interface ProjectCollaborator {
  id: string;
  project_id: string;
  invited_email: string;
  invited_user_id?: string;
  invited_company_id?: string;
  invited_by_user_id: string;
  invited_by_company_id: string;
  role: 'client' | 'collaborator' | 'viewer';
  relationship?: 'my_client' | 'subcontractor' | 'partner';
  their_client_id?: string;
  their_client_name?: string;
  status: 'pending' | 'accepted' | 'declined';
  can_view_financials: boolean;
  can_view_time_entries: boolean;
  can_comment: boolean;
  can_invite_others: boolean;
  can_edit_tasks: boolean;
  invited_at?: string;
  accepted_at?: string;
  created_at?: string;
  updated_at?: string;
  // Joined data
  project?: Project;
  invited_by_profile?: { full_name: string; email: string };
  invited_by_company?: { company_name: string };
  invited_company?: { name: string };  // Company of the invited user (when accepted)
  invited_user_name?: string;  // Name of the invited user (when accepted)
  replies?: ProjectComment[];
}

export interface TaskBillingSelection {
  task_id: string;
  task_name: string;
  total_budget: number;
  billed_percentage: number;
  billed_amount: number;
  remaining_percentage: number;
  remaining_amount: number;
  billing_type: 'milestone' | 'percentage';
  percentage_to_bill?: number; // For percentage billing
  amount_to_bill: number;
}

export interface ProjectTeamMember {
  id: string;
  project_id: string;
  staff_member_id: string;
  role?: string;
  is_lead?: boolean;
  is_active?: boolean;
  created_at?: string;
  profile?: { id: string; full_name?: string; avatar_url?: string; email?: string; role?: string };
}

export interface TimeEntry {
  id: string;
  company_id: string;
  user_id: string;
  project_id?: string;
  task_id?: string;
  invoice_id?: string;
  description?: string;
  hours: number;
  billable?: boolean;
  hourly_rate?: number;
  date: string;
  created_at?: string;
  approval_status?: 'draft' | 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approved_at?: string;
  project?: Project;
  task?: Task;
  user?: { id: string; full_name?: string; email?: string };
}

export interface Expense {
  id: string;
  company_id: string;
  user_id: string;
  project_id?: string;
  description: string;
  amount: number;
  category?: string;
  billable?: boolean;
  date: string;
  status?: string;
  receipt_url?: string;
  created_at?: string;
  approval_status?: 'draft' | 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approved_at?: string;
  project?: Project;
  user?: { id: string; full_name?: string; email?: string };
}

export interface Invoice {
  id: string;
  company_id: string;
  client_id: string;
  project_id?: string;
  invoice_number: string;
  status?: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  due_date?: string;
  sent_date?: string;
  sent_at?: string;
  paid_at?: string;
  created_at?: string;
  amount_paid?: number;
  payment_date?: string;
  payment_method?: string;
  calculator_type?: string;
  pdf_template_id?: string;
  public_view_token?: string;
  view_count?: number;
  last_viewed_at?: string;
  // Online payment
  accept_online_payment?: boolean;
  // Consolidation fields
  consolidated_into?: string; // ID of the consolidated invoice this was merged into
  consolidated_from?: string[]; // Array of invoice IDs that were merged into this invoice
  client?: Client;
  project?: Project;
  invoice_line_items?: {
    task?: {
      project_id: string;
    };
  }[];
}

export interface Quote {
  id: string;
  company_id: string;
  client_id: string;
  lead_id?: string;
  project_id?: string;
  quote_number?: string;
  title: string;
  description?: string;
  billing_model?: string;
  status?: string; // 'draft' | 'pending_collaborators' | 'sent' | 'accepted' | 'approved' | 'declined' | 'archived' | 'converted'
  total_amount?: number;
  valid_until?: string;
  revision_of_quote_id?: string;
  cover_background_url?: string;
  cover_volume_number?: string;
  scope_of_work?: string;
  letter_content?: string;
  created_at?: string;
  view_count?: number;
  last_viewed_at?: string;
  last_sent_at?: string;
  client?: Client;
  // Collaborator tracking fields
  collaborators_invited?: number;
  collaborators_responded?: number;
  collaborator_invitations_sent_at?: string;
  // Retainer fields
  retainer_enabled?: boolean;
  retainer_type?: 'percentage' | 'fixed';
  retainer_percentage?: number;
  retainer_amount?: number;
  retainer_paid?: boolean;
  retainer_paid_at?: string;
  retainer_stripe_payment_id?: string;
  // Recipient tracking - who the proposal was sent TO
  recipient_name?: string;
  recipient_email?: string;
}

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  description: string;
  unit_price: number;
  quantity: number;
  amount: number;
  unit?: string;
  taxed?: boolean;
  task_type?: string;
  staff_role?: string;
  sort_order?: number;
  estimated_days?: number;
  start_offset?: number;
  start_type?: string;
  depends_on?: string;
  overlap_days?: number;
  created_at?: string;
}

export interface TemplateLineItem {
  description: string;
  unit_price: number;
  quantity: number;
  unit?: string;
  taxed?: boolean;
  estimated_days?: number;
  start_offset?: number;
  start_type?: string;
  depends_on?: string;
  overlap_days?: number;
}

export interface RetainerPayment {
  id: string;
  company_id: string;
  client_id: string;
  quote_id?: string;
  project_id?: string;
  amount: number;
  payment_method?: string;
  stripe_payment_id?: string;
  status?: string;
  notes?: string;
  applied_to_invoice_id?: string;
  applied_amount?: number;
  created_at?: string;
  updated_at?: string;
  client?: Client;
  quote?: Quote;
  project?: Project;
}

export interface ProposalTemplate {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  client_type?: string;
  template_data: {
    title?: string;
    description?: string;
    scope_of_work?: string;
    cover_background_url?: string;
    line_items?: TemplateLineItem[];
  };
  use_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface CompanySettings {
  id: string;
  company_id: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
  website?: string;
  email?: string;
  logo_url?: string;
  default_tax_rate?: number;
  default_terms?: string;
  stripe_account_id?: string;
  bigtime_api_token?: string | null;
  bigtime_firm_id?: string | null;
  saved_cover_background_urls?: string[];
  created_at?: string;
}

export interface Service {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  category?: string;
  pricing_type?: string;
  base_rate?: number;
  min_rate?: number;
  max_rate?: number;
  unit_label?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// API functions with retry logic
export const api = {
  // Clients
  async getClients(companyId: string) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('clients')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_archived', false)
        .order('name');
      if (error) throw error;
      return data as Client[];
    });
  },

  async createClient(client: Partial<Client>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('clients')
        .insert(client)
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    });
  },

  async updateClient(id: string, updates: Partial<Client>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    });
  },

  async deleteClient(id: string) {
    return apiCall(async () => {
      const { error } = await supabase.from('clients')
        .update({ is_archived: true })
        .eq('id', id);
      if (error) throw error;
    });
  },

  // Client Contacts
  async getClientContacts(clientId: string) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('client_contacts')
        .select('*')
        .eq('client_id', clientId)
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as ClientContact[];
    });
  },

  async getClientWithContacts(clientId: string) {
    return apiCall(async () => {
      const { data: client, error: clientError } = await supabase.from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      if (clientError) throw clientError;

      const { data: contacts, error: contactsError } = await supabase.from('client_contacts')
        .select('*')
        .eq('client_id', clientId)
        .order('role', { ascending: true });
      if (contactsError) throw contactsError;

      return { ...client, contacts: contacts || [] } as Client;
    });
  },

  async createClientContact(contact: Partial<ClientContact>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('client_contacts')
        .insert(contact)
        .select()
        .single();
      if (error) throw error;

      // Auto-populate client's primary_contact_name if empty
      if (contact.client_id && contact.name) {
        const { data: clientData } = await supabase.from('clients')
          .select('primary_contact_name')
          .eq('id', contact.client_id)
          .single();
        if (clientData && (!clientData.primary_contact_name || clientData.primary_contact_name.trim() === '')) {
          await supabase.from('clients')
            .update({ primary_contact_name: contact.name })
            .eq('id', contact.client_id);
        }
      }

      return data as ClientContact;
    });
  },

  async updateClientContact(id: string, updates: Partial<ClientContact>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('client_contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ClientContact;
    });
  },

  async deleteClientContact(id: string) {
    return apiCall(async () => {
      const { error } = await supabase.from('client_contacts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    });
  },

  // Projects
  async getProjects(companyId: string) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('projects')
        .select('*, client:clients(id, name, display_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Project[];
    });
  },

  async getProject(id: string) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('projects')
        .select('*, client:clients(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Project;
    });
  },

  /** Fetch minimal project info by IDs (works across companies via RLS). */
  async getProjectsByIds(ids: string[]): Promise<Pick<Project, 'id' | 'name'>[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('projects')
      .select('id, name')
      .in('id', ids);
    if (error) {
      console.error('getProjectsByIds error:', error);
      return [];
    }
    return data || [];
  },

  async createProject(project: Partial<Project>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('projects')
        .insert(project)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    });
  },

  async updateProject(id: string, updates: Partial<Project>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    });
  },

  async deleteProject(id: string) {
    return apiCall(async () => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    });
  },

  // Tasks: stable order (created_at then id) so list position never jumps when editing
  async getTasks(projectId: string) {
    const { data, error } = await supabase.from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return data as Task[];
  },

  async getTasksWithBilling(projectId: string) {
    const { data: tasksData, error } = await supabase.from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    const tasks = (tasksData || []) as Task[];

    // Aggregate billed_percentage and billed_amount from invoice_line_items (only for existing invoices for this project).
    // Two-step: get invoice IDs for project, then line items for those invoices. Deleted invoices are excluded.
    const { data: projectInvoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('project_id', projectId);
    const invoiceIds = (projectInvoices || []).map((r: { id: string }) => r.id);

    const aggregatedByTask: Record<string, { billed_percentage: number; billed_amount: number }> = {};
    if (invoiceIds.length > 0) {
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('task_id, billed_percentage, amount')
        .in('invoice_id', invoiceIds)
        .not('task_id', 'is', null);
      if (lineItems) {
        for (const item of lineItems as { task_id: string; billed_percentage: number | null; amount: number | null }[]) {
          const tid = item.task_id;
          if (!tid) continue;
          const pct = Number(item.billed_percentage) || 0;
          const amt = Number(item.amount) || 0;
          if (!aggregatedByTask[tid]) {
            aggregatedByTask[tid] = { billed_percentage: 0, billed_amount: 0 };
          }
          aggregatedByTask[tid].billed_percentage += pct;
          aggregatedByTask[tid].billed_amount += amt;
        }
      }
    }

    return tasks.map(task => {
      const agg = aggregatedByTask[task.id];
      // Use only aggregated totals from invoice_line_items. If no line items exist for this task (e.g. draft invoice was deleted),
      // show 0 so the user can bill again. We still update the task row on create/delete for consistency.
      const billed_percentage = agg ? agg.billed_percentage : 0;
      const billed_amount = agg ? agg.billed_amount : 0;
      return {
        ...task,
        billed_percentage,
        billed_amount,
        total_budget: task.total_budget ?? task.estimated_fees ?? 0,
      };
    });
  },

  async updateTaskBilling(taskId: string, billedPercentage: number, billedAmount: number) {
    const { data, error } = await supabase.from('tasks')
      .update({
        billed_percentage: billedPercentage,
        billed_amount: billedAmount,
      })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async createTask(task: Partial<Task>) {
    const { data, error } = await supabase.from('tasks')
      .insert(task)
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async updateTask(id: string, updates: Partial<Task>) {
    const { data, error } = await supabase.from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },

  // Project Team Members
  async getProjectTeamMembers(projectId: string) {
    const { data, error } = await supabase.from('project_team_members')
      .select('*, profile:profiles!project_team_members_staff_member_id_fkey(id, full_name, avatar_url, email, role)')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('is_lead', { ascending: false });
    if (error) throw error;
    return data as ProjectTeamMember[];
  },

  async addProjectTeamMember(projectId: string, staffMemberId: string, companyId: string, role?: string, isLead?: boolean) {
    const { data, error } = await supabase.from('project_team_members')
      .insert({
        project_id: projectId,
        staff_member_id: staffMemberId,
        company_id: companyId,
        role: role || 'Team Member',
        is_lead: isLead || false,
        is_active: true,
      })
      .select('*, profile:profiles!project_team_members_staff_member_id_fkey(id, full_name, avatar_url, email, role)')
      .single();
    if (error) throw error;
    return data as ProjectTeamMember;
  },

  async removeProjectTeamMember(id: string) {
    const { error } = await supabase.from('project_team_members')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  },

  async getStaffProjects(staffMemberId: string) {
    const { data, error } = await supabase.from('project_team_members')
      .select('*, project:projects(id, name, status, client:clients(name))')
      .eq('staff_member_id', staffMemberId)
      .eq('is_active', true);
    if (error) throw error;
    return data;
  },

  async getStaffTasks(companyId: string, userId: string) {
    const { data, error } = await supabase.from('tasks')
      .select('*, project:projects(id, name)')
      .eq('company_id', companyId)
      .eq('assigned_to', userId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return data as Task[];
  },

  async getCompanyProfiles(companyId: string) {
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, avatar_url, email, role, hourly_pay_rate, hourly_rate')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return data;
  },

  // Time Entries
  async getTimeEntries(companyId: string, userId?: string, startDate?: string, endDate?: string) {
    return apiCall(async () => {
      let query = supabase
        .from('time_entries')
        .select('*, project:projects(id, name, client:clients(id, name)), task:tasks(id, name)')
        .eq('company_id', companyId);

      if (userId) query = query.eq('user_id', userId);
      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);

      const { data, error } = await query.order('date', { ascending: false });
      if (error) throw error;
      return data as TimeEntry[];
    });
  },

  async createTimeEntry(entry: Partial<TimeEntry>) {
    return apiCall(async () => {
      // If task_id provided, check and set billing_mode to 'time'
      if (entry.task_id) {
        const { data: task } = await supabase.from('tasks')
          .select('billing_mode')
          .eq('id', entry.task_id)
          .single();

        if (task) {
          if (task.billing_mode && task.billing_mode !== 'unset' && task.billing_mode !== 'time') {
            throw new Error(`Cannot add time entry: Task is set to ${task.billing_mode} billing mode`);
          }
          // Auto-lock to time mode on first entry
          if (!task.billing_mode || task.billing_mode === 'unset') {
            await supabase.from('tasks').update({ billing_mode: 'time' }).eq('id', entry.task_id);
          }
        }
      }

      const { data, error } = await supabase.from('time_entries')
        .insert(entry)
        .select()
        .single();
      if (error) throw error;
      return data as TimeEntry;
    });
  },

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('time_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TimeEntry;
    });
  },

  async deleteTimeEntry(id: string) {
    return apiCall(async () => {
      const { error } = await supabase.from('time_entries').delete().eq('id', id);
      if (error) throw error;
    });
  },

  // Expenses
  async getExpenses(companyId: string, userId?: string) {
    let query = supabase
      .from('expenses')
      .select('*, project:projects(id, name)')
      .eq('company_id', companyId);

    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data as Expense[];
  },

  async createExpense(expense: Partial<Expense>) {
    const { data, error } = await supabase.from('expenses')
      .insert(expense)
      .select()
      .single();
    if (error) throw error;
    return data as Expense;
  },

  async updateExpense(id: string, updates: Partial<Expense>) {
    const { data, error } = await supabase.from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Expense;
  },

  async deleteExpense(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
  },

  async uploadReceipt(file: File, companyId: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${companyId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
    return data.publicUrl;
  },

  // Approval functions
  async getApprovedTimeEntries(companyId: string, startDate?: string, endDate?: string) {
    let query = supabase
      .from('time_entries')
      .select('*, project:projects(id, name), task:tasks(id, name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'approved');

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data: entries, error } = await query.order('date', { ascending: false });
    if (error) throw error;

    const userIds = [...new Set(entries?.map(e => e.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      return entries?.map(e => ({ ...e, user: profileMap.get(e.user_id) || null })) as TimeEntry[];
    }
    return entries as TimeEntry[];
  },

  async getApprovedExpenses(companyId: string, startDate?: string, endDate?: string) {
    let query = supabase
      .from('expenses')
      .select('*, project:projects(id, name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'approved');

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data: expenses, error } = await query.order('date', { ascending: false });
    if (error) throw error;

    const userIds = [...new Set(expenses?.map(e => e.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      return expenses?.map(e => ({ ...e, user: profileMap.get(e.user_id) || null })) as Expense[];
    }
    return expenses as Expense[];
  },

  async getPendingTimeEntries(companyId: string) {
    // First get time entries
    const { data: entries, error } = await supabase.from('time_entries')
      .select('*, project:projects(id, name), task:tasks(id, name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'pending')
      .order('date', { ascending: false });
    if (error) throw error;

    // Get unique user IDs
    const userIds = [...new Set(entries?.map(e => e.user_id).filter(Boolean))];

    // Fetch user profiles
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      // Map profiles to entries
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      return entries?.map(e => ({
        ...e,
        user: profileMap.get(e.user_id) || null
      })) as TimeEntry[];
    }

    return entries as TimeEntry[];
  },

  async getPendingExpenses(companyId: string) {
    // First get expenses
    const { data: expenses, error } = await supabase.from('expenses')
      .select('*, project:projects(id, name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'pending')
      .order('date', { ascending: false });
    if (error) throw error;

    // Get unique user IDs
    const userIds = [...new Set(expenses?.map(e => e.user_id).filter(Boolean))];

    // Fetch user profiles
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      // Map profiles to expenses
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      return expenses?.map(e => ({
        ...e,
        user: profileMap.get(e.user_id) || null
      })) as Expense[];
    }

    return expenses as Expense[];
  },

  async approveTimeEntry(id: string, approverId: string) {
    const { data, error } = await supabase.from('time_entries')
      .update({
        approval_status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as TimeEntry;
  },

  async rejectTimeEntry(id: string, approverId: string) {
    const { data, error } = await supabase.from('time_entries')
      .update({
        approval_status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as TimeEntry;
  },

  async approveExpense(id: string, approverId: string) {
    const { data, error } = await supabase.from('expenses')
      .update({
        approval_status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Expense;
  },

  async rejectExpense(id: string, approverId: string) {
    const { data, error } = await supabase.from('expenses')
      .update({
        approval_status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Expense;
  },

  async getApprovedTimeEntriesForInvoice(companyId: string, projectId?: string) {
    let query = supabase
      .from('time_entries')
      .select('*, project:projects(id, name), task:tasks(id, name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'approved')
      .is('invoice_id', null);

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data as TimeEntry[];
  },

  async getApprovedExpensesForInvoice(companyId: string, projectId?: string) {
    let query = supabase
      .from('expenses')
      .select('*, project:projects(id, name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'approved')
      .eq('billable', true);

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data as Expense[];
  },

  // Invoices
  async getInvoices(companyId: string) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('invoices')
        .select('*, client:clients(id, name, display_name, email, address, city, state, zip, phone, website, primary_contact_name, primary_contact_email, primary_contact_phone, billing_contact_name, billing_contact_email, billing_contact_phone), project:projects(id, name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    });
  },

  async createInvoice(invoice: Partial<Invoice>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('invoices')
        .insert(invoice)
        .select()
        .single();
      if (error) throw error;
      return data as Invoice;
    });
  },

  async createInvoiceWithTaskBilling(
    invoice: Partial<Invoice>,
    taskBillings: { taskId: string; billingType: string; percentageToBill: number; amountToBill: number; totalBudget: number; previousBilledPercentage: number; previousBilledAmount: number }[]
  ) {
    // Create the invoice
    const { data: invoiceData, error: invoiceError } = await supabase.from('invoices')
      .insert(invoice)
      .select()
      .single();
    if (invoiceError) throw invoiceError;

    // Create invoice line items and update task billing
    const errors: { taskId: string; error: Error }[] = [];

    for (const billing of taskBillings) {
      try {
        // Get task details for description and quantity/rate calculation
        const { data: task } = await supabase.from('tasks')
          .select('name, estimated_hours, estimated_fees, billing_unit')
          .eq('id', billing.taskId)
          .single();

        // Calculate quantity and rate based on task data and percentage being billed
        const isHourBased = task?.billing_unit !== 'unit';
        const taskQuantity = task?.estimated_hours || 1;  // estimated_hours stores quantity for both hours and units
        const taskFees = task?.estimated_fees || billing.totalBudget;
        const taskRate = taskFees / taskQuantity;  // Unit rate = total / quantity (works for both hours and units)

        // For percentage billing, quantity is proportional to the percentage being billed
        const billedQuantity = taskQuantity * billing.percentageToBill / 100;

        // Create invoice line item with proper quantity and rate
        const { error: lineItemError } = await supabase.from('invoice_line_items').insert({
          invoice_id: invoiceData.id,
          task_id: billing.taskId,
          description: task?.name || 'Task',
          quantity: billedQuantity,
          unit_price: taskRate,
          amount: billing.amountToBill,
          billing_type: billing.billingType,
          billed_percentage: billing.percentageToBill,
          task_total_budget: billing.totalBudget,
          unit: isHourBased ? 'hr' : 'unit',
        });

        if (lineItemError) {
          console.error('Failed to create line item for task:', billing.taskId, lineItemError);
          errors.push({ taskId: billing.taskId, error: lineItemError });
          continue;
        }

        // Update task's cumulative billed percentage and amount, and lock billing_mode
        const newBilledPercentage = billing.previousBilledPercentage + billing.percentageToBill;
        const newBilledAmount = billing.previousBilledAmount + billing.amountToBill;

        const { error: updateError } = await supabase.from('tasks')
          .update({
            billed_percentage: newBilledPercentage,
            billed_amount: newBilledAmount,
            total_budget: billing.totalBudget,
            billing_mode: billing.billingType as 'milestone' | 'percentage',  // Lock billing mode
          })
          .eq('id', billing.taskId);

        if (updateError) {
          console.error('Failed to update task billing:', billing.taskId, updateError);
          errors.push({ taskId: billing.taskId, error: updateError });
        }
      } catch (err) {
        console.error('Unexpected error processing task billing:', billing.taskId, err);
        errors.push({ taskId: billing.taskId, error: err as Error });
      }
    }

    if (errors.length > 0) {
      console.warn(`Invoice created with ${errors.length} task billing errors`);
    }

    // Verify at least some line items were created
    const { count: lineItemCount } = await supabase
      .from('invoice_line_items')
      .select('*', { count: 'exact', head: true })
      .eq('invoice_id', invoiceData.id);

    if (!lineItemCount || lineItemCount === 0) {
      // All line items failed -- create a fallback line item so the invoice always has a breakdown
      console.error('All line items failed to create. Creating fallback line item.');
      const fallbackDescription = taskBillings.length === 1
        ? 'Task billing'
        : `${taskBillings.length} tasks billed`;
      const invoiceTotal = invoiceData.subtotal || taskBillings.reduce((sum, b) => sum + b.amountToBill, 0);

      await supabase.from('invoice_line_items').insert({
        invoice_id: invoiceData.id,
        description: fallbackDescription,
        quantity: 1,
        unit_price: invoiceTotal,
        amount: invoiceTotal,
        sort_order: 0,
      });
    }

    return invoiceData as Invoice;
  },

  async updateInvoice(id: string, updates: Partial<Invoice>) {
    return apiCall(async () => {
      const { data, error } = await supabase.from('invoices')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Invoice;
    });
  },

  async deleteInvoice(id: string) {
    try {
      // Guard: prevent deleting an invoice that has been consolidated into another
      const { data: invoiceCheck } = await supabase
        .from('invoices')
        .select('consolidated_into, status')
        .eq('id', id)
        .single();

      if (invoiceCheck?.consolidated_into) {
        return { success: false, error: new Error('Cannot delete this invoice because it has been consolidated into another invoice. Delete the consolidated invoice first.'), step: 'validation' };
      }

      // Fetch task-billing line items before delete so we can roll back tasks.billed_percentage / billed_amount
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('task_id, billed_percentage, amount')
        .eq('invoice_id', id)
        .not('task_id', 'is', null);
      const byTask: Record<string, { billed_percentage: number; billed_amount: number }> = {};
      if (lineItems) {
        for (const item of lineItems as { task_id: string; billed_percentage: number | null; amount: number | null }[]) {
          const tid = item.task_id;
          if (!tid) continue;
          const pct = Number(item.billed_percentage) || 0;
          const amt = Number(item.amount) || 0;
          if (!byTask[tid]) byTask[tid] = { billed_percentage: 0, billed_amount: 0 };
          byTask[tid].billed_percentage += pct;
          byTask[tid].billed_amount += amt;
        }
      }

      // If this is a consolidated invoice, revert original invoices back to draft
      if (invoiceCheck?.status === 'draft' || invoiceCheck?.status === 'sent') {
        const { data: consolidatedInvoice } = await supabase
          .from('invoices')
          .select('consolidated_from')
          .eq('id', id)
          .single();

        if (consolidatedInvoice?.consolidated_from && consolidatedInvoice.consolidated_from.length > 0) {
          // Revert original invoices: clear consolidated_into and set status back to draft
          const { error: revertError } = await supabase
            .from('invoices')
            .update({ consolidated_into: null, status: 'draft' })
            .in('id', consolidatedInvoice.consolidated_from);

          if (revertError) {
            console.error('Failed to revert consolidated invoices:', revertError);
            // Continue with deletion anyway - better to delete than leave orphaned data
          }
        }
      }

      // Clear invoice_id from time entries
      const { error: timeEntriesError } = await supabase.from('time_entries').update({ invoice_id: null }).eq('invoice_id', id);
      if (timeEntriesError) {
        console.error('Failed to clear time entries:', timeEntriesError);
        return { success: false, error: timeEntriesError, step: 'time_entries' };
      }

      // Delete related line items
      const { error: lineItemsError } = await supabase.from('invoice_line_items').delete().eq('invoice_id', id);
      if (lineItemsError) {
        console.error('Failed to delete line items:', lineItemsError);
        return { success: false, error: lineItemsError, step: 'line_items' };
      }

      // Then delete the invoice
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete invoice:', error);
        return { success: false, error, step: 'invoice' };
      }

      // Roll back task billing so milestone/percentage calculator shows correct remaining
      for (const [taskId, delta] of Object.entries(byTask)) {
        const { data: task } = await supabase.from('tasks').select('billed_percentage, billed_amount').eq('id', taskId).single();
        if (task) {
          const currentPct = Number((task as { billed_percentage?: number }).billed_percentage) || 0;
          const currentAmt = Number((task as { billed_amount?: number }).billed_amount) || 0;
          const newPct = Math.max(0, currentPct - delta.billed_percentage);
          const newAmt = Math.max(0, currentAmt - delta.billed_amount);
          await supabase.from('tasks').update({ billed_percentage: newPct, billed_amount: newAmt }).eq('id', taskId);
        }
      }

      return { success: true };
    } catch (err) {
      console.error('Unexpected error deleting invoice:', err);
      return { success: false, error: err as Error, step: 'unknown' };
    }
  },

  async deleteInvoices(ids: string[]) {
    try {
      if (ids.length === 0) return { success: true };

      // Guard: prevent deleting invoices that have been consolidated into another
      const { data: consolidatedCheck } = await supabase
        .from('invoices')
        .select('id, invoice_number, consolidated_into')
        .in('id', ids)
        .not('consolidated_into', 'is', null);

      if (consolidatedCheck && consolidatedCheck.length > 0) {
        const numbers = consolidatedCheck.map(inv => inv.invoice_number).join(', ');
        return { success: false, error: new Error(`Cannot delete invoices that have been consolidated: ${numbers}. Delete the consolidated invoice first.`), step: 'validation' };
      }

      // Fetch task-billing line items for these invoices so we can roll back tasks
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('task_id, billed_percentage, amount')
        .in('invoice_id', ids)
        .not('task_id', 'is', null);
      const byTask: Record<string, { billed_percentage: number; billed_amount: number }> = {};
      if (lineItems) {
        for (const item of lineItems as { task_id: string; billed_percentage: number | null; amount: number | null }[]) {
          const tid = item.task_id;
          if (!tid) continue;
          const pct = Number(item.billed_percentage) || 0;
          const amt = Number(item.amount) || 0;
          if (!byTask[tid]) byTask[tid] = { billed_percentage: 0, billed_amount: 0 };
          byTask[tid].billed_percentage += pct;
          byTask[tid].billed_amount += amt;
        }
      }

      // Clear invoice_id from time entries
      const { error: timeEntriesError } = await supabase.from('time_entries').update({ invoice_id: null }).in('invoice_id', ids);
      if (timeEntriesError) {
        console.error('Failed to clear time entries:', timeEntriesError);
        return { success: false, error: timeEntriesError, step: 'time_entries' };
      }

      // Delete related line items for all invoices
      const { error: lineItemsError } = await supabase.from('invoice_line_items').delete().in('invoice_id', ids);
      if (lineItemsError) {
        console.error('Failed to delete line items:', lineItemsError);
        return { success: false, error: lineItemsError, step: 'line_items' };
      }

      // Then delete the invoices
      const { error } = await supabase.from('invoices').delete().in('id', ids);
      if (error) {
        console.error('Failed to delete invoices:', error);
        return { success: false, error, step: 'invoices' };
      }

      // Roll back task billing for each affected task
      for (const [taskId, delta] of Object.entries(byTask)) {
        const { data: task } = await supabase.from('tasks').select('billed_percentage, billed_amount').eq('id', taskId).single();
        if (task) {
          const currentPct = Number((task as { billed_percentage?: number }).billed_percentage) || 0;
          const currentAmt = Number((task as { billed_amount?: number }).billed_amount) || 0;
          const newPct = Math.max(0, currentPct - delta.billed_percentage);
          const newAmt = Math.max(0, currentAmt - delta.billed_amount);
          await supabase.from('tasks').update({ billed_percentage: newPct, billed_amount: newAmt }).eq('id', taskId);
        }
      }

      return { success: true };
    } catch (err) {
      console.error('Unexpected error deleting invoices:', err);
      return { success: false, error: err as Error, step: 'unknown' };
    }
  },

  async consolidateInvoices(invoiceIds: string[], companyId: string): Promise<{ success: boolean; consolidatedInvoice?: Invoice; error?: string }> {
    try {
      if (invoiceIds.length < 2) {
        return { success: false, error: 'At least 2 invoices are required for consolidation' };
      }

      // Fetch all invoices to consolidate (fresh data to avoid race conditions)
      const { data: invoices, error: fetchError } = await supabase
        .from('invoices')
        .select('*, client:clients(*), project:projects(*)')
        .in('id', invoiceIds);

      if (fetchError) throw fetchError;
      if (!invoices || invoices.length !== invoiceIds.length) {
        return { success: false, error: 'Some invoices could not be found' };
      }

      // Validate all invoices are from the same client
      const clientIds = [...new Set(invoices.map(inv => inv.client_id))];
      if (clientIds.length > 1) {
        return { success: false, error: 'All invoices must be from the same client' };
      }

      // Validate only draft invoices can be consolidated (not sent, paid, or consolidated)
      const nonDraftInvoices = invoices.filter(inv => inv.status !== 'draft');
      if (nonDraftInvoices.length > 0) {
        const statuses = [...new Set(nonDraftInvoices.map(inv => inv.status))].join(', ');
        return { success: false, error: `Only draft invoices can be consolidated. Found invoices with status: ${statuses}` };
      }

      // Check if any invoice is already consolidated into another invoice
      const alreadyConsolidated = invoices.filter(inv => inv.consolidated_into);
      if (alreadyConsolidated.length > 0) {
        const numbers = alreadyConsolidated.map(inv => inv.invoice_number).join(', ');
        return { success: false, error: `These invoices are already consolidated: ${numbers}` };
      }

      // Prevent consolidating invoices that are themselves consolidated invoices (have consolidated_from)
      const areConsolidatedInvoices = invoices.filter(inv => inv.consolidated_from && inv.consolidated_from.length > 0);
      if (areConsolidatedInvoices.length > 0) {
        const numbers = areConsolidatedInvoices.map(inv => inv.invoice_number).join(', ');
        return { success: false, error: `Cannot re-consolidate consolidated invoices: ${numbers}. Please select original invoices only.` };
      }

      // Calculate totals
      const subtotal = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
      const taxAmount = invoices.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
      const total = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

      // Generate consolidated invoice number
      const invoiceNumber = `CONS-${Date.now().toString().slice(-6)}`;

      // Create consolidated invoice
      const { data: consolidatedInvoice, error: createError } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId,
          client_id: clientIds[0],
          invoice_number: invoiceNumber,
          status: 'draft',
          subtotal,
          tax_amount: taxAmount,
          total,
          consolidated_from: invoiceIds,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;

      // Fetch line items from all original invoices
      const { data: allLineItems, error: lineItemsError } = await supabase
        .from('invoice_line_items')
        .select('*')
        .in('invoice_id', invoiceIds);

      if (lineItemsError) throw lineItemsError;

      // Identify invoices that have a total but NO line items (e.g. milestone invoices where line item creation failed)
      const invoiceIdsWithLineItems = new Set((allLineItems || []).map(li => li.invoice_id));
      const invoicesWithoutLineItems = invoices.filter(
        inv => !invoiceIdsWithLineItems.has(inv.id) && (inv.total || 0) > 0
      );

      // For invoices without line items, try to generate them from task data
      const syntheticLineItems: Array<{
        invoice_id: string;
        description: string;
        quantity: number;
        unit_price: number;
        amount: number;
        sort_order: number;
        unit: string | null;
      }> = [];

      for (const inv of invoicesWithoutLineItems) {
        const projectName = inv.project?.name || inv.invoice_number || 'General';

        // Try to fetch tasks for the project that have been billed
        if (inv.project_id) {
          const { data: billedTasks } = await supabase
            .from('tasks')
            .select('id, name, billed_amount, total_budget, estimated_fees, billing_unit')
            .eq('project_id', inv.project_id)
            .gt('billed_amount', 0);

          if (billedTasks && billedTasks.length > 0) {
            // Create a line item for each billed task
            billedTasks.forEach((task, idx) => {
              const taskAmount = task.billed_amount || task.total_budget || task.estimated_fees || 0;
              syntheticLineItems.push({
                invoice_id: consolidatedInvoice.id,
                description: `[${projectName}] ${task.name}`,
                quantity: 1,
                unit_price: taskAmount,
                amount: taskAmount,
                sort_order: (allLineItems?.length || 0) + syntheticLineItems.length,
                unit: null,
              });
            });

            // Verify synthetic line items sum matches invoice total; adjust if needed
            const syntheticSum = billedTasks.reduce((sum, t) => sum + (t.billed_amount || t.total_budget || t.estimated_fees || 0), 0);
            const invoiceTotal = inv.total || 0;
            if (Math.abs(syntheticSum - invoiceTotal) > 0.01) {
              // Amounts don't match exactly, use a single line item instead
              const lastAdded = billedTasks.length;
              syntheticLineItems.splice(syntheticLineItems.length - lastAdded, lastAdded);
              syntheticLineItems.push({
                invoice_id: consolidatedInvoice.id,
                description: `[${projectName}] Project Total`,
                quantity: 1,
                unit_price: invoiceTotal,
                amount: invoiceTotal,
                sort_order: (allLineItems?.length || 0) + syntheticLineItems.length,
                unit: null,
              });
            }
            continue;
          }
        }

        // Fallback: create a single catch-all line item with the full invoice total
        syntheticLineItems.push({
          invoice_id: consolidatedInvoice.id,
          description: `[${projectName}] Project Total`,
          quantity: 1,
          unit_price: inv.total || 0,
          amount: inv.total || 0,
          sort_order: (allLineItems?.length || 0) + syntheticLineItems.length,
          unit: null,
        });
      }

      // Combine existing line items with synthetic ones
      const newLineItems: Array<{
        invoice_id: string;
        description: string;
        quantity: number;
        unit_price: number;
        amount: number;
        sort_order: number;
        unit: string | null;
      }> = [];

      // Copy existing line items with project context
      if (allLineItems && allLineItems.length > 0) {
        allLineItems.forEach((item, index) => {
          const originalInvoice = invoices.find(inv => inv.id === item.invoice_id);
          const projectName = originalInvoice?.project?.name || originalInvoice?.invoice_number || 'General';
          newLineItems.push({
            invoice_id: consolidatedInvoice.id,
            description: `[${projectName}] ${item.description || 'Line item'}`,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            amount: item.amount || 0,
            sort_order: item.sort_order || index,
            unit: item.unit || null
          });
        });
      }

      // Add synthetic line items
      newLineItems.push(...syntheticLineItems);

      // Insert all line items
      if (newLineItems.length > 0) {
        const { error: insertLineItemsError } = await supabase
          .from('invoice_line_items')
          .insert(newLineItems);

        if (insertLineItemsError) throw insertLineItemsError;
      }

      // Final validation: verify line items total matches consolidated invoice total
      const lineItemsTotal = newLineItems.reduce((sum, li) => sum + (li.amount || 0), 0);
      if (Math.abs(lineItemsTotal - total) > 0.01) {
        console.warn(`Consolidation line items total ($${lineItemsTotal.toFixed(2)}) differs from invoice total ($${total.toFixed(2)}). Gap: $${(total - lineItemsTotal).toFixed(2)}`);
      }

      // Mark original invoices as consolidated
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          consolidated_into: consolidatedInvoice.id,
          status: 'consolidated'
        })
        .in('id', invoiceIds);

      if (updateError) throw updateError;

      return { success: true, consolidatedInvoice };
    } catch (err: any) {
      console.error('Failed to consolidate invoices:', err);
      return { success: false, error: err.message || 'Failed to consolidate invoices' };
    }
  },

  // Proposal Responses
  async getProposalResponses(companyId: string) {
    const { data, error } = await supabase.from('proposal_responses')
      .select('*')
      .eq('company_id', companyId)
      .order('responded_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Quotes
  async getQuotes(companyId: string) {
    const { data, error } = await supabase.from('quotes')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Quote[];
  },

  async createQuote(quote: Partial<Quote>) {
    const { data, error } = await supabase.from('quotes')
      .insert(quote)
      .select()
      .single();
    if (error) throw error;
    return data as Quote;
  },

  async updateQuote(id: string, updates: Partial<Quote>) {
    const { data, error } = await supabase.from('quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Quote;
  },

  async deleteQuote(id: string) {
    // First delete related line items
    await supabase.from('quote_line_items').delete().eq('quote_id', id);
    // Then delete the quote
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw error;
  },

  /** Create a copy of a quote as a new draft (for client-requested revisions). Original is unchanged. */
  async duplicateQuoteAsRevision(quoteId: string): Promise<Quote> {
    const { data: quote, error: quoteErr } = await supabase.from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();
    if (quoteErr || !quote) throw new Error(quoteErr?.message || 'Quote not found');

    const { data: lineItems } = await supabase.from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true });

    const newQuote: Partial<Quote> = {
      company_id: quote.company_id,
      client_id: quote.client_id,
      lead_id: quote.lead_id,
      title: (quote.title || 'Proposal').replace(/\s*\(Revision.*\)$/i, ''),
      description: quote.description,
      billing_model: quote.billing_model,
      status: 'draft',
      total_amount: quote.total_amount,
      valid_until: quote.valid_until,
      cover_background_url: quote.cover_background_url,
      cover_volume_number: quote.cover_volume_number,
      scope_of_work: quote.scope_of_work,
      letter_content: quote.letter_content,
      revision_of_quote_id: quoteId,
      retainer_enabled: quote.retainer_enabled,
      retainer_type: quote.retainer_type,
      retainer_percentage: quote.retainer_percentage,
      retainer_amount: quote.retainer_amount,
      recipient_name: quote.recipient_name,
      recipient_email: quote.recipient_email,
    };
    const { data: created, error: createErr } = await supabase.from('quotes')
      .insert(newQuote)
      .select()
      .single();
    if (createErr || !created) throw new Error(createErr?.message || 'Failed to create revision');

    if (lineItems?.length) {
      const newItems = lineItems.map((item: any) => ({
        quote_id: created.id,
        description: item.description,
        unit_price: item.unit_price,
        quantity: item.quantity,
        amount: item.amount,
        unit: item.unit,
        taxed: item.taxed,
        task_type: item.task_type,
        staff_role: item.staff_role,
        sort_order: item.sort_order,
        estimated_days: item.estimated_days,
        start_offset: item.start_offset,
        start_type: item.start_type,
        depends_on: item.depends_on,
        overlap_days: item.overlap_days,
      }));
      await supabase.from('quote_line_items').insert(newItems);
    }
    return created as Quote;
  },

  async convertQuoteToProject(quoteId: string, companyId: string): Promise<{ projectId: string; projectName: string; tasksCreated: number }> {
    const { data, error } = await supabase.rpc('convert_quote_to_project', {
      p_quote_id: quoteId,
      p_company_id: companyId,
    });
    if (error) throw error;
    return {
      projectId: data.project_id,
      projectName: data.project_name,
      tasksCreated: data.tasks_created,
    };
  },

  // Dashboard stats
  async getDashboardStats(companyId: string, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Get today's hours
    const { data: todayEntries } = await supabase.from('time_entries')
      .select('hours, billable')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('date', today);

    const hoursToday = todayEntries?.reduce((sum, e) => sum + Number(e.hours), 0) || 0;

    // Get week's hours for billability
    const { data: weekEntries } = await supabase.from('time_entries')
      .select('hours, billable')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .gte('date', weekStartStr);

    const totalWeekHours = weekEntries?.reduce((sum, e) => sum + Number(e.hours), 0) || 0;
    const billableWeekHours = weekEntries?.filter(e => e.billable).reduce((sum, e) => sum + Number(e.hours), 0) || 0;
    const utilization = totalWeekHours > 0 ? Math.round((billableWeekHours / totalWeekHours) * 100) : 0;

    // Get pending tasks
    const { count: pendingTasks } = await supabase.from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['not_started', 'in_progress']);

    // Get unbilled WIP (billable time entries not yet invoiced)
    const { data: unbilledEntries } = await supabase.from('time_entries')
      .select('hours, hourly_rate')
      .eq('company_id', companyId)
      .eq('billable', true);

    const unbilledWIP = unbilledEntries?.reduce((sum, e) => sum + Number(e.hours) * Number(e.hourly_rate || 150), 0) || 0;

    // Get invoice stats
    const { data: invoices } = await supabase.from('invoices')
      .select('status, total')
      .eq('company_id', companyId);

    const draftInvoices = invoices?.filter(i => i.status === 'draft').length || 0;
    const sentInvoices = invoices?.filter(i => i.status === 'sent' || i.status === 'paid').length || 0;

    return {
      hoursToday,
      pendingTasks: pendingTasks || 0,
      unbilledWIP,
      utilization,
      billableHours: billableWeekHours,
      nonBillableHours: totalWeekHours - billableWeekHours,
      draftInvoices,
      sentInvoices,
    };
  },

  // Project team
  async getProjectTeam(projectId: string) {
    const { data, error } = await supabase.from('project_team')
      .select('*, user:profiles(id, full_name, email)')
      .eq('project_id', projectId);
    if (error) throw error;
    return data;
  },

  // Project rates
  async getProjectRates(projectId: string) {
    const { data, error } = await supabase.from('project_rates')
      .select('*')
      .eq('project_id', projectId);
    if (error) throw error;
    return data;
  },

  // Quote Line Items
  async getQuoteLineItems(quoteId: string) {
    const { data, error } = await supabase.from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order');
    if (error) throw error;
    return data as QuoteLineItem[];
  },

  // Fetch collaboration quote (for owner signing mode - bypasses RLS)
  async getCollaborationQuote(quoteId: string, collaborationId?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-collaboration-quote`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ quoteId, collaborationId })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch collaboration quote');
    }

    return response.json();
  },

  // Sign and approve a collaborator's proposal (simplified one-click signing)
  async signCollaborationProposal(collaborationId: string, quoteId: string, signerName?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated - please log in again');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-collaboration-proposal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ collaborationId, quoteId, signerName })
      }
    );

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Failed to sign proposal');
    }

    return response.json();
  },

  async approveMergedCollaborations(parentQuoteId: string, collaborationIds: string[]) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated - please log in again');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-merged-collaborations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ parentQuoteId, collaborationIds })
      }
    );

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Failed to approve collaborations');
    }

    return response.json();
  },

  async createQuoteLineItem(item: Partial<QuoteLineItem>) {
    const { data, error } = await supabase.from('quote_line_items')
      .insert(item)
      .select()
      .single();
    if (error) throw error;
    return data as QuoteLineItem;
  },

  async updateQuoteLineItem(id: string, updates: Partial<QuoteLineItem>) {
    const { data, error } = await supabase.from('quote_line_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as QuoteLineItem;
  },

  async deleteQuoteLineItem(id: string) {
    const { error } = await supabase.from('quote_line_items').delete().eq('id', id);
    if (error) throw error;
  },

  async saveQuoteLineItems(quoteId: string, items: (Partial<QuoteLineItem> & { id?: string })[]) {
    // Get existing item IDs
    const { data: existingItems } = await supabase.from('quote_line_items')
      .select('id')
      .eq('quote_id', quoteId);
    const existingIds = new Set((existingItems || []).map(i => i.id));

    // Helper to check if ID looks like a valid UUID
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Determine which IDs to keep and which to delete (only consider valid UUIDs)
    const newIds = new Set(items.filter(i => i.id && isValidUUID(i.id)).map(i => i.id));
    const idsToDelete = [...existingIds].filter(id => !newIds.has(id));

    // Delete removed items
    if (idsToDelete.length > 0) {
      await supabase.from('quote_line_items').delete().in('id', idsToDelete);
    }

    // Upsert items (preserving IDs)
    if (items.length > 0) {
      const itemsWithQuoteId = items.map((item, index) => ({
        ...item,
        id: (item.id && isValidUUID(item.id)) ? item.id : crypto.randomUUID(),
        quote_id: quoteId,
        sort_order: index,
      }));
      const { error } = await supabase.from('quote_line_items').upsert(itemsWithQuoteId, { onConflict: 'id' });
      if (error) throw error;
    }
  },

  // Company Settings
  async getCompanySettings(companyId: string) {
    const { data, error } = await supabase.from('company_settings')
      .select('*')
      .eq('company_id', companyId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as CompanySettings | null;
  },

  async upsertCompanySettings(settings: Partial<CompanySettings>) {
    const { data, error } = await supabase.from('company_settings')
      .upsert(settings, { onConflict: 'company_id' })
      .select()
      .single();
    if (error) throw error;
    return data as CompanySettings;
  },

  async uploadCoverBackground(companyId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${companyId}/cover-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('cover-backgrounds')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('cover-backgrounds').getPublicUrl(fileName);
    const url = data.publicUrl;
    const settings = await this.getCompanySettings(companyId);
    const existing = (settings?.saved_cover_background_urls as string[] | undefined) || [];
    if (!existing.includes(url)) {
      await this.upsertCompanySettings({
        ...(settings || { company_id: companyId }),
        company_id: companyId,
        saved_cover_background_urls: [...existing, url],
      });
    }
    return url;
  },

  // Hierarchical Tasks
  async getTasksWithChildren(projectId: string) {
    const { data, error } = await supabase.from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');
    if (error) throw error;

    // Build hierarchical structure
    const taskMap = new Map<string, Task>();
    const rootTasks: Task[] = [];

    (data as Task[]).forEach(task => {
      task.children = [];
      taskMap.set(task.id, task);
    });

    (data as Task[]).forEach(task => {
      if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
        taskMap.get(task.parent_task_id)!.children!.push(task);
      } else {
        rootTasks.push(task);
      }
    });

    return rootTasks;
  },

  // Services (Products & Services catalog)
  async getServices(companyId: string) {
    const { data, error } = await supabase.from('services')
      .select('*')
      .eq('company_id', companyId)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return data as Service[];
  },

  async createService(service: Partial<Service>) {
    const { data, error } = await supabase.from('services')
      .insert(service)
      .select()
      .single();
    if (error) throw error;
    return data as Service;
  },

  async updateService(id: string, updates: Partial<Service>) {
    const { data, error } = await supabase.from('services')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Service;
  },

  async deleteService(id: string) {
    const { error } = await supabase.from('services')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Send email for invoices/quotes
  async sendEmail(params: {
    to: string;
    subject: string;
    documentType: 'invoice' | 'quote';
    documentNumber?: string;
    clientName?: string;
    companyName?: string;
    total?: number;
  }) {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send email');
    }
    return response.json();
  },

  // === PROPOSAL TEMPLATES ===
  async getProposalTemplates(companyId: string): Promise<ProposalTemplate[]> {
    const { data, error } = await supabase.from('proposal_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('use_count', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getProposalTemplate(id: string): Promise<ProposalTemplate> {
    const { data, error } = await supabase.from('proposal_templates')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createProposalTemplate(template: Omit<ProposalTemplate, 'id' | 'use_count' | 'created_at' | 'updated_at'>): Promise<ProposalTemplate> {
    const { data, error } = await supabase.from('proposal_templates')
      .insert({ ...template, use_count: 0 })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateProposalTemplate(id: string, updates: Partial<ProposalTemplate>): Promise<ProposalTemplate> {
    const { data, error } = await supabase.from('proposal_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteProposalTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('proposal_templates').delete().eq('id', id);
    if (error) throw error;
  },

  async incrementTemplateUseCount(_id: string): Promise<void> {
    // Non-critical analytics - silently skip if DB function doesn't exist
    // TODO: Create increment_template_use_count RPC in database if needed
  },

  async getTemplateCategories(companyId: string): Promise<{ categories: string[]; clientTypes: string[] }> {
    const { data, error } = await supabase.from('proposal_templates')
      .select('category, client_type')
      .eq('company_id', companyId);
    if (error) throw error;
    const categories = [...new Set((data || []).map(t => t.category).filter(Boolean))] as string[];
    const clientTypes = [...new Set((data || []).map(t => t.client_type).filter(Boolean))] as string[];
    return { categories, clientTypes };
  },
};


// User Management Types
export interface Role {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  is_system?: boolean;
  permissions?: Record<string, { view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }>;
  created_at?: string;
}

export interface UserProfile {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role?: string;
  role_id?: string;
  hourly_rate?: number;
  is_billable?: boolean;
  is_active?: boolean;
  avatar_url?: string;
  created_at?: string;
  // Personal Details
  phone?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  hire_date?: string;
  // Arrays
  user_groups?: string[];
  management_departments?: string[];
  staff_teams?: string[];
}

export interface CompanyInvitation {
  id: string;
  company_id: string;
  email: string;
  role_id?: string;
  invited_by?: string;
  status?: string;
  token?: string;
  expires_at?: string;
  created_at?: string;
  role?: Role;
}

// User Management API
export const userManagementApi = {
  // Roles
  async getRoles(companyId: string) {
    const { data, error } = await supabase.from('roles')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return data as Role[];
  },

  // Departments (uses 'name' column and 'is_active' flag)
  async getDepartments(companyId: string) {
    const { data, error } = await supabase.from('departments')
      .select('id, name, description')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    if (error) {
      console.warn('departments table error:', error.message);
      return [];
    }
    return data || [];
  },

  // Staff Teams (uses 'value' column and 'is_inactive' flag)
  async getStaffTeams(companyId: string) {
    const { data, error } = await supabase.from('staff_teams')
      .select('id, value, description')
      .eq('company_id', companyId)
      .eq('is_inactive', false)
      .order('sort_order')
      .order('value');
    if (error) {
      console.warn('staff_teams table error:', error.message);
      return [];
    }
    return data?.map(t => ({ id: t.id, name: t.value })) || [];
  },

  async createRole(role: Partial<Role>) {
    const { data, error } = await supabase.from('roles')
      .insert(role)
      .select()
      .single();
    if (error) throw error;
    return data as Role;
  },

  async updateRole(id: string, updates: Partial<Role>) {
    const { data, error } = await supabase.from('roles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Role;
  },

  async deleteRole(id: string) {
    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) throw error;
  },

  // Users/Profiles
  async getCompanyUsers(companyId: string) {
    const { data, error } = await supabase.from('profiles')
      .select('*')
      .eq('company_id', companyId)
      .order('full_name');
    if (error) throw error;
    return data as UserProfile[];
  },

  async createStaffProfile(staffData: Partial<UserProfile> & { company_id: string; email: string }) {
    const { data, error } = await supabase.from('profiles')
      .insert({
        ...staffData,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  async updateUserProfile(id: string, updates: Partial<UserProfile>) {
    const { data, error } = await supabase.from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  async deactivateUser(id: string) {
    return this.updateUserProfile(id, { is_active: false });
  },

  async activateUser(id: string) {
    return this.updateUserProfile(id, { is_active: true });
  },

  // Invitations
  async getInvitations(companyId: string) {
    const { data, error } = await supabase.from('company_invitations')
      .select('*, role:roles(id, name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as CompanyInvitation[];
  },

  async createInvitation(invitation: Partial<CompanyInvitation>) {
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const { data, error } = await supabase.from('company_invitations')
      .insert({
        ...invitation,
        token,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return data as CompanyInvitation;
  },

  async cancelInvitation(id: string) {
    const { error } = await supabase.from('company_invitations')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
  },

  async resendInvitation(id: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data, error } = await supabase.from('company_invitations')
      .update({
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CompanyInvitation;
  },
};


// Settings Types
export interface Category {
  id: string;
  company_id: string;
  name: string;
  code?: string;
  service_item?: string;
  tax_rate?: number;
  description?: string;
  is_non_billable?: boolean;
  is_inactive?: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface ExpenseCode {
  id: string;
  company_id: string;
  name: string;
  code?: string;
  service_item?: string;
  description?: string;
  markup_percent?: number;
  is_taxable?: boolean;
  is_inactive?: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface InvoiceTerm {
  id: string;
  company_id: string;
  name: string;
  days_out?: number;
  quickbooks_link?: string;
  is_default?: boolean;
  is_inactive?: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface FieldValue {
  id: string;
  company_id: string;
  value: string;
  description?: string;
  is_inactive?: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface StatusCode {
  id: string;
  company_id: string;
  value: string;
  description?: string;
  items_inactive?: boolean;
  is_inactive?: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface CostCenter {
  id: string;
  company_id: string;
  name: string;
  abbreviation?: string;
  description?: string;
  is_inactive?: boolean;
  sort_order?: number;
  created_at?: string;
}

// Settings API
export const settingsApi = {
  // Generic CRUD for simple tables
  async getItems<T>(tableName: string, companyId: string, includeInactive = false): Promise<T[]> {
    let query = supabase.from(tableName).select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('name', { ascending: true });
    if (error) throw error;
    return data as T[];
  },

  async createItem<T>(tableName: string, item: Partial<T>): Promise<T> {
    const { data, error } = await supabase.from(tableName).insert(item).select().single();
    if (error) throw error;
    return data as T;
  },

  async updateItem<T>(tableName: string, id: string, updates: Partial<T>): Promise<T> {
    const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as T;
  },

  async deleteItem(tableName: string, id: string): Promise<void> {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw error;
  },

  // Categories
  async getCategories(companyId: string, includeInactive = false) {
    let query = supabase.from('categories').select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;
    return (data || []) as Category[];
  },
  async createCategory(category: Partial<Category>) {
    const { data, error } = await supabase.from('categories').insert(category).select().single();
    if (error) throw error;
    return data as Category;
  },
  async updateCategory(id: string, updates: Partial<Category>) {
    const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Category;
  },
  async deleteCategory(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  },

  // Expense Codes
  async getExpenseCodes(companyId: string, includeInactive = false) {
    let query = supabase.from('expense_codes').select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;
    return (data || []) as ExpenseCode[];
  },
  async createExpenseCode(code: Partial<ExpenseCode>) {
    const { data, error } = await supabase.from('expense_codes').insert(code).select().single();
    if (error) throw error;
    return data as ExpenseCode;
  },
  async updateExpenseCode(id: string, updates: Partial<ExpenseCode>) {
    const { data, error } = await supabase.from('expense_codes').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as ExpenseCode;
  },
  async deleteExpenseCode(id: string) {
    const { error } = await supabase.from('expense_codes').delete().eq('id', id);
    if (error) throw error;
  },

  // Invoice Terms
  async getInvoiceTerms(companyId: string, includeInactive = false) {
    let query = supabase.from('invoice_terms').select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;
    return (data || []) as InvoiceTerm[];
  },
  async createInvoiceTerm(term: Partial<InvoiceTerm>) {
    const { data, error } = await supabase.from('invoice_terms').insert(term).select().single();
    if (error) throw error;
    return data as InvoiceTerm;
  },
  async updateInvoiceTerm(id: string, updates: Partial<InvoiceTerm>) {
    const { data, error } = await supabase.from('invoice_terms').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as InvoiceTerm;
  },
  async deleteInvoiceTerm(id: string) {
    const { error } = await supabase.from('invoice_terms').delete().eq('id', id);
    if (error) throw error;
  },

  // Field Values
  async getFieldValues(tableName: string, companyId: string, includeInactive = false) {
    let query = supabase.from(tableName).select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('value');
    if (error) throw error;
    return (data || []) as FieldValue[];
  },
  async createFieldValue(tableName: string, item: Partial<FieldValue>) {
    const { data, error } = await supabase.from(tableName).insert(item).select().single();
    if (error) throw error;
    return data as FieldValue;
  },
  async updateFieldValue(tableName: string, id: string, updates: Partial<FieldValue>) {
    const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as FieldValue;
  },
  async deleteFieldValue(tableName: string, id: string) {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw error;
  },

  // Status Codes
  async getStatusCodes(tableName: string, companyId: string, includeInactive = false) {
    let query = supabase.from(tableName).select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('value');
    if (error) throw error;
    return (data || []) as StatusCode[];
  },
  async createStatusCode(tableName: string, item: Partial<StatusCode>) {
    const { data, error } = await supabase.from(tableName).insert(item).select().single();
    if (error) throw error;
    return data as StatusCode;
  },
  async updateStatusCode(tableName: string, id: string, updates: Partial<StatusCode>) {
    const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as StatusCode;
  },
  async deleteStatusCode(tableName: string, id: string) {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw error;
  },

  // Cost Centers
  async getCostCenters(tableName: string, companyId: string, includeInactive = false) {
    let query = supabase.from(tableName).select('*').eq('company_id', companyId);
    if (!includeInactive) query = query.eq('is_inactive', false);
    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;
    return (data || []) as CostCenter[];
  },
  async createCostCenter(tableName: string, item: Partial<CostCenter>) {
    const { data, error } = await supabase.from(tableName).insert(item).select().single();
    if (error) throw error;
    return data as CostCenter;
  },
  async updateCostCenter(tableName: string, id: string, updates: Partial<CostCenter>) {
    const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as CostCenter;
  },
  async deleteCostCenter(tableName: string, id: string) {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw error;
  },

  // Reorder items
  async reorderItems(tableName: string, items: { id: string; sort_order: number }[]): Promise<void> {
    for (const item of items) {
      await supabase.from(tableName).update({ sort_order: item.sort_order }).eq('id', item.id);
    }
  },
};

// Email Templates Types & API
export interface EmailTemplate {
  id: string;
  company_id: string;
  template_type: string;
  subject: string;
  body: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ReminderHistory {
  id: string;
  company_id: string;
  invoice_id: string;
  recipient_email: string;
  subject?: string;
  body?: string;
  status: string;
  error_message?: string;
  sent_at?: string;
  created_at?: string;
}

export interface Notification {
  id: string;
  company_id: string;
  user_id?: string;
  type: string;
  title: string;
  message?: string;
  reference_id?: string;
  reference_type?: string;
  is_read: boolean;
  created_at?: string;
}

export const emailTemplatesApi = {
  async getTemplates(companyId: string) {
    const { data, error } = await supabase.from('email_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('template_type');
    if (error) throw error;
    return (data || []) as EmailTemplate[];
  },

  async getTemplate(companyId: string, templateType: string) {
    const { data, error } = await supabase.from('email_templates')
      .select('*')
      .eq('company_id', companyId)
      .eq('template_type', templateType)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return data as EmailTemplate | null;
  },

  async upsertTemplate(template: Partial<EmailTemplate>) {
    const { data, error } = await supabase.from('email_templates')
      .upsert(template, { onConflict: 'company_id,template_type' })
      .select()
      .single();
    if (error) throw error;
    return data as EmailTemplate;
  },

  async createTemplate(template: Partial<EmailTemplate>) {
    const { data, error } = await supabase.from('email_templates')
      .insert(template)
      .select()
      .single();
    if (error) throw error;
    return data as EmailTemplate;
  },

  async updateTemplate(id: string, updates: Partial<EmailTemplate>) {
    const { data, error } = await supabase.from('email_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as EmailTemplate;
  },
};

export const reminderHistoryApi = {
  async getHistory(companyId: string, invoiceId?: string) {
    let query = supabase
      .from('reminder_history')
      .select('*')
      .eq('company_id', companyId);
    if (invoiceId) query = query.eq('invoice_id', invoiceId);
    const { data, error } = await query.order('sent_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ReminderHistory[];
  },

  async logReminder(history: Partial<ReminderHistory>) {
    const { data, error } = await supabase.from('reminder_history')
      .insert(history)
      .select()
      .single();
    if (error) throw error;
    return data as ReminderHistory;
  },
};

export const notificationsApi = {
  async getNotifications(companyId: string, userId?: string, limit = 20) {
    // Fetch notifications for this company that are either:
    // 1. Targeted to this specific user (user_id = userId)
    // 2. Company-wide system notifications (user_id is null)
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('company_id', companyId);
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as Notification[];
  },

  async getUnreadCount(companyId: string, userId?: string) {
    // Count unread notifications for this company that are either:
    // 1. Targeted to this specific user (user_id = userId)
    // 2. Company-wide system notifications (user_id is null)
    let query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_read', false);
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  },

  async markAsRead(id: string) {
    const { error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw error;
  },

  async markAllAsRead(companyId: string, userId?: string) {
    // Mark all company notifications as read that are either:
    // 1. Targeted to this specific user (user_id = userId)
    // 2. Company-wide system notifications (user_id is null)
    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('company_id', companyId)
      .eq('is_read', false);
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }
    const { error } = await query;
    if (error) throw error;
  },

  async createNotification(notification: Partial<Notification>) {
    const { data, error } = await supabase.from('notifications')
      .insert(notification)
      .select()
      .single();
    if (error) throw error;
    return data as Notification;
  },
};

// Recurring Invoices
export interface RecurringInvoice {
  id: string;
  company_id: string;
  client_id: string;
  project_id?: string;
  template_invoice_id?: string;
  frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_run_date: string;
  last_run_date?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  client?: Client;
  template_invoice?: Invoice;
}

export const recurringInvoicesApi = {
  async getAll(companyId: string) {
    const { data, error } = await supabase.from('recurring_invoices')
      .select('*, client:clients(*), template_invoice:invoices(*)')
      .eq('company_id', companyId)
      .order('next_run_date', { ascending: true });
    if (error) throw error;
    return (data || []) as RecurringInvoice[];
  },

  async getById(id: string) {
    const { data, error } = await supabase.from('recurring_invoices')
      .select('*, client:clients(*), template_invoice:invoices(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as RecurringInvoice;
  },

  async create(recurring: Partial<RecurringInvoice>) {
    const { data, error } = await supabase.from('recurring_invoices')
      .insert(recurring)
      .select()
      .single();
    if (error) throw error;
    return data as RecurringInvoice;
  },

  async update(id: string, updates: Partial<RecurringInvoice>) {
    const { data, error } = await supabase.from('recurring_invoices')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as RecurringInvoice;
  },

  async delete(id: string) {
    const { error } = await supabase.from('recurring_invoices')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async toggleActive(id: string, isActive: boolean) {
    return this.update(id, { is_active: isActive });
  },
};

// Client Portal Tokens
export interface ClientPortalToken {
  id: string;
  client_id: string;
  company_id: string;
  token: string;
  expires_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  client?: Client;
}

// Company Expenses (Overhead costs)
export interface CompanyExpense {
  id: string;
  company_id: string;
  name: string;
  category: string;
  custom_category?: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  is_recurring: boolean;
  unit?: string;
  quantity?: number;
  vendor?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const companyExpensesApi = {
  async getExpenses(companyId: string) {
    const { data, error } = await supabase.from('company_expenses')
      .select('*')
      .eq('company_id', companyId)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return data as CompanyExpense[];
  },

  async createExpense(expense: Partial<CompanyExpense>) {
    const { data, error } = await supabase.from('company_expenses')
      .insert(expense)
      .select()
      .single();
    if (error) throw error;
    return data as CompanyExpense;
  },

  async updateExpense(id: string, updates: Partial<CompanyExpense>) {
    const { data, error } = await supabase.from('company_expenses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CompanyExpense;
  },

  async deleteExpense(id: string) {
    const { error } = await supabase.from('company_expenses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Calculate monthly equivalent for any frequency
  getMonthlyAmount(expense: CompanyExpense): number {
    switch (expense.frequency) {
      case 'daily': return expense.amount * 30;
      case 'weekly': return expense.amount * 4;
      case 'monthly': return expense.amount;
      case 'quarterly': return expense.amount / 3;
      case 'yearly': return expense.amount / 12;
      case 'one-time': return 0;
      default: return expense.amount;
    }
  }
};

export const clientPortalApi = {
  async getTokenByClient(clientId: string) {
    const { data, error } = await supabase.from('client_portal_tokens')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    return data as ClientPortalToken | null;
  },

  async createToken(clientId: string, companyId: string) {
    // Generate a random 64-char token
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { data, error } = await supabase.from('client_portal_tokens')
      .insert({
        client_id: clientId,
        company_id: companyId,
        token,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ClientPortalToken;
  },

  async regenerateToken(clientId: string, companyId: string) {
    // Delete existing token
    await supabase.from('client_portal_tokens')
      .delete()
      .eq('client_id', clientId);

    // Create new token
    return this.createToken(clientId, companyId);
  },

  async deleteToken(clientId: string) {
    const { error } = await supabase.from('client_portal_tokens')
      .delete()
      .eq('client_id', clientId);
    if (error) throw error;
  },

  getPortalUrl(token: string) {
    // Use production URL for portal links (not Capacitor's internal URL)
    const baseUrl = (window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost'))
      ? 'https://billdora.com'
      : window.location.origin;
    return `${baseUrl}/portal/${token}`;
  },
};

// Bank Statements Types and API
export interface BankStatement {
  id: string;
  company_id: string;
  file_path: string;
  file_name: string;
  original_filename?: string;
  account_name?: string;
  account_number?: string;
  period_start?: string;
  period_end?: string;
  beginning_balance?: number;
  ending_balance?: number;
  status: 'pending' | 'parsed' | 'reconciled' | 'error';
  created_at?: string;
  updated_at?: string;
}

export interface BankTransaction {
  id: string;
  statement_id: string;
  company_id?: string;
  transaction_date: string;
  description?: string;
  amount: number;
  type?: 'credit' | 'debit';
  check_number?: string;
  matched_expense_id?: string;
  matched_invoice_id?: string;
  matched_type?: string;
  match_status: 'matched' | 'unmatched' | 'suggested' | 'ignored' | 'discrepancy';
  category?: string;
  category_source?: 'auto' | 'manual' | 'ai' | null;
  subcategory?: string;
  project_id?: string;
  payee_id?: string;
  notes?: string;
  is_cleared?: boolean;
  reconciled_at?: string;
  created_at?: string;
  // Joined data
  matched_expense?: CompanyExpense;
  project?: { id: string; name: string };
  payee?: { id: string; full_name: string; employment_type: string | null };
}

export const bankStatementsApi = {
  async getStatements(companyId: string) {
    const { data, error } = await supabase.from('bank_statements')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data as BankStatement[];
  },

  async getStatement(id: string) {
    const { data, error } = await supabase.from('bank_statements')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as BankStatement | null;
  },

  async createStatement(statement: Partial<BankStatement>) {
    const { data, error } = await supabase.from('bank_statements')
      .insert(statement)
      .select()
      .single();
    if (error) throw error;
    return data as BankStatement;
  },

  async updateStatement(id: string, updates: Partial<BankStatement>) {
    const { data, error } = await supabase.from('bank_statements')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as BankStatement;
  },

  async deleteStatement(id: string) {
    // First delete all transactions
    await supabase.from('bank_transactions')
      .delete()
      .eq('statement_id', id);

    // Then delete the statement
    const { error } = await supabase.from('bank_statements')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getTransactions(statementId: string) {
    const { data, error } = await supabase.from('bank_transactions')
      .select('*, project:projects(id, name), payee:profiles!bank_transactions_payee_id_fkey(id, full_name, employment_type)')
      .eq('statement_id', statementId)
      .order('transaction_date', { ascending: true });
    if (error) throw error;
    return data as BankTransaction[];
  },

  async updateTransaction(id: string, updates: Partial<BankTransaction>) {
    const { data, error } = await supabase.from('bank_transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as BankTransaction;
  },

  async uploadStatement(companyId: string, file: File): Promise<BankStatement> {
    // Upload file to storage
    const fileName = `${companyId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('bank-statements')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // Create statement record
    const statement = await this.createStatement({
      company_id: companyId,
      file_name: file.name,
      file_path: fileName,
      original_filename: file.name,
      status: 'pending'
    });

    return statement;
  },

  async parseStatement(statementId: string, companyId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('company_id', companyId);
    formData.append('statement_id', statementId);

    const { data, error } = await supabase.functions.invoke('parse-bank-statement', {
      body: formData
    });

    if (error) throw error;
    return data;
  },

  async reconcileStatement(statementId: string, companyId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('reconcile-statement', {
      body: { statement_id: statementId, company_id: companyId }
    });

    if (error) throw error;
    return data;
  },

  getReconciliationSummary(transactions: BankTransaction[]) {
    const matched = transactions.filter(t => t.match_status === 'matched');
    const unmatched = transactions.filter(t => t.match_status === 'unmatched');
    const discrepancies = transactions.filter(t => t.match_status === 'discrepancy');
    const deposits = transactions.filter(t => t.amount > 0);
    const withdrawals = transactions.filter(t => t.amount < 0);

    return {
      totalTransactions: transactions.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      discrepancyCount: discrepancies.length,
      depositsTotal: deposits.reduce((sum, t) => sum + t.amount, 0),
      withdrawalsTotal: Math.abs(withdrawals.reduce((sum, t) => sum + t.amount, 0)),
      matched,
      unmatched,
      discrepancies,
      deposits,
      withdrawals
    };
  },
};

// Leads API
export const leadsApi = {
  async getLeads(companyId: string): Promise<Lead[]> {
    return apiCall(async () => {
      const { data, error } = await supabase.from('leads')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    });
  },

  async createLead(lead: Partial<Lead>): Promise<Lead> {
    return apiCall(async () => {
      console.log('[API] Creating lead:', lead);
      const { data, error } = await supabase.from('leads')
        .insert(lead)
        .select()
        .single();
      if (error) {
        console.error('[API] Create lead error:', error);
        throw error;
      }
      console.log('[API] Lead created:', data);
      return data;
    });
  },

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    return apiCall(async () => {
      const { data, error } = await supabase.from('leads')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    });
  },

  async deleteLead(id: string): Promise<void> {
    return apiCall(async () => {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    });
  },

  async convertLeadToClient(lead: Lead, companyId: string): Promise<Client> {
    return apiCall(async () => {
      // Create client from lead data
      const { data, error } = await supabase.from('clients')
        .insert({
          company_id: companyId,
          name: lead.company_name || lead.name,
          display_name: lead.name,
          email: lead.email,
          phone: lead.phone,
          lifecycle_stage: 'client'
        })
        .select()
        .single();
      if (error) throw error;

      // Update lead status to won
      await supabase.from('leads').update({ status: 'won', updated_at: new Date().toISOString() }).eq('id', lead.id);

      // Link any projects created from this lead's quotes to the new client
      const { data: leadQuotes } = await supabase.from('quotes')
        .select('id')
        .eq('lead_id', lead.id);

      if (leadQuotes && leadQuotes.length > 0) {
        const quoteIds = leadQuotes.map(q => q.id);
        // Update projects that were created from these quotes
        await supabase.from('projects')
          .update({ client_id: data.id })
          .in('quote_id', quoteIds);
      }

      return data;
    });
  }
};

// Collaboration API for proposal sharing
export const collaborationApi = {
  async getReceivedInvitations(userEmail: string, userId?: string): Promise<ProposalCollaboration[]> {
    // Fetch collaborations with joined data for owner and parent quote
    const { data, error } = await supabase
      .from('proposal_collaborations')
      .select('*')
      .eq('collaborator_email', userEmail.toLowerCase())
      .in('status', ['pending', 'accepted', 'submitted', 'merged', 'approved'])
      .order('invited_at', { ascending: false });

    if (error) {
      console.error('[CollaborationAPI] Error fetching received invitations:', error);
      return [];
    }

    // Enrich with owner profile and parent quote data
    if (data && data.length > 0) {
      const ownerUserIds = [...new Set(data.map(d => d.owner_user_id).filter(Boolean))];
      const parentQuoteIds = [...new Set(data.map(d => d.parent_quote_id).filter(Boolean))];

      // Fetch owner profiles with company info
      let profilesMap: Record<string, { full_name: string; email: string; company_name?: string; company_id?: string }> = {};
      if (ownerUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, company_id')
          .in('id', ownerUserIds);

        if (profiles && profiles.length > 0) {
          // Fetch company names for these profiles
          const companyIds = [...new Set(profiles.map(p => p.company_id).filter(Boolean))];
          let companiesMap: Record<string, string> = {};

          if (companyIds.length > 0) {
            const { data: companies } = await supabase
              .from('companies')
              .select('id, name')
              .in('id', companyIds);
            if (companies) {
              companiesMap = companies.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});
            }
          }

          profilesMap = profiles.reduce((acc, p) => ({
            ...acc,
            [p.id]: {
              full_name: p.full_name,
              email: p.email,
              company_id: p.company_id,
              company_name: p.company_id ? companiesMap[p.company_id] : undefined
            }
          }), {});
        }
      }

      // Fetch parent quotes
      let quotesMap: Record<string, { id: string; title: string; quote_number?: string }> = {};
      if (parentQuoteIds.length > 0) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, title, quote_number')
          .in('id', parentQuoteIds);
        if (quotes) {
          quotesMap = quotes.reduce((acc, q) => ({ ...acc, [q.id]: q }), {});
        }
      }

      // Enrich the data
      const enriched = data.map(collab => ({
        ...collab,
        owner_profile: collab.owner_user_id ? profilesMap[collab.owner_user_id] : undefined,
        parent_quote: collab.parent_quote_id ? quotesMap[collab.parent_quote_id] : undefined
      }));
      console.log('[CollaborationAPI] Enriched invitations:', enriched.map(e => ({ id: e.id, owner: e.owner_profile?.email, company: e.owner_profile?.company_name, quote: e.parent_quote?.title })));
      return enriched;
    }

    return data || [];
  },

  async getSentInvitations(companyId: string): Promise<ProposalCollaboration[]> {
    // Query with joined quote data
    const { data, error } = await supabase
      .from('proposal_collaborations')
      .select(`
        *,
        parent_quote:quotes!parent_quote_id(id, title, client_id, status)
      `)
      .eq('owner_company_id', companyId)
      .order('invited_at', { ascending: false });

    if (error) {
      console.error('[CollaborationAPI] Error fetching sent invitations:', error);
      return [];
    }

    // Fetch client names separately if we have client_ids
    if (data && data.length > 0) {
      const clientIds = [...new Set(data.map((d: any) => d.parent_quote?.client_id).filter(Boolean))];
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', clientIds);

        const clientMap = (clients || []).reduce((acc: any, c: any) => ({ ...acc, [c.id]: c.name }), {});

        return data.map((d: any) => ({
          ...d,
          parent_quote: d.parent_quote ? {
            ...d.parent_quote,
            client_name: clientMap[d.parent_quote.client_id] || null
          } : null
        }));
      }
    }

    return data || [];
  },

  async createInvitation(invitation: {
    parent_quote_id: string;
    owner_user_id: string;
    owner_company_id: string;
    collaborator_email: string;
    collaborator_name?: string;
    collaborator_company_name?: string;
    category_id?: string;
    message?: string;
    share_line_items?: boolean;
    transparency_mode?: string;
    payment_mode?: string;
    expires_at?: string;
  }): Promise<ProposalCollaboration> {
    const { data, error } = await supabase
      .from('proposal_collaborations')
      .insert({
        ...invitation,
        collaborator_email: invitation.collaborator_email.toLowerCase(),
        status: 'pending',
        invited_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[CollaborationAPI] Error creating invitation:', error);
      throw error;
    }
    return data;
  },

  async acceptInvitation(invitationId: string, collaboratorUserId: string, collaboratorCompanyId: string): Promise<void> {
    const { error } = await supabase
      .from('proposal_collaborations')
      .update({
        status: 'accepted',
        collaborator_user_id: collaboratorUserId,
        collaborator_company_id: collaboratorCompanyId,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId);

    if (error) {
      console.error('[CollaborationAPI] Error accepting invitation:', error);
      throw error;
    }
  },

  async declineInvitation(invitationId: string): Promise<void> {
    const { error } = await supabase
      .from('proposal_collaborations')
      .update({
        status: 'declined',
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId);

    if (error) {
      console.error('[CollaborationAPI] Error declining invitation:', error);
      throw error;
    }
  },

  async getCollaborations(quoteId: string): Promise<ProposalCollaboration[]> {
    const { data, error } = await supabase
      .from('proposal_collaborations')
      .select('*')
      .eq('parent_quote_id', quoteId)
      .order('invited_at', { ascending: false });

    if (error) {
      console.error('[CollaborationAPI] Error fetching collaborations:', error);
      return [];
    }
    return data || [];
  },

  async submitResponse(invitationId: string, responseQuoteId: string): Promise<void> {
    // Try using the secure RPC first (bypass RLS for status update)
    const { error: rpcError } = await supabase.rpc('submit_collaboration_response', {
      p_invitation_id: invitationId,
      p_response_quote_id: responseQuoteId
    });

    if (!rpcError) return;

    console.warn('[CollaborationAPI] RPC failed, falling back to direct update:', rpcError);

    const { data, error } = await supabase
      .from('proposal_collaborations')
      .update({
        status: 'submitted',
        response_quote_id: responseQuoteId,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId)
      .select('parent_quote_id')
      .single();

    if (error) {
      console.error('[CollaborationAPI] Error submitting response:', error);
      throw error;
    }

    // Update parent quote status to 'review' to indicate responses are ready
    if (data?.parent_quote_id) {
      await supabase
        .from('quotes')
        .update({ status: 'review' })
        .eq('id', data.parent_quote_id)
        .eq('status', 'pending_collaborators'); // Only update if currently waiting
    }
  },

  // Get unique previously invited collaborators for quick selection
  async getPreviousCollaborators(companyId: string): Promise<Array<{
    email: string;
    name: string;
    company: string;
    categoryId: string;
    lastUsed: string;
  }>> {
    const { data, error } = await supabase
      .from('proposal_collaborations')
      .select('collaborator_email, collaborator_name, collaborator_company_name, category_id, invited_at')
      .eq('owner_company_id', companyId)
      .order('invited_at', { ascending: false });

    if (error) {
      console.error('[CollaborationAPI] Error fetching previous collaborators:', error);
      return [];
    }

    // Deduplicate by email, keeping the most recent entry
    const collaboratorMap = new Map<string, { email: string; name: string; company: string; categoryId: string; lastUsed: string }>();
    for (const item of data || []) {
      const email = item.collaborator_email?.toLowerCase();
      if (email && !collaboratorMap.has(email)) {
        collaboratorMap.set(email, {
          email,
          name: item.collaborator_name || '',
          company: item.collaborator_company_name || '',
          categoryId: item.category_id || '',
          lastUsed: item.invited_at || ''
        });
      }
    }

    return Array.from(collaboratorMap.values());
  },

  // Get all trade partners (both directions: people you've invited AND people who've invited you)
  async getPartners(companyId: string, userId: string, userEmail: string): Promise<Array<{
    id: string;
    email: string;
    name: string;
    companyName: string;
    companyId: string | null;
    phone: string;
    projectCount: number;
    lastCollaboration: string;
    relationship: 'invited' | 'received' | 'mutual';
    trade: string;
  }>> {
    try {
      // Fetch collaborations where current company is owner (people we invited)
      const { data: sentData, error: sentError } = await supabase
        .from('proposal_collaborations')
        .select('collaborator_email, collaborator_name, collaborator_company_name, collaborator_company_id, collaborator_user_id, invited_at, status, category_id')
        .eq('owner_company_id', companyId);

      // Fetch collaborations where current user is collaborator (people who invited us)
      const { data: receivedData, error: receivedError } = await supabase
        .from('proposal_collaborations')
        .select('owner_user_id, owner_company_id, invited_at, status')
        .or(`collaborator_email.eq.${userEmail},collaborator_user_id.eq.${userId}`);

      if (sentError) console.error('[CollaborationAPI] Error fetching sent partners:', sentError);
      if (receivedError) console.error('[CollaborationAPI] Error fetching received partners:', receivedError);

      // Fetch category names for trade display
      const categoryIds = [...new Set((sentData || []).map((s: any) => s.category_id).filter(Boolean))];
      let categoryMap = new Map<string, string>();

      if (categoryIds.length > 0) {
        const { data: categoryData } = await supabase
          .from('collaborator_categories')
          .select('id, name')
          .in('id', categoryIds);

        for (const cat of categoryData || []) {
          categoryMap.set(cat.id, cat.name);
        }
      }

      const partnersMap = new Map<string, {
        id: string;
        email: string;
        name: string;
        companyName: string;
        companyId: string | null;
        phone: string;
        projectCount: number;
        lastCollaboration: string;
        relationship: 'invited' | 'received' | 'mutual';
        trade: string;
      }>();

      // Process people we've invited
      for (const item of sentData || []) {
        const key = item.collaborator_email?.toLowerCase() || item.collaborator_company_id || '';
        if (!key) continue;

        const tradeName = (item as any).category_id ? categoryMap.get((item as any).category_id) || '' : '';

        const existing = partnersMap.get(key);
        if (existing) {
          existing.projectCount++;
          existing.relationship = 'mutual';
          if (new Date(item.invited_at) > new Date(existing.lastCollaboration)) {
            existing.lastCollaboration = item.invited_at;
          }
          // Update trade if not set and this one has it
          if (!existing.trade && tradeName) {
            existing.trade = tradeName;
          }
        } else {
          partnersMap.set(key, {
            id: item.collaborator_company_id || crypto.randomUUID(),
            email: item.collaborator_email || '',
            name: item.collaborator_name || '',
            companyName: item.collaborator_company_name || '',
            companyId: item.collaborator_company_id || null,
            phone: '',
            projectCount: 1,
            lastCollaboration: item.invited_at || '',
            relationship: 'invited',
            trade: tradeName
          });
        }
      }

      // Process people who've invited us - need to fetch their company info
      const ownerCompanyIds = [...new Set((receivedData || []).map(r => r.owner_company_id).filter(Boolean))];

      let companyInfoMap = new Map<string, { name: string; email: string }>();
      if (ownerCompanyIds.length > 0) {
        const { data: companyData } = await supabase
          .from('company_settings')
          .select('company_id, company_name, email')
          .in('company_id', ownerCompanyIds);

        for (const c of companyData || []) {
          companyInfoMap.set(c.company_id, { name: c.company_name || '', email: c.email || '' });
        }
      }

      for (const item of receivedData || []) {
        if (!item.owner_company_id) continue;
        const key = item.owner_company_id;
        const companyInfo = companyInfoMap.get(key) || { name: '', email: '' };

        const existing = partnersMap.get(key);
        if (existing) {
          existing.projectCount++;
          existing.relationship = 'mutual';
          if (new Date(item.invited_at) > new Date(existing.lastCollaboration)) {
            existing.lastCollaboration = item.invited_at;
          }
        } else {
          partnersMap.set(key, {
            id: key,
            email: companyInfo.email,
            name: companyInfo.name,
            companyName: companyInfo.name,
            companyId: key,
            phone: '',
            projectCount: 1,
            lastCollaboration: item.invited_at || '',
            relationship: 'received',
            trade: '' // Trade info is from the inviter's perspective, not available here
          });
        }
      }

      return Array.from(partnersMap.values()).sort((a, b) =>
        new Date(b.lastCollaboration).getTime() - new Date(a.lastCollaboration).getTime()
      );
    } catch (err) {
      console.error('[CollaborationAPI] Error fetching partners:', err);
      return [];
    }
  }
};

export interface ProposalCollaboration {
  id: string;
  parent_quote_id: string;
  owner_user_id: string;
  owner_company_id: string;
  collaborator_email: string;
  collaborator_name?: string;
  collaborator_user_id?: string;
  collaborator_company_id?: string;
  collaborator_company_name?: string;
  response_quote_id?: string;
  category_id?: string;
  share_line_items?: boolean;
  message?: string;
  transparency_mode?: string;
  payment_mode?: string;
  collaborator_visible?: boolean;
  collaborator_stripe_account_id?: string;
  status?: 'pending' | 'accepted' | 'declined' | 'submitted' | 'merged' | 'approved';
  invited_at?: string;
  accepted_at?: string;
  submitted_at?: string;
  merged_at?: string;
  owner_signed_at?: string;
  converted_project_id?: string;
  expires_at?: string;
  depth?: number;
  created_at?: string;
  updated_at?: string;
  // Joined relations
  owner_profile?: {
    full_name: string;
    email: string;
    company_name?: string;
  };
  parent_quote?: {
    id: string;
    title: string;
    quote_number?: string;
    status?: string;
  };
}

// Lead forms API for embedded lead capture
export const leadFormsApi = {
  async getForms(companyId: string) {
    return [];
  },
  async getOrCreateDefaultForm(companyId: string) {
    // Stub - return a default form structure
    return {
      id: 'default',
      company_id: companyId,
      form_name: 'Default Lead Form',
      is_active: true,
    };
  }
};

// ============================================================
// COLLABORATOR CATEGORIES API
// ============================================================

export interface CollaboratorCategory {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const collaboratorCategoryApi = {
  async getCategories(companyId: string): Promise<CollaboratorCategory[]> {
    const { data, error } = await supabase
      .from('collaborator_categories')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[CollaboratorCategoryAPI] Error fetching categories:', error);
      throw error;
    }
    return data || [];
  },

  async createCategory(category: Omit<CollaboratorCategory, 'id' | 'created_at' | 'updated_at'>): Promise<CollaboratorCategory> {
    const { data, error } = await supabase
      .from('collaborator_categories')
      .insert(category)
      .select()
      .single();

    if (error) {
      console.error('[CollaboratorCategoryAPI] Error creating category:', error);
      throw error;
    }
    return data;
  },

  async updateCategory(id: string, updates: Partial<CollaboratorCategory>): Promise<CollaboratorCategory> {
    const { data, error } = await supabase
      .from('collaborator_categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CollaboratorCategoryAPI] Error updating category:', error);
      throw error;
    }
    return data;
  },

  async deleteCategory(id: string): Promise<void> {
    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('collaborator_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[CollaboratorCategoryAPI] Error deleting category:', error);
      throw error;
    }
  }
};

// Retainer Payments API
export const retainerApi = {
  async getByCompany(companyId: string): Promise<RetainerPayment[]> {
    const { data, error } = await supabase
      .from('retainer_payments')
      .select('*, client:clients(*), quote:quotes(*), project:projects(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getByClient(clientId: string): Promise<RetainerPayment[]> {
    const { data, error } = await supabase
      .from('retainer_payments')
      .select('*, quote:quotes(*), project:projects(*)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getClientBalance(clientId: string): Promise<number> {
    const { data, error } = await supabase
      .from('retainer_payments')
      .select('amount, applied_amount')
      .eq('client_id', clientId)
      .eq('status', 'completed');

    if (error) throw error;

    // Calculate total retainer minus what's been applied
    const balance = (data || []).reduce((sum, p) => {
      return sum + (Number(p.amount) - Number(p.applied_amount || 0));
    }, 0);

    return balance;
  },

  async create(payment: Omit<RetainerPayment, 'id' | 'created_at' | 'updated_at'>): Promise<RetainerPayment> {
    const { data, error } = await supabase
      .from('retainer_payments')
      .insert(payment)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async applyToInvoice(retainerPaymentId: string, invoiceId: string, amount: number): Promise<RetainerPayment> {
    const { data, error } = await supabase
      .from('retainer_payments')
      .update({
        applied_to_invoice_id: invoiceId,
        applied_amount: amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', retainerPaymentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async markQuoteRetainerPaid(quoteId: string, stripePaymentId?: string): Promise<void> {
    const { error } = await supabase
      .from('quotes')
      .update({
        retainer_paid: true,
        retainer_paid_at: new Date().toISOString(),
        retainer_stripe_payment_id: stripePaymentId
      })
      .eq('id', quoteId);

    if (error) throw error;
  }
};

// Project Comments API
export const projectCommentsApi = {
  async getByProject(projectId: string): Promise<ProjectComment[]> {
    const { data, error } = await supabase
      .from('project_comments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Organize into threaded structure
    const comments = data || [];
    const topLevel = comments.filter(c => !c.parent_id);
    const replies = comments.filter(c => c.parent_id);

    // Attach replies to their parent comments
    return topLevel.map(comment => ({
      ...comment,
      replies: replies.filter(r => r.parent_id === comment.id)
    }));
  },

  async create(comment: {
    project_id: string;
    company_id: string;
    author_id: string;
    author_name?: string;
    author_email?: string;
    content: string;
    visibility?: 'all' | 'internal' | 'owner_only';
    parent_id?: string;
    mentions?: string[];
  }): Promise<ProjectComment> {
    const { data, error } = await supabase
      .from('project_comments')
      .insert({
        ...comment,
        visibility: comment.visibility || 'all'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: {
    content?: string;
    visibility?: 'all' | 'internal' | 'owner_only';
    is_resolved?: boolean;
  }): Promise<ProjectComment> {
    const { data, error } = await supabase
      .from('project_comments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_comments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async toggleResolved(id: string, isResolved: boolean): Promise<ProjectComment> {
    return this.update(id, { is_resolved: isResolved });
  },

  async getAllByCompany(_companyId: string): Promise<(ProjectComment & { project_name?: string; project_number?: string })[]> {
    // RLS already restricts visibility based on project membership / collaboration.
    // Don't join projects here — the RLS policy on project_comments already
    // references projects internally, causing a PostgREST 400 conflict.
    // Project names are resolved in the component from the separate getProjects call.
    const { data, error } = await supabase
      .from('project_comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('getAllByCompany error:', error);
      throw error;
    }
    return (data || []) as (ProjectComment & { project_name?: string; project_number?: string })[];
  },

  async uploadAttachment(companyId: string, projectId: string, file: File): Promise<{ name: string; url: string; type: string; size: number }> {
    const fileName = `${companyId}/${projectId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage
      .from('comment-attachments')
      .upload(fileName, file);
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('comment-attachments')
      .getPublicUrl(fileName);

    return { name: file.name, url: publicUrl, type: file.type, size: file.size };
  },

  async createWithAttachments(comment: {
    project_id: string;
    company_id: string;
    author_id: string;
    author_name?: string;
    author_email?: string;
    content: string;
    visibility?: 'all' | 'internal' | 'owner_only';
    parent_id?: string;
    mentions?: string[];
    attachments?: Array<{ name: string; url: string; type: string; size: number }>;
  }): Promise<ProjectComment> {
    const { data, error } = await supabase
      .from('project_comments')
      .insert({
        ...comment,
        visibility: comment.visibility || 'all',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// ─── Comment Tasks API (pin messages as to-do) ─────────────────
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CommentTask {
  id: string;
  comment_id: string;
  project_id: string;
  user_id: string;
  company_id: string;
  note: string;
  priority: TaskPriority;
  due_date: string | null;
  reminder_at: string | null;
  reminder_sent: boolean;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export const commentTasksApi = {
  async getAll(): Promise<CommentTask[]> {
    const { data, error } = await supabase
      .from('comment_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('commentTasksApi.getAll error:', error); throw error; }
    return (data || []) as CommentTask[];
  },

  async create(task: {
    comment_id: string;
    project_id: string;
    user_id: string;
    company_id: string;
    note?: string;
    priority?: TaskPriority;
    due_date?: string | null;
    reminder_at?: string | null;
  }): Promise<CommentTask> {
    const { data, error } = await supabase
      .from('comment_tasks')
      .insert({
        ...task,
        note: task.note || '',
        priority: task.priority || 'medium',
        due_date: task.due_date || null,
        reminder_at: task.reminder_at || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as CommentTask;
  },

  async update(id: string, fields: {
    priority?: TaskPriority;
    due_date?: string | null;
    reminder_at?: string | null;
    note?: string;
  }): Promise<CommentTask> {
    const { data, error } = await supabase
      .from('comment_tasks')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CommentTask;
  },

  async toggleComplete(id: string, isCompleted: boolean): Promise<CommentTask> {
    const { data, error } = await supabase
      .from('comment_tasks')
      .update({ is_completed: isCompleted, completed_at: isCompleted ? new Date().toISOString() : null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CommentTask;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('comment_tasks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /** Fetch tasks with due reminders (reminder_at <= now, not sent, not completed) */
  async getDueReminders(): Promise<CommentTask[]> {
    const { data, error } = await supabase
      .from('comment_tasks')
      .select('*')
      .eq('is_completed', false)
      .eq('reminder_sent', false)
      .lte('reminder_at', new Date().toISOString())
      .order('reminder_at', { ascending: true });
    if (error) { console.error('getDueReminders error:', error); return []; }
    return (data || []) as CommentTask[];
  },

  /** Mark a reminder as sent so it doesn't fire again */
  async markReminderSent(id: string): Promise<void> {
    const { error } = await supabase
      .from('comment_tasks')
      .update({ reminder_sent: true })
      .eq('id', id);
    if (error) console.error('markReminderSent error:', error);
  },

  /** Snooze: push reminder_at forward and reset reminder_sent */
  async snoozeReminder(id: string, newReminderAt: string): Promise<CommentTask> {
    const { data, error } = await supabase
      .from('comment_tasks')
      .update({ reminder_at: newReminderAt, reminder_sent: false })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CommentTask;
  },
};

// ─── Generic App Reminder Interface (extensible for submittals, deadlines, etc.) ───
export type ReminderSource = 'comment_task' | 'submittal' | 'project_deadline';

export interface AppReminder {
  id: string;
  sourceId: string;
  source: ReminderSource;
  title: string;
  message: string;
  projectName?: string;
  projectId?: string;
  priority?: TaskPriority;
  reminder_at: string;
  created_at: string;
}

// Project Collaborators API
export const projectCollaboratorsApi = {
  // Get all collaborators for a project
  async getByProject(projectId: string): Promise<ProjectCollaborator[]> {
    try {
      const { data, error } = await supabase
        .from('project_collaborators')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[projectCollaboratorsApi] getByProject error:', error);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Fetch company names and user names for accepted collaborators
      const acceptedWithCompanies = data.filter(d => d.status === 'accepted' && d.invited_company_id);
      const companyIds = [...new Set(acceptedWithCompanies.map(d => d.invited_company_id).filter(Boolean))];
      const userIds = [...new Set(acceptedWithCompanies.map(d => d.invited_user_id).filter(Boolean))];

      let companyMap: Record<string, string> = {};
      let userMap: Record<string, string> = {};

      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);
        
        companyMap = (companies || []).reduce((acc, c) => {
          acc[c.id] = c.name;
          return acc;
        }, {} as Record<string, string>);
      }

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        userMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || '';
          return acc;
        }, {} as Record<string, string>);
      }

      // Enrich collaborators with company and user names
      return data.map(collab => ({
        ...collab,
        invited_company: collab.invited_company_id && companyMap[collab.invited_company_id] 
          ? { name: companyMap[collab.invited_company_id] } 
          : undefined,
        invited_user_name: collab.invited_user_id ? userMap[collab.invited_user_id] : undefined
      }));
    } catch (err) {
      console.error('[projectCollaboratorsApi] getByProject exception:', err);
      return [];
    }
  },

  // Get all invitations for the current user (by email or user_id)
  async getMyInvitations(userEmail: string, userId?: string): Promise<ProjectCollaborator[]> {
    try {
      console.log('[projectCollaboratorsApi] getMyInvitations called for:', userEmail);
      
      // Use RPC function that includes project and company details (bypasses RLS)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_project_invitations', {
        target_email: userEmail
      });

      console.log('[projectCollaboratorsApi] RPC result:', { data: rpcData, error: rpcError });

      if (rpcError) {
        console.error('[projectCollaboratorsApi] getMyInvitations RPC error:', rpcError);
        return [];
      }

      if (!rpcData || rpcData.length === 0) {
        return [];
      }

      // Transform RPC response to include nested project and company objects
      return rpcData.map((d: any) => ({
        ...d,
        project: d.project_name ? { 
          id: d.project_id, 
          name: d.project_name, 
          status: d.project_status 
        } : null,
        invited_by_company: d.invited_by_company_name ? { 
          company_name: d.invited_by_company_name 
        } : null
      }));
    } catch (err) {
      console.error('[projectCollaboratorsApi] getMyInvitations exception:', err);
      return [];
    }
  },

  // Get projects shared with the current user (accepted invitations)
  async getSharedProjects(userEmail: string, userId?: string): Promise<ProjectCollaborator[]> {
    try {
      console.log('[projectCollaboratorsApi] getSharedProjects called:', { userEmail, userId });
      
      // Use RPC function that bypasses RLS for reliable fetching
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_shared_projects', {
        target_email: userEmail.toLowerCase(),
        target_user_id: userId || null
      });

      console.log('[projectCollaboratorsApi] getSharedProjects RPC result:', { data: rpcData, error: rpcError });

      if (rpcError) {
        console.error('[projectCollaboratorsApi] getSharedProjects RPC error:', rpcError);
        return [];
      }

      if (!rpcData || rpcData.length === 0) {
        console.log('[projectCollaboratorsApi] getSharedProjects: no shared projects found');
        return [];
      }

      // Transform RPC response to include nested project object with client data
      const result = rpcData.map((d: any) => ({
        id: d.collaboration_id,
        project_id: d.project_id,
        invited_email: d.invited_email,
        invited_user_id: d.invited_user_id,
        invited_company_id: d.invited_company_id,
        role: d.role,
        relationship: d.relationship,
        their_client_id: d.their_client_id,
        their_client_name: d.their_client_name,
        can_view_financials: d.can_view_financials,
        can_view_time_entries: d.can_view_time_entries,
        can_comment: d.can_comment,
        can_edit_tasks: d.can_edit_tasks,
        can_invite_others: d.can_invite_others,
        accepted_at: d.accepted_at,
        status: 'accepted',
        project: {
          id: d.project_id,
          company_id: d.project_company_id,
          name: d.project_name,
          status: d.project_status,
          description: d.project_description,
          start_date: d.project_start_date,
          end_date: d.project_end_date,
          budget: d.project_budget,
          client_id: d.project_client_id,
          priority: d.project_priority,
          // Include client data from the project owner's side
          client: d.client_name ? {
            id: d.project_client_id,
            name: d.client_name,
            email: d.client_email,
            phone: d.client_phone,
            address: d.client_address,
            billing_contact_name: d.client_billing_contact_name,
            billing_contact_email: d.client_billing_contact_email
          } : undefined
        },
        invited_by_company: d.inviter_company_name ? {
          name: d.inviter_company_name
        } : null
      }));
      
      console.log('[projectCollaboratorsApi] getSharedProjects returning:', result.length, 'projects');
      return result;
    } catch (err) {
      console.error('[projectCollaboratorsApi] getSharedProjects exception:', err);
      return [];
    }
  },

  // Invite a collaborator to a project
  async invite(invitation: {
    project_id: string;
    invited_email: string;
    invited_by_user_id: string;
    invited_by_company_id: string;
    role?: 'client' | 'collaborator' | 'viewer';
    relationship?: 'my_client' | 'subcontractor' | 'partner';
    can_view_financials?: boolean;
    can_view_time_entries?: boolean;
    can_comment?: boolean;
    can_invite_others?: boolean;
    can_edit_tasks?: boolean;
  }): Promise<ProjectCollaborator> {
    console.log('[projectCollaboratorsApi] invite - starting with data:', {
      project_id: invitation.project_id,
      invited_email: invitation.invited_email,
      invited_by_user_id: invitation.invited_by_user_id,
      invited_by_company_id: invitation.invited_by_company_id,
      role: invitation.role
    });

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }
    console.log('[projectCollaboratorsApi] invite - authenticated user:', user.id);

    // Check if user already exists in the system
    const { data: existingUser, error: profileError } = await supabase
      .from('profiles')
      .select('id, company_id, email')
      .ilike('email', invitation.invited_email)
      .maybeSingle();

    if (profileError) {
      console.error('[projectCollaboratorsApi] invite - profile lookup error:', profileError);
    }

    console.log('[projectCollaboratorsApi] invite - existingUser:', existingUser);

    const insertData = {
      project_id: invitation.project_id,
      invited_email: invitation.invited_email.toLowerCase(),
      invited_by_user_id: invitation.invited_by_user_id,
      invited_by_company_id: invitation.invited_by_company_id,
      role: invitation.role || 'collaborator',
      relationship: invitation.relationship,
      invited_user_id: existingUser?.id || null,
      invited_company_id: existingUser?.company_id || null,
      status: 'pending',
      can_view_financials: invitation.can_view_financials ?? false,
      can_view_time_entries: invitation.can_view_time_entries ?? false,
      can_comment: invitation.can_comment ?? true,
      can_invite_others: invitation.can_invite_others ?? false,
      can_edit_tasks: invitation.can_edit_tasks ?? false,
      invited_at: new Date().toISOString()
    };

    console.log('[projectCollaboratorsApi] invite - inserting:', insertData);

    const { data, error } = await supabase
      .from('project_collaborators')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[projectCollaboratorsApi] invite - insert error:', error);
      throw error;
    }

    console.log('[projectCollaboratorsApi] invite - success:', data);

    // Fetch project and inviter details for notification/email
    const [projectResult, inviterResult, inviterCompanyResult] = await Promise.all([
      supabase.from('projects').select('name').eq('id', invitation.project_id).single(),
      supabase.from('profiles').select('full_name, email').eq('id', invitation.invited_by_user_id).single(),
      supabase.from('companies').select('name').eq('id', invitation.invited_by_company_id).single()
    ]);

    const project = projectResult.data;
    const inviter = inviterResult.data;
    const inviterCompany = inviterCompanyResult.data;
    const projectName = project?.name || 'a project';
    const inviterName = inviter?.full_name || inviter?.email || 'Someone';
    const companyName = inviterCompany?.name || 'a company';

    console.log('[projectCollaboratorsApi] invite - notification data:', { projectName, inviterName, companyName });

    // Send in-app notification if user exists in system
    if (existingUser?.id && existingUser?.company_id) {
      try {
        console.log('[projectCollaboratorsApi] invite - creating in-app notification for existing user');
        await NotificationService.collaborationInvited(
          existingUser.id,
          existingUser.company_id,
          projectName,
          inviterName,
          data.id
        );
        console.log('[projectCollaboratorsApi] invite - in-app notification created');
      } catch (notifyErr) {
        console.error('[projectCollaboratorsApi] Failed to send in-app notification:', notifyErr);
      }
    }

    // Always send email notification
    try {
      // Link goes to login page with email pre-filled; invitations are auto-accepted on login/signup
      const inviteEmail = encodeURIComponent(invitation.invited_email.toLowerCase());
      const returnTo = encodeURIComponent(`/project-share/${data.id}`);
      const acceptUrl = `${window.location.origin}/login?email=${inviteEmail}&return_to=${returnTo}`;
      console.log('[projectCollaboratorsApi] invite - sending email to:', invitation.invited_email);
      
      const emailResult = await supabase.functions.invoke('send-email', {
        body: {
          to: invitation.invited_email.toLowerCase(),
          subject: `${inviterName} invited you to collaborate on "${projectName}"`,
          type: 'project_collaboration_invite',
          data: {
            inviterName,
            companyName,
            projectName,
            role: invitation.role || 'collaborator',
            acceptUrl,
            // Include permissions summary
            permissions: {
              can_comment: invitation.can_comment ?? true,
              can_view_financials: invitation.can_view_financials ?? false,
              can_view_time_entries: invitation.can_view_time_entries ?? false,
              can_edit_tasks: invitation.can_edit_tasks ?? false,
            }
          }
        }
      });

      if (emailResult.error) {
        console.error('[projectCollaboratorsApi] invite - email send error:', emailResult.error);
      } else {
        console.log('[projectCollaboratorsApi] invite - email sent successfully');
      }
    } catch (emailErr) {
      console.error('[projectCollaboratorsApi] Failed to send email notification:', emailErr);
    }

    return data;
  },

  // Resend invitation email for a pending collaborator
  async resendInvitation(collaboratorId: string): Promise<void> {
    // Fetch the existing collaborator record
    const { data: collab, error: fetchErr } = await supabase
      .from('project_collaborators')
      .select('*')
      .eq('id', collaboratorId)
      .single();

    if (fetchErr || !collab) throw fetchErr || new Error('Collaborator not found');
    if (collab.status !== 'pending') throw new Error('Can only resend pending invitations');

    // Fetch project name
    const { data: proj } = await supabase
      .from('projects')
      .select('name')
      .eq('id', collab.project_id)
      .single();
    const projectName = proj?.name || 'Untitled Project';

    // Fetch inviter details
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', collab.invited_by_user_id)
      .single();
    const inviterName = inviterProfile?.full_name || inviterProfile?.email || 'A team member';

    // Fetch inviter company
    const { data: inviterCompany } = await supabase
      .from('companies')
      .select('company_name')
      .eq('id', collab.invited_by_company_id)
      .single();
    const companyName = inviterCompany?.company_name || 'a company';

    // Build the login URL (same format as new invite flow)
    const inviteEmail = encodeURIComponent(collab.invited_email.toLowerCase());
    const returnTo = encodeURIComponent(`/project-share/${collab.id}`);
    const acceptUrl = `${window.location.origin}/login?email=${inviteEmail}&return_to=${returnTo}`;

    const emailResult = await supabase.functions.invoke('send-email', {
      body: {
        to: collab.invited_email.toLowerCase(),
        subject: `Reminder: ${inviterName} invited you to collaborate on "${projectName}"`,
        type: 'project_collaboration_invite',
        data: {
          inviterName,
          companyName,
          projectName,
          role: collab.role || 'collaborator',
          acceptUrl,
          permissions: {
            can_comment: collab.can_comment ?? true,
            can_view_financials: collab.can_view_financials ?? false,
            can_view_time_entries: collab.can_view_time_entries ?? false,
            can_edit_tasks: collab.can_edit_tasks ?? false,
          }
        }
      }
    });

    if (emailResult.error) {
      console.error('[projectCollaboratorsApi] resendInvitation - email error:', emailResult.error);
      throw new Error('Failed to resend invitation email');
    }

    // Update the invited_at timestamp to track the resend
    await supabase
      .from('project_collaborators')
      .update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', collaboratorId);

    console.log('[projectCollaboratorsApi] resendInvitation - sent successfully to:', collab.invited_email);
  },

  // Accept an invitation
  async accept(id: string, userId: string, companyId: string): Promise<ProjectCollaborator> {
    const { data, error } = await supabase
      .from('project_collaborators')
      .update({
        status: 'accepted',
        invited_user_id: userId,
        invited_company_id: companyId,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Decline an invitation
  async decline(id: string): Promise<ProjectCollaborator> {
    const { data, error } = await supabase
      .from('project_collaborators')
      .update({
        status: 'declined',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update collaborator permissions
  async update(id: string, updates: Partial<{
    role: 'client' | 'collaborator' | 'viewer';
    relationship: 'my_client' | 'subcontractor' | 'partner';
    their_client_id: string;
    their_client_name: string;
    can_view_financials: boolean;
    can_view_time_entries: boolean;
    can_comment: boolean;
    can_invite_others: boolean;
    can_edit_tasks: boolean;
  }>): Promise<ProjectCollaborator> {
    const { data, error } = await supabase
      .from('project_collaborators')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Remove a collaborator
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_collaborators')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Set the collaborator's own client for this project
  async setTheirClient(id: string, clientId: string, clientName: string): Promise<ProjectCollaborator> {
    return this.update(id, {
      their_client_id: clientId,
      their_client_name: clientName
    });
  }
};

// ─── Transaction Categories (Accounting) ────────────────────────────

export const TAX_CLASSIFICATIONS = [
  { value: 'business_expense', label: 'Business Expense', description: 'Deductible operating expense' },
  { value: 'personal_draw', label: 'Personal / Owner Draw', description: 'Not deductible — owner withdrawal' },
  { value: 'owner_contribution', label: 'Owner Contribution', description: 'Capital invested by owner' },
  { value: 'income', label: 'Business Income', description: 'Revenue from sales and services' },
  { value: 'cost_of_goods', label: 'Cost of Goods Sold', description: 'Direct costs tied to projects/services' },
  { value: 'payroll', label: 'Payroll', description: 'Wages, salaries, and employee benefits' },
  { value: 'tax_payment', label: 'Tax Payment', description: 'Business taxes, licensing, permits' },
  { value: 'transfer', label: 'Transfer (Excluded)', description: 'Internal transfers — excluded from P&L' },
] as const;

export interface TransactionCategory {
  id: string;
  company_id: string;
  value: string;
  label: string;
  tax_classification: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export const transactionCategoryApi = {
  async getAll(companyId: string, includeInactive = false): Promise<TransactionCategory[]> {
    let query = supabase
      .from('transaction_categories')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as TransactionCategory[];
  },

  async create(category: Partial<TransactionCategory> & { company_id: string; value: string; label: string }): Promise<TransactionCategory> {
    const { data, error } = await supabase
      .from('transaction_categories')
      .insert({ ...category, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data as TransactionCategory;
  },

  async update(id: string, updates: Partial<TransactionCategory>): Promise<TransactionCategory> {
    const { data, error } = await supabase
      .from('transaction_categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as TransactionCategory;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('transaction_categories').delete().eq('id', id);
    if (error) throw error;
  },
};

// ===== Submittals Tracker =====

export interface Agency {
  id: string;
  company_id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  typical_response_days?: number;
  notes?: string;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SubmittalPackage {
  id: string;
  project_id: string;
  company_id: string;
  name: string;
  description?: string;
  version?: string;
  submitted_date?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  // Joined
  items?: SubmittalItem[];
  creator?: { id: string; full_name?: string };
}

export type SubmittalStatus =
  | 'not_submitted'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revisions_required'
  | 'resubmitted'
  | 'not_applicable';

export interface SubmittalItem {
  id: string;
  package_id: string;
  agency_id?: string;
  company_id: string;
  agency_name: string;
  status: SubmittalStatus;
  submitted_date?: string;
  submitted_by?: string;
  expected_response_date?: string;
  received_date?: string;
  response_notes?: string;
  tracking_number?: string;
  follow_up_date?: string;
  created_at?: string;
  updated_at?: string;
  // Joined
  agency?: Agency;
  submitter?: { id: string; full_name?: string };
  package?: SubmittalPackage;
}

export interface SubmittalActivity {
  id: string;
  submittal_item_id: string;
  company_id: string;
  action: string;
  old_status?: string;
  new_status?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  creator?: { id: string; full_name?: string };
}

export const submittalsApi = {
  // --- Agency Directory ---
  async getAgencies(companyId: string): Promise<Agency[]> {
    const { data, error } = await supabase
      .from('agency_directory')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_archived', false)
      .order('name');
    if (error) throw error;
    return (data || []) as Agency[];
  },

  async createAgency(agency: Partial<Agency> & { company_id: string; name: string }): Promise<Agency> {
    const { data, error } = await supabase
      .from('agency_directory')
      .insert(agency)
      .select()
      .single();
    if (error) throw error;
    return data as Agency;
  },

  async updateAgency(id: string, updates: Partial<Agency>): Promise<Agency> {
    const { data, error } = await supabase
      .from('agency_directory')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Agency;
  },

  async deleteAgency(id: string): Promise<void> {
    const { error } = await supabase
      .from('agency_directory')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // --- Submittal Packages ---
  async getPackages(projectId: string): Promise<SubmittalPackage[]> {
    const { data, error } = await supabase
      .from('submittal_packages')
      .select('*, creator:profiles!submittal_packages_created_by_fkey(id, full_name), items:submittal_items(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as SubmittalPackage[];
  },

  async createPackage(pkg: Partial<SubmittalPackage> & { project_id: string; company_id: string; name: string }): Promise<SubmittalPackage> {
    const { data, error } = await supabase
      .from('submittal_packages')
      .insert(pkg)
      .select()
      .single();
    if (error) throw error;
    return data as SubmittalPackage;
  },

  async updatePackage(id: string, updates: Partial<SubmittalPackage>): Promise<SubmittalPackage> {
    const { data, error } = await supabase
      .from('submittal_packages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as SubmittalPackage;
  },

  async deletePackage(id: string): Promise<void> {
    const { error } = await supabase.from('submittal_packages').delete().eq('id', id);
    if (error) throw error;
  },

  // --- Submittal Items ---
  async createItem(item: Partial<SubmittalItem> & { package_id: string; company_id: string; agency_name: string }): Promise<SubmittalItem> {
    const { data, error } = await supabase
      .from('submittal_items')
      .insert(item)
      .select()
      .single();
    if (error) throw error;
    return data as SubmittalItem;
  },

  async createItems(items: (Partial<SubmittalItem> & { package_id: string; company_id: string; agency_name: string })[]): Promise<SubmittalItem[]> {
    const { data, error } = await supabase
      .from('submittal_items')
      .insert(items)
      .select();
    if (error) throw error;
    return (data || []) as SubmittalItem[];
  },

  async updateItem(id: string, updates: Partial<SubmittalItem>): Promise<SubmittalItem> {
    const { data, error } = await supabase
      .from('submittal_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as SubmittalItem;
  },

  async deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('submittal_items').delete().eq('id', id);
    if (error) throw error;
  },

  // --- Submittal Activity ---
  async getActivity(submittalItemId: string): Promise<SubmittalActivity[]> {
    const { data, error } = await supabase
      .from('submittal_activity')
      .select('*, creator:profiles!submittal_activity_created_by_fkey(id, full_name)')
      .eq('submittal_item_id', submittalItemId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as SubmittalActivity[];
  },

  async logActivity(activity: {
    submittal_item_id: string;
    company_id: string;
    action: string;
    old_status?: string;
    new_status?: string;
    notes?: string;
    created_by?: string;
  }): Promise<SubmittalActivity> {
    const { data, error } = await supabase
      .from('submittal_activity')
      .insert(activity)
      .select()
      .single();
    if (error) throw error;
    return data as SubmittalActivity;
  },

  // --- Combined: Update item status + log activity ---
  async updateItemStatus(
    id: string,
    newStatus: SubmittalStatus,
    companyId: string,
    userId?: string,
    notes?: string,
    extraUpdates?: Partial<SubmittalItem>
  ): Promise<SubmittalItem> {
    // Get current status
    const { data: current } = await supabase
      .from('submittal_items')
      .select('status')
      .eq('id', id)
      .single();

    const oldStatus = current?.status || 'not_submitted';

    // Update item
    const updates: Partial<SubmittalItem> = { status: newStatus, ...extraUpdates };
    if (newStatus === 'submitted' && !extraUpdates?.submitted_date) {
      updates.submitted_date = new Date().toISOString().split('T')[0];
      updates.submitted_by = userId;
    }
    if (['approved', 'rejected', 'revisions_required'].includes(newStatus) && !extraUpdates?.received_date) {
      updates.received_date = new Date().toISOString().split('T')[0];
    }

    const item = await this.updateItem(id, updates);

    // Log activity
    await this.logActivity({
      submittal_item_id: id,
      company_id: companyId,
      action: `Status changed to ${newStatus.replace(/_/g, ' ')}`,
      old_status: oldStatus,
      new_status: newStatus,
      notes,
      created_by: userId,
    });

    return item;
  },
};
