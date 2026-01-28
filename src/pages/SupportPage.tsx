import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Mail, FileText, BookOpen } from 'lucide-react';

const faqs = [
  {
    question: "How do I get started with Billdora?",
    answer: "Sign up for a free trial, then add your first client and create a project. From there, you can track time, log expenses, and generate invoices—all from one dashboard."
  },
  {
    question: "Can I import data from other invoicing software?",
    answer: "Yes! We support CSV imports for clients, projects, and historical invoices. Contact our support team for assistance with bulk migrations."
  },
  {
    question: "How does time tracking work?",
    answer: "Use the built-in timer or manually log hours against any project. All tracked time can be converted to invoice line items with one click."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express) through Stripe. Annual plans also support bank transfers."
  },
  {
    question: "Can I customize my invoices?",
    answer: "Absolutely. Add your company logo, customize colors, and configure payment terms, tax rates, and footer messages in Settings."
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use enterprise-grade encryption, automatic backups, and maintain 99.9% uptime. All data is stored securely in SOC 2 compliant data centers."
  },
  {
    question: "How do recurring invoices work?",
    answer: "Set up a recurring schedule (weekly, monthly, quarterly) and Billdora will automatically generate and send invoices on your behalf."
  },
  {
    question: "Can my clients view their invoices online?",
    answer: "Yes! Each client gets a secure portal link where they can view all their invoices, payment history, and download PDFs."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "You can cancel anytime from Settings > Subscription. Your data remains accessible for 30 days after cancellation."
  },
  {
    question: "Do you offer refunds?",
    answer: "We offer a 14-day money-back guarantee for new subscribers. Contact support within 14 days of your first payment for a full refund."
  }
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-5 flex justify-between items-center text-left hover:text-[#476E66] transition-colors"
      >
        <span className="font-medium text-gray-900 pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-5 text-gray-600 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  useEffect(() => {
    // Load HubSpot form script
    const script = document.createElement('script');
    script.src = 'https://js-na2.hsforms.net/forms/embed/23302531.js';
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 py-4">
        <div className="container mx-auto px-6 max-w-4xl">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#476E66] flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-xl font-bold text-neutral-900">Billdora</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 max-w-4xl py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Support Center</h1>
        <p className="text-xl text-gray-600 mb-12">
          Find answers to common questions or get in touch with our team.
        </p>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <a
            href="mailto:info@billdora.com"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#476E66] hover:bg-gray-50 transition-all"
          >
            <div className="w-10 h-10 bg-[#476E66]/10 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#476E66]" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Email Support</p>
              <p className="text-sm text-gray-500">info@billdora.com</p>
            </div>
          </a>
          <Link
            to="/terms"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#476E66] hover:bg-gray-50 transition-all"
          >
            <div className="w-10 h-10 bg-[#476E66]/10 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#476E66]" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Terms of Service</p>
              <p className="text-sm text-gray-500">Usage policies</p>
            </div>
          </Link>
          <Link
            to="/privacy"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#476E66] hover:bg-gray-50 transition-all"
          >
            <div className="w-10 h-10 bg-[#476E66]/10 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[#476E66]" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Privacy Policy</p>
              <p className="text-sm text-gray-500">Data protection</p>
            </div>
          </Link>
        </div>

        {/* FAQ Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="bg-gray-50 rounded-lg p-6">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </section>

        {/* Contact Form */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Contact Us</h2>
          <p className="text-gray-600 mb-6">
            Can't find what you're looking for? Send us a message and we'll get back to you within 24 hours.
          </p>
          <div className="bg-gray-50 rounded-lg p-6">
            <div 
              className="hs-form-frame" 
              data-region="na2" 
              data-form-id="a58bff6b-7301-4c0e-a57d-c9ce25fddff5" 
              data-portal-id="23302531"
            />
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link to="/" className="text-[#476E66] hover:underline text-sm">Back to Home</Link>
          <div className="flex gap-6">
            <Link to="/terms" className="text-[#476E66] hover:underline text-sm">Terms</Link>
            <Link to="/privacy" className="text-[#476E66] hover:underline text-sm">Privacy</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
