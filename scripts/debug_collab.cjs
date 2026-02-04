const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bqxnagmmegdbqrzhheip.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log('Searching for "Loop 25"...');

    const { data: quotesLike, error: quoteLikeError } = await supabase
        .from('quotes')
        .select('id, title, status')
        .ilike('title', '%Loop 25%');

    if (quoteLikeError) {
        console.error('Error fetching quotes:', quoteLikeError);
        return;
    }

    console.log(`Found ${quotesLike.length} quotes matching "Loop 25":`);
    quotesLike.forEach(q => console.log(JSON.stringify(q, null, 2)));

    if (quotesLike.length === 0) return;

    // Check collaborations for ALL matching quotes to be sure
    for (const quote of quotesLike) {
        console.log(`\nChecking collaborations for Quote ID: ${quote.id}`);

        const { data: collabs, error: collabError } = await supabase
            .from('proposal_collaborations')
            .select('*')
            .eq('parent_quote_id', quote.id);

        if (collabError) {
            console.error('Error fetching collaborations:', collabError);
            continue;
        }

        console.log(`Found ${collabs.length} collaborations:`);
        collabs.forEach(c => console.log(JSON.stringify(c, null, 2)));
    }
}

debug().catch(console.error);
