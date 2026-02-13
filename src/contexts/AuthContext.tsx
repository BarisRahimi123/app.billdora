import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Profile, clearStorageCache, getStoredAuth, getCachedProfile, setCachedProfile, clearCachedProfile } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { registerPushNotifications, isPushNotificationsAvailable } from '../lib/pushNotifications';
import { logger } from '../lib/logger';

interface SignUpResult {
  error: Error | null;
  emailConfirmationRequired?: boolean;
  userId?: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authReady: boolean;
  resumeCount: number; // Increments on app resume - use in useEffect deps to refetch
  passwordRecoveryMode: boolean; // True when user clicked password reset link
  clearPasswordRecoveryMode: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, phone: string, companyName?: string, staffData?: any) => Promise<SignUpResult>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithApple: () => Promise<{ error: Error | null }>;
  signInWithFacebook: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple push notification setup
async function setupPushNotifications(userId: string, companyId: string, authToken: string) {
  if (!isPushNotificationsAvailable()) return;
  
  try {
    const apnsToken = await registerPushNotifications();
    await new Promise(r => setTimeout(r, 1000));
    
    let fcmToken: string | null = null;
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const result = await Preferences.get({ key: 'fcmToken' });
      fcmToken = result.value;
    } catch {}
    
    const token = fcmToken || apnsToken;
    if (token) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseAnonKey) {
        await fetch(`${supabaseUrl}/rest/v1/device_tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${authToken}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ device_token: token, user_id: userId, company_id: companyId, platform: 'ios' })
        });
      }
    }
  } catch (e) {
    console.error('[Push] Setup failed:', e);
  }
}

// Fetch profile helper with timeout
async function fetchProfile(userId: string): Promise<Profile | null> {
  logger.auth('fetchProfile: Starting fetch for userId:', userId);
  const startTime = Date.now();
  
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Profile fetch timeout after 10s')), 10000)
    );
    
    const fetchPromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
    
    const elapsed = Date.now() - startTime;
    logger.auth('fetchProfile: Query completed in', elapsed, 'ms');
    
    if (error) {
      console.error('[Auth] fetchProfile error:', error.message, error.code, error.details);
      return null;
    }
    
    if (!data) {
      console.warn('[Auth] fetchProfile: No profile found for user', userId);
      return null;
    }
    
    logger.auth('fetchProfile: Got profile -', data.email, 'companyId:', data.company_id);
    return data;
  } catch (e: any) {
    const elapsed = Date.now() - startTime;
    console.error('[Auth] fetchProfile exception after', elapsed, 'ms:', e?.message || e);
    return null;
  }
}

// Prevent multiple auth initializations across rapid refreshes
let globalInitLock = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  
  const clearPasswordRecoveryMode = () => setPasswordRecoveryMode(false);
  const [resumeCount, setResumeCount] = useState(0);

  // Initialize auth on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Prevent concurrent initializations
      if (globalInitLock) {
        logger.auth('Init already in progress, skipping');
        return;
      }
      globalInitLock = true;
      
      logger.auth('Initializing...');
      
      // INSTANT: Check cached auth FIRST
      const cachedAuth = getStoredAuth();
      
      if (cachedAuth?.user) {
        // HAS CACHED AUTH - use it immediately
        logger.auth('INSTANT: Using cached auth for', cachedAuth.user.email, 'userId:', cachedAuth.user.id);
        setUser(cachedAuth.user);
        
        // INSTANT: Also use cached profile if available
        const cachedProfile = getCachedProfile();
        if (cachedProfile) {
          logger.auth('INSTANT: Using cached profile for', cachedProfile.email, 'companyId:', cachedProfile.company_id);
          setProfile(cachedProfile);
        } else {
          console.warn('[Auth] INSTANT: No cached profile found, will load from onAuthStateChange');
        }
        
        setLoading(false);
        setAuthReady(true);
        
        // BACKGROUND: Refresh profile from database (don't block UI)
        setTimeout(async () => {
          try {
            const { supabaseRest } = await import('../lib/supabase');
            const freshProfile = await supabaseRest.getProfile(cachedAuth.user.id);
            if (mounted && freshProfile) {
              setProfile(freshProfile);
              setCachedProfile(freshProfile); // Update cache
            }
          } catch (e) {
            console.warn('[Auth] Background profile refresh failed (using cached):', e);
          }
          
          // Also verify session is still valid
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session && mounted) {
              console.warn('[Auth] Background check: session expired');
              clearStorageCache();
              clearCachedProfile();
              setUser(null);
              setProfile(null);
            } else if (session?.user && session.user.id !== cachedAuth.user.id) {
              console.warn('[Auth] Background check: identity mismatch');
              clearStorageCache();
              clearCachedProfile();
              window.location.reload();
            }
          } catch (e) {
            console.warn('[Auth] Background session check failed (ignored):', e);
          }
          globalInitLock = false;
        }, 500); // Slight delay to not compete with initial render
        
        return;
      }
      
      // NO CACHED AUTH - user is not logged in, make it INSTANT
      logger.auth('No cached auth - user not logged in');
      globalInitLock = false;
      if (mounted) {
        setLoading(false);
        setAuthReady(true);
      }
      
      // Background: Let SDK initialize for future use (don't block)
      supabase.auth.getSession().catch(() => {});
    }

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.auth('State change:', event, session?.user?.email);
        
        if (!mounted) return;
        
        // Handle password recovery - user clicked reset link in email
        if (event === 'PASSWORD_RECOVERY') {
          logger.auth('PASSWORD_RECOVERY event detected');
          setPasswordRecoveryMode(true);
          // Don't process further - let LoginPage handle the password update
          return;
        }
        
        if (event === 'SIGNED_OUT') {
          // FIX: Clear ALL caches on sign-out to prevent "wrong user" bug
          clearStorageCache();
          clearCachedProfile();
          logger.auth('Cleared all caches on SIGNED_OUT event');
          setUser(null);
          setProfile(null);
        } else if (session?.user) {
          // FIX: Verify cached user matches session user to prevent identity mismatch
          const cachedAuth = getStoredAuth();
          if (cachedAuth && cachedAuth.user?.id !== session.user.id) {
            console.warn('[Auth] User mismatch! Cached:', cachedAuth.user?.email, 'Session:', session.user.email);
            clearStorageCache();
            clearCachedProfile();
          }
          
          // IMPORTANT: Try to use cached profile FIRST to avoid flash of empty data
          const cachedProfile = getCachedProfile();
          if (cachedProfile && cachedProfile.id === session.user.id) {
            logger.auth('Using cached profile on state change:', cachedProfile.email, 'companyId:', cachedProfile.company_id);
            setUser(session.user);
            setProfile(cachedProfile);
            // Auto-accept pending project invitations (fire-and-forget)
            if (cachedProfile.email && cachedProfile.company_id) {
              autoAcceptProjectInvitations(session.user.id, cachedProfile.email, cachedProfile.company_id);
            }
          } else {
            // No valid cached profile, fetch from database
            // FIX: Don't set user until profile is also fetched to prevent race condition
            // where Dashboard sees user but no profile and shows error
            logger.auth('Fetching profile from database for', session.user.email);
            let profileData = await fetchProfile(session.user.id);
            
            // RECOVERY: If no profile found (e.g., first login after email confirmation
            // where signUp() failed to create profile due to no session)
            if (!profileData && session.user.email) {
              logger.auth('No profile on auth state change, attempting recovery...');
              profileData = await recoverProfile(session.user.id, session.user.email);
            }

            // RECOVERY: Profile exists but has no company — create one now
            if (profileData && !profileData.company_id && session.user.email) {
              logger.auth('Profile exists but no company_id, creating company...');
              try {
                const meta = session.user.user_metadata || {};
                const fullName = meta.full_name || profileData.full_name || session.user.email.split('@')[0];
                const compName = meta.company_name || `${fullName}'s Company`;
                const phone = meta.phone || profileData.phone || '';

                const { data: newCompanyId } = await supabase.rpc('create_company_for_user', {
                  p_user_id: session.user.id,
                  p_company_name: compName,
                  p_full_name: fullName,
                  p_phone: phone
                });

                if (newCompanyId) {
                  logger.auth('Company created for existing profile:', newCompanyId);
                  // Update the profile with the new company_id
                  const { data: updatedProfile } = await supabase
                    .from('profiles')
                    .update({ company_id: newCompanyId, full_name: fullName, phone: phone || profileData.phone })
                    .eq('id', session.user.id)
                    .select()
                    .single();
                  if (updatedProfile) profileData = updatedProfile;
                }
              } catch (e) {
                console.error('[Auth] Company creation for existing profile failed:', e);
              }
            }
            
            logger.auth('Profile loaded on state change:', profileData?.email, 'companyId:', profileData?.company_id);
            if (mounted) {
              // Set both together so Dashboard sees complete state
              setUser(session.user);
              setProfile(profileData);
              if (profileData) {
                setCachedProfile(profileData);
                // Auto-accept pending project invitations (fire-and-forget)
                if (profileData.email && profileData.company_id) {
                  autoAcceptProjectInvitations(session.user.id, profileData.email, profileData.company_id);
                }
              }
            }
          }
        }
      }
    );

    // Visibility change handler - triggers data refresh on resume
    // FIX: Initialize to current time to prevent bogus resume on page load
    let hiddenAt = Date.now();
    let hasBeenHidden = false; // Only trigger resume if page was actually hidden first
    
    const handleVisibility = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        hasBeenHidden = true;
      } else if (document.visibilityState === 'visible' && hasBeenHidden) {
        const hiddenDuration = Date.now() - hiddenAt;
        // Only trigger refresh if hidden for more than 2 seconds
        if (hiddenDuration > 2000 && hiddenDuration < 86400000) { // Max 24 hours to filter bogus values
          logger.auth('Resume after', Math.round(hiddenDuration / 1000), 's');
          
          // Don't clear cache on resume - it causes race conditions with init
          // Just trigger a data refresh
          setResumeCount(c => c + 1);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Native app state handler for iOS
    let appListener: any = null;
    let backgroundAt = Date.now();
    let hasBeenBackgrounded = false;
    
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        appListener = App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            backgroundAt = Date.now();
            hasBeenBackgrounded = true;
          } else if (hasBeenBackgrounded) {
            const bgDuration = Date.now() - backgroundAt;
            if (bgDuration > 2000 && bgDuration < 86400000) { // Max 24 hours
              logger.auth('Native resume after', Math.round(bgDuration / 1000), 's');
              // Don't clear cache - just trigger data refresh
              setResumeCount(c => c + 1);
            }
          }
        });
      }).catch(() => {});
    }

    // Cleanup
    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      if (appListener) appListener.remove();
    };
  }, []);

  // Sign in with email/password
  async function signIn(email: string, password: string) {
    logger.auth('Signing in:', email);
    
    // FIX: Clear memory cache BEFORE sign-in to prevent "wrong user" bug
    // This ensures no stale tokens from a previous user session are used
    clearStorageCache();
    logger.auth('Cleared storage cache before sign-in');
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        return { error: new Error('Please verify your email address before logging in.') };
      }
      return { error };
    }
    
    if (data.user) {
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        return { error: new Error('Please verify your email address before logging in.') };
      }
      
      setUser(data.user);
      
      let profileData = await fetchProfile(data.user.id);
      
      // RECOVERY: If no profile found by auth user ID, attempt to fix
      if (!profileData) {
        logger.auth('No profile found by ID, attempting recovery for', email);
        profileData = await recoverProfile(data.user.id, email);
      }
      
      logger.auth('Profile loaded after sign-in:', { 
        hasProfile: !!profileData, 
        companyId: profileData?.company_id,
        email: profileData?.email 
      });
      setProfile(profileData);
      
      // CACHE the profile for instant loading on refresh
      if (profileData) {
        setCachedProfile(profileData);
      }
      
      // Setup push notifications
      if (profileData?.company_id && data.session?.access_token) {
        setupPushNotifications(data.user.id, profileData.company_id, data.session.access_token);
      }
    }
    
    return { error: null };
  }

  // Auto-accept any pending project collaboration invitations for this user.
  // Runs silently after login/signup so the shared project appears immediately.
  async function autoAcceptProjectInvitations(userId: string, email: string, companyId: string) {
    try {
      const { data: pending } = await supabase
        .from('project_collaborators')
        .select('id')
        .eq('status', 'pending')
        .or(`invited_user_id.eq.${userId},invited_email.eq.${email.toLowerCase()}`);

      if (!pending || pending.length === 0) return;

      for (const inv of pending) {
        const { error } = await supabase
          .from('project_collaborators')
          .update({
            status: 'accepted',
            invited_user_id: userId,
            invited_company_id: companyId,
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', inv.id);
        if (error) {
          console.error('[Auth] Failed to auto-accept invitation:', inv.id, error);
        } else {
          logger.auth('Auto-accepted project invitation:', inv.id);
        }
      }
    } catch (err) {
      console.error('[Auth] autoAcceptProjectInvitations error:', err);
    }
  }

  // Recover a missing or mismatched profile during sign-in
  // This handles cases where signUp() failed to create/link the profile properly
  // (e.g., email confirmation was required and profile creation silently failed)
  async function recoverProfile(userId: string, email: string): Promise<Profile | null> {
    try {
      // Step 1: Check if a profile exists with this email but a different ID (ID mismatch)
      const { data: emailProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      
      if (emailProfile && emailProfile.id !== userId) {
        logger.auth('Found profile with mismatched ID, repairing:', emailProfile.id, '->', userId);
        const { data: fixed, error: fixErr } = await supabase
          .from('profiles')
          .update({ id: userId })
          .eq('email', email.toLowerCase())
          .select()
          .single();
        if (fixErr) {
          console.error('[Auth] Profile ID repair failed:', fixErr);
        } else {
          logger.auth('Profile ID repaired successfully');
          return fixed;
        }
      }
      
      if (emailProfile) {
        // Profile exists and ID matches (shouldn't reach here, but just in case)
        return emailProfile;
      }
      
      // Step 2: No profile at all - check for invitation and create profile
      logger.auth('No profile found, checking for company invitation...');
      let companyId: string | null = null;
      let userRole = 'admin';
      let roleId: string | null = null;
      
      try {
        const { data: invitation } = await supabase
          .from('company_invitations')
          .select('*, role:roles(id, name)')
          .eq('email', email.toLowerCase())
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (invitation) {
          logger.auth('Found invitation for', email, '- company:', invitation.company_id);
          companyId = invitation.company_id;
          roleId = invitation.role_id;
          userRole = invitation.role?.name || 'staff';
          
          // Mark invitation as accepted if still pending
          if (invitation.status === 'pending') {
            await supabase
              .from('company_invitations')
              .update({ status: 'accepted' })
              .eq('id', invitation.id);
          }
        }
      } catch (e) {
        console.error('[Auth] Failed to check invitations during recovery:', e);
      }
      
      // If no company from invitation, create a new company for this user
      // This handles: project collaborator invitations, regular signups with email confirmation
      if (!companyId) {
        try {
          // Get user metadata stored during signup
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const meta = authUser?.user_metadata || {};
          const fullName = meta.full_name || email.split('@')[0];
          const compName = meta.company_name || `${fullName}'s Company`;
          const phone = meta.phone || '';

          logger.auth('Creating company for new user during recovery:', email, 'company:', compName);
          const { data: newCompanyId } = await supabase.rpc('create_company_for_user', {
            p_user_id: userId,
            p_company_name: compName,
            p_full_name: fullName,
            p_phone: phone
          });
          if (newCompanyId) {
            companyId = newCompanyId;
            logger.auth('Company created during recovery:', companyId);
          }
        } catch (e) {
          console.error('[Auth] Company creation during recovery failed:', e);
        }
      }

      // Create the profile
      const { data: { user: authUserForProfile } } = await supabase.auth.getUser();
      const metaForProfile = authUserForProfile?.user_metadata || {};

      const profileInsert: any = {
        id: userId,
        email: email.toLowerCase(),
        full_name: metaForProfile.full_name || email.split('@')[0],
        phone: metaForProfile.phone || null,
        company_name: metaForProfile.company_name || null,
        is_active: true,
        is_billable: true,
        role: userRole,
      };
      if (companyId) profileInsert.company_id = companyId;
      if (roleId) profileInsert.role_id = roleId;
      
      const { data: created, error: createErr } = await supabase
        .from('profiles')
        .insert(profileInsert)
        .select()
        .single();
      
      if (createErr) {
        console.error('[Auth] Profile creation during recovery failed:', createErr);
        return null;
      }
      
      logger.auth('Profile created during sign-in recovery:', created?.id, 'company:', created?.company_id);
      return created;
    } catch (e) {
      console.error('[Auth] Profile recovery exception:', e);
      return null;
    }
  }

  // Helper to get the correct redirect URL (production URL when on localhost/capacitor)
  function getRedirectUrl(path: string = '/login'): string {
    const origin = window.location.origin;
    if (origin.includes('localhost') || origin.includes('capacitor://') || origin.includes('127.0.0.1')) {
      return `https://app.billdora.com${path}`;
    }
    return `${origin}${path}`;
  }

  // Sign up
  async function signUp(email: string, password: string, fullName: string, phone: string, companyName?: string, staffData?: any): Promise<SignUpResult> {
    logger.auth('Signing up:', email);
    
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: getRedirectUrl('/login'),
        data: {
          full_name: fullName,
          company_name: companyName || '',
          phone: phone || '',
        },
      }
    });
    
    if (error) return { error };
    
    if (data.user) {
      const emailConfirmationRequired = !data.user.email_confirmed_at;
      
      // Check for invitation
      // Note: This may fail silently if email confirmation is required (no session yet)
      // The signIn() recovery flow will handle it when the user first logs in
      let invitation: any = null;
      try {
        const { data: inv, error: invErr } = await supabase
          .from('company_invitations')
          .select('*, role:roles(id, name)')
          .eq('email', email.toLowerCase())
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (invErr) {
          console.warn('[Auth] Invitation lookup failed (may be expected if email confirmation required):', invErr.message);
        }
        invitation = inv;
      } catch (e) {
        console.warn('[Auth] Invitation lookup exception:', e);
      }

      let companyId: string | null = null;
      let userRole = 'admin';
      let roleId: string | null = null;

      if (invitation) {
        companyId = invitation.company_id;
        roleId = invitation.role_id;
        userRole = invitation.role?.name || 'staff';
        
        try {
          await supabase.from('company_invitations').update({ status: 'accepted' }).eq('id', invitation.id);
        } catch (e) {
          console.warn('[Auth] Invitation status update failed:', e);
        }
      } else if (!emailConfirmationRequired) {
        // Only create a new company for non-invite signups when we have a session
        try {
          const { data: newCompanyId } = await supabase.rpc('create_company_for_user', {
            p_user_id: data.user.id,
            p_company_name: companyName?.trim() || `${fullName}'s Company`,
            p_full_name: fullName,
            p_phone: phone
          });
          if (newCompanyId) companyId = newCompanyId;
        } catch (e) {
          console.warn('[Auth] Company creation failed:', e);
        }
      }
      
      // Create/update profile
      try {
        const profileUpdate: any = { 
          company_id: companyId, 
          full_name: fullName, 
          role: userRole,
          phone,
          company_name: companyName || null,
        };
        if (roleId) profileUpdate.role_id = roleId;
        if (staffData) {
          const fieldMap: Record<string, string> = {
            dateOfBirth: 'date_of_birth', address: 'address', city: 'city', 
            state: 'state', zipCode: 'zip_code', emergencyContactName: 'emergency_contact_name',
            emergencyContactPhone: 'emergency_contact_phone', dateOfHire: 'hire_date'
          };
          Object.entries(fieldMap).forEach(([from, to]) => { 
            if (staffData[from]) profileUpdate[to] = staffData[from]; 
          });
        }
        
        // First check by auth user ID
        const { data: existing } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
        
        if (existing) {
          const { data: updated, error: updateErr } = await supabase.from('profiles').update(profileUpdate).eq('id', data.user.id).select().single();
          if (updateErr) console.error('[Auth] Profile update error during signUp:', updateErr);
          else setProfile(updated);
        } else {
          // Check if a profile exists with same email but different ID (from a previous signup attempt)
          const { data: emailExisting } = await supabase.from('profiles').select('*').eq('email', email.toLowerCase()).maybeSingle();
          
          if (emailExisting) {
            // Fix the ID mismatch and update
            logger.auth('Found existing profile with different ID for', email, '- updating to', data.user.id);
            const { data: fixed, error: fixErr } = await supabase
              .from('profiles')
              .update({ ...profileUpdate, id: data.user.id })
              .eq('email', email.toLowerCase())
              .select()
              .single();
            if (fixErr) console.error('[Auth] Profile ID fix error during signUp:', fixErr);
            else setProfile(fixed);
          } else {
            // Create new profile
            const { data: created, error: insertErr } = await supabase.from('profiles').insert({ 
              id: data.user.id, email, is_active: true, is_billable: true, ...profileUpdate 
            }).select().single();
            if (insertErr) console.error('[Auth] Profile insert error during signUp:', insertErr);
            else setProfile(created);
          }
        }
      } catch (e) {
        console.error('[Auth] Profile creation/update exception during signUp:', e);
      }
      
      // HubSpot sync (fire and forget)
      const hubspotUrl = import.meta.env.VITE_SUPABASE_URL;
      if (hubspotUrl) {
        fetch(`${hubspotUrl}/functions/v1/hubspot-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, full_name: fullName, phone_number: phone, company_name: companyName }),
        }).catch(() => {});
      }
      
      if (!emailConfirmationRequired) setUser(data.user);
      return { error: null, emailConfirmationRequired, userId: data.user.id };
    }
    
    return { error: null };
  }

  // Resend verification email
  async function resendVerificationEmail(email: string) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: getRedirectUrl('/login') }
    });
    return { error };
  }

  // Sign out
  async function signOut() {
    logger.auth('Signing out');
    
    // FIX: Clear ALL caches FIRST to prevent stale data being read
    clearStorageCache();
    clearCachedProfile();
    logger.auth('Cleared all caches on sign-out');
    
    setUser(null);
    setProfile(null);
    
    await supabase.auth.signOut().catch(() => {});
    
    // Clear storage
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    
    if (Capacitor.isNativePlatform()) {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.clear();
      } catch {}
    }
  }

  // OAuth sign in methods
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    return { error };
  }

  async function signInWithApple() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    return { error };
  }

  async function signInWithFacebook() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    return { error };
  }

  // Refresh profile
  async function refreshProfile() {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
      if (profileData) {
        setCachedProfile(profileData);
      }
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      authReady,
      resumeCount,
      passwordRecoveryMode,
      clearPasswordRecoveryMode,
      signIn, 
      signUp, 
      signInWithGoogle, 
      signInWithApple, 
      signInWithFacebook, 
      signOut, 
      refreshProfile, 
      resendVerificationEmail 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
