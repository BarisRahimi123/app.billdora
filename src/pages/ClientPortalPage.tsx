import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Download, Clock, CheckCircle, AlertCircle, Building2 } from 'lucide-react';
import { generateInvoicePdf } from '../lib/pdf';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface PortalInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  due_date: string;
  created_at: string;
  amount_paid?: number;
  paid_at?: string;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  due_date: string;
  created_at: string;
  amount_paid?: number;
  paid_at?: string;
  line_items: Array<{
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

interface PortalData {
  client: { id: string; name: string; email: string; address?: string; city?: string; state?: string; zip?: string };
  company: { name: string; logo_url?: string; address?: string; phone?: string };
  invoices?: PortalInvoice[];
  invoice?: InvoiceDetail;
}

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (token) {
      loadPortalData();
    }
  }, [token]);

  const loadPortalData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/client-portal?token=${token}&action=list`
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to load portal');
      }
      const data = await response.json();
      setPortalData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portal');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoiceDetail = async (invoiceId: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/client-portal?token=${token}&action=detail&invoice_id=${invoiceId}`
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to load invoice');
      }
      const data = await response.json();
      setSelectedInvoice(data.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async (invoice: InvoiceDetail) => {
    if (!portalData) return;
    try {
      setDownloadingPdf(true);
      const pdfData = {
        invoiceNumber: invoice.invoice_number,
        company: {
          name: portalData.company.name,
          address: portalData.company.address,
          phone: portalData.company.phone,
        },
        client: {
          name: portalData.client.name,
          email: portalData.client.email,
        },
        lineItems: invoice.line_items.map(item => ({
          description: item.description,
          amount: item.amount,
        })),
        totals: {
          subtotal: invoice.subtotal,
          tax: invoice.tax_amount,
          total: invoice.total,
        },
        dueDate: invoice.due_date,
      };
      await generateInvoicePdf(pdfData);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'overdue':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-amber-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      sent: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      partial: 'bg-amber-100 text-amber-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading && !portalData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!portalData) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {portalData.company.logo_url ? (
              <img src={portalData.company.logo_url} alt="" className="h-12 w-12 object-contain" />
            ) : (
              <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-indigo-600" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{portalData.company.name}</h1>
              <p className="text-sm text-gray-500">Client Portal</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Client Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome, {portalData.client.name}</h2>
          <p className="text-sm text-gray-500">{portalData.client.email}</p>
        </div>

        {selectedInvoice ? (
          /* Invoice Detail View */
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
              >
                Back to Invoices
              </button>
              <button
                onClick={() => handleDownloadPdf(selectedInvoice)}
                disabled={downloadingPdf}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloadingPdf ? 'Generating...' : 'Download PDF'}
              </button>
            </div>

            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Invoice #{selectedInvoice.invoice_number}</h3>
                <p className="text-sm text-gray-500">
                  Created: {new Date(selectedInvoice.created_at).toLocaleDateString()}
                </p>
              </div>
              {getStatusBadge(selectedInvoice.status)}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">Due Date</p>
                <p className="font-medium">{new Date(selectedInvoice.due_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Amount Due</p>
                <p className="font-medium text-lg">
                  ${(selectedInvoice.total - (selectedInvoice.amount_paid || 0)).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Line Items */}
            <div className="border rounded-lg overflow-hidden mb-6">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedInvoice.line_items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">${item.rate.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">${item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">${selectedInvoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tax</span>
                  <span className="text-gray-900">${selectedInvoice.tax_amount.toFixed(2)}</span>
                </div>
                {selectedInvoice.amount_paid && selectedInvoice.amount_paid > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Paid</span>
                    <span>-${selectedInvoice.amount_paid.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total Due</span>
                  <span>${(selectedInvoice.total - (selectedInvoice.amount_paid || 0)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Invoice List View */
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Your Invoices</h3>
            </div>
            {portalData.invoices && portalData.invoices.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {portalData.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                    onClick={() => loadInvoiceDetail(invoice.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <FileText className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Invoice #{invoice.invoice_number}</p>
                        <p className="text-sm text-gray-500">
                          Due: {new Date(invoice.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">${invoice.total.toFixed(2)}</p>
                        {invoice.amount_paid && invoice.amount_paid > 0 && (
                          <p className="text-sm text-green-600">Paid: ${invoice.amount_paid.toFixed(2)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(invoice.status)}
                        {getStatusBadge(invoice.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>No invoices found</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
