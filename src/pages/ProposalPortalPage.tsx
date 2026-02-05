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
  
  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  const formatDate = (date: string | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Timeline calculation helper
  function getComputedStartOffsets(items: LineItem[]): Map<string, number> {
    const offsets = new Map<string, number>();
    let currentDay = 0;
    
    items.forEach((item, idx) => {
      if (idx === 0 || item.start_type === 'parallel') {
        offsets.set(item.id, item.start_offset || 0);
      } else if (item.start_type === 'sequential') {
        const depId = item.depends_on || items[idx - 1]?.id;
        const depOffset = offsets.get(depId) || 0;
        const depItem = items.find(i => i.id === depId);
        const depDays = depItem?.estimated_days || 0;
        offsets.set(item.id, depOffset + depDays);
      } else if (item.start_type === 'overlap') {
        const depId = item.depends_on || items[idx - 1]?.id;
        const depOffset = offsets.get(depId) || 0;
        offsets.set(item.id, depOffset + (item.overlap_days || 0));
      }
      currentDay = Math.max(currentDay, (offsets.get(item.id) || 0) + item.estimated_days);
    });
    
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

  // Main proposal view - NEW REFINED TEMPLATE
  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
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
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${quote.cover_background_url})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
                </div>
                <div className="relative z-10 h-full flex flex-col text-white p-12">
                  {/* Top Section */}
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      {company?.logo_url ? (
                        <img src={company.logo_url} alt={company.company_name} className="w-16 h-16 object-contain rounded-lg bg-white/10 mb-2" />
                      ) : (
                        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center text-2xl font-bold mb-2">
                          {company?.company_name?.charAt(0) || 'C'}
                        </div>
                      )}
                      <p className="text-white/70 text-sm">{company?.website}</p>
                    </div>
                  </div>
                  
                  {/* Client Info */}
                  <div className="mb-auto">
                    <p className="text-white/60 text-sm uppercase tracking-wider mb-2">Prepared For</p>
                    <h3 className="text-2xl font-semibold mb-1">{client?.name}</h3>
                    {client?.primary_contact_name && client.primary_contact_name !== client.name && (
                      <p className="text-white/80">{client.primary_contact_name}</p>
                    )}
                    <p className="text-white/60 mt-4">{formatDate(quote?.created_at)}</p>
                  </div>
                  
                  {/* Center - Project Title */}
                  <div className="text-center py-16">
                    <h1 className="text-5xl font-bold tracking-tight">{quote?.title || 'PROJECT PROPOSAL'}</h1>
                    <p className="text-lg text-white/70 mt-4">Proposal #{quote?.quote_number}</p>
                  </div>
                  
                  {/* Bottom - Company Info */}
                  <div className="mt-auto pt-8 border-t border-white/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-semibold">{company?.company_name}</p>
                        <p className="text-white/60 text-sm">{company?.address}</p>
                        <p className="text-white/60 text-sm">{company?.city}, {company?.state} {company?.zip}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/60 text-sm">{company?.phone}</p>
                        <p className="text-white/60 text-sm">{company?.website}</p>
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
              <div className="flex justify-between items-start mb-12">
                <div className="flex gap-4">
                  {company?.logo_url ? (
                    <img src={company.logo_url} alt={company.company_name} className="w-14 h-14 object-contain rounded-lg bg-neutral-100" />
                  ) : (
                    <div className="w-14 h-14 bg-neutral-100 rounded-lg flex items-center justify-center text-xl font-bold text-neutral-700">
                      {company?.company_name?.charAt(0) || 'C'}
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900">{company?.company_name}</h2>
                    <p className="text-sm text-neutral-600">{company?.address}</p>
                    <p className="text-sm text-neutral-600">{company?.city}, {company?.state} {company?.zip}</p>
                    <p className="text-sm text-neutral-500">{company?.phone} | {company?.website}</p>
                  </div>
                </div>
                <div className="text-right text-sm text-neutral-500">
                  <p>{formatDate(quote?.created_at)}</p>
                </div>
              </div>

              {/* Recipient */}
              <div className="mb-8">
                <p className="font-semibold text-neutral-900">{client?.name}</p>
                {client?.primary_contact_name && client.primary_contact_name !== client.name && (
                  <p className="text-neutral-600">{client.primary_contact_name}</p>
                )}
                {(client?.primary_contact_email || client?.email) && (
                  <p className="text-neutral-500 text-sm">{client.primary_contact_email || client.email}</p>
                )}
              </div>

              {/* Subject */}
              <div className="mb-8">
                <p className="text-neutral-900">
                  <span className="font-semibold">Subject:</span> {quote?.title || 'Project Proposal'}
                </p>
              </div>

              {/* Letter Body */}
              <div className="mb-8">
                <p className="text-neutral-900 mb-6">Dear {client?.primary_contact_name?.trim().split(' ')[0] || 'Valued Client'},</p>
                <div className="text-neutral-700 whitespace-pre-line leading-relaxed">
                  {quote?.letter_content || `Thank you for the potential opportunity to work together on the ${quote?.title || 'project'}. I have attached the proposal for your consideration which includes a thorough Scope of Work, deliverable schedule, and Fee.\n\nPlease review and let me know if you have any questions or comments. If you are ready for us to start working on the project, please sign the proposal sheet.`}
                </div>
              </div>

              {/* Closing */}
              <div className="mt-16">
                <p className="text-neutral-900 mb-8">Sincerely,</p>
                <div className="mt-12">
                  <p className="font-semibold text-neutral-900">{company?.company_name}</p>
                </div>
              </div>
            </div>
            {/* Page Footer */}
            <div className="absolute bottom-0 left-0 right-0 px-12 py-4 border-t border-neutral-100 flex justify-between text-xs text-neutral-400">
              <span>{company?.company_name}</span>
              <span>Page 1</span>
            </div>
          </div>

          {/* PAGE 3: Scope of Work & Timeline */}
          {(quote?.scope_of_work || lineItems.some(item => item.estimated_days > 0)) && (
            <div className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
              <div className="p-12 pb-20">
                <h2 className="text-2xl font-bold text-neutral-900 mb-8">Scope of Work & Project Timeline</h2>

                {/* Scope of Work */}
                {quote?.scope_of_work && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Scope of Work</h3>
                    <div className="text-neutral-700 whitespace-pre-line leading-relaxed border border-neutral-200 rounded-lg p-4">
                      {quote.scope_of_work}
                    </div>
                  </div>
                )}

                {/* Project Timeline */}
                {lineItems.some(item => item.estimated_days > 0) && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Project Timeline</h3>
                    <div className="border border-neutral-200 rounded-lg p-4">
                      {(() => {
                        const validItems = lineItems.filter(item => item.estimated_days > 0);
                        const computedOffsets = getComputedStartOffsets(validItems);
                        const maxEnd = Math.max(...validItems.map(item => (computedOffsets.get(item.id) || 0) + item.estimated_days));
                        const totalDays = maxEnd || 1;

                        return (
                          <div className="space-y-4">
                            {validItems.map((item, idx) => {
                              const startDay = computedOffsets.get(item.id) || 0;
                              const widthPercent = (item.estimated_days / totalDays) * 100;
                              const leftPercent = (startDay / totalDays) * 100;
                              const actualStartDay = startDay + 1;
                              const isCollaboratorTask = item.description.startsWith('[');
                              
                              return (
                                <div key={item.id}>
                                  {/* Task name */}
                                  <div className="mb-1.5 flex items-center gap-2">
                                    <span className="text-xs text-neutral-900 font-medium">{item.description}</span>
                                    <span className="text-[9px] text-neutral-400 font-medium">
                                      Day {actualStartDay} • {item.estimated_days}d
                                    </span>
                                  </div>
                                  {/* Timeline bar */}
                                  <div className="h-6 bg-neutral-100 rounded-full relative">
                                    <div
                                      className={`absolute h-full rounded-full flex items-center justify-center text-white text-[10px] font-medium ${isCollaboratorTask ? 'bg-amber-500' : 'bg-[#476E66]'}`}
                                      style={{
                                        left: `${leftPercent}%`,
                                        width: `${Math.max(widthPercent, 8)}%`
                                      }}
                                    >
                                      {item.estimated_days}d
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="pt-4 border-t border-neutral-200 text-sm text-neutral-600">
                              <span className="font-medium">Total Project Duration:</span> {totalDays} days
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
              {/* Page Footer */}
              <div className="absolute bottom-0 left-0 right-0 px-12 py-4 border-t border-neutral-100 flex justify-between text-xs text-neutral-400">
                <span>{company?.company_name}</span>
                <span>Page 2</span>
              </div>
            </div>
          )}

          {/* PAGE 4: Quote Details */}
          <div className="w-[850px] max-w-full bg-white shadow-xl print:shadow-none print:w-full print:max-w-none relative" style={{ minHeight: '1100px' }}>
            <div className="pb-20">
              {/* Header */}
              <div className="p-8 border-b border-neutral-200">
                <div className="flex justify-between">
                  <div className="flex gap-6">
                    {company?.logo_url ? (
                      <img src={company.logo_url} alt={company.company_name} className="w-16 h-16 object-contain rounded-xl bg-neutral-100" />
                    ) : (
                      <div className="w-16 h-16 bg-neutral-100 rounded-xl flex items-center justify-center text-2xl font-bold text-neutral-700">
                        {company?.company_name?.charAt(0) || 'C'}
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl font-bold text-neutral-900">{company?.company_name}</h2>
                      <p className="text-neutral-600">{company?.address}</p>
                      <p className="text-neutral-600">{company?.city}, {company?.state} {company?.zip}</p>
                      <p className="text-neutral-500 text-sm mt-1">{company?.website} | {company?.phone}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm">
                      <table className="text-left">
                        <tbody>
                          <tr><td className="pr-4 py-1 text-neutral-500">DATE:</td><td className="font-medium text-neutral-900">{formatDate(quote?.created_at)}</td></tr>
                          <tr><td className="pr-4 py-1 text-neutral-500">QUOTE #:</td><td className="font-medium text-neutral-900">{quote?.quote_number}</td></tr>
                          <tr><td className="pr-4 py-1 text-neutral-500">VALID UNTIL:</td><td className="font-medium text-neutral-900">{quote?.valid_until ? formatDate(quote.valid_until) : '-'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer */}
              <div className="px-8 py-4">
                <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Customer</h3>
                <div className="border border-neutral-200 rounded-lg p-5">
                  <div className="space-y-1">
                    <p className="font-semibold text-neutral-900">{client?.name}</p>
                    {client?.primary_contact_name && client.primary_contact_name !== client.name && (
                      <p className="text-neutral-600 text-sm">{client.primary_contact_name}</p>
                    )}
                    {(client?.primary_contact_email || client?.email) && (
                      <p className="text-neutral-500 text-sm">{client.primary_contact_email || client.email}</p>
                    )}
                    {(client?.primary_contact_phone || client?.phone) && (
                      <p className="text-neutral-500 text-sm">{client.primary_contact_phone || client.phone}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="px-8 py-4">
                <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Line Items</h3>
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200">
                        <th className="text-left px-5 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Description</th>
                        <th className="text-right px-4 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-24">Unit Price</th>
                        <th className="text-center px-4 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-16">Unit</th>
                        <th className="text-center px-4 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-12">Qty</th>
                        <th className="text-right px-5 py-3 font-medium text-neutral-600 text-xs uppercase tracking-wider w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {lineItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-3 text-neutral-900">{item.description}</td>
                          <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-3 text-center text-neutral-500 text-xs">{item.unit}</td>
                          <td className="px-4 py-3 text-center text-neutral-900">{item.quantity}</td>
                          <td className="px-5 py-3 text-right font-medium text-neutral-900">{formatCurrency(item.unit_price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="px-8 py-4 flex justify-end">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between py-1"><span className="text-neutral-600">Subtotal:</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
                  {taxRate > 0 && <div className="flex justify-between py-1"><span className="text-neutral-600">Tax ({taxRate}%):</span><span>{formatCurrency(taxDue)}</span></div>}
                  <div className="flex justify-between py-2 border-t-2 border-neutral-900 mt-2">
                    <span className="text-lg font-bold">TOTAL:</span>
                    <span className="text-lg font-bold">{formatCurrency(total)}</span>
                  </div>
                  {quote?.retainer_enabled && (
                    <div className="flex justify-between py-2 bg-amber-50 border border-amber-200 rounded-lg px-3 mt-2">
                      <span className="text-amber-800 font-medium">Deposit Due:</span>
                      <span className="text-amber-900 font-bold">
                        {formatCurrency(quote.retainer_type === 'percentage' 
                          ? subtotal * (quote.retainer_percentage || 0) / 100
                          : quote.retainer_amount || 0
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Terms */}
              {quote?.terms && (
                <div className="px-8 py-4">
                  <h3 className="font-bold text-neutral-900 mb-2">TERMS AND CONDITIONS</h3>
                  <div className="text-sm text-neutral-700 whitespace-pre-line">{quote.terms}</div>
                </div>
              )}

              {/* Signature Section */}
              <div className="px-8 py-6 border-t border-neutral-200 mt-4">
                <h3 className="font-bold text-neutral-900 mb-4">Customer Acceptance:</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    {existingResponse?.status === 'accepted' ? (
                      <>
                        <div className="border-b-2 border-emerald-600 pb-1 mb-2 h-10 flex items-end">
                          <span className="text-2xl font-serif italic text-emerald-700">{existingResponse.signer_name || 'Signed'}</span>
                        </div>
                        <p className="text-sm text-emerald-600">Signature ✓</p>
                      </>
                    ) : (
                      <>
                        <div className="border-b-2 border-neutral-900 pb-1 mb-2"><span className="text-2xl font-serif">X</span><span className="ml-4 text-neutral-400">___________________________</span></div>
                        <p className="text-sm text-neutral-500">Signature</p>
                      </>
                    )}
                  </div>
                  <div>
                    {existingResponse?.status === 'accepted' ? (
                      <>
                        <div className="border-b-2 border-emerald-600 pb-1 mb-2 h-10 flex items-end">
                          <span className="text-neutral-800">{existingResponse.signer_name || client?.name}</span>
                        </div>
                        <p className="text-sm text-emerald-600">Print Name ✓</p>
                      </>
                    ) : (
                      <>
                        <div className="border-b-2 border-neutral-900 pb-1 mb-2 h-8"></div>
                        <p className="text-sm text-neutral-500">Print Name</p>
                      </>
                    )}
                  </div>
                </div>
                {existingResponse?.status === 'accepted' && existingResponse.responded_at && (
                  <div className="mt-4 pt-4 border-t border-emerald-200 flex items-center gap-2 text-emerald-700">
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Digitally Signed on </span>
                    <span>{new Date(existingResponse.responded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Page Footer */}
            <div className="absolute bottom-0 left-0 right-0 px-12 py-4 border-t border-neutral-100 flex justify-between text-xs text-neutral-400">
              <span>{company?.company_name}</span>
              <span>Page {quote?.scope_of_work || lineItems.some(i => i.estimated_days > 0) ? '3' : '2'}</span>
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
