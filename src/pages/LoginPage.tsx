import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, signInWithGoogle, signInWithApple, signInWithFacebook, signOut, user, passwordRecoveryMode, clearPasswordRecoveryMode } = useAuth();
  
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const companyNameRef = useRef<HTMLInputElement>(null);
  
  // Staff onboarding fields for invited users
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [dateOfHire, setDateOfHire] = useState(new Date().toISOString().split('T')[0]);
  
  // Track if this is an invite-based signup (email locked)
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  // Track collaborator invitation data
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [collaborationId, setCollaborationId] = useState<string | null>(null);
  const [prefillName, setPrefillName] = useState<string | null>(null);
  const [prefillCompany, setPrefillCompany] = useState<string | null>(null);

  // Track if we've already handled the initial signup cleanup
  const [initialCleanupDone, setInitialCleanupDone] = useState(false);
  
  // Check for invitation params in URL
  useEffect(() => {
    const emailParam = searchParams.get('email');
    const signupParam = searchParams.get('signup');
    const nameParam = searchParams.get('name');
    const companyParam = searchParams.get('company');
    const collaboratorParam = searchParams.get('collaborator');
    const collaborationIdParam = searchParams.get('collaboration_id');
    const expiredParam = searchParams.get('expired');
    
    // Show message if session expired
    if (expiredParam === 'true') {
      setError('Your session has expired. Please sign in again.');
    }
    
    // If visiting signup page and there's an existing session from a DIFFERENT flow,
    // sign out first. But only do this ONCE on initial load, not after successful login.
    // FIX: Check initialCleanupDone to prevent sign-out loop after successful login
    if (signupParam === 'true' && user && !initialCleanupDone) {
      setInitialCleanupDone(true);
      signOut();
      return; // The effect will re-run after signOut clears the user
    }
    
    if (emailParam) {
      setInvitedEmail(emailParam.toLowerCase());
      if (emailRef.current) {
        emailRef.current.value = emailParam;
      }
    }
    if (signupParam === 'true') {
      setIsSignUp(true);
    }
    // Handle collaborator-specific params
    if (collaboratorParam === 'true') {
      setIsCollaborator(true);
    }
    if (collaborationIdParam) {
      setCollaborationId(collaborationIdParam);
    }
    if (nameParam) {
      setPrefillName(nameParam);
    }
    if (companyParam) {
      setPrefillCompany(companyParam);
    }
  }, [searchParams, user, signOut, initialCleanupDone]);

  // Detect password reset mode from AuthContext (set when PASSWORD_RECOVERY event fires)
  useEffect(() => {
    if (passwordRecoveryMode) {
      console.log('[LoginPage] Password recovery mode detected from context');
      setIsPasswordReset(true);
    }
  }, [passwordRecoveryMode]);

  // Handle password update
  const handlePasswordUpdate = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Please enter and confirm your new password');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      setPasswordResetSuccess(true);
      // Clear the recovery mode flag in context
      clearPasswordRecoveryMode();
      // Sign out after password reset so they can log in fresh
      await supabase.auth.signOut();
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        setIsPasswordReset(false);
        setPasswordResetSuccess(false);
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const email = emailRef.current?.value || '';
    const password = passwordRef.current?.value || '';
    const fullName = fullNameRef.current?.value || '';
    const phone = phoneRef.current?.value || '';
    const companyName = companyNameRef.current?.value || '';
    
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    if (isSignUp) {
      if (!fullName.trim()) {
        setError('Please enter your full name');
        return;
      }
      if (!phone.trim()) {
        setError('Please enter your phone number');
        return;
      }
      // Security: If this is an invite-based signup, email must match exactly
      if (invitedEmail && email.toLowerCase() !== invitedEmail) {
        setError(`This invitation was sent to ${invitedEmail}. Please use that email address to accept the invitation.`);
        return;
      }
    }
    
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // For staff invites, pass staff profile data; for collaborators/regular signups, pass company name
        const isStaffInvite = invitedEmail && !isCollaborator;
        const staffData = isStaffInvite ? { dateOfBirth, address, city, state, zipCode, emergencyContactName, emergencyContactPhone, dateOfHire } : null;
        // Collaborators use their pre-filled company name
        const finalCompanyName = isCollaborator ? (prefillCompany || companyName) : (isStaffInvite ? '' : companyName);
        const result = await signUp(email, password, fullName, phone, finalCompanyName, staffData);
        
        // Handle existing user trying to accept collaboration
        if (result.error) {
          const errorMsg = result.error.message?.toLowerCase() || '';
          if (isCollaborator && collaborationId && (errorMsg.includes('already registered') || errorMsg.includes('already exists'))) {
            // User already exists - try to sign them in instead
            const { supabase } = await import('../lib/supabase');
            const { error: signInError } = await signIn(email, password);
            if (signInError) {
              setError('This email is already registered with an existing account. Please log in with your existing password, or use "Forgot Password" if you don\'t remember it.');
              setIsSignUp(false); // Switch to login mode
              return;
            }
            // Successfully logged in - now link the collaboration
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
              if (supabaseUrl) {
                await fetch(`${supabaseUrl}/functions/v1/confirm-collaborator`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: currentUser.id, collaborationId })
                });
              }
              navigate('/dashboard');
              return;
            }
          }
          throw result.error;
        }
        
        // If this is a collaborator signup, auto-confirm and link them
        if (isCollaborator && collaborationId && result.userId) {
          try {
            const { supabase } = await import('../lib/supabase');
            
            // Call edge function to auto-confirm collaborator and link them
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${supabaseUrl}/functions/v1/confirm-collaborator`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: result.userId, collaborationId })
            });
            
            if (!response.ok) {
              console.error('Failed to confirm collaborator:', await response.text());
            }
            
            // Wait for confirmation to propagate, then try to sign in with retries
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            let signInSuccess = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              await delay(attempt === 0 ? 500 : 1000); // 500ms first, 1s after
              const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
              if (!signInErr) {
                signInSuccess = true;
                break;
              }
              console.log(`Sign-in attempt ${attempt + 1} failed, retrying...`);
            }
            
            if (!signInSuccess) {
              // SignIn failed after retries - likely email already existed
              setError('This email is already registered with an existing account. Please log in with your existing password, or use "Forgot Password" if you don\'t remember it.');
              setIsSignUp(false);
              setLoading(false);
              return;
            }
            
            // Successfully signed in - go to dashboard
            navigate('/dashboard');
            return;
          } catch (linkErr) {
            console.error('Failed to link collaborator:', linkErr);
          }
        }
        
        // Redirect to check-email page if confirmation required (non-collaborators)
        if (result.emailConfirmationRequired) {
          sessionStorage.setItem('pendingVerificationEmail', email);
          navigate('/check-email');
          return;
        }
        navigate('/dashboard');
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        
        // If this is a collaborator accepting an invite via login, link them
        if (isCollaborator && collaborationId) {
          const { supabase } = await import('../lib/supabase');
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            if (supabaseUrl) {
              await fetch(`${supabaseUrl}/functions/v1/confirm-collaborator`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, collaborationId })
              });
            }
          }
        }
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = emailRef.current?.value || '';
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      // Use custom edge function for password reset (uses SendGrid)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/request-password-reset`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          email,
          redirectUrl: `${window.location.origin}/login?reset=true`
        })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send reset email');
      
      setResetEmailSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    setError('');
    setLoading(true);
    try {
      let result;
      if (provider === 'google') result = await signInWithGoogle();
      else if (provider === 'apple') result = await signInWithApple();
      else result = await signInWithFacebook();
      if (result.error) throw result.error;
    } catch (err: any) {
      setError(err.message || 'Social login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F3] flex" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-4 sm:px-8 lg:px-16 py-6">
        <div className="max-w-md w-full mx-auto">
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10 text-center"
          >
            <span className="text-5xl sm:text-6xl font-black text-neutral-900 tracking-tighter" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', letterSpacing: '-0.05em' }}>
              BILLDORA
            </span>
          </motion.div>

          {/* Welcome Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-2 text-neutral-900">
              {isPasswordReset ? 'Set New Password.' : isForgotPassword ? 'Reset Password.' : isSignUp ? 'Create Account.' : 'Welcome Back.'}
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              {isPasswordReset
                ? 'Enter your new password below.'
                : isForgotPassword
                  ? 'Enter your email and we\'ll send you a reset link.'
                  : isSignUp 
                    ? 'Start managing your projects with precision.' 
                    : 'Streamline your workflow with mathematical precision.'}
            </p>
          </motion.div>

          {/* Form */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="space-y-3"
          >
            {/* Password Reset Form */}
            {isPasswordReset ? (
              passwordResetSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-neutral-900 mb-2">Password Updated!</p>
                  <p className="text-sm text-neutral-500">Redirecting you to login...</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                      placeholder="Enter new password"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                      placeholder="Confirm new password"
                    />
                  </div>
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                      {error}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handlePasswordUpdate}
                    className="w-full h-11 bg-[#476E66] hover:bg-[#3A5B54] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 rounded-lg shadow-sm"
                  >
                    {loading ? 'Updating...' : 'UPDATE PASSWORD'}
                  </button>
                </>
              )
            ) : (
            <>
            {isSignUp && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={fullNameRef}
                    type="text"
                    defaultValue={prefillName || ''}
                    className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={phoneRef}
                    type="tel"
                    className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                {/* Staff onboarding fields for invited employees (not collaborators) */}
                {invitedEmail && !isCollaborator ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                        placeholder="123 Main St"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                          placeholder="CA"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                          Zip
                        </label>
                        <input
                          type="text"
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
                          className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                          placeholder="12345"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Emergency Contact Name
                      </label>
                      <input
                        type="text"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                        placeholder="Jane Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Emergency Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                        placeholder="+1 (555) 987-6543"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Date of Hire
                      </label>
                      <input
                        type="date"
                        value={dateOfHire}
                        onChange={(e) => setDateOfHire(e.target.value)}
                        className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Company Name <span className="text-neutral-400 text-[10px]">(optional)</span>
                    </label>
                    <input
                      ref={companyNameRef}
                      type="text"
                      defaultValue={prefillCompany || ''}
                      className="w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                      placeholder="Acme Inc."
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                Email {isSignUp && <span className="text-red-500">*</span>}
                {invitedEmail && isSignUp && <span className="text-[11px] font-normal text-neutral-500 ml-2">(Invitation)</span>}
              </label>
              <input
                ref={emailRef}
                type="email"
                readOnly={!!(invitedEmail && isSignUp)}
                className={`w-full h-11 px-3 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400 ${invitedEmail && isSignUp ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                placeholder="you@company.com"
              />
              {invitedEmail && isSignUp && (
                <p className="text-[10px] text-neutral-500 mt-1">This email is linked to your invitation and cannot be changed.</p>
              )}
            </div>

            {!isForgotPassword && (
              <div className="relative">
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Password {isSignUp && <span className="text-red-500">*</span>}
                </label>
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  className="w-full h-11 px-3 pr-10 text-sm border border-neutral-200 bg-white rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none transition-all text-neutral-900 placeholder:text-neutral-400"
                  placeholder="Enter your password"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[30px] text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            )}

            {isSignUp && (
              <p className="text-[10px] text-neutral-500">
                Password must be at least 6 characters long.
              </p>
            )}

            {!isSignUp && !isForgotPassword && (
              <div className="text-right">
                <button 
                  type="button"
                  onClick={() => { setIsForgotPassword(true); setError(''); setResetEmailSent(false); }}
                  className="text-xs font-semibold text-neutral-500 hover:text-[#476E66] transition-colors"
                >
                  FORGOT PASSWORD?
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {error}
              </div>
            )}

            {isForgotPassword ? (
              resetEmailSent ? (
                <div className="text-center py-4">
                  <p className="text-sm text-green-600 mb-4">Password reset email sent! Check your inbox.</p>
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setResetEmailSent(false); }}
                    className="text-sm font-semibold text-[#476E66] hover:underline"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleForgotPassword}
                    className="w-full h-11 bg-[#476E66] hover:bg-[#3A5B54] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 rounded-lg shadow-sm"
                  >
                    {loading ? 'Please wait...' : 'SEND RESET EMAIL'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setError(''); }}
                    className="w-full mt-2 text-sm font-semibold text-neutral-500 hover:text-[#476E66]"
                  >
                    Back to Login
                  </button>
                </>
              )
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleSubmit}
                className="w-full h-11 bg-[#476E66] hover:bg-[#3A5B54] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 rounded-lg shadow-sm"
              >
                {loading ? 'Please wait...' : isSignUp ? 'CREATE ACCOUNT' : 'LOG IN'} 
                {!loading && <ArrowRight size={16} />}
              </button>
            )}

            {isSignUp && (
              <p className="text-[10px] text-neutral-500 text-center mt-3">
                By creating an account, you agree to our Terms of Service and Privacy Policy.
              </p>
            )}
            </>
            )}
          </motion.div>

          {/* Switch Mode */}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="mt-6 text-center text-sm text-neutral-600"
          >
            {isSignUp ? 'Already have an account? ' : 'New to Billdora? '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="font-semibold text-[#476E66] hover:underline transition-colors"
            >
              {isSignUp ? 'LOG IN' : 'CREATE ACCOUNT'}
            </button>
          </motion.p>
        </div>
      </div>

      {/* Right Side - Swiss Grid Design */}
      <div className="hidden lg:flex w-1/2 bg-[#476E66] items-center justify-center p-12 relative overflow-hidden">
        {/* Swiss Grid Pattern */}
        <div className="absolute inset-0 grid grid-cols-6 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border-l border-white h-full"></div>
          ))}
        </div>
        <div className="absolute inset-0 grid grid-rows-6 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border-t border-white w-full"></div>
          ))}
        </div>
        
        {/* Accent block */}
        <div className="absolute top-12 right-12 w-32 h-32 bg-white/10"></div>
        <div className="absolute bottom-24 left-12 w-24 h-24 border-2 border-white/30"></div>
        
        <div className="relative z-10 text-center max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter leading-[1.1] text-white mb-6">
              Precision in Every Detail.
            </h2>
            <p className="text-lg text-white/70 mb-8">
              Time tracking, billing, and project management built for professional firms who demand excellence.
            </p>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-12">
              <div className="text-left">
                <div className="text-3xl font-bold text-white">98%</div>
                <div className="text-xs font-bold uppercase tracking-wider text-white/50 mt-1">Accuracy</div>
              </div>
              <div className="text-left">
                <div className="text-3xl font-bold text-white">50+</div>
                <div className="text-xs font-bold uppercase tracking-wider text-white/50 mt-1">Features</div>
              </div>
              <div className="text-left">
                <div className="text-3xl font-bold text-white">24/7</div>
                <div className="text-xs font-bold uppercase tracking-wider text-white/50 mt-1">Support</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
