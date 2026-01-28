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

    // Helper to insert data into Supabase
    async function insertData(table: string, data: any[]) {
      if (data.length === 0) return { inserted: 0 };
      
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Insert error for ${table}:`, errorText);
      }
      
      return { inserted: data.length };
    }

    if (action === 'validate') {
      // Test connection by fetching firm info
      try {
        await bigTimeRequest('/session/staff');
        return new Response(JSON.stringify({ data: { valid: true } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        throw new Error('Invalid BigTime credentials: ' + e.message);
      }
    }

    if (action === 'import') {
      let result = { imported: 0, type: data_type };
      
      switch (data_type) {
        case 'clients': {
          const clients = await bigTimeRequest('/Client');
          const mapped = (clients || []).map((c: any) => ({
            company_id,
            name: c.Name || c.ClientName || 'Unknown Client',
            email: c.Email || null,
            phone: c.Phone || null,
            address: c.Address || null,
            city: c.City || null,
            state: c.State || null,
            zip: c.Zip || null,
            notes: `Imported from BigTime (ID: ${c.ClientId || c.Id})`,
            external_id: String(c.ClientId || c.Id)
          }));
          await insertData('clients', mapped);
          result.imported = mapped.length;
          break;
        }
        
        case 'projects': {
          const projects = await bigTimeRequest('/Project');
          const mapped = (projects || []).map((p: any) => ({
            company_id,
            name: p.Name || p.ProjectName || 'Unknown Project',
            description: p.Description || null,
            status: p.IsActive === false ? 'completed' : 'active',
            budget_amount: p.Budget || null,
            notes: `Imported from BigTime (ID: ${p.ProjectId || p.Id})`,
            external_id: String(p.ProjectId || p.Id)
          }));
          await insertData('projects', mapped);
          result.imported = mapped.length;
          break;
        }
        
        case 'tasks': {
          const tasks = await bigTimeRequest('/Task');
          const mapped = (tasks || []).map((t: any) => ({
            company_id,
            name: t.Name || t.TaskName || 'Unknown Task',
            description: t.Description || null,
            is_billable: t.IsBillable !== false,
            rate: t.Rate || null,
            external_id: String(t.TaskId || t.Id)
          }));
          await insertData('services', mapped);
          result.imported = mapped.length;
          break;
        }
        
        case 'staff': {
          const staff = await bigTimeRequest('/Staff');
          // Staff is informational - we log it but don't create user accounts
          result.imported = (staff || []).length;
          console.log('Staff data retrieved:', result.imported, 'records');
          break;
        }
        
        case 'time_entries': {
          // Fetch recent time entries (last 90 days)
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const timeEntries = await bigTimeRequest(`/Time?startDt=${startDate}&endDt=${endDate}`);
          const mapped = (timeEntries || []).map((t: any) => ({
            company_id,
            date: t.Date || t.EntryDate || new Date().toISOString().split('T')[0],
            hours: t.Hours || t.Qty || 0,
            description: t.Notes || t.Description || 'Imported from BigTime',
            billable: t.IsBillable !== false,
            external_id: String(t.TimeId || t.Id)
          }));
          await insertData('time_entries', mapped);
          result.imported = mapped.length;
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
