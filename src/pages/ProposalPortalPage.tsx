import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Check, MessageSquare, Clock, FileText, Printer, Pen, X } from 'lucide-react';
import { formatCurrency, formatDate, paginateText } from '../lib/utils';

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
  letter_content?: string;
  terms?: string;
  tax_rate?: number;
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  const [submitting, setSubmitting] = useState(false);

  // Click-to-Sign consent
  const [consentChecked, setConsentChecked] = useState(false);
  const [showOptionalSignature, setShowOptionalSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

        // Track proposal view
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

        // Pre-fill signer name
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
  // Initialize canvas when optional signature is shown
  useEffect(() => {
    if (responseType === 'accept' && showOptionalSignature && canvasRef.current) {
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
  }, [responseType, showOptionalSignature]);

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

    // For acceptance, require consent checkbox
    if (responseType === 'accept' && !consentChecked) {
      setError('Please check the consent box to proceed');
      return;
    }

    setSubmitting(true);
    try {
      // Capture optional hand-drawn signature if provided
      let signatureData = null;
      if (responseType === 'accept' && showOptionalSignature && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        // Check if canvas has any drawing (not just white)
        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        const hasDrawing = imageData?.data.some((pixel, i) => i % 4 !== 3 && pixel !== 255);
        if (hasDrawing) {
          signatureData = canvas.toDataURL('image/png');
        }
      }

      // Build audit trail data
      const auditTrail = {
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        consentText: responseType === 'accept'
          ? `I, ${signerName}, have reviewed and agree to the terms of Proposal #${quote?.quote_number} for ${formatCurrency(total)}. I authorize ${company?.company_name} to begin work as outlined in this proposal.`
          : null,
        consentGiven: responseType === 'accept' ? consentChecked : null,
        documentHash: quote?.id // In production, this would be a hash of the document content
      };

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
          comments,
          auditTrail // Include audit trail for legal compliance
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
              setError('Signed successfully, but payment setup failed. Please contact support.');
            }
          } catch (payErr) {
            console.error('Payment redirect error:', payErr);
            setError('Signed successfully, but payment redirect failed.');
          }
        }

        const statusMapLocal: Record<string, string> = {
          accept: 'accepted',
          changes: 'changes_requested',
          discuss: 'discussion_requested',
          later: 'deferred'
        };
        setExistingResponse({
          status: statusMapLocal[responseType],
          signer_name: signerName,
          responded_at: new Date().toISOString(),
          audit_trail: auditTrail
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

  // Computed values
  const subtotal = (lineItems || []).reduce((sum, item) => sum + ((item?.unit_price || 0) * (item?.quantity || 0)), 0);
  const taxRate = quote?.tax_rate || 0;
  const taxDue = subtotal * (taxRate / 100);
  const total = subtotal + taxDue;



  // Timeline calculation helper
  function getComputedStartOffsets(items: LineItem[]): Map<string, number> {
    const offsets = new Map<string, number>();
    const itemMap = new Map(items.map(i => [i.id, i]));

    // Detect cycles: build dependency graph and check for circular refs
    const hasCycle = (startId: string, visited: Set<string>): boolean => {
      if (visited.has(startId)) return true;
      const item = itemMap.get(startId);
      if (!item || !item.depends_on || item.start_type === 'parallel') return false;
      visited.add(startId);
      return hasCycle(item.depends_on, visited);
    };

    // Calculate start for each item (with cycle protection)
    const getStart = (itemId: string, visited: Set<string>): number => {
      if (visited.has(itemId)) return 0; // Cycle detected, return 0
      visited.add(itemId);

      const item = itemMap.get(itemId);
      if (!item) return 0;

      if (item.start_type === 'parallel' || !item.depends_on) {
        return item.start_offset || 0;
      }

      const dep = itemMap.get(item.depends_on);
      if (!dep) return 0;

      const depStart = getStart(dep.id, visited);

      if (item.start_type === 'sequential') {
        return depStart + dep.estimated_days;
      } else if (item.start_type === 'overlap') {
        return depStart + Math.floor(item.overlap_days || 0);
      }
      return 0;
    };

    for (const item of items) {
      offsets.set(item.id, getStart(item.id, new Set()));
    }

    return offsets;
  }

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
    const auditData = existingResponse?.audit_trail;

    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 ${isAccepted ? 'bg-green-100' : 'bg-blue-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Check className={`w-8 h-8 ${isAccepted ? 'text-green-600' : 'text-blue-600'}`} />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
              {isAccepted ? 'Proposal Signed & Accepted!' : 'Response Submitted'}
            </h1>
            <p className="text-neutral-600">
              {isAccepted
                ? 'Your signature has been recorded. A confirmation email will be sent shortly.'
                : 'Your feedback has been sent. The team will review and get back to you soon.'}
            </p>
          </div>

          {/* Signature Confirmation Details */}
          {isAccepted && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Digital Signature Record
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-700">Signed By:</span>
                  <span className="font-medium text-green-900">{existingResponse?.signer_name || signerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Proposal:</span>
                  <span className="font-medium text-green-900">#{quote?.quote_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Amount:</span>
                  <span className="font-medium text-green-900">{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Date & Time:</span>
                  <span className="font-medium text-green-900">
                    {new Date(existingResponse?.responded_at || Date.now()).toLocaleString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                    })}
                  </span>
                </div>
                {auditData?.timezone && (
                  <div className="flex justify-between">
                    <span className="text-green-700">Timezone:</span>
                    <span className="font-medium text-green-900">{auditData.timezone}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-green-200">
                <p className="text-xs text-green-600">
                  This electronic signature is legally binding under the ESIGN Act and UETA.
                  A copy of this record has been saved for compliance purposes.
                </p>
              </div>
            </div>
          )}

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
            <p className="text-sm text-neutral-500 mt-6 text-center">
              Questions? Contact {company.company_name} at {company.phone}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Main proposal view - NEW REFINED TEMPLATE v2.1 (Feb 5 2026)

  // Pre-calculate page counts for accurate numbering
  const hasScope = !!quote?.scope_of_work;
  const hasTimeline = lineItems.some(item => item.estimated_days > 0);
  const rawScopePages = hasScope ? paginateText(quote?.scope_of_work || '') : [];
  // If no scope but timeline exists, we have at least 1 page
  if (rawScopePages.length === 0 && hasTimeline) rawScopePages.push('');

  // Check timeline overflow
  let timelineOverflows = false;
  if (hasTimeline && rawScopePages.length > 0) {
    const lastPageContent = rawScopePages[rawScopePages.length - 1];
    const pageScore = lastPageContent.split('').reduce((acc, char) => acc + (char === '\n' ? 120 : 1), 0);
    // If score >= 2000, timeline moves to next page
    if (pageScore >= 2000) timelineOverflows = true;
  }

  const totalScopePages = rawScopePages.length + (timelineOverflows ? 1 : 0);

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white" data-version="3.0-feb5">
      {/* Floating Header - Hidden when printing */}
      <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b z-50 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
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
          <div className="flex items-center gap-3">
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
        </div>
      </header>

      {/* Document Pages Container */}
      <main className="pt-20 pb-12 print:pt-0 print:pb-0">
        <div className="flex flex-col items-center gap-8 print:gap-0">

          {/* PAGE 1: Cover Page */}
          {quote?.cover_background_url && (
            <div className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none" style={{ minHeight: '1100px', aspectRatio: '8.5/11' }}>
              <div className="relative h-full">
                {/* Background Image & Overlay */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${quote.cover_background_url})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-zinc-900/90 via-zinc-900/40 to-black/60" />
                </div>

                {/* Content Container */}
                <div className="relative z-10 h-full flex flex-col text-white p-14">

                  {/* TOP HEADER */}
                  <div className="flex justify-between items-start">
                    {/* Brand / Logo */}
                    <div>
                      {company?.logo_url ? (
                        <img src={company.logo_url} alt={company.company_name} className="h-16 w-auto object-contain brightness-0 invert" />
                      ) : (
                        <div className="text-7xl font-light tracking-tighter leading-none opacity-90">
                          P
                        </div>
                      )}
                    </div>

                    {/* Date */}
                    <div className="text-sm font-medium tracking-wider opacity-80 pt-2">
                      {formatDate(quote?.created_at)}
                    </div>
                  </div>

                  {/* MAIN CONTENT AREA */}
                  <div className="flex-1 flex flex-col justify-center pl-2">

                    {/* Client Name Section */}
                    <div className="mb-10">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-0.5 h-3 bg-white/50"></div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">PREPARED FOR</p>
                      </div>
                      <h2 className="text-5xl font-thin tracking-wide text-white opacity-95">
                        {client?.name || 'Valued Client'}
                      </h2>
                    </div>

                    {/* Decorative Divider */}
                    <div className="w-24 h-px bg-white/20 mb-10"></div>

                    {/* Project Title Section */}
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-0.5 h-3 bg-white/50"></div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">PROJECT</p>
                      </div>
                      <h1 className="text-7xl font-bold text-white mb-4 leading-none tracking-tight">
                        {quote?.title || 'Project Proposal'}
                      </h1>
                      <p className="text-2xl font-light text-white/80">
                        Professional Services Proposal
                      </p>
                    </div>

                  </div>

                  {/* BOTTOM FOOTER */}
                  <div className="mt-auto">
                    {/* Divider Line */}
                    <div className="w-full h-px bg-white/10 mb-8"></div>

                    <div className="flex justify-between items-end">
                      {/* Total Investment */}
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2">TOTAL INVESTMENT</p>
                        <p className="text-5xl font-thin text-white tracking-tight">
                          {formatCurrency(total)}
                        </p>
                      </div>

                      {/* Reference Number */}
                      <div className="text-right pb-1">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2">PROPOSAL REFERENCE</p>
                        <p className="text-xl font-medium text-white/90 tracking-widest">
                          {quote?.quote_number}
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* PAGE 2: Letter Page */}
          <div className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
            <div className="p-12 pb-20">
              {/* Letterhead */}
              {/* HEADER - Logo Left, Company Info Right */}
              <div className="flex justify-between items-start mb-16">
                {/* Logo Box */}
                <div>
                  {company?.logo_url ? (
                    <img src={company.logo_url} alt={company.company_name} className="w-20 h-20 object-contain" />
                  ) : (
                    <div className="w-20 h-20 bg-neutral-900 flex items-center justify-center">
                      <span className="text-3xl font-bold text-white tracking-tighter">
                        {company?.company_name?.charAt(0) || 'C'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Company Contact Info - Right Aligned */}
                <div className="text-right">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1">{company?.company_name}</h3>
                  <div className="text-xs text-neutral-500 space-y-1">
                    <p>{company?.address}</p>
                    <p>{company?.city}, {company?.state} {company?.zip}</p>
                    <p>{company?.website?.replace(/^https?:\/\//, '')}</p>
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="mb-12">
                <p className="text-sm text-neutral-500">
                  {formatDate(quote?.created_at)}
                </p>
              </div>

              {/* Title Section */}
              <div className="mb-12 border-b border-neutral-100 pb-12">
                <h1 className="text-2xl font-bold text-neutral-900 mb-2">
                  Project Proposal: {quote?.title || 'Project'}
                </h1>
                <p className="text-lg text-neutral-500 font-light">
                  Prepared for {client?.name}
                </p>
              </div>

              {/* Main Letter Body */}
              <div className="mb-16">
                <p className="font-semibold text-neutral-900 mb-6">
                  Dear {client?.primary_contact_name?.trim().split(' ')[0] || 'Client'},
                </p>

                <div className="text-neutral-600 font-light leading-relaxed whitespace-pre-line text-lg">
                  {quote?.letter_content || `Thank you for the opportunity to work together on this project. We have prepared this proposal to outline our scope of work, timeline, and fee structure.

Our team is dedicated to delivering high-quality results that meet your specific needs.`}
                </div>
              </div>

              {/* Closing Signature */}
              <div>
                <p className="text-neutral-900 mb-6">Sincerely,</p>

                <div className="mt-8">
                  <p className="text-xl font-medium text-neutral-900 mb-1">
                    {signerName || 'Project Manager'}
                  </p>
                  <p className="font-bold text-sm text-neutral-900">
                    {signerName || 'Project Manager'}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {company?.company_name}
                  </p>
                </div>
              </div>
            </div>
            {/* Page Footer */}
            {/* Footer - Stick to bottom */}
            <div className="absolute bottom-0 left-0 right-0 px-16 py-8 border-t border-neutral-100/50">
              <div className="flex justify-between items-center text-[10px] tracking-widest text-neutral-400 uppercase">
                <div className="flex items-center gap-4">
                  <span>{company?.company_name}</span>
                  <span className="text-neutral-300">|</span>
                  <span>{company?.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                </div>
                <div>
                  PROPOSAL #{quote?.quote_number || 'NEW'}
                </div>
              </div>
            </div>
          </div>

          {/* PAGE 3: Scope & Timeline Sheets - Auto Paginated */}
          {(() => {
            const hasScope = !!quote?.scope_of_work;
            const hasTimeline = lineItems.some(item => item.estimated_days > 0);

            if (!hasScope && !hasTimeline) return null;

            const scopeContent = quote?.scope_of_work || '';
            const scopePages = hasScope ? paginateText(scopeContent) : [];
            // If no scope but we have timeline, treat as 1 empty scope page to render timeline
            if (scopePages.length === 0 && hasTimeline) scopePages.push('');

            return scopePages.map((pageContent, idx) => {
              const isLastPage = idx === scopePages.length - 1;

              // improved check for remaining space on page
              const pageScore = pageContent.split('').reduce((acc, char) => acc + (char === '\n' ? 120 : 1), 0);
              const renderTimelineHere = hasTimeline && isLastPage && pageScore < 2000;

              return (
                <div key={`scope-${idx}`} className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
                  <div className="p-12 md:p-16 flex-1 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-8 flex-shrink-0">
                      <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">
                        {idx === 0 ? 'Scope & Execution' : 'Scope & Execution (Cont.)'}
                      </h2>
                      <div className="h-px bg-neutral-200 flex-1"></div>
                    </div>

                    <div className="flex-1 overflow-hidden relative flex flex-col">
                      {/* FADE OUT for overflow if calculation fails slightly */}
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"></div>

                      {/* Scope Content Chunk */}
                      {pageContent && (
                        <div className="mb-8">
                          {idx === 0 && <h3 className="text-lg font-semibold text-neutral-900 mb-4">Project Scope</h3>}
                          <div className="text-neutral-700 whitespace-pre-wrap leading-relaxed text-sm">
                            {pageContent}
                          </div>
                        </div>
                      )}

                      {/* Timeline (if fitting on this page) */}
                      {renderTimelineHere && (
                        <div className="pt-8 mt-auto">
                          <h3 className="text-lg font-semibold text-neutral-900 mb-6">Estimated Timeline</h3>
                          {(() => {
                            const validItems = lineItems.filter(item => item.description.trim());
                            const computedOffsets = getComputedStartOffsets(validItems);
                            const minStart = Math.min(...validItems.map(item => computedOffsets.get(item.id) || 0));
                            const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimated_days));
                            const timelineRange = maxEnd - minStart;
                            const totalDays = maxEnd || 1;
                            const dayMarkers = [minStart + 1];
                            const step = timelineRange > 20 ? 5 : timelineRange > 10 ? 4 : 2;
                            for (let day = minStart + step; day < maxEnd; day += step) dayMarkers.push(day + 1);
                            if (dayMarkers[dayMarkers.length - 1] !== maxEnd) dayMarkers.push(maxEnd);

                            return (
                              <div className="flex-1 flex flex-col pt-8">
                                {/* Header */}
                                <div className="flex items-center text-[10px] text-neutral-400 pb-2 border-b border-neutral-100 mb-6">
                                  <span className="w-32">PROJECT SCHEDULE</span>
                                  <div className="flex-1 relative h-4">
                                    <span className="absolute left-0">Start (Day 1)</span>
                                    <span className="absolute right-0">Completion (Day {totalDays})</span>
                                  </div>
                                </div>

                                {/* Timeline Rows */}
                                <div className="space-y-6">
                                  {[...validItems].sort((a, b) => (computedOffsets.get(a.id) || 0) - (computedOffsets.get(b.id) || 0)).map((item) => {
                                    const start = computedOffsets.get(item.id) || 0;
                                    const left = ((start - minStart) / timelineRange) * 100;
                                    const width = (item.estimated_days / timelineRange) * 100;

                                    return (
                                      <div key={item.id} className="relative h-12 flex items-center border-b border-neutral-50 mb-4">
                                        {/* Background Guide Line */}
                                        <div className="absolute top-1/2 left-[128px] right-0 h-px bg-neutral-100 -translate-y-1/2"></div>

                                        {/* The Active Bar - Thinner and Centered */}
                                        <div className="absolute inset-0 w-full h-full">
                                          <div
                                            className={`absolute top-1/2 -translate-y-1/2 h-8 rounded ${item.description.startsWith('[') ? 'bg-amber-100' : 'bg-neutral-200'}`}
                                            style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                                          >
                                            {/* Collaborate Stripe */}
                                            {item.description.startsWith('[') && (
                                              <div className="absolute top-0 bottom-0 left-0 w-1 bg-amber-500 rounded-l"></div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Text Content */}
                                        <div className="relative z-10 w-full px-4 flex justify-between items-center text-sm">
                                          <span className="font-medium text-neutral-900 truncate pr-4">{item.description}</span>
                                          <span className="text-xs text-neutral-500 font-medium whitespace-nowrap">{item.estimated_days} Days</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="flex justify-end pt-4 mt-2 border-t border-neutral-100">
                                  <div className="text-sm font-bold text-neutral-900">Total Project Duration: {totalDays} Days</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Footer - Stick to bottom */}
                    <div className="absolute bottom-0 left-0 right-0 px-12 py-8 border-t border-neutral-100/50 bg-white">
                      <div className="flex justify-between items-center text-[10px] tracking-widest text-neutral-400 uppercase">
                        <div className="flex items-center gap-4">
                          <span>{company?.company_name}</span>
                          <span className="text-neutral-300">|</span>
                          <span>{company?.website}</span>
                        </div>
                        <div className="flex gap-4">
                          <span>Proposal #{quote?.quote_number}</span>
                          <span className="text-neutral-300">•</span>
                          <span>Page {idx + 2}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }).concat(
              // If we have a timeline but it didn't fit, render it on its own page
              (hasTimeline && (scopePages.length === 0 || scopePages[scopePages.length - 1].split('').reduce((acc, char) => acc + (char === '\n' ? 120 : 1), 0) >= 2000)) ? [(
                <div key="timeline-only" className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
                  <div className="p-12 md:p-16 flex-1 flex flex-col h-full">
                    <div className="flex items-center gap-4 mb-8 flex-shrink-0">
                      <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Project Schedule</h2>
                      <div className="h-px bg-neutral-200 flex-1"></div>
                    </div>

                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-neutral-900 mb-6">Estimated Timeline</h3>
                      {(() => {
                        const validItems = lineItems.filter(item => item.description.trim());
                        const computedOffsets = getComputedStartOffsets(validItems);
                        const minStart = Math.min(...validItems.map(item => computedOffsets.get(item.id) || 0));
                        const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimated_days));
                        const timelineRange = maxEnd - minStart;
                        const totalDays = maxEnd || 1;

                        return (
                          <div className="flex-1 flex flex-col">

                            {/* Header with Day Markers */}
                            <div className="flex items-center text-[10px] text-neutral-400 mb-6 border-b border-neutral-100 pb-2">
                              <span className="w-32">PROJECT SCHEDULE</span>
                              <div className="flex-1 relative h-4">
                                <span className="absolute left-0">Start (Day 1)</span>
                                <span className="absolute right-0">Completion (Day {totalDays})</span>
                              </div>
                            </div>

                            {/* Timeline Rows */}
                            <div className="space-y-6 flex-1">
                              {[...validItems].sort((a, b) => (computedOffsets.get(a.id) || 0) - (computedOffsets.get(b.id) || 0)).map((item) => {
                                const start = computedOffsets.get(item.id) || 0;
                                const left = ((start - minStart) / timelineRange) * 100;
                                const width = (item.estimated_days / timelineRange) * 100;

                                return (
                                  <div key={item.id} className="relative h-12 flex items-center border-b border-neutral-50">
                                    {/* Background Guide Line */}
                                    <div className="absolute top-1/2 left-[128px] right-0 h-px bg-neutral-100 -translate-y-1/2"></div>

                                    {/* The Active Bar - Thinner and Centered */}
                                    <div className="absolute inset-0 w-full h-full">
                                      <div
                                        className={`absolute top-1/2 -translate-y-1/2 h-8 rounded ${item.description.startsWith('[') ? 'bg-amber-100' : 'bg-neutral-200'}`}
                                        style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                                      >
                                        {/* Collaborate Stripe */}
                                        {item.description.startsWith('[') && (
                                          <div className="absolute top-0 bottom-0 left-0 w-1 bg-amber-500 rounded-l"></div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Text Content (Foreground Layer) - Full Width */}
                                    <div className="relative z-10 w-full px-4 flex justify-between items-center">
                                      <span className="font-medium text-neutral-900 truncate pr-4 text-sm">
                                        {item.description}
                                      </span>
                                      <span className="text-xs text-neutral-500 flex-shrink-0 font-medium whitespace-nowrap">
                                        {item.estimated_days} Days
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex justify-end pt-4 mt-2 border-t border-neutral-100">
                              <div className="text-sm font-bold text-neutral-900">Total Project Duration: {totalDays} Days</div>
                            </div>

                            {/* Footer - Stick to bottom */}
                            <div className="absolute bottom-0 left-0 right-0 px-12 py-8 border-t border-neutral-100/50 bg-white">
                              <div className="flex justify-between items-center text-[10px] tracking-widest text-neutral-400 uppercase">
                                <div className="flex items-center gap-4">
                                  <span>{company?.company_name}</span>
                                  <span className="text-neutral-300">|</span>
                                  <span>{company?.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                                </div>
                                <div className="flex gap-4">
                                  <span>PROPOSAL #{quote?.quote_number || 'NEW'}</span>
                                  <span className="text-neutral-300">•</span>
                                  <span>PAGE {scopePages.length + 2}</span>
                                </div>
                              </div>
                            </div>

                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )] : []
            )
          })()}

          {/* PAGE 4: Investment Breakdown */}
          <div className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
            <div className="p-10 md:p-12 flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Investment Breakdown</h2>
                <div className="h-px bg-neutral-200 flex-1"></div>
              </div>

              <div className="mb-4 flex-1 overflow-hidden">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="border-b-2 border-neutral-900">
                      <th className="text-left py-2 font-bold text-neutral-900 uppercase tracking-wider text-xs" style={{ width: '60%' }}>Service / Deliverable</th>
                      <th className="text-center py-2 font-bold text-neutral-900 uppercase tracking-wider text-xs" style={{ width: '15%' }}>Qty</th>
                      <th className="text-right py-2 font-bold text-neutral-900 uppercase tracking-wider text-xs" style={{ width: '25%' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {lineItems.filter(i => i.description.trim()).map(item => (
                      <tr key={item.id}>
                        <td className="py-2 pr-4" style={{ verticalAlign: 'top' }}>
                          <p className="font-semibold text-neutral-900 text-sm" style={{ marginBottom: '1px' }}>{item.description}</p>
                          <p className="text-neutral-500 text-xs" style={{ margin: 0 }}>{formatCurrency(item.unit_price)} / {item.unit}</p>
                        </td>
                        <td className="py-2 text-center text-neutral-600 text-sm" style={{ verticalAlign: 'top' }}>{item.quantity}</td>
                        <td className="py-2 text-right font-medium text-neutral-900 text-sm" style={{ verticalAlign: 'top' }}>{formatCurrency(item.unit_price * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end border-t-2 border-neutral-900 pt-4 mt-4">
                  <div className="w-56 space-y-2">
                    <div className="flex justify-between text-neutral-500 text-sm">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {taxRate > 0 && (
                      <div className="flex justify-between text-neutral-500 text-sm">
                        <span>Tax ({taxRate}%)</span>
                        <span>{formatCurrency(taxDue)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-2 border-t border-neutral-200">
                      <span className="font-bold text-neutral-900 text-sm">Total Investment</span>
                      <span className="text-xl font-bold text-neutral-900">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>

                {/* Retainer Inline */}
                {quote?.retainer_enabled && (
                  <div className="mt-4 bg-neutral-50 border border-neutral-200 p-3 flex items-center justify-between rounded-none border-l-4 border-l-neutral-900">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-bold text-neutral-900 text-sm">Retainer Required</p>
                        <p className="text-xs text-neutral-500">Due upon acceptance</p>
                      </div>
                    </div>
                    <span className="font-bold text-neutral-900">
                      {formatCurrency(quote.retainer_type === 'percentage' ? (subtotal * (quote.retainer_percentage || 0) / 100) : (quote.retainer_amount || 0))}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-auto pt-4 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider flex-shrink-0">
                <div className="flex gap-4">
                  <span>{company?.company_name}</span>
                  <span>|</span>
                  <span>{company?.website}</span>
                </div>
                <div className="flex gap-4">
                  <span>Proposal #{quote?.quote_number}</span>
                  <span>•</span>
                  <span>Page {totalScopePages + 2}</span>
                </div>
              </div>
            </div>
          </div>

          {/* PAGE 5: Terms & Acceptance */}
          <div className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
            <div className="p-12 md:p-16 flex-1 flex flex-col h-full">
              <div className="flex items-center gap-4 mb-8">
                <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Terms & Acceptance</h2>
                <div className="h-px bg-neutral-200 flex-1"></div>
              </div>

              {quote?.terms && (
                <div className="mb-12 flex-1">
                  <div className="text-neutral-600 text-xs leading-relaxed text-justify columns-1 md:columns-2 gap-8">
                    {quote.terms}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-16">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-widest mb-8">Authorization</h3>
                <p className="text-sm text-neutral-600 mb-12 max-w-2xl font-light">
                  By signing below, the Client agrees to the terms outlined in this proposal along with the payment schedule, and authorizes {company?.company_name} to proceed with the scope of work defined within.
                </p>

                {/* Signature Grid - 2x2 Layout */}
                <div className="grid grid-cols-2 gap-x-20 gap-y-16">

                  {/* Row 1: Signature & Printed Name */}

                  {/* Signature */}
                  <div className="relative group">
                    {existingResponse?.status === 'accepted' ? (
                      <>
                        <div className="absolute bottom-3 left-0 text-emerald-800 font-serif text-3xl italic select-none">
                          {existingResponse.signer_name || 'Signed'}
                        </div>
                        <div className="border-b border-neutral-300 h-12 w-full"></div>
                      </>
                    ) : (
                      <>
                        <div className="absolute bottom-3 left-0 text-neutral-900 font-serif text-4xl opacity-[0.08] select-none">X</div>
                        <div className="border-b border-neutral-300 h-10 w-full transition-colors group-hover:border-neutral-400"></div>
                      </>
                    )}
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Signature</p>
                  </div>

                  {/* Printed Name */}
                  <div>
                    <div className="border-b border-neutral-300 h-10 w-full flex items-end pb-1">
                      <span className="font-medium text-neutral-900 text-sm">
                        {existingResponse?.status === 'accepted' ? existingResponse.signer_name : ''}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Printed Name</p>
                  </div>

                  {/* Row 2: Title & Date */}

                  {/* Title */}
                  <div>
                    <div className="border-b border-neutral-300 h-8 w-full"></div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Title</p>
                  </div>

                  {/* Date */}
                  <div>
                    <div className="border-b border-neutral-300 h-8 w-full flex items-end pb-1">
                      {existingResponse?.status === 'accepted' && existingResponse.responded_at && (
                        <span className="font-medium text-neutral-900 text-sm">
                          {new Date(existingResponse.responded_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3">Date</p>
                  </div>

                </div>
              </div>

              {/* Footer */}
              <div className="mt-16 pt-8 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
                <div className="flex gap-4">
                  <span>{company?.company_name}</span>
                  <span>|</span>
                  <span>{company?.website}</span>
                </div>
                <div className="flex gap-4">
                  <span>Proposal #{quote?.quote_number}</span>
                  <span>•</span>
                  <span>Page {totalScopePages + 3}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons - Only shown when not printing */}
          <div className="print:hidden pb-8">
            {existingResponse?.status === 'accepted' ? (
              <button
                onClick={() => window.print()}
                className="px-8 py-4 bg-[#476E66] text-white rounded-xl font-semibold text-lg hover:bg-[#3A5B54] transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                Print / Save as PDF
              </button>
            ) : (
              <button
                onClick={() => setStep('respond')}
                className="px-8 py-4 bg-[#476E66] text-white rounded-xl font-semibold text-lg hover:bg-[#3A5B54] transition-colors"
              >
                Respond to This Proposal
              </button>
            )}
          </div>
        </div>
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
                    className="w-full p-4 border-2 border-[#476E66]/20 bg-[#476E66]/5 rounded-xl text-left hover:border-[#476E66]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#476E66] rounded-full flex items-center justify-center">
                        <Pen className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#476E66]">Request Changes</p>
                        <p className="text-sm text-[#476E66]/70">I'd like some modifications to the proposal</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResponseType('discuss')}
                    className="w-full p-4 border-2 border-[#476E66]/20 bg-[#476E66]/5 rounded-xl text-left hover:border-[#476E66]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#476E66] rounded-full flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#476E66]">Need to Discuss</p>
                        <p className="text-sm text-[#476E66]/70">I'd like to talk before making a decision</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResponseType('later')}
                    className="w-full p-4 border-2 border-[#476E66]/20 bg-[#476E66]/5 rounded-xl text-left hover:border-[#476E66]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#476E66] rounded-full flex items-center justify-center">
                        <Clock className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#476E66]">Not Right Now</p>
                        <p className="text-sm text-[#476E66]/70">The timing isn't right, but maybe later</p>
                      </div>
                    </div>
                  </button>
                </div>
              ) : responseType === 'accept' ? (
                <div className="space-y-5">
                  {/* Proposal Summary */}
                  <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm text-neutral-500">Proposal</p>
                        <p className="font-semibold text-neutral-900">{quote?.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-neutral-500">Total Amount</p>
                        <p className="text-xl font-bold text-neutral-900">{formatCurrency(total)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">Proposal #{quote?.quote_number}</p>
                  </div>

                  {/* Retainer Payment Notice */}
                  {quote?.retainer_enabled && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-bold">$</span>
                        </div>
                        <div>
                          <p className="font-semibold text-amber-900">Deposit Due Upon Signing</p>
                          <p className="text-2xl font-bold text-amber-800 mt-1">
                            {formatCurrency(quote.retainer_type === 'percentage'
                              ? subtotal * (quote.retainer_percentage || 0) / 100
                              : quote.retainer_amount || 0
                            )}
                          </p>
                          <p className="text-sm text-amber-700 mt-1">
                            You will be directed to payment after signing.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Signer Information */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Your Full Name *</label>
                      <input
                        type="text"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                        placeholder="Enter your full legal name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Title (Optional)</label>
                      <input
                        type="text"
                        value={signerTitle}
                        onChange={(e) => setSignerTitle(e.target.value)}
                        className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                        placeholder="e.g., Owner, CEO, Manager"
                      />
                    </div>
                  </div>

                  {/* Legal Consent Checkbox - Primary Signing Method */}
                  <div className={`border-2 rounded-lg p-4 transition-colors ${consentChecked ? 'border-green-500 bg-green-50' : 'border-neutral-200'}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                        className="mt-1 w-5 h-5 rounded border-neutral-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      />
                      <div className="text-sm">
                        <p className="font-medium text-neutral-900 mb-1">
                          I agree to the terms of this proposal
                        </p>
                        <p className="text-neutral-600 leading-relaxed">
                          By checking this box, I, <span className="font-semibold">{signerName || '[Your Name]'}</span>,
                          confirm that I have reviewed and agree to the terms of Proposal #{quote?.quote_number}
                          for <span className="font-semibold">{formatCurrency(total)}</span>.
                          I authorize <span className="font-semibold">{company?.company_name}</span> to
                          begin work as outlined in this proposal.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Optional Hand-Drawn Signature */}
                  <div className="border-t border-neutral-200 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowOptionalSignature(!showOptionalSignature)}
                      className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700"
                    >
                      <Pen className="w-4 h-4" />
                      {showOptionalSignature ? 'Hide' : 'Add'} hand-drawn signature (optional)
                    </button>

                    {showOptionalSignature && (
                      <div className="mt-3">
                        <p className="text-xs text-neutral-500 mb-2">Draw your signature below (optional - the checkbox above is the legal signature)</p>
                        <div className="border-2 border-dashed border-neutral-300 rounded-lg overflow-hidden bg-white">
                          <canvas
                            ref={canvasRef}
                            width={400}
                            height={120}
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
                        <button onClick={clearSignature} className="text-xs text-neutral-500 hover:text-neutral-700 mt-1">
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Signing Metadata Preview */}
                  <div className="bg-neutral-100 rounded-lg p-3 text-xs text-neutral-500">
                    <p className="font-medium text-neutral-600 mb-1">Digital Signature Record</p>
                    <p>Signed electronically on {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {new Date().toLocaleTimeString()}</p>
                    <p>Email: {client?.primary_contact_email || client?.email}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setResponseType(null); setConsentChecked(false); setShowOptionalSignature(false); }}
                      className="flex-1 px-4 py-3 border border-neutral-300 rounded-lg hover:bg-neutral-50 font-medium"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitResponse}
                      disabled={!signerName || !consentChecked || submitting}
                      className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Signing...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          Sign & Accept Proposal
                        </>
                      )}
                    </button>
                  </div>

                  {/* Legal Notice */}
                  <p className="text-[10px] text-neutral-400 text-center leading-relaxed">
                    By clicking "Sign & Accept Proposal", you agree that your electronic signature is the legal equivalent
                    of your manual signature on this proposal. This agreement is legally binding under the
                    Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).
                  </p>
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
// Build timestamp: 1770277308
