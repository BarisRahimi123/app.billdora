// Proposal response handler - self-contained
const ALLOWED_ORIGINS = [
  'https://app.billdora.com',
  'https://billdora.com',
  'https://app-billdora.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost'
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.vercel.app') || origin.endsWith('.minimax.io')
  ) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  try {
    const url = new URL(req.url);
    
    // GET: Verify token and get proposal data
    if (req.method === 'GET') {
      const token = url.searchParams.get('token');
      const accessCode = url.searchParams.get('code');

      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get token record
      const tokenRes = await fetch(
        `${SUPABASE_URL}/rest/v1/proposal_tokens?token=eq.${token}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );

      const tokens = await tokenRes.json();
      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const tokenRecord = tokens[0];

      // Check expiry
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This proposal link has expired' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // If code provided, verify it
      if (accessCode) {
        if (accessCode !== tokenRecord.access_code) {
          return new Response(JSON.stringify({ error: 'Invalid access code' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if this is the first view (to avoid duplicate notifications on refresh)
        const isFirstView = !tokenRecord.viewed_at;

        // Update viewed_at on token
        await fetch(`${SUPABASE_URL}/rest/v1/proposal_tokens?id=eq.${tokenRecord.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ viewed_at: new Date().toISOString() })
        });

        // Increment view_count and update last_viewed_at on quote
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_quote_view_count`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ quote_id_param: tokenRecord.quote_id })
        });

        // Create "Proposal Viewed" notification (only on first view)
        if (isFirstView) {
          // Get quote info for notification message
          const quoteInfoRes = await fetch(
            `${SUPABASE_URL}/rest/v1/quotes?id=eq.${tokenRecord.quote_id}&select=quote_number,title,client_id,lead_id`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          const quoteInfoArr = await quoteInfoRes.json();
          const quoteInfo = quoteInfoArr[0];

          // Get client/lead name
          let viewerName = 'A client';
          if (quoteInfo?.client_id) {
            const clientRes = await fetch(
              `${SUPABASE_URL}/rest/v1/clients?id=eq.${quoteInfo.client_id}&select=name,primary_contact_name`,
              {
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                }
              }
            );
            const clientArr = await clientRes.json();
            viewerName = clientArr[0]?.primary_contact_name || clientArr[0]?.name || 'A client';
          } else if (quoteInfo?.lead_id) {
            const leadRes = await fetch(
              `${SUPABASE_URL}/rest/v1/leads?id=eq.${quoteInfo.lead_id}&select=name,company_name`,
              {
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                }
              }
            );
            const leadArr = await leadRes.json();
            viewerName = leadArr[0]?.name || leadArr[0]?.company_name || 'A lead';
          }

          const proposalTitle = quoteInfo?.title || `Proposal #${quoteInfo?.quote_number || ''}`;

          // Create notification in database
          await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
              company_id: tokenRecord.company_id,
              type: 'proposal_viewed',
              title: "👀 Proposal Viewed",
              message: `${viewerName} opened "${proposalTitle}"`,
              reference_id: tokenRecord.quote_id,
              reference_type: 'quote',
              is_read: false
            })
          });

          // Send push notification
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              },
              body: JSON.stringify({
                companyId: tokenRecord.company_id,
                title: "👀 Proposal Viewed",
                body: `${viewerName} opened "${proposalTitle}"`,
                data: {
                  type: 'proposal_viewed',
                  quoteId: tokenRecord.quote_id,
                  referenceType: 'quote'
                }
              })
            });
            console.log('Push notification sent for proposal view');
          } catch (pushError) {
            console.error('Failed to send push notification for view:', pushError);
          }
        }

        // Get quote data
        const quoteRes = await fetch(
          `${SUPABASE_URL}/rest/v1/quotes?id=eq.${tokenRecord.quote_id}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const quotes = await quoteRes.json();

        // Get line items
        const itemsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/quote_line_items?quote_id=eq.${tokenRecord.quote_id}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const lineItems = await itemsRes.json();

        // Get client or lead
        let client = null;
        if (quotes[0]?.client_id) {
          const clientRes = await fetch(
            `${SUPABASE_URL}/rest/v1/clients?id=eq.${quotes[0].client_id}&select=*`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          const clients = await clientRes.json();
          client = clients[0];
        } else if (quotes[0]?.lead_id) {
          // Fetch lead data and map to client-like structure
          const leadRes = await fetch(
            `${SUPABASE_URL}/rest/v1/leads?id=eq.${quotes[0].lead_id}&select=*`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          const leads = await leadRes.json();
          const lead = leads[0];
          if (lead) {
            client = {
              id: lead.id,
              name: lead.company_name || lead.name,
              primary_contact_name: lead.name,
              primary_contact_email: lead.email,
              email: lead.email,
              phone: lead.phone,
              address: lead.address,
              city: lead.city,
              state: lead.state,
              zip: lead.zip
            };
          }
        } else if (tokenRecord.client_email) {
          // Fallback: use email from token if no client/lead linked
          client = {
            id: null,
            name: tokenRecord.client_email.split('@')[0],
            primary_contact_name: null,
            primary_contact_email: tokenRecord.client_email,
            email: tokenRecord.client_email
          };
        }

        // Get company settings
        const companyRes = await fetch(
          `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${tokenRecord.company_id}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const company = await companyRes.json();

        // Check existing response
        const responseRes = await fetch(
          `${SUPABASE_URL}/rest/v1/proposal_responses?token_id=eq.${tokenRecord.id}&select=*&order=responded_at.desc&limit=1`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const existingResponse = await responseRes.json();

        return new Response(JSON.stringify({
          verified: true,
          quote: quotes[0],
          lineItems,
          client: client,
          company: company[0],
          tokenId: tokenRecord.id,
          existingResponse: existingResponse[0] || null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // No code - just verify token exists
      return new Response(JSON.stringify({ 
        valid: true,
        requiresCode: true 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // POST: Submit response
    if (req.method === 'POST') {
      const { tokenId, quoteId, companyId, status, responseType, signatureData, signerName, signerTitle, comments } = await req.json();

      // Get client IP
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';

      // Save response
      const responseData = {
        token_id: tokenId,
        quote_id: quoteId,
        company_id: companyId,
        status,
        response_type: responseType,
        signature_data: signatureData || null,
        signer_name: signerName || null,
        signer_title: signerTitle || null,
        comments: comments || null,
        ip_address: ip,
        responded_at: new Date().toISOString()
      };

      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/proposal_responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(responseData)
      });

      if (!saveRes.ok) {
        throw new Error('Failed to save response');
      }

      // Get quote and client info for notifications
      const quoteInfoRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&select=*`, {
        headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      const quoteInfo = (await quoteInfoRes.json())[0];
      
      const clientInfoRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${quoteInfo?.client_id}&select=*`, {
        headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      const clientInfo = (await clientInfoRes.json())[0];
      const clientName = clientInfo?.primary_contact_name?.trim() || clientInfo?.name || 'Client';

      // Create notification for proposal response
      const notificationType = status === 'accepted' ? 'proposal_signed' : status === 'declined' ? 'proposal_declined' : 'proposal_response';
      const notificationTitle = status === 'accepted' ? '🎉 Proposal Signed!' : status === 'declined' ? 'Proposal Declined' : 'Proposal Response';
      const notificationMessage = status === 'accepted' 
        ? `${clientName} signed proposal #${quoteInfo?.quote_number || ''} - ${quoteInfo?.title || 'Untitled'}`
        : status === 'declined'
        ? `${clientName} declined proposal #${quoteInfo?.quote_number || ''}`
        : `${clientName} responded to proposal #${quoteInfo?.quote_number || ''}`;

      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          company_id: companyId,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          reference_id: quoteId,
          reference_type: 'quote',
          is_read: false
        })
      });

      // Send push notification via Firebase
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            companyId,
            title: notificationTitle,
            body: notificationMessage,
            data: {
              type: notificationType,
              quoteId,
              referenceType: 'quote'
            }
          })
        });
        console.log('Push notification sent for proposal response');
      } catch (pushError) {
        console.error('Failed to send push notification:', pushError);
      }

      // Update quote status if accepted and send confirmation email
      if (status === 'accepted') {
        await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ status: 'approved' })
        });

        // Fetch quote and client details for email
        const quoteRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&select=*`, {
          headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });
        const quotes = await quoteRes.json();
        const quote = quotes[0];

        const clientRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${quote?.client_id}&select=*`, {
          headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });
        const clients = await clientRes.json();
        const client = clients[0];

        const companyRes = await fetch(`${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${companyId}&select=*`, {
          headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });
        const companies = await companyRes.json();
        const company = companies[0];

        // Get the proposal token and access code for view URL
        const tokenRes = await fetch(`${SUPABASE_URL}/rest/v1/proposal_tokens?id=eq.${tokenId}&select=token,access_code`, {
          headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });
        const tokens = await tokenRes.json();
        const proposalToken = tokens[0]?.token;
        const accessCode = tokens[0]?.access_code;

        // Send confirmation email to client
        if (client?.email) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              },
              body: JSON.stringify({
                to: client.email,
                subject: `Proposal #${quote?.quote_number || ''} - Signed Confirmation`,
                type: 'signed_proposal',
                data: {
                  proposalNumber: quote?.quote_number,
                  proposalTitle: quote?.title,
                  clientName: client?.primary_contact_name || client?.name,
                  companyName: company?.company_name,
                  signerName: signerName,
                  signedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                  viewUrl: proposalToken ? `https://billdora.com/proposal/${proposalToken}` : null,
                  accessCode: accessCode
                }
              })
            });
          } catch (emailErr) {
            console.error('Failed to send confirmation email:', emailErr);
          }
        }

        // Check if there are merged collaborations ready to be signed by owner
        const collabsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/proposal_collaborations?parent_quote_id=eq.${quoteId}&status=eq.merged&select=id,collaborator_name,collaborator_company_name`,
          { headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
        );
        const mergedCollabs = await collabsRes.json();

        if (mergedCollabs && mergedCollabs.length > 0) {
          // Notify owner that collaborator proposals are ready to be signed
          const collabNames = mergedCollabs.map((c: any) => c.collaborator_name || c.collaborator_company_name || 'Collaborator').join(', ');
          
          await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
              company_id: companyId,
              type: 'collaborators_ready',
              title: '✍️ Collaborator Proposals Ready to Sign',
              message: `Your client approved "${quote?.title || 'the proposal'}". You can now sign and approve the proposals from: ${collabNames}`,
              reference_id: quoteId,
              reference_type: 'quote',
              is_read: false,
              metadata: { collaboration_count: mergedCollabs.length }
            })
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
