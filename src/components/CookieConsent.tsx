import { useState, useEffect } from 'react';
import { X, Cookie } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      // Show banner after a short delay
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie_consent', JSON.stringify({
      essential: true,
      analytics: true,
      marketing: true,
      accepted_at: new Date().toISOString()
    }));
    setShowBanner(false);
  };

  const handleAcceptEssential = () => {
    localStorage.setItem('cookie_consent', JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      accepted_at: new Date().toISOString()
    }));
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-neutral-200 shadow-lg" style={{ zIndex: 99999 }}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Cookie className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-neutral-700">
              We use cookies to enhance your experience, analyze site traffic, and for marketing purposes. 
              By clicking "Accept All", you consent to our use of cookies. 
              <Link to="/privacy#cookies" className="text-[#476E66] hover:underline ml-1">
                Learn more
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAcceptEssential(); }}
            className="px-4 py-2 text-sm font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAcceptAll(); }}
            className="px-4 py-2 text-sm font-medium text-white bg-[#476E66] rounded-lg hover:bg-[#3A5B54] transition-colors"
          >
            Accept All
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAcceptEssential(); }}
            className="p-2 text-neutral-400 hover:text-neutral-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
