import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface FormConfig {
  id: string;
  slug: string;
  heading: string;
  description: string;
  button_text: string;
  success_message: string;
  logo_url?: string;
  accent_color: string;
  show_phone: boolean;
  show_company: boolean;
  show_message: boolean;
  require_phone: boolean;
  require_company: boolean;
}

export default function LeadFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
  });

  useEffect(() => {
    async function loadForm() {
      if (!formId) {
        setError('Invalid form link');
        setLoading(false);
        return;
      }

      try {
        // Fetch form config from Supabase directly (public read)
        const response = await fetch(
          `https://bqxnagmmegdbqrzhheip.supabase.co/rest/v1/lead_forms?id=eq.${formId}&is_active=eq.true&select=id,slug,heading,description,button_text,success_message,logo_url,accent_color,show_phone,show_company,show_message,require_phone,require_company`,
          {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY',
            },
          }
        );

        const data = await response.json();
        if (!data || data.length === 0) {
          setError('Form not found or no longer active');
        } else {
          setFormConfig(data[0]);
        }
      } catch (e) {
        console.error('Failed to load form:', e);
        setError('Failed to load form');
      } finally {
        setLoading(false);
      }
    }

    loadForm();
  }, [formId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formConfig) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        'https://bqxnagmmegdbqrzhheip.supabase.co/functions/v1/lead-form-submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            formId: formId,
            name: formData.name,
            email: formData.email,
            phone: formData.phone || undefined,
            company: formData.company || undefined,
            message: formData.message || undefined,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit form');
      }

      setSuccessMessage(result.message || formConfig.success_message);
      setSubmitted(true);

      if (result.redirect_url) {
        setTimeout(() => {
          window.location.href = result.redirect_url;
        }, 2000);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error && !formConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Form Not Available</h1>
          <p className="text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!formConfig) return null;

  const accentColor = formConfig.accent_color || '#476E66';

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <CheckCircle className="w-8 h-8" style={{ color: accentColor }} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">Thank You!</h1>
          <p className="text-neutral-600">{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {formConfig.logo_url && (
          <div className="text-center mb-6">
            <img src={formConfig.logo_url} alt="Logo" className="h-12 mx-auto" />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div 
            className="p-6 text-white"
            style={{ backgroundColor: accentColor }}
          >
            <h1 className="text-2xl font-bold mb-2">{formConfig.heading}</h1>
            <p className="opacity-90">{formConfig.description}</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                style={{ '--tw-ring-color': accentColor } as any}
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                style={{ '--tw-ring-color': accentColor } as any}
                placeholder="your@email.com"
              />
            </div>

            {formConfig.show_phone && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Phone {formConfig.require_phone && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="tel"
                  required={formConfig.require_phone}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                  style={{ '--tw-ring-color': accentColor } as any}
                  placeholder="Your phone number"
                />
              </div>
            )}

            {formConfig.show_company && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Company {formConfig.require_company && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  required={formConfig.require_company}
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                  style={{ '--tw-ring-color': accentColor } as any}
                  placeholder="Your company name"
                />
              </div>
            )}

            {formConfig.show_message && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Message
                </label>
                <textarea
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:border-transparent outline-none resize-none"
                  style={{ '--tw-ring-color': accentColor } as any}
                  placeholder="How can we help you?"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 text-white font-medium rounded-lg transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: accentColor }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                formConfig.button_text
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-neutral-400 text-xs mt-6">
          Powered by Billdora
        </p>
      </div>
    </div>
  );
}
