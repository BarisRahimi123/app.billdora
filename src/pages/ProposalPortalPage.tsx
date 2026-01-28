import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Check, MessageSquare, Clock, FileText, Printer, Pen, X } from 'lucide-react';

interface Quote {
  id: string;
  quote_number: string;
  title: string;
  description: string;
  total_amount: number;
  valid_until: string;
  scope_of_work: string;
  created_at: string;
  cover_background_url: string;
  cover_volume_number: string;
  retainer_enabled?: boolean;
  retainer_type?: 'percentage' | 'fixed';
  retainer_percentage?: number;
  retainer_amount?: number;
}

interface LineItem {
  id: string;
  description: string;
  unit_price: number;
  quantity: number;
  unit: string;
  taxed: boolean;
  estimated_days: number;
  start_offset: number;
  depends_on: string;
  start_type: string;
  overlap_days: number;
}

interface Client {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
  primary_contact_name?: string;
  primary_contact_title?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  billing_contact_name?: string;
  billing_contact_title?: string;
  billing_contact_email?: string;
  billing_contact_phone?: string;
}

interface Company {
  company_id: string;
  company_name: string;
  logo_url: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  email?: string;
}

const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY';

export default function ProposalPortalPage() {
  const { token } = useParams();
  const [step, setStep] = useState<'loading' | 'code' | 'view' | 'respond' | 'complete' | 'error'>('loading');
  const [accessCode, setAccessCode] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [tokenId, setTokenId] = useState('');
  const [existingResponse, setExistingResponse] = useState<any>(null);
  
  // Response state
  const [responseType, setResponseType] = useState<'accept' | 'changes' | 'discuss' | 'later' | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [comments, setComments] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const codeInputRef0 = useRef<HTMLInputElement>(null);
  const codeInputRef1 = useRef<HTMLInputElement>(null);
  const codeInputRef2 = useRef<HTMLInputElement>(null);
  const codeInputRef3 = useRef<HTMLInputElement>(null);
  const codeInputRefs = [codeInputRef0, codeInputRef1, codeInputRef2, codeInputRef3];

  useEffect(() => {
    verifyToken();
  }, [token]);

  async function verifyToken() {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/proposal-response?token=${token}`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
        setStep('error');
        return;
      }
      
      if (data.valid && data.requiresCode) {
        setStep('code');
        setTimeout(() => codeInputRefs[0].current?.focus(), 100);
      }
    } catch (err) {
      setError('Unable to verify proposal link');
      setStep('error');
    }
  }

  async function verifyCode() {
    const code = accessCode.join('');
    if (code.length !== 4) return;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/proposal-response?token=${token}&code=${code}`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      const data = await res.json();
      
      console.log('[DEBUG] ProposalPortal received data:', JSON.stringify(data, null, 2));
      console.log('[DEBUG] quote.show_collaborators:', data.quote?.show_collaborators);
      console.log('[DEBUG] lineItems sample:', data.lineItems?.[0]);
      
      if (data.error) {
        setError(data.error);
        setAccessCode(['', '', '', '']);
        codeInputRefs[0].current?.focus();
        return;
      }
      
      if (data.verified) {
        setQuote(data.quote);
        setLineItems(data.lineItems || []);
        setClient(data.client);
        setCompany(data.company);
        setTokenId(data.tokenId);
        setExistingResponse(data.existingResponse);
        setError('');

        // Track proposal view (triggers push notification)
        if (data.quote?.id && data.company?.company_id) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/proposal-response`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                quoteId: data.quote.id,
                companyId: data.company.company_id,
                action: 'view'
              })
            });
          } catch (e) {
            console.warn('Failed to track proposal view:', e);
          }
        }
        
        // Pre-fill signer name from primary contact
        if (data.client?.primary_contact_name) {
          setSignerName(data.client.primary_contact_name);
        } else if (data.client?.name) {
          setSignerName(data.client.name);
        }
        
        if (data.existingResponse?.status === 'accepted') {
          setStep('complete');
        } else {
          setStep('view');
        }
      }
    } catch (err) {
      setError('Unable to verify code');
    }
  }

  function handleCodeInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = [...accessCode];
    newCode[index] = value.slice(-1);
    setAccessCode(newCode);
    setError('');

    if (value && index < 3) {
      codeInputRefs[index + 1].current?.focus();
    }

    if (newCode.every(d => d) && newCode.join('').length === 4) {
      setTimeout(() => verifyCode(), 100);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !accessCode[index] && index > 0) {
      codeInputRefs[index - 1].current?.focus();
    }
  }

  // Canvas signature functions
  useEffect(() => {
    if (responseType === 'accept' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#18181b';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }
  }, [responseType]);

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function submitResponse() {
    if (!responseType) return;
    
    setSubmitting(true);
    try {
      let signatureData = null;
      if (responseType === 'accept' && canvasRef.current) {
        signatureData = canvasRef.current.toDataURL('image/png');
      }

      const statusMap = {
        accept: 'accepted',
        changes: 'changes_requested',
        discuss: 'discussion_requested',
        later: 'deferred'
      };

      const res = await fetch(`${SUPABASE_URL}/functions/v1/proposal-response`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          tokenId,
          quoteId: quote?.id,
          companyId: company?.company_id,
          status: statusMap[responseType],
          responseType,
          signatureData,
          signerName,
          signerTitle,
          comments
        })
      });

      const data = await res.json();
      if (data.success) {
        // If accepted and retainer enabled, redirect to payment
        if (responseType === 'accept' && quote?.retainer_enabled) {
          try {
            const paymentRes = await fetch(`${SUPABASE_URL}/functions/v1/stripe-retainer-checkout`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
              },
              body: JSON.stringify({
                quote_id: quote.id,
                token_id: tokenId
              })
            });
            const paymentData = await paymentRes.json();
            if (paymentData.data?.checkout_url) {
              window.location.href = paymentData.data.checkout_url;
              return;
            } else {
              console.error('Failed to create payment session:', paymentData.error);
              // Still show complete but notify about payment issue
              setError('Signed successfully, but payment setup failed. Please contact support.');
            }
          } catch (payErr) {
            console.error('Payment redirect error:', payErr);
            setError('Signed successfully, but payment redirect failed.');
          }
        }

        // Update existingResponse so the view shows correct state
        const statusMapLocal: Record<string, string> = {
          accept: 'accepted',
          changes: 'changes_requested',
          discuss: 'discussion_requested',
          later: 'deferred'
        };
        setExistingResponse({
          status: statusMapLocal[responseType],
          signer_name: signerName,
          responded_at: new Date().toISOString()
        });
        setStep('complete');
      } else {
        setError(data.error || 'Failed to submit response');
      }
    } catch (err) {
      setError('Failed to submit response');
    }
    setSubmitting(false);
  }

  const subtotal = (lineItems || []).reduce((sum, item) => sum + ((item?.unit_price || 0) * (item?.quantity || 0)), 0);
  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  // Debug - log rendering
  console.log('ProposalPortalPage rendering, step:', step);

  // Loading state
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Error state
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Unable to Access Proposal</h1>
          <p className="text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }

  // Access code entry
  if (step === 'code') {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#476E66] rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Enter Access Code</h1>
            <p className="text-neutral-600">Please enter the 4-digit code from your email</p>
          </div>

          <div className="flex justify-center gap-3 mb-6">
            {accessCode.map((digit, idx) => (
              <input
                key={idx}
                ref={codeInputRefs[idx]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeInput(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-14 h-16 text-center text-2xl font-semibold border-2 border-neutral-200 rounded-xl focus:border-neutral-900 focus:ring-0 outline-none transition-colors"
              />
            ))}
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center mb-4">{error}</p>
          )}

          <button
            onClick={verifyCode}
            disabled={accessCode.join('').length !== 4}
            className="w-full py-3 bg-[#476E66] text-white rounded-xl font-medium hover:bg-[#3A5B54] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            Verify Code
          </button>

          <p className="text-neutral-500 text-sm text-center">
            Check your email for the access code sent with your proposal link.
          </p>
        </div>
      </div>
    );
  }

  // Complete state
  if (step === 'complete') {
    const isAccepted = responseType === 'accept' || existingResponse?.status === 'accepted';
    
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 ${isAccepted ? 'bg-green-100' : 'bg-blue-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <Check className={`w-8 h-8 ${isAccepted ? 'text-green-600' : 'text-blue-600'}`} />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
            {isAccepted ? 'Proposal Accepted!' : 'Response Submitted'}
          </h1>
          <p className="text-neutral-600 mb-6">
            {isAccepted 
              ? 'Thank you for accepting this proposal. A signed copy will be sent to your email shortly. The team has been notified and will be in touch soon.'
              : 'Your feedback has been sent. The team will review and get back to you soon.'}
          </p>
          {isAccepted && quote && (
            <div className="space-y-3">
              <button
                onClick={() => setStep('view')}
                className="w-full py-3 bg-[#476E66] text-white rounded-xl font-medium hover:bg-[#3A5B54] flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                View Signed Proposal
              </button>
              <button
                onClick={() => {
                  setStep('view');
                  setTimeout(() => window.print(), 500);
                }}
                className="w-full py-3 border-2 border-[#476E66] text-[#476E66] rounded-xl font-medium hover:bg-[#476E66]/5 flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                Print / Save as PDF
              </button>
            </div>
          )}
          {company && (
            <p className="text-sm text-neutral-500">
              Questions? Contact {company.company_name} at {company.phone}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Main proposal view
  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="" className="w-10 h-10 object-contain rounded-lg" />
            ) : (
              <div className="w-10 h-10 bg-[#476E66] rounded-lg flex items-center justify-center text-white font-bold">
                {company?.company_name?.charAt(0) || 'P'}
              </div>
            )}
            <div>
              <h1 className="font-semibold text-neutral-900">{company?.company_name}</h1>
              <p className="text-sm text-neutral-500">Proposal #{quote?.quote_number}</p>
            </div>
          </div>
          {existingResponse?.status === 'accepted' ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium">
              <Check className="w-5 h-5" />
              Signed
            </div>
          ) : (
            <button
              onClick={() => setStep('respond')}
              className="px-6 py-2.5 bg-[#476E66] text-white rounded-lg font-medium hover:bg-[#3A5B54] transition-colors"
            >
              Respond to Proposal
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Cover Page */}
        {quote?.cover_background_url && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div 
              className="relative h-80 bg-cover bg-center"
              style={{ backgroundImage: `url(${quote.cover_background_url})` }}
            >
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white text-center p-8">
                {company?.logo_url && (
                  <img src={company.logo_url} alt="" className="w-24 h-24 object-contain mb-6 bg-white/10 rounded-xl p-2" />
                )}
                <p className="text-sm uppercase tracking-widest mb-2 opacity-80">{quote.cover_volume_number || 'Proposal'}</p>
                <h1 className="text-3xl font-bold mb-2">{quote.title}</h1>
                <p className="text-lg opacity-90">Prepared for {client?.name}</p>
                <p className="text-sm mt-4 opacity-70">
                  {new Date(quote.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cover Letter */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
          {/* Letterhead */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-start gap-4">
              {company?.logo_url ? (
                <img src={company.logo_url} alt="" className="w-12 h-12 object-contain" />
              ) : (
                <div className="w-12 h-12 bg-[#476E66] rounded-lg flex items-center justify-center text-white font-bold text-xl">
                  {company?.company_name?.charAt(0) || 'P'}
                </div>
              )}
              <div>
                <p className="font-bold text-neutral-900 text-lg">{company?.company_name}</p>
                {company?.address && <p className="text-neutral-600 text-sm">{company.address}</p>}
                {(company?.city || company?.state || company?.zip) && (
                  <p className="text-neutral-600 text-sm">
                    {[company?.city, company?.state].filter(Boolean).join(', ')} {company?.zip}
                  </p>
                )}
                <p className="text-neutral-600 text-sm">
                  {company?.phone}{company?.phone && company?.website && ' | '}{company?.website}
                </p>
              </div>
            </div>
            <p className="text-neutral-500 text-sm">
              {quote?.created_at ? new Date(quote.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : ''}
            </p>
          </div>

          {/* Recipient */}
          <div className="mb-6">
            <p className="font-semibold text-neutral-900">{client?.name}</p>
            {client?.primary_contact_name && <p className="text-neutral-600 text-sm">{client.primary_contact_name}</p>}
            {(client?.primary_contact_email || client?.email) && (
              <p className="text-neutral-600 text-sm">{client.primary_contact_email || client.email}</p>
            )}
          </div>

          {/* Subject */}
          <div className="mb-6">
            <p className="text-neutral-900"><span className="font-semibold">Subject:</span> {quote?.title}</p>
          </div>

          {/* Greeting & Body */}
          <div className="mb-8">
            <p className="text-neutral-700 mb-4">Dear {client?.primary_contact_name?.trim().split(' ')[0] || 'Valued Client'},</p>
            <p className="text-neutral-700 mb-4">
              Thank you for the potential opportunity to work together on the {quote?.title}. I have attached the proposal for your consideration which includes a thorough Scope of Work, deliverable schedule, and Fee.
            </p>
            <p className="text-neutral-700">
              Please review and let me know if you have any questions or comments. If you are ready for us to start working on the project, please sign the proposal sheet.
            </p>
          </div>

          {/* Signature */}
          <div>
            <p className="text-neutral-700 mb-4">Sincerely,</p>
            <p className="font-semibold text-neutral-900">{company?.company_name}</p>
          </div>
        </div>

        {/* Project Info Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-8 mb-6">
            {/* From: Company */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">From</h3>
              <div className="space-y-1">
                <p className="font-semibold text-neutral-900 text-lg">{company?.company_name}</p>
                {company?.address && (
                  <p className="text-neutral-600 text-sm">{company.address}</p>
                )}
                {(company?.city || company?.state || company?.zip) && (
                  <p className="text-neutral-600 text-sm">
                    {[company?.city, company?.state].filter(Boolean).join(', ')} {company?.zip}
                  </p>
                )}
                {company?.phone && (
                  <p className="text-neutral-600 text-sm">{company.phone}</p>
                )}
                {company?.email && (
                  <p className="text-neutral-600 text-sm">{company.email}</p>
                )}
                {company?.website && (
                  <p className="text-neutral-600 text-sm">{company.website}</p>
                )}
              </div>
            </div>

            {/* To: Client */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Prepared For</h3>
              <div className="space-y-1">
                <p className="font-semibold text-neutral-900 text-lg">{client?.name}</p>
                {client?.primary_contact_name && (
                  <p className="text-neutral-700 text-sm">
                    <span className="font-medium">Attn:</span> {client.primary_contact_name}
                    {client.primary_contact_title && <span className="text-neutral-500"> ({client.primary_contact_title})</span>}
                  </p>
                )}
                {client?.address && (
                  <p className="text-neutral-600 text-sm">{client.address}</p>
                )}
                {(client?.city || client?.state || client?.zip) && (
                  <p className="text-neutral-600 text-sm">
                    {[client?.city, client?.state].filter(Boolean).join(', ')} {client?.zip}
                  </p>
                )}
                {(client?.primary_contact_email || client?.email) && (
                  <p className="text-neutral-600 text-sm">{client.primary_contact_email || client.email}</p>
                )}
                {(client?.primary_contact_phone || client?.phone) && (
                  <p className="text-neutral-600 text-sm">{client.primary_contact_phone || client.phone}</p>
                )}
                {/* Billing Contact if different from primary */}
                {client?.billing_contact_name && client.billing_contact_name !== client.primary_contact_name && (
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Billing Contact</p>
                    <p className="text-neutral-700 text-sm">
                      {client.billing_contact_name}
                      {client.billing_contact_title && <span className="text-neutral-500"> ({client.billing_contact_title})</span>}
                    </p>
                    {client.billing_contact_email && (
                      <p className="text-neutral-600 text-sm">{client.billing_contact_email}</p>
                    )}
                    {client.billing_contact_phone && (
                      <p className="text-neutral-600 text-sm">{client.billing_contact_phone}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Proposal Details Bar */}
          <div className="border-t pt-6">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">{quote?.title}</h2>
            {quote?.description && <p className="text-neutral-600 mb-4">{quote.description}</p>}
            <div className="flex flex-wrap gap-6 items-center">
              <div className="bg-neutral-50 rounded-lg px-4 py-2">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Proposal #</p>
                <p className="font-semibold text-neutral-900">{quote?.quote_number}</p>
              </div>
              <div className="bg-neutral-50 rounded-lg px-4 py-2">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Valid Until</p>
                <p className="font-semibold text-neutral-900">
                  {quote?.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
              <div className="bg-[#476E66]/10 rounded-lg px-4 py-2 ml-auto">
                <p className="text-xs text-[#476E66] uppercase tracking-wider">Total</p>
                <p className="font-bold text-[#476E66] text-xl">{formatCurrency(subtotal)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scope of Work */}
        {quote?.scope_of_work && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Scope of Work
            </h3>
            <p className="text-neutral-700 whitespace-pre-line">{quote.scope_of_work}</p>
          </div>
        )}

        {/* Line Items */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="p-6 border-b">
            <h3 className="font-semibold text-neutral-900">Services & Pricing</h3>
          </div>
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 uppercase">Description</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-neutral-500 uppercase">Price</th>
                <th className="text-center px-6 py-3 text-xs font-medium text-neutral-500 uppercase">Qty</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-neutral-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lineItems.map(item => (
                <tr key={item.id}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-neutral-900">{item.description}</p>
                    {item.estimated_days > 0 && (
                      <p className="text-sm text-neutral-500">{item.estimated_days} day{item.estimated_days > 1 ? 's' : ''}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-neutral-700">{formatCurrency(item.unit_price)}</td>
                  <td className="px-6 py-4 text-center text-neutral-700">{item.quantity} {item.unit}</td>
                  <td className="px-6 py-4 text-right font-medium text-neutral-900">{formatCurrency(item.unit_price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50">
              <tr>
                <td colSpan={3} className="px-6 py-4 text-right font-semibold text-neutral-900">Total</td>
                <td className="px-6 py-4 text-right font-bold text-xl text-neutral-900">{formatCurrency(subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Timeline */}
        {lineItems.some(item => item.estimated_days > 0) && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Project Timeline
            </h3>
            <div className="space-y-3">
              {(() => {
                // Calculate timeline positions
                const itemsWithDays = lineItems.filter(item => item.estimated_days > 0);
                let currentDay = 1;
                const schedule: { item: typeof lineItems[0]; startDay: number; endDay: number }[] = [];
                
                itemsWithDays.forEach((item, idx) => {
                  let startDay = currentDay;
                  if (item.start_type === 'parallel' || idx === 0) {
                    startDay = 1;
                  } else if (item.start_type === 'sequential' && schedule.length > 0) {
                    const depIdx = item.depends_on ? itemsWithDays.findIndex(i => i.id === item.depends_on) : schedule.length - 1;
                    if (depIdx >= 0 && schedule[depIdx]) {
                      startDay = schedule[depIdx].endDay + 1;
                    }
                  } else if (item.start_type === 'overlap' && schedule.length > 0) {
                    const depIdx = item.depends_on ? itemsWithDays.findIndex(i => i.id === item.depends_on) : schedule.length - 1;
                    if (depIdx >= 0 && schedule[depIdx]) {
                      startDay = schedule[depIdx].startDay + (item.overlap_days || 0);
                    }
                  }
                  const endDay = startDay + item.estimated_days - 1;
                  schedule.push({ item, startDay, endDay });
                  currentDay = Math.max(currentDay, endDay + 1);
                });

                const totalDays = Math.max(...schedule.map(s => s.endDay), 1);
                // Brand colors - teal/dark green palette
                const colors = ['#2D5A4F', '#3D6B5F', '#4D7C6F', '#5D8D7F', '#6D9E8F', '#7DAF9F'];

                return schedule.map((s, idx) => {
                  const leftPercent = ((s.startDay - 1) / totalDays) * 100;
                  const widthPercent = (s.item.estimated_days / totalDays) * 100;
                  return (
                    <div key={s.item.id} className="flex items-center gap-4">
                      <div className="w-40 flex-shrink-0 text-sm text-neutral-700 truncate">{s.item.description}</div>
                      <div className="flex-1 h-8 bg-neutral-100 rounded relative">
                        <div
                          className="absolute h-full rounded flex items-center px-2 text-white text-xs font-medium"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${Math.max(widthPercent, 8)}%`,
                            backgroundColor: colors[idx % colors.length]
                          }}
                        >
                          {s.item.estimated_days}d
                        </div>
                      </div>
                      <div className="w-24 text-xs text-neutral-500 text-right">
                        Day {s.startDay}-{s.endDay}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="mt-4 pt-4 border-t text-sm text-neutral-500">
              Total estimated duration: {Math.max(...lineItems.filter(i => i.estimated_days > 0).map((item, idx, arr) => {
                let start = 1;
                return start + item.estimated_days - 1;
              }), ...(() => {
                let maxEnd = 0;
                let currentDay = 1;
                lineItems.filter(i => i.estimated_days > 0).forEach(item => {
                  const end = currentDay + item.estimated_days - 1;
                  maxEnd = Math.max(maxEnd, end);
                  if (item.start_type !== 'parallel') currentDay = end + 1;
                });
                return [maxEnd];
              })())} days
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {existingResponse?.status === 'accepted' && (
          <div className="text-center mb-6 print:hidden">
            <button
              onClick={() => window.print()}
              className="px-8 py-4 bg-[#476E66] text-white rounded-xl font-semibold text-lg hover:bg-[#3A5B54] transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <Printer className="w-5 h-5" />
              Print / Save as PDF
            </button>
          </div>
        )}
        {existingResponse?.status !== 'accepted' && (
          <div className="text-center print:hidden">
            <button
              onClick={() => setStep('respond')}
              className="px-8 py-4 bg-[#476E66] text-white rounded-xl font-semibold text-lg hover:bg-[#3A5B54] transition-colors"
            >
              Respond to This Proposal
            </button>
          </div>
        )}
        {/* Signed Confirmation for Print */}
        {existingResponse?.status === 'accepted' && (
          <div className="hidden print:block bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-green-700 font-semibold text-lg mb-2">
              <Check className="w-6 h-6" />
              Proposal Accepted & Signed
            </div>
            <p className="text-green-600 text-sm">
              Signed by {existingResponse.signer_name} on {new Date(existingResponse.responded_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}
      </main>

      {/* Response Modal */}
      {step === 'respond' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-neutral-900">Your Response</h2>
              <button onClick={() => { setStep('view'); setResponseType(null); }} className="p-2 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!responseType ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setResponseType('accept')}
                    className="w-full p-4 border-2 border-green-200 bg-green-50 rounded-xl text-left hover:border-green-400 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-green-900">Accept & Sign</p>
                        <p className="text-sm text-green-700">I approve this proposal and am ready to proceed</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResponseType('changes')}
                    className="w-full p-4 border-2 border-[#2D5A4F]/20 bg-[#2D5A4F]/5 rounded-xl text-left hover:border-[#2D5A4F]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#2D5A4F] rounded-full flex items-center justify-center">
                        <Pen className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#2D5A4F]">Request Changes</p>
                        <p className="text-sm text-[#2D5A4F]/70">I'd like some modifications to the proposal</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResponseType('discuss')}
                    className="w-full p-4 border-2 border-[#2D5A4F]/20 bg-[#2D5A4F]/5 rounded-xl text-left hover:border-[#2D5A4F]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#2D5A4F] rounded-full flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#2D5A4F]">Need to Discuss</p>
                        <p className="text-sm text-[#2D5A4F]/70">I'd like to talk before making a decision</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResponseType('later')}
                    className="w-full p-4 border-2 border-[#2D5A4F]/20 bg-[#2D5A4F]/5 rounded-xl text-left hover:border-[#2D5A4F]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#2D5A4F] rounded-full flex items-center justify-center">
                        <Clock className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#2D5A4F]">Not Right Now</p>
                        <p className="text-sm text-[#2D5A4F]/70">The timing isn't right, but maybe later</p>
                      </div>
                    </div>
                  </button>
                </div>
              ) : responseType === 'accept' ? (
                <div className="space-y-4">
                  {/* Retainer Payment Notice */}
                  {quote?.retainer_enabled && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-bold">$</span>
                        </div>
                        <div>
                          <p className="font-semibold text-amber-900">Amount Due Upon Acceptance</p>
                          <p className="text-2xl font-bold text-amber-800 mt-1">
                            ${(quote.retainer_type === 'percentage' 
                              ? (lineItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0) * (quote.retainer_percentage || 0) / 100)
                              : (quote.retainer_amount || 0)
                            ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-sm text-amber-700 mt-1">
                            A retainer payment is required to begin this project. You will be directed to payment after signing.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Signing as</label>
                    <div className="w-full px-4 py-2.5 bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-900 font-medium">
                      {signerName || client?.primary_contact_name || client?.name || 'Client'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Title (Optional)</label>
                    <input
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent outline-none"
                      placeholder="e.g., Owner, Manager"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Signature *</label>
                    <div className="border-2 border-dashed border-neutral-300 rounded-lg overflow-hidden">
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={150}
                        className="w-full touch-none cursor-crosshair"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                      />
                    </div>
                    <button onClick={clearSignature} className="text-sm text-neutral-500 hover:text-neutral-700 mt-2">
                      Clear signature
                    </button>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setResponseType(null)}
                      className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-lg hover:bg-neutral-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitResponse}
                      disabled={!signerName || submitting}
                      className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting...' : 'Accept Proposal'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      {responseType === 'changes' ? 'What changes would you like?' : 
                       responseType === 'discuss' ? 'What would you like to discuss?' :
                       'Any comments? (Optional)'}
                    </label>
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent outline-none resize-none"
                      placeholder={responseType === 'changes' ? 'Please describe the changes you need...' :
                                   responseType === 'discuss' ? 'What questions or concerns do you have?' :
                                   'Any additional comments...'}
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setResponseType(null)}
                      className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-lg hover:bg-neutral-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitResponse}
                      disabled={submitting}
                      className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg font-medium hover:bg-[#3A5B54] disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : 'Submit Response'}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
