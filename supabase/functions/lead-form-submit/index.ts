// Public Lead Form Submission Handler
// This endpoint accepts form submissions without authentication

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { formId, name, email, phone, company, message } = await req.json();

    // Validate required fields
    if (!formId || !name || !email) {
      return new Response(JSON.stringify({ error: 'Name and email are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Supabase credentials from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch the form to get company_id and validate it exists/is active
    const formResponse = await fetch(
      `${supabaseUrl}/rest/v1/lead_forms?id=eq.${formId}&is_active=eq.true&select=id,company_id,require_phone,require_company,success_message,redirect_url,submission_count`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    const forms = await formResponse.json();
    if (!forms || forms.length === 0) {
      return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const form = forms[0];

    // Validate required fields based on form config
    if (form.require_phone && !phone) {
      return new Response(JSON.stringify({ error: 'Phone number is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (form.require_company && !company) {
      return new Response(JSON.stringify({ error: 'Company name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create the lead
    const leadData = {
      company_id: form.company_id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      company_name: company?.trim() || null,
      notes: message?.trim() || null,
      source: 'form',
      form_id: form.id,
      stage: 'new',
    };

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(leadData),
    });

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('Failed to create lead:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to submit form' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update form submission count
    await fetch(
      `${supabaseUrl}/rest/v1/lead_forms?id=eq.${form.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submission_count: form.submission_count + 1,
          last_submission_at: new Date().toISOString(),
        }),
      }
    );

    return new Response(JSON.stringify({
      success: true,
      message: form.success_message || 'Thank you! We\'ll be in touch soon.',
      redirect_url: form.redirect_url || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Lead form submission error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
