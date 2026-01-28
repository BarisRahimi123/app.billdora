import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function CheckEmailPage() {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');

  const handleResend = async () => {
    setResending(true);
    setMessage('');
    
    const email = sessionStorage.getItem('pendingVerificationEmail');
    if (!email) {
      setMessage('Unable to resend. Please try signing up again.');
      setResending(false);
      return;
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Verification email sent! Check your inbox.');
    }
    setResending(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#476E66' }}>
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h1>
        <p className="text-gray-600 mb-6">
          We've sent a verification link to your email address. Please click the link to verify your account and get started with Billdora.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-gray-600">
            <strong>Didn't receive the email?</strong>
          </p>
          <ul className="text-sm text-gray-500 mt-2 space-y-1">
            <li>- Check your spam or junk folder</li>
            <li>- Make sure you entered the correct email</li>
            <li>- Wait a few minutes and try again</li>
          </ul>
        </div>

        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full py-3 px-4 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#476E66' }}
        >
          {resending ? 'Sending...' : 'Resend Verification Email'}
        </button>

        {message && (
          <p className={`mt-4 text-sm ${message.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}

        <Link
          to="/login"
          className="inline-block mt-6 text-sm hover:underline"
          style={{ color: '#476E66' }}
        >
          Back to Login
        </Link>
      </div>

      <p className="mt-8 text-gray-500 text-sm">Billdora - Professional Invoicing</p>
    </div>
  );
}
