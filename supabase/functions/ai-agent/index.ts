// AI Agent Edge Function — Central router for all AI tasks
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Inlined CORS ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://app.billdora.com',
  'https://billdora.com',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

// ─── Inlined Auth ─────────────────────────────────────────────
interface AuthResult {
  authenticated: boolean;
  user?: { id: string; email?: string };
  error?: string;
}

async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { authenticated: false, error: 'Missing Authorization header' };
  const token = authHeader.replace('Bearer ', '');
  if (!token || token === authHeader) return { authenticated: false, error: 'Invalid Authorization format' };
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKey && token === serviceRoleKey) return { authenticated: true };
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { authenticated: false, error: error?.message || 'Invalid token' };
    return { authenticated: true, user: { id: user.id, email: user.email } };
  } catch (e) {
    return { authenticated: false, error: 'Token verification failed' };
  }
}

// ─── Service Role Client (for DB writes) ──────────────────────
function getServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}

// ─── Types ────────────────────────────────────────────────────
interface AiRequest {
  task: 'parse_receipt' | 'parse_statement' | 'generate_proposal' | 'chat' | 'categorize' | 'extract';
  payload: Record<string, any>;
  company_id: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

const CREDIT_COSTS: Record<string, number> = {
  parse_receipt: 1, parse_statement: 2, generate_proposal: 3, chat: 1, categorize: 1, extract: 1,
};

const PLAN_LIMITS: Record<string, number> = {
  free: 50, starter: 200, professional: 500, enterprise: 2000,
};

// ─── Auto-Categorization: Keyword Rules ──────────────────────
// Bank descriptions use abbreviations (ATT*, MSFT, SQ *, etc.) so we match those too
const CATEGORY_RULES: { keywords: string[]; category: string }[] = [
  // Software & Subscriptions
  { keywords: ['adobe', 'figma', 'slack', 'zoom', 'dropbox', 'google workspace', 'google storage', 'microsoft 365', 'microsoft office', 'msft', 'github', 'gitlab', 'atlassian', 'jira', 'notion', 'canva', 'hubspot', 'salesforce', 'quickbooks', 'xero', 'freshbooks', 'mailchimp', 'sendgrid', 'twilio', 'aws', 'amazon web services', 'azure', 'google cloud', 'gcloud', 'heroku', 'digital ocean', 'digitalocean', 'cloudflare', 'shopify', 'squarespace', 'wix', 'godaddy', 'namecheap', 'hover', 'openai', 'anthropic', 'vercel', 'netlify', 'supabase', 'mongodb', 'datadog', 'sentry', 'intercom', 'zendesk', 'calendly', 'docusign', 'loom', 'miro', 'airtable', 'zapier', 'make.com', 'grammarly', '1password', 'lastpass', 'bitwarden', 'nordvpn', 'expressvpn', 'chatgpt', 'spotify', 'apple.com/bill', 'icloud', 'google *', 'linkedin premium', 'semrush', 'ahrefs', 'hootsuite', 'buffer'], category: 'software' },
  // Utilities & Telecom
  { keywords: ['att*', 'at&t', 'at & t', 'verizon', 't-mobile', 'tmobile', 'sprint', 'comcast', 'xfinity', 'spectrum', 'cox comm', 'centurylink', 'lumen', 'frontier comm', 'electric', 'gas bill', 'water bill', 'power company', 'edison', 'pacific gas', 'con edison', 'duke energy', 'dominion energy', 'southern company', 'xcel energy', 'internet service', 'phone bill', 'utility payment', 'waste management', 'republic services'], category: 'utilities' },
  // Travel
  { keywords: ['delta air', 'united air', 'american air', 'southwest air', 'jetblue', 'spirit air', 'frontier air', 'alaska air', 'hilton', 'marriott', 'hyatt', 'airbnb', 'vrbo', 'booking.com', 'expedia', 'hotels.com', 'enterprise rent', 'hertz', 'avis', 'budget rent', 'national car', 'turo', 'amtrak', 'greyhound', 'tsa precheck', 'global entry', 'airline', 'hotel', 'flight', 'uber trip', 'lyft ride'], category: 'travel' },
  // Vehicle & Gas
  { keywords: ['shell', 'chevron', 'exxon', 'exxonmobil', 'exxon mobil', 'sunoco', 'valero', 'marathon petro', 'speedway', 'wawa', 'racetrac', 'circle k', 'quiktrip', 'loves travel', 'pilot flying', 'costco gas', "sam's gas", 'buc-ees', 'jiffy lube', 'valvoline', 'midas', 'firestone', 'goodyear', 'discount tire', 'autozone', 'advance auto', 'oreilly auto', "o'reilly auto", 'napa auto', 'car wash', 'bp gas', 'fuel', 'gasoline', 'arco'], category: 'vehicle' },
  // Meals & Entertainment
  { keywords: ['doordash', 'grubhub', 'uber eats', 'ubereats', 'postmates', 'seamless', 'caviar', 'instacart', 'starbucks', 'dunkin', 'mcdonalds', "mcdonald's", 'chipotle', 'chick-fil-a', 'panera', 'subway', 'wendy', 'burger king', 'taco bell', 'domino', 'pizza hut', 'papa john', 'olive garden', 'applebee', 'ihop', 'waffle house', 'five guys', 'shake shack', 'sweetgreen', 'cava grill', 'panda express', 'restaurant', 'cafe ', 'diner', 'bistro', 'catering', 'sq *', 'tst*', 'toast*'], category: 'meals' },
  // Office Supplies
  { keywords: ['staples', 'office depot', 'officemax', 'uline', 'quill.com', 'w.b. mason', 'toner', 'ink cartridge', 'office supply', 'usps', 'ups store', 'fedex office', 'stamps.com', 'pitney bowes'], category: 'office_supplies' },
  // Marketing & Advertising
  { keywords: ['meta ads', 'facebook ads', 'fb *', 'google ads', 'adwords', 'linkedin ads', 'twitter ads', 'x ads', 'tiktok ads', 'bing ads', 'yelp ads', 'thumbtack', 'angi leads', 'homeadvisor', 'facebook business', 'meta business', 'google marketing', 'vistaprint', 'moo.com', 'fiverr', 'upwork', '99designs', 'advertising', 'sponsorship', 'flyers', 'promo'], category: 'marketing' },
  // Insurance
  { keywords: ['geico', 'state farm', 'progressive', 'allstate', 'liberty mutual', 'usaa', 'nationwide', 'farmers ins', 'travelers ins', 'the hartford', 'hiscox', 'next insurance', 'simply business', 'general liability', 'workers comp', 'insurance premium', 'insurance payment'], category: 'insurance' },
  // Rent & Lease
  { keywords: ['rent payment', 'lease payment', 'monthly rent', 'office rent', 'warehouse rent', 'storage unit', 'public storage', 'extra space', 'cubesmart', 'life storage', 'regus', 'wework', 'industrious', 'coworking'], category: 'rent' },
  // Bank Fees
  { keywords: ['monthly maintenance fee', 'service charge', 'overdraft fee', 'nsf fee', 'wire transfer fee', 'atm fee', 'foreign transaction fee', 'account fee', 'annual fee', 'card fee', 'statement fee', 'bank charge', 'bank fee', 'monthly fee', 'analysis charge'], category: 'bank_fees' },
  // Taxes & Fees
  { keywords: ['irs ', 'eftps', 'internal revenue', 'tax payment', 'estimated tax', 'state tax', 'federal tax', 'sales tax', 'property tax', 'payroll tax', 'quarterly tax', 'annual tax'], category: 'taxes' },
  // Professional Services
  { keywords: ['attorney', 'law office', 'law firm', 'legal fee', 'legal service', 'cpa ', 'accountant', 'accounting fee', 'bookkeep', 'tax preparation', 'consultant', 'consulting fee', 'advisory fee', 'audit fee'], category: 'professional_services' },
  // Equipment
  { keywords: ['apple store', 'apple.com', 'best buy', 'b&h photo', 'adorama', 'newegg', 'dell.com', 'lenovo', 'hp store', 'samsung store', 'micro center', 'cdw ', 'tiger direct', 'monoprice', 'amazon.com'], category: 'equipment' },
  // Payroll & Wages
  { keywords: ['payroll', 'gusto', 'adp ', 'paychex', 'paylocity', 'rippling', 'justworks', 'square payroll', 'wage payment', 'salary payment', 'employee pay'], category: 'payroll' },
  // Loan Payments
  { keywords: ['loan payment', 'sba loan', 'line of credit', 'credit line', 'mortgage payment', 'principal payment', 'interest payment', 'kabbage', 'ondeck', 'bluevine', 'fundbox', 'lendio'], category: 'loan_payment' },
  // Materials & Supplies
  { keywords: ['home depot', 'lowes', "lowe's", 'menards', 'ace hardware', 'tractor supply', 'grainger', 'fastenal', 'lumber', 'supply house', 'plumbing supply', 'electrical supply', 'building material'], category: 'materials' },
  // Incoming Zelle / person-to-person (received payments = income) — must be before outgoing Zelle
  { keywords: ['zelle from', 'zelle payment from'], category: 'income' },
  // Zelle / Venmo / P2P payments — typically freelancer or subcontractor payments
  { keywords: ['zelle payment', 'zelle to', 'pmnt sent', 'venmo', 'cashapp', 'cash app', 'paypal'], category: 'professional_services' },
  // Internal account transfers (between own accounts only)
  { keywords: ['online transfer to chk', 'online transfer to sav', 'mobile transfer to chk', 'mobile transfer to sav', 'transfer to chk', 'transfer to sav', 'internal transfer', 'account transfer'], category: 'transfer' },
  // Refunds
  { keywords: ['refund', 'credit memo', 'chargeback', 'reversal'], category: 'refund' },
  // Income
  { keywords: ['deposit from', 'client payment', 'invoice payment', 'payment received', 'incoming wire', 'incoming ach', 'check deposit'], category: 'income' },
];

/**
 * Auto-categorize a transaction description using keyword rules.
 * Returns { category, category_source } or null if no match.
 */
function autoCategorize(description: string): { category: string; category_source: string } | null {
  if (!description) return null;
  const desc = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      const idx = desc.indexOf(keyword);
      if (idx === -1) continue;
      // Word-boundary check: make sure keyword isn't a partial match (e.g. "mobil" inside "mobile")
      const charAfter = desc[idx + keyword.length];
      if (charAfter === undefined || !/[a-z]/.test(charAfter)) {
        return { category: rule.category, category_source: 'auto' };
      }
    }
  }
  return null;
}

// ─── Claude API Client ───────────────────────────────────────
async function callClaude(opts: {
  system?: string;
  messages: ClaudeMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; input_tokens: number; output_tokens: number }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured. Set it in Supabase secrets.');

  const body: Record<string, any> = {
    model: opts.model || 'claude-sonnet-4-20250514',
    max_tokens: opts.maxTokens || 4096,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Claude API error:', response.status, errText);
    throw new Error(`Claude API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  return {
    text: result.content?.[0]?.text || '',
    input_tokens: result.usage?.input_tokens || 0,
    output_tokens: result.usage?.output_tokens || 0,
  };
}

// ─── Usage Tracker ───────────────────────────────────────────
async function trackUsage(companyId: string, userId: string, taskType: string, model: string, inputTokens: number, outputTokens: number, creditsUsed: number, metadata: Record<string, any> = {}): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from('ai_usage').insert({ company_id: companyId, user_id: userId, task_type: taskType, model, input_tokens: inputTokens, output_tokens: outputTokens, credits_used: creditsUsed, metadata });
  } catch (e) { console.error('Failed to track AI usage:', e); }
}

async function getMonthlyUsage(companyId: string): Promise<number> {
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  try {
    const db = getServiceClient();
    const { data: rows } = await db.from('ai_usage').select('credits_used').eq('company_id', companyId).gte('created_at', startOfMonth.toISOString());
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum: number, r: any) => sum + Number(r.credits_used || 0), 0);
  } catch { return 0; }
}

// ─── Task Handlers ───────────────────────────────────────────
async function handleParseReceipt(payload: any) {
  const { image_base64, mime_type } = payload;
  if (!image_base64) throw new Error('Missing image_base64');
  return callClaude({
    system: 'You are a receipt parser. Extract structured data from receipt images. Return ONLY valid JSON with no markdown.',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Extract from this receipt and return ONLY valid JSON:\n{\n  "vendor": "store name",\n  "date": "YYYY-MM-DD",\n  "total": 0.00,\n  "subtotal": 0.00,\n  "tax": 0.00,\n  "category": "office_supplies|meals|travel|utilities|software|equipment|marketing|professional_services|other",\n  "items": [{"description": "item", "amount": 0.00}],\n  "payment_method": "credit_card|cash|debit|check|other"\n}' }, { type: 'image', source: { type: 'base64', media_type: mime_type || 'image/jpeg', data: image_base64 } }] }],
    temperature: 0,
  });
}

async function handleParseStatement(payload: any, companyId: string) {
  const { file_base64, mime_type, statement_id } = payload;
  if (!file_base64) throw new Error('Missing file_base64');

  // Determine the correct content block type based on mime type
  const isPdf = (mime_type || '').includes('pdf');
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file_base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime_type || 'image/jpeg', data: file_base64 } };

  const result = await callClaude({
    system: 'You are a bank statement parser. Extract ALL transactions accurately. Return ONLY valid JSON with no markdown fences.',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Analyze this bank statement and extract ALL transactions. Return ONLY valid JSON (no markdown code fences):\n{\n  "accountName": "name on account",\n  "accountNumber": "last 4 digits",\n  "bankName": "bank name",\n  "periodStart": "YYYY-MM-DD",\n  "periodEnd": "YYYY-MM-DD",\n  "beginningBalance": 0.00,\n  "endingBalance": 0.00,\n  "transactions": [\n    {\n      "date": "YYYY-MM-DD",\n      "description": "full description",\n      "amount": -50.00,\n      "check_number": null\n    }\n  ]\n}\n\nRules:\n- Use NEGATIVE amounts for debits/withdrawals/payments\n- Use POSITIVE amounts for credits/deposits\n- Dates MUST be in YYYY-MM-DD format\n- Include ALL transactions, don\'t skip any' },
      contentBlock
    ] }],
    maxTokens: 8192,
    temperature: 0,
  });

  // Parse the Claude response
  let parsed: any;
  try {
    parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    console.error('Failed to parse Claude response as JSON:', result.text.substring(0, 500));
    throw new Error('Failed to parse AI response as JSON');
  }

  // ─── Save to database server-side using service role ────────
  const db = getServiceClient();
  const txCount = parsed.transactions?.length || 0;
  let autoCategorizedCount = 0;

  if (statement_id) {
    // Delete old transactions for this statement
    await db.from('bank_transactions').delete().eq('statement_id', statement_id);

    // Insert new transactions with auto-categorization
    if (txCount > 0) {
      const txToInsert = parsed.transactions.map((tx: any) => {
        const autoCategory = autoCategorize(tx.description);
        if (autoCategory) autoCategorizedCount++;
        return {
          statement_id: statement_id,
          company_id: companyId,
          transaction_date: tx.date,
          description: tx.description || '',
          amount: tx.amount,
          type: tx.amount >= 0 ? 'credit' : 'debit',
          check_number: tx.check_number || null,
          match_status: 'unmatched',
          ...(autoCategory ? { category: autoCategory.category, category_source: autoCategory.category_source } : {}),
        };
      });

      const { error: insertErr } = await db.from('bank_transactions').insert(txToInsert);
      if (insertErr) {
        console.error('Transaction insert error:', JSON.stringify(insertErr));
        await db.from('bank_statements').update({ status: 'error' }).eq('id', statement_id);
        throw new Error(`Failed to save transactions: ${insertErr.message}`);
      }
    }

    // Update statement with parsed data — only after transactions saved
    const { error: updateErr } = await db.from('bank_statements').update({
      account_name: parsed.accountName || 'Bank Account',
      account_number: parsed.accountNumber || '',
      period_start: parsed.periodStart || null,
      period_end: parsed.periodEnd || null,
      beginning_balance: parsed.beginningBalance || 0,
      ending_balance: parsed.endingBalance || 0,
      status: 'parsed',
    }).eq('id', statement_id);

    if (updateErr) {
      console.error('Statement update error:', JSON.stringify(updateErr));
    }
  }

  return {
    text: JSON.stringify({
      ...parsed,
      _saved: true,
      _transactionCount: txCount,
      _autoCategorizedCount: autoCategorizedCount,
    }),
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
  };
}

async function handleGenerateProposal(payload: any) {
  const { brief, client_name, project_type, company_name, existing_scope } = payload;
  const prompt = existing_scope
    ? `Improve and refine this proposal scope of work. Make it more professional, detailed, and well-structured.\n\nExisting scope:\n${existing_scope}\n\nClient: ${client_name || 'the client'}\nProject type: ${project_type || 'project'}`
    : `Generate a professional scope of work for a proposal.\n\nBrief: ${brief}\nClient: ${client_name || 'the client'}\nProject type: ${project_type || 'project'}\nCompany: ${company_name || 'our company'}\n\nWrite a detailed, professional scope of work with:\n- Project overview\n- Key deliverables (as bullet points)\n- Approach/methodology\n- Assumptions and exclusions\n\nUse professional language. Use bullet points (\u2022) for lists. Do NOT include pricing or timelines.`;
  return callClaude({
    system: 'You are an expert business proposal writer. Write clear, professional, and persuasive scope of work documents. Use bullet points (\u2022) for lists. Output plain text, not markdown.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.3,
  });
}

async function handleChat(payload: any) {
  const { message, history, context } = payload;
  const systemPrompt = `You are an AI assistant for Billdora, a business management platform for small businesses. You help users with:\n- Understanding their financial data\n- Creating and improving proposals\n- Managing projects and time tracking\n- Bookkeeping and tax preparation questions\n- General business advice\n\nBe concise, helpful, and actionable.${context ? `\n\nCurrent context:\n${JSON.stringify(context)}` : ''}`;
  const messages: ClaudeMessage[] = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: message });
  return callClaude({ system: systemPrompt, messages, maxTokens: 2048, temperature: 0.5 });
}

async function handleCategorize(payload: any) {
  const { transactions, valid_categories } = payload;
  if (!transactions || !Array.isArray(transactions)) throw new Error('Missing transactions array');

  // Use the client-provided categories if available, otherwise use defaults
  const categories = valid_categories || [
    'owner_draw', 'owner_contribution', 'payroll', 'rent', 'utilities', 'insurance',
    'office_supplies', 'software', 'equipment', 'travel', 'meals', 'vehicle',
    'professional_services', 'marketing', 'project_expense', 'materials',
    'subcontractor', 'freelancer', 'taxes', 'bank_fees', 'loan_payment',
    'income', 'refund', 'transfer', 'personal', 'other'
  ];

  return callClaude({
    system: `You are a bank transaction categorization expert for small businesses. You analyze bank statement line items and assign the most accurate category. Return ONLY valid JSON.

CRITICAL RULES:
- POSITIVE amounts (+) are CREDITS: deposits, client payments, refunds, income. These are usually "income" or "refund" or "owner_contribution".
- NEGATIVE amounts (-) are DEBITS: expenses, payments, withdrawals.
- ATM deposits and mobile check deposits from clients are "income", NOT "owner_draw".
- ATM withdrawals by the owner are "owner_draw".
- Zelle/Venmo/PayPal/CashApp payments TO named individuals are "professional_services" (freelancer/contractor payments), NOT "transfer".
- Only use "transfer" for internal account-to-account transfers (e.g., "online transfer to CHK 3509", "transfer to savings").
- Wire transfers TO companies or individuals for services are "professional_services", not "transfer".
- Only use "owner_draw" for cash withdrawals BY the business owner (ATM withdrawals, personal spending).
- Use "income" for any client payment, check deposit, Zelle received, or business revenue.`,
    messages: [{ role: 'user', content: `Categorize these bank transactions. Return ONLY a JSON array (no markdown):\n[{ "index": 0, "category": "category_value", "is_business": true }]\n\nYou MUST use ONLY these exact category values:\n${categories.join(', ')}\n\nTransactions:\n${JSON.stringify(transactions, null, 2)}` }],
    temperature: 0,
  });
}

async function handleExtract(payload: any) {
  const { document_base64, mime_type, instructions } = payload;
  if (!document_base64) throw new Error('Missing document_base64');

  const isPdf = (mime_type || '').includes('pdf');
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: document_base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime_type || 'image/jpeg', data: document_base64 } };

  return callClaude({
    system: 'You are a document data extraction specialist. Extract structured data from documents accurately. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: [
      { type: 'text', text: instructions || 'Extract all relevant information from this document and return it as structured JSON.' },
      contentBlock
    ] }],
    temperature: 0,
  });
}

// ─── Main Router ─────────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const auth = await verifyAuth(req);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: auth.error } }), { status: 401, headers: jsonHeaders });
  }

  try {
    let body: AiRequest;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const task = formData.get('task') as string;
      const companyId = formData.get('company_id') as string;
      const file = formData.get('file') as File | null;
      const payload: Record<string, any> = {};
      if (file) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode(...chunk);
        }
        payload.file_base64 = btoa(binary);
        payload.image_base64 = payload.file_base64;
        payload.mime_type = file.type;
        payload.filename = file.name;
      }
      for (const [key, value] of formData.entries()) {
        if (key !== 'task' && key !== 'company_id' && key !== 'file') payload[key] = value;
      }
      body = { task: task as AiRequest['task'], company_id: companyId, payload };
    } else {
      body = await req.json();
    }

    const { task, payload, company_id } = body;
    if (!task || !company_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing task or company_id' }), { status: 400, headers: jsonHeaders });
    }

    const currentUsage = await getMonthlyUsage(company_id);
    const creditCost = CREDIT_COSTS[task] || 1;
    const creditLimit = PLAN_LIMITS['professional'];
    if (currentUsage + creditCost > creditLimit) {
      return new Response(JSON.stringify({ success: false, error: 'AI credit limit reached for this month.' }), { status: 429, headers: jsonHeaders });
    }

    let result: { text: string; input_tokens: number; output_tokens: number };
    switch (task) {
      case 'parse_receipt': result = await handleParseReceipt(payload); break;
      case 'parse_statement': result = await handleParseStatement(payload, company_id); break;
      case 'generate_proposal': result = await handleGenerateProposal(payload); break;
      case 'chat': result = await handleChat(payload); break;
      case 'categorize': result = await handleCategorize(payload); break;
      case 'extract': result = await handleExtract(payload); break;
      default: return new Response(JSON.stringify({ success: false, error: `Unknown task: ${task}` }), { status: 400, headers: jsonHeaders });
    }

    let data: any = result.text;
    if (task !== 'chat' && task !== 'generate_proposal') {
      try { data = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim()); } catch { data = result.text; }
    }

    const userId = auth.user?.id || 'service';
    await trackUsage(company_id, userId, task, 'claude-sonnet-4-20250514', result.input_tokens, result.output_tokens, creditCost, {
      ...(payload.statement_id ? { statement_id: payload.statement_id } : {}),
    });

    return new Response(JSON.stringify({ success: true, data, usage: { input_tokens: result.input_tokens, output_tokens: result.output_tokens, credits_used: creditCost } }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error('AI Agent error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: jsonHeaders });
  }
});
