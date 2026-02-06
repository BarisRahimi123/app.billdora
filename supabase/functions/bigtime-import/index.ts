import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Verify authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return unauthorizedResponse(corsHeaders, auth.error);
  }

  try {
    const { action, company_id, api_token, firm_id, data_type } = await req.json();
    
    const BIGTIME_API_BASE = 'https://iq.bigtime.net/BigtimeData/api/v2';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    // Helper to make BigTime API requests
    async function bigTimeRequest(endpoint: string) {
      const response = await fetch(`${BIGTIME_API_BASE}${endpoint}`, {
        headers: {
          'X-Auth-Token': api_token,
          'X-Auth-Realm': firm_id,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BigTime API error: ${response.status} - ${errorText}`);
      }
      return response.json();
    }

    // Helper to insert/upsert data into Supabase with return
    async function upsertData(table: string, data: any[], conflictColumn = 'external_id') {
      if (data.length === 0) return [];
      
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Upsert error for ${table}:`, errorText);
        throw new Error(`Failed to insert ${table}: ${errorText}`);
      }
      
      return await response.json();
    }

    // Helper to query existing data
    async function queryData(table: string, filters: Record<string, string>) {
      const params = new URLSearchParams(filters);
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        return [];
      }
      
      return await response.json();
    }

    if (action === 'validate') {
      // Test connection by fetching firm info
      try {
        const staffData = await bigTimeRequest('/session/staff');
        return new Response(JSON.stringify({ 
          data: { 
            valid: true,
            firm_name: staffData?.FirmNm || 'Unknown',
            user_name: staffData?.Nm || 'Unknown'
          } 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        throw new Error('Invalid BigTime credentials: ' + e.message);
      }
    }

    if (action === 'preview') {
      // Return preview of what will be imported (counts and sample data)
      const preview: any = { data_type, counts: {} };
      
      switch (data_type) {
        case 'clients': {
          const clients = await bigTimeRequest('/Client');
          preview.counts.clients = (clients || []).length;
          preview.sample = (clients || []).slice(0, 3).map((c: any) => ({
            name: c.Nm || c.Name,
            code: c.ClientId,
            address: c.Address,
            phone: c.MainPH
          }));
          break;
        }
        case 'projects': {
          const projects = await bigTimeRequest('/Project');
          preview.counts.projects = (projects || []).length;
          preview.sample = (projects || []).slice(0, 3).map((p: any) => ({
            name: p.Nm || p.Name,
            code: p.ProjectCode,
            client_id: p.ClientId,
            status: p.IsInactive ? 'inactive' : 'active'
          }));
          break;
        }
        case 'tasks': {
          // Tasks require a project - get first project's tasks as sample
          const projects = await bigTimeRequest('/Project');
          if (projects && projects.length > 0) {
            const tasks = await bigTimeRequest(`/task/listByProject/${projects[0].SystemId}?showCompleted=true`);
            preview.counts.sample_project_tasks = (tasks || []).length;
            preview.sample = (tasks || []).slice(0, 3).map((t: any) => ({
              name: t.TaskNm,
              group: t.TaskGroup,
              status: t.CurrentStatus_nm,
              budget_hours: t.BudgetHours
            }));
          }
          break;
        }
        case 'time_entries': {
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const timeEntries = await bigTimeRequest(`/Time?startDt=${startDate}&endDt=${endDate}`);
          preview.counts.time_entries_30_days = (timeEntries || []).length;
          preview.sample = (timeEntries || []).slice(0, 3).map((t: any) => ({
            date: t.Dt,
            hours: t.Hours_IN,
            project: t.ProjectNm,
            notes: t.Notes?.substring(0, 50)
          }));
          break;
        }
      }
      
      return new Response(JSON.stringify({ data: preview }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'import') {
      let result: any = { imported: 0, type: data_type, details: {} };
      
      switch (data_type) {
        case 'clients': {
          // Fetch clients from BigTime - correct field names per API docs
          const clients = await bigTimeRequest('/Client');
          
          const mapped = (clients || []).map((c: any) => ({
            company_id,
            name: c.Nm || c.Name || 'Unknown Client',
            email: null, // BigTime clients don't have email at client level
            phone: c.MainPH || null,
            address: c.Address || null,
            city: c.City || null,
            state: c.State || null,
            zip: c.Zip || null,
            country: c.Country || null,
            notes: c.Notes || null,
            // Store BigTime SystemId as external_id for linking
            external_id: `bigtime_${c.SystemId}`,
            // Store additional BigTime fields in metadata
            metadata: JSON.stringify({
              bigtime_system_id: c.SystemId,
              bigtime_client_id: c.ClientId, // User-friendly code
              legal_name: c.LegalNm,
              main_fax: c.MainFX
            })
          }));
          
          const inserted = await upsertData('clients', mapped);
          result.imported = inserted.length;
          result.details.clients = inserted.length;
          break;
        }
        
        case 'projects': {
          // First, get existing clients to map BigTime ClientId → Billdora client_id
          const existingClients = await queryData('clients', {
            'company_id': `eq.${company_id}`,
            'external_id': 'like.bigtime_%'
          });
          
          // Build mapping: BigTime SystemId → Billdora client ID
          const clientMap: Record<string, string> = {};
          for (const client of existingClients) {
            try {
              const metadata = JSON.parse(client.metadata || '{}');
              if (metadata.bigtime_system_id) {
                clientMap[String(metadata.bigtime_system_id)] = client.id;
              }
            } catch (e) {
              // Skip invalid metadata
            }
          }
          
          // Fetch projects from BigTime
          const projects = await bigTimeRequest('/Project?ShowInactive=true');
          
          const mapped = (projects || []).map((p: any) => {
            // Find the Billdora client_id from the BigTime ClientId
            const billdoraClientId = clientMap[String(p.ClientId)] || null;
            
            return {
              company_id,
              client_id: billdoraClientId,
              name: p.Nm || p.Name || 'Unknown Project',
              description: p.Notes || null,
              status: p.IsInactive ? 'completed' : 'active',
              budget: p.BudgetFees || null,
              start_date: p.StartDt || null,
              end_date: p.EndDt || null,
              // Store BigTime SystemId as external_id for linking tasks
              external_id: `bigtime_${p.SystemId}`,
              metadata: JSON.stringify({
                bigtime_system_id: p.SystemId,
                bigtime_project_code: p.ProjectCode,
                bigtime_client_id: p.ClientId,
                display_name: p.DisplayName,
                billing_status: p.StatusBill,
                production_status: p.StatusProd
              })
            };
          });
          
          const inserted = await upsertData('projects', mapped);
          result.imported = inserted.length;
          result.details.projects = inserted.length;
          result.details.linked_to_clients = mapped.filter(p => p.client_id).length;
          result.details.unlinked = mapped.filter(p => !p.client_id).length;
          
          if (result.details.unlinked > 0) {
            result.warning = `${result.details.unlinked} projects could not be linked to clients. Import clients first.`;
          }
          break;
        }
        
        case 'tasks': {
          // Get existing projects to map BigTime ProjectSid → Billdora project_id
          const existingProjects = await queryData('projects', {
            'company_id': `eq.${company_id}`,
            'external_id': 'like.bigtime_%'
          });
          
          // Build mapping: BigTime SystemId → Billdora project ID
          const projectMap: Record<string, string> = {};
          for (const project of existingProjects) {
            try {
              const metadata = JSON.parse(project.metadata || '{}');
              if (metadata.bigtime_system_id) {
                projectMap[String(metadata.bigtime_system_id)] = project.id;
              }
            } catch (e) {
              // Skip invalid metadata
            }
          }
          
          // Fetch tasks for each project
          let allTasks: any[] = [];
          const projectSids = Object.keys(projectMap);
          
          for (const projectSid of projectSids) {
            try {
              const tasks = await bigTimeRequest(`/task/listByProject/${projectSid}?showCompleted=true`);
              if (tasks && Array.isArray(tasks)) {
                allTasks = allTasks.concat(tasks.map((t: any) => ({
                  ...t,
                  _billdora_project_id: projectMap[projectSid]
                })));
              }
            } catch (e) {
              console.log(`Failed to fetch tasks for project ${projectSid}:`, e);
            }
          }
          
          const mapped = allTasks.map((t: any) => ({
            company_id,
            project_id: t._billdora_project_id,
            name: t.TaskNm || 'Unknown Task',
            description: t.Notes || null,
            status: t.IsArchived ? 'completed' : (t.CurrentStatus_nm || 'pending'),
            estimated_hours: t.BudgetHours || null,
            due_date: t.DueDt || null,
            start_date: t.StartDt || null,
            external_id: `bigtime_task_${t.TaskSid}`,
            metadata: JSON.stringify({
              bigtime_task_sid: t.TaskSid,
              bigtime_project_sid: t.ProjectSid,
              task_group: t.TaskGroup,
              priority: t.Priority,
              budget_fees: t.BudgetFees,
              budget_expenses: t.BudgetExps,
              percent_complete: t.PerComp,
              assignments: t.AssignmentNames
            })
          }));
          
          const inserted = await upsertData('tasks', mapped);
          result.imported = inserted.length;
          result.details.tasks = inserted.length;
          result.details.from_projects = projectSids.length;
          break;
        }
        
        case 'staff': {
          const staff = await bigTimeRequest('/Staff');
          // Staff info - we return details but don't auto-create user accounts
          result.imported = (staff || []).length;
          result.details.staff = (staff || []).map((s: any) => ({
            name: `${s.FName || ''} ${s.SName || ''}`.trim(),
            email: s.EMail,
            title: s.Title,
            is_active: !s.IsInactive
          }));
          result.note = 'Staff data retrieved for reference. User accounts must be created manually in Billdora.';
          break;
        }
        
        case 'time_entries': {
          // Get existing projects to map BigTime ProjectSID → Billdora project_id
          const existingProjects = await queryData('projects', {
            'company_id': `eq.${company_id}`,
            'external_id': 'like.bigtime_%'
          });
          
          const projectMap: Record<string, string> = {};
          for (const project of existingProjects) {
            try {
              const metadata = JSON.parse(project.metadata || '{}');
              if (metadata.bigtime_system_id) {
                projectMap[String(metadata.bigtime_system_id)] = project.id;
              }
            } catch (e) {
              // Skip invalid metadata
            }
          }
          
          // Fetch time entries (last 90 days)
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const timeEntries = await bigTimeRequest(`/Time?startDt=${startDate}&endDt=${endDate}`);
          
          const mapped = (timeEntries || []).map((t: any) => {
            const billdoraProjectId = projectMap[String(t.ProjectSID)] || null;
            
            return {
              company_id,
              project_id: billdoraProjectId,
              date: t.Dt || new Date().toISOString().split('T')[0],
              hours: t.Hours_IN || 0,
              description: t.Notes || `Time from BigTime - ${t.ProjectNm || 'Unknown Project'}`,
              billable: !t.NoCharge,
              external_id: `bigtime_time_${Math.abs(t.SID)}`,
              metadata: JSON.stringify({
                bigtime_sid: t.SID,
                bigtime_project_sid: t.ProjectSID,
                bigtime_task_sid: t.TaskSID,
                bigtime_staff_sid: t.StaffSID,
                project_name: t.ProjectNm,
                client_name: t.ClientNm,
                staff_name: t.SourceNm,
                task_name: t.TaskNm,
                labor_code: t.BudgCatNm,
                bill_rate: t.BillRate,
                billable_charge: t.ChargeBillable,
                is_submitted: t.IsNew === false,
                is_approved: t.IsApproved
              })
            };
          });
          
          const inserted = await upsertData('time_entries', mapped);
          result.imported = inserted.length;
          result.details.time_entries = inserted.length;
          result.details.linked_to_projects = mapped.filter(t => t.project_id).length;
          result.details.unlinked = mapped.filter(t => !t.project_id).length;
          result.details.date_range = `${startDate} to ${endDate}`;
          
          if (result.details.unlinked > 0) {
            result.warning = `${result.details.unlinked} time entries could not be linked to projects. Import projects first.`;
          }
          break;
        }
        
        case 'expenses': {
          // Get existing projects for mapping
          const existingProjects = await queryData('projects', {
            'company_id': `eq.${company_id}`,
            'external_id': 'like.bigtime_%'
          });
          
          const projectMap: Record<string, string> = {};
          for (const project of existingProjects) {
            try {
              const metadata = JSON.parse(project.metadata || '{}');
              if (metadata.bigtime_system_id) {
                projectMap[String(metadata.bigtime_system_id)] = project.id;
              }
            } catch (e) {}
          }
          
          // Fetch expenses (last 90 days)
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const expenses = await bigTimeRequest(`/Expense?startDt=${startDate}&endDt=${endDate}`);
          
          const mapped = (expenses || []).map((e: any) => {
            const billdoraProjectId = projectMap[String(e.ProjectSID)] || null;
            
            return {
              company_id,
              project_id: billdoraProjectId,
              date: e.Dt || new Date().toISOString().split('T')[0],
              amount: e.Cost || e.Amount || 0,
              description: e.Notes || e.ExpCode_nm || 'Expense from BigTime',
              category: e.ExpCode_nm || 'Other',
              billable: !e.NoCharge,
              external_id: `bigtime_exp_${Math.abs(e.SID)}`,
              metadata: JSON.stringify({
                bigtime_sid: e.SID,
                bigtime_project_sid: e.ProjectSID,
                project_name: e.ProjectNm,
                staff_name: e.SourceNm,
                expense_code: e.ExpCode_nm,
                billable_amount: e.Billable,
                vendor: e.Vendor
              })
            };
          });
          
          const inserted = await upsertData('expenses', mapped);
          result.imported = inserted.length;
          result.details.expenses = inserted.length;
          result.details.date_range = `${startDate} to ${endDate}`;
          break;
        }
        
        default:
          throw new Error(`Unknown data type: ${data_type}`);
      }
      
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Invalid action');
    
  } catch (error: any) {
    console.error('BigTime import error:', error);
    return new Response(JSON.stringify({
      error: { code: 'BIGTIME_IMPORT_ERROR', message: error.message }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
