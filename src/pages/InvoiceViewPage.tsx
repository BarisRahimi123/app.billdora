import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, FileText, CreditCard, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY';

interface Invoice {
  id: string;
  company_id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  due_date: string;
  created_at: string;
  client: { name: string; email: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; website?: string };
  project: { name: string } | null;
}

interface CompanySettings {
  stripe_account_id?: string;
}

interface Company {
  company_name?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

export default function InvoiceViewPage() {
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check for payment callback
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      setPaymentMessage({ type: 'success', text: 'Payment successful! Your invoice has been paid.' });
      // Reload invoice to get updated status
      loadInvoice();
    } else if (payment === 'cancelled') {
      setPaymentMessage({ type: 'error', text: 'Payment was cancelled.' });
    }
  }, [searchParams]);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  async function loadInvoice() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoiceId}&select=*,client:clients(name,email,address,city,state,zip,phone,website),project:projects(name)`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      const data = await res.json();
      
      if (data.length === 0) {
        setError('Invoice not found');
        setLoading(false);
        return;
      }
      
      setInvoice(data[0]);

      // Track view via RPC (also creates notification)
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/track_invoice_view`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ p_invoice_id: invoiceId })
        });
      } catch (e) {
        console.warn('Failed to track view:', e);
      }

      // Fetch company info from company_settings
      const companyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${data[0].company_id}&select=company_name,logo_url,address,city,state,zip,phone,email`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      const companyData = await companyRes.json();
      if (companyData && companyData.length > 0) {
        setCompany(companyData[0]);
      }

      // Fetch company settings to check for Stripe connection
      const settingsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/company_settings?company_id=eq.${data[0].company_id}&select=stripe_account_id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      const settingsData = await settingsRes.json();
      if (settingsData && settingsData.length > 0) {
        setCompanySettings(settingsData[0]);
      }

      const itemsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/invoice_line_items?invoice_id=eq.${invoiceId}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      const itemsData = await itemsRes.json();
      setLineItems(itemsData || []);
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to load invoice:', err);
      setError('Failed to load invoice');
      setLoading(false);
    }
  }

  async function handlePayNow() {
    if (!invoice) return;
    setProcessingPayment(true);
    setPaymentMessage(null);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoice.id })
      });
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      // Redirect to Stripe Checkout
      window.location.href = result.data.checkout_url;
    } catch (err: any) {
      console.error('Payment error:', err);
      setPaymentMessage({ type: 'error', text: err.message || 'Failed to initiate payment' });
      setProcessingPayment(false);
    }
  }

  const canPay = invoice && 
    invoice.status !== 'paid' && 
    companySettings?.stripe_account_id && 
    invoice.total > 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#476E66] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Invoice Not Found</h1>
          <p className="text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-content { box-shadow: none !important; }
        }
      `}</style>
      
      <div className="min-h-screen bg-neutral-100 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Payment Message */}
          {paymentMessage && (
            <div className={`no-print mb-4 p-4 rounded-xl flex items-center gap-3 ${
              paymentMessage.type === 'success' 
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {paymentMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{paymentMessage.text}</span>
            </div>
          )}

          {/* Actions Bar */}
          <div className="no-print bg-white rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-[#476E66]" />
                <span className="font-semibold text-neutral-900">Invoice {invoice?.invoice_number}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                {invoice?.status === 'paid' ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-100 text-emerald-700 font-semibold rounded-lg min-h-[44px] w-full sm:w-auto">
                    <CheckCircle className="w-5 h-5" />
                    Paid - {formatCurrency(invoice?.total || 0)}
                  </div>
                ) : canPay ? (
                  <button
                    onClick={handlePayNow}
                    disabled={processingPayment}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#635BFF] text-white font-semibold rounded-lg text-lg shadow-lg hover:bg-[#5851DB] transition-colors disabled:opacity-50 min-h-[44px] w-full sm:w-auto"
                  >
                    {processingPayment ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5" />
                        Pay Online - {formatCurrency(invoice?.total || 0)}
                      </>
                    )}
                  </button>
                ) : null}
                <button
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 px-4 py-3 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors min-h-[44px] w-full sm:w-auto"
                >
                  <Download className="w-4 h-4" />
                  Print / Download PDF
                </button>
              </div>
            </div>
          </div>

          {/* Invoice Document */}
          <div className="print-content bg-white rounded-xl shadow-sm p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                {company?.logo_url && (
                  <img src={company.logo_url} alt="" className="h-12 w-auto object-contain mb-3" />
                )}
                <h2 className="text-xl font-bold text-neutral-900">{company?.company_name || 'Company'}</h2>
                {company?.address && <p className="text-sm text-neutral-600">{company.address}</p>}
                {(company?.city || company?.state || company?.zip) && (
                  <p className="text-sm text-neutral-600">
                    {[company.city, company.state, company.zip].filter(Boolean).join(', ')}
                  </p>
                )}
                {company?.phone && <p className="text-sm text-neutral-600">{company.phone}</p>}
              </div>
              <div className="text-right">
                <h1 className="text-3xl font-bold text-neutral-900 mb-1">INVOICE</h1>
                <p className="text-neutral-500">#{invoice?.invoice_number}</p>
              </div>
            </div>

            {/* Invoice Dates */}
            <div className="flex justify-end mb-8">
              <div className="text-right">
                <p className="text-sm text-neutral-500">Invoice Date</p>
                <p className="font-medium">{new Date(invoice?.created_at || '').toLocaleDateString()}</p>
                {invoice?.due_date && (
                  <>
                    <p className="text-sm text-neutral-500 mt-2">Due Date</p>
                    <p className="font-medium">{new Date(invoice.due_date).toLocaleDateString()}</p>
                  </>
                )}
              </div>
            </div>
            {/* Bill To */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-2">BILL TO</p>
                <p className="font-semibold text-lg text-neutral-900">{invoice?.client?.name}</p>
                {invoice?.client?.address && <p className="text-neutral-600">{invoice.client.address}</p>}
                {(invoice?.client?.city || invoice?.client?.state || invoice?.client?.zip) && (
                  <p className="text-neutral-600">
                    {[invoice.client.city, invoice.client.state, invoice.client.zip].filter(Boolean).join(', ')}
                  </p>
                )}
                
                {invoice?.client?.phone && <p className="text-neutral-600">{invoice.client.phone}</p>}
                {invoice?.client?.website && <p className="text-neutral-600">{invoice.client.website}</p>}
              </div>
              {invoice?.project && (
                <div>
                  <p className="text-sm font-medium text-neutral-500 mb-2">PROJECT</p>
                  <p className="font-semibold text-neutral-900">{invoice.project.name}</p>
                </div>
              )}
            </div>

            {/* Line Items */}
            <table className="w-full mb-8">
              <thead>
                <tr className="border-b-2 border-neutral-200">
                  <th className="text-left py-3 text-sm font-semibold text-neutral-600">Description</th>
                  <th className="text-right py-3 text-sm font-semibold text-neutral-600 w-24">Qty</th>
                  <th className="text-right py-3 text-sm font-semibold text-neutral-600 w-32">Rate</th>
                  <th className="text-right py-3 text-sm font-semibold text-neutral-600 w-32">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length > 0 ? (
                  lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-neutral-100">
                      <td className="py-4 text-neutral-900">{item.description}</td>
                      <td className="py-4 text-right text-neutral-600">{item.quantity}</td>
                      <td className="py-4 text-right text-neutral-600">{formatCurrency(item.unit_price)}</td>
                      <td className="py-4 text-right font-medium text-neutral-900">{formatCurrency(item.amount || item.quantity * item.unit_price)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-neutral-500">No line items</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-72">
                <div className="flex justify-between py-2">
                  <span className="text-neutral-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(invoice?.subtotal || 0)}</span>
                </div>
                {(invoice?.tax_amount || 0) > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-neutral-600">Tax</span>
                    <span className="font-medium">{formatCurrency(invoice?.tax_amount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 border-t-2 border-neutral-900">
                  <span className="text-lg font-bold">Total Due</span>
                  <span className="text-lg font-bold">{formatCurrency(invoice?.total || 0)}</span>
                </div>
              </div>
            </div>

            {/* Status Badge */}
            <div className="mt-8 pt-8 border-t border-neutral-200 text-center">
              <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                invoice?.status === 'paid' ? 'bg-green-100 text-green-700' :
                invoice?.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                invoice?.status === 'overdue' ? 'bg-red-100 text-red-700' :
                'bg-neutral-100 text-neutral-700'
              }`}>
                {invoice?.status?.toUpperCase() || 'DRAFT'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
