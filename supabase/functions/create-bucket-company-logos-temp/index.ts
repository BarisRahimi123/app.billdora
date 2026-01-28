import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
    const origin = req.headers.get('origin');
    const corsHeaders = getCorsHeaders(origin);

    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
    // Verify authorization header exists
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' }
        }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
        });
    }

    // Get service role key from environment
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!serviceRoleKey || !supabaseUrl) {
        return new Response(JSON.stringify({
        error: { code: 'CONFIG_ERROR', message: 'Missing Supabase configuration' }
        }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
        });
    }

    // Storage API endpoint
    const storageUrl = `${supabaseUrl}/storage/v1/bucket`;

    // Prepare bucket configuration
    const bucketConfig = {
        id: 'company-logos',
        name: 'company-logos',
        public: true,
        allowed_mime_types: ["image/*"],
        file_size_limit: 5242880
    };

    // Create bucket using Storage API
    const response = await fetch(storageUrl, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(bucketConfig)
    });

    const responseData = await response.json();

    if (!response.ok) {
        return new Response(JSON.stringify({
        error: {
            code: 'BUCKET_CREATION_FAILED',
            message: responseData.error || responseData.message || 'Failed to create bucket',
            status: response.status
        }
        }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
        });
    }

    // Create public access policies for the bucket
    const policyQueries = [
        `CREATE POLICY "Public Access for company-logos" ON storage.objects FOR SELECT USING (bucket_id = 'company-logos');`,
        `CREATE POLICY "Public Upload for company-logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'company-logos');`,
        `CREATE POLICY "Public Update for company-logos" ON storage.objects FOR UPDATE USING (bucket_id = 'company-logos');`,
        `CREATE POLICY "Public Delete for company-logos" ON storage.objects FOR DELETE USING (bucket_id = 'company-logos');`
    ];

    const policyResults = [];
    for (const query of policyQueries) {
        try {
        const policyResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            },
            body: JSON.stringify({ query: query })
        });

        if (policyResponse.ok) {
            policyResults.push(`Policy created: ${query.split(' ')[2]}`);
        } else {
            const errorText = await policyResponse.text();
            policyResults.push(`Policy failed: ${query.split(' ')[2]} - ${errorText}`);
        }
        } catch (policyError) {
        policyResults.push(`Policy error: ${policyError.message}`);
        }
    }

    return new Response(JSON.stringify({
        success: true,
        message: 'Bucket created successfully with public access policies',
        bucket: {
        name: 'company-logos',
        public: true,
        allowed_mime_types: ["image/*"],
        file_size_limit: 5242880,
        policies: policyResults
        }
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    } catch (error) {
    return new Response(JSON.stringify({
        error: { code: 'FUNCTION_ERROR', message: error.message }
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
    });
    }
});
