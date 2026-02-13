// Edge function to check for overdue submittal responses and create notifications
// Should be triggered daily via cron job

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];

    // Find submittal items that are pending and past expected response date
    const { data: overdueItems, error } = await supabase
      .from('submittal_items')
      .select(`
        id,
        agency_name,
        status,
        expected_response_date,
        submitted_date,
        company_id,
        package:submittal_packages(id, name, project_id, project:projects(id, name))
      `)
      .in('status', ['submitted', 'under_review', 'resubmitted'])
      .lt('expected_response_date', today);

    if (error) {
      console.error('Failed to fetch overdue submittals:', error);
      throw error;
    }

    console.log(`Found ${overdueItems?.length || 0} overdue submittal items`);

    const results = [];
    const milestones = [1, 3, 7, 14, 21, 30, 45, 60, 90];

    for (const item of overdueItems || []) {
      const expectedDate = new Date(item.expected_response_date);
      const todayDate = new Date(today);
      const daysOverdue = Math.floor((todayDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));

      // Only notify at milestone days
      if (!milestones.includes(daysOverdue)) continue;

      const pkg = item.package as any;
      const projectName = pkg?.project?.name || 'Unknown Project';
      const packageName = pkg?.name || 'Unknown Package';

      // Check if we already sent a notification for this milestone
      const { data: existingReminder } = await supabase
        .from('submittal_reminders')
        .select('id')
        .eq('submittal_item_id', item.id)
        .eq('reminder_date', today)
        .eq('status', 'sent')
        .maybeSingle();

      if (existingReminder) continue;

      // Create in-app notification
      try {
        await supabase.from('notifications').insert({
          company_id: item.company_id,
          type: 'submittal_overdue',
          title: '📋 Submittal Response Overdue',
          message: `${item.agency_name} has not responded to "${packageName}" (${projectName}) - ${daysOverdue} days overdue`,
          reference_id: pkg?.project_id || item.id,
          reference_type: 'project',
          is_read: false,
        });
      } catch (e) {
        console.warn('Failed to create notification:', e);
      }

      // Record the reminder
      try {
        await supabase.from('submittal_reminders').insert({
          submittal_item_id: item.id,
          company_id: item.company_id,
          reminder_date: today,
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed to record reminder:', e);
      }

      // Send email to admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('company_id', item.company_id)
        .eq('role', 'admin')
        .limit(3);

      for (const admin of admins || []) {
        try {
          const baseUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://billdora.com';
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              to: admin.email,
              subject: `📋 Submittal overdue: ${item.agency_name} - ${packageName}`,
              type: 'submittal_overdue',
              data: {
                agencyName: item.agency_name,
                packageName,
                projectName,
                daysOverdue,
                submittedDate: item.submitted_date ? new Date(item.submitted_date).toLocaleDateString() : 'N/A',
                expectedDate: new Date(item.expected_response_date).toLocaleDateString(),
                viewUrl: `${baseUrl}/projects/${pkg?.project_id}`,
              },
            }),
          });
        } catch (e) {
          console.warn('Failed to send email:', e);
        }
      }

      results.push({
        item_id: item.id,
        agency: item.agency_name,
        package: packageName,
        days_overdue: daysOverdue,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: overdueItems?.length || 0,
        notified: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Check overdue submittals error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to check overdue submittals' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
