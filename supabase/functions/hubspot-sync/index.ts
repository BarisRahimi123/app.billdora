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
    const { email, full_name, phone_number, company_name } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hubspotKey = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!hubspotKey) {
      return new Response(
        JSON.stringify({ error: 'HubSpot not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Split full name into first and last
    const nameParts = (full_name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create or update contact in HubSpot
    const contactData = {
      properties: {
        email: email,
        firstname: firstName,
        lastname: lastName,
        phone: phone_number || '',
        company: company_name || '',
        lifecyclestage: 'lead',
        hs_lead_status: 'NEW',
      }
    };

    // Try to create contact
    const createResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hubspotKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactData),
    });

    const result = await createResponse.json();

    if (createResponse.status === 409) {
      // Contact exists, update instead
      const searchResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/search`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hubspotKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{
                propertyName: 'email',
                operator: 'EQ',
                value: email
              }]
            }]
          }),
        }
      );
      
      const searchResult = await searchResponse.json();
      if (searchResult.results && searchResult.results.length > 0) {
        const contactId = searchResult.results[0].id;
        
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${hubspotKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: contactData.properties }),
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Contact updated in HubSpot' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!createResponse.ok) {
      console.error('HubSpot error:', result);
      return new Response(
        JSON.stringify({ error: result.message || 'Failed to sync to HubSpot' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, contact_id: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('HubSpot sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
