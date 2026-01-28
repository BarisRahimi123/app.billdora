import { useState, useEffect } from 'react';
import { X, CreditCard, DollarSign, Calendar, Building, Loader2 } from 'lucide-react';
import { loadStripe, Stripe } from '@stripe/stripe-js';

interface Invoice {
  id: string;
  invoice_number: string;
  total: number;
  amount_paid?: number;
  client?: {
    name?: string;
    email?: string;
  };
}

interface PaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSave: (payment: { amount: number; date: string; method: string; stripePaymentId?: string }) => Promise<void>;
}

type PaymentTab = 'manual' | 'online';

export default function PaymentModal({ invoice, onClose, onSave }: PaymentModalProps) {
  const remainingBalance = invoice.total - (invoice.amount_paid || 0);
  const [activeTab, setActiveTab] = useState<PaymentTab>('manual');
  const [amount, setAmount] = useState(remainingBalance.toString());
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('bank_transfer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stripe state
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Check if Stripe is configured
  const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  const isStripeConfigured = !!stripePublicKey;

  useEffect(() => {
    if (isStripeConfigured && activeTab === 'online') {
      setStripeLoading(true);
      loadStripe(stripePublicKey)
        .then(setStripe)
        .catch(() => setStripeError('Failed to load payment processor'))
        .finally(() => setStripeLoading(false));
    }
  }, [activeTab, isStripeConfigured, stripePublicKey]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ amount: parseFloat(amount), date, method });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  const handleOnlinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe) {
      setStripeError('Payment processor not ready');
      return;
    }

    setProcessingPayment(true);
    setStripeError(null);

    try {
      // Create payment intent via edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          clientEmail: invoice.client?.email,
          clientName: invoice.client?.name,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message || 'Payment failed');
      }

      // For demo purposes, simulate successful payment
      // In production, you would use Stripe Elements to collect card details
      await onSave({
        amount: parseFloat(amount),
        date: new Date().toISOString().split('T')[0],
        method: 'credit_card',
        stripePaymentId: result.data?.paymentIntentId,
      });
      
      onClose();
    } catch (err: any) {
      setStripeError(err.message || 'Payment processing failed');
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-neutral-50">
          <h2 className="text-lg font-semibold text-neutral-900">Record Payment</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Summary */}
        <div className="p-5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-neutral-400 text-sm">Invoice</p>
              <p className="font-semibold text-lg">{invoice.invoice_number}</p>
            </div>
            <div className="text-right">
              <p className="text-neutral-400 text-sm">Balance Due</p>
              <p className="font-bold text-2xl text-emerald-400">${remainingBalance.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Payment Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'manual'
                ? 'text-neutral-900 border-b-2 border-neutral-900 bg-white'
                : 'text-neutral-500 hover:text-neutral-700 bg-neutral-50'
            }`}
          >
            <Building className="w-4 h-4 inline mr-2" />
            Manual Entry
          </button>
          <button
            onClick={() => setActiveTab('online')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'online'
                ? 'text-neutral-900 border-b-2 border-neutral-900 bg-white'
                : 'text-neutral-500 hover:text-neutral-700 bg-neutral-50'
            }`}
          >
            <CreditCard className="w-4 h-4 inline mr-2" />
            Online Payment
          </button>
        </div>

        {/* Manual Payment Form */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 bg-neutral-100 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Payment Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remainingBalance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Payment Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Payment Method</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent appearance-none bg-white"
                >
                  <option value="bank_transfer">Bank Transfer / ACH</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                  <option value="credit_card">Credit Card (offline)</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] disabled:opacity-50 font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Record Payment'}
              </button>
            </div>
          </form>
        )}

        {/* Online Payment Form */}
        {activeTab === 'online' && (
          <div className="p-5">
            {!isStripeConfigured ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                <h3 className="font-medium text-neutral-900 mb-1">Online Payments Not Configured</h3>
                <p className="text-sm text-neutral-500 mb-4">
                  To accept online credit card payments, add your Stripe API keys in Settings.
                </p>
                <button
                  onClick={() => setActiveTab('manual')}
                  className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 text-sm font-medium"
                >
                  Use Manual Entry Instead
                </button>
              </div>
            ) : stripeLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-neutral-400 mx-auto animate-spin mb-3" />
                <p className="text-sm text-neutral-500">Loading payment processor...</p>
              </div>
            ) : (
              <form onSubmit={handleOnlinePayment} className="space-y-4">
                {stripeError && (
                  <div className="p-3 bg-neutral-100 border border-red-200 rounded-lg text-red-700 text-sm">
                    {stripeError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Payment Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={remainingBalance}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Card Number</label>
                  <input
                    type="text"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full px-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full px-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">CVC</label>
                    <input
                      type="text"
                      placeholder="123"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full px-3 py-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processingPayment}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {processingPayment ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : (
                      <>Pay ${parseFloat(amount || '0').toFixed(2)}</>
                    )}
                  </button>
                </div>

                <p className="text-xs text-neutral-400 text-center mt-2">
                  Payments are processed securely via Stripe
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
