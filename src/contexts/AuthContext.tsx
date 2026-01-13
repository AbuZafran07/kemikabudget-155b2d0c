import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'super_admin' | 'finance' | 'admin' | 'user';

interface Profile {
  id: string;
  division_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  requires_otp: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; requiresOtp?: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  verifyOtp: (otp: string) => Promise<{ error: Error | null }>;
  hasRole: (requiredRole: AppRole) => boolean;
  canAccessDivision: (divisionId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingOtpUserId, setPendingOtpUserId] = useState<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetching with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserProfile(session.user.id);
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserProfile(session.user.id);
        fetchUserRole(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data as Profile);
    }
  };

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .order('role')
      .limit(1)
      .single();

    if (!error && data) {
      setRole(data.role as AppRole);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error };
    }

    // Check if user requires OTP (super_admin)
    if (data.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('requires_otp')
        .eq('id', data.user.id)
        .single();

      if (profileData?.requires_otp) {
        setPendingOtpUserId(data.user.id);
        return { error: null, requiresOtp: true };
      }
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setPendingOtpUserId(null);
  };

  const verifyOtp = async (otp: string) => {
    if (!pendingOtpUserId) {
      return { error: new Error('No pending OTP verification') };
    }

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return { error: new Error('OTP must be 6 digits') };
    }

    try {
      // Use edge function for secure server-side OTP verification with rate limiting
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: {
          action: 'verify',
          userId: pendingOtpUserId,
          otp: otp,
        },
      });

      if (error) {
        console.error('OTP verification error:', error);
        return { error: new Error('OTP verification failed') };
      }

      if (data?.success === true) {
        setPendingOtpUserId(null);
        return { error: null };
      }

      if (data?.rateLimited) {
        return { error: new Error('Too many attempts. Please wait 5 minutes.') };
      }

      return { error: new Error(data?.error || 'Invalid OTP code') };
    } catch (err) {
      console.error('OTP verification error:', err);
      return { error: new Error('OTP verification failed') };
    }
  };

  const hasRole = (requiredRole: AppRole): boolean => {
    if (!role) return false;
    
    const roleHierarchy: Record<AppRole, number> = {
      super_admin: 4,
      finance: 3,
      admin: 2,
      user: 1,
    };

    return roleHierarchy[role] >= roleHierarchy[requiredRole];
  };

  const canAccessDivision = (divisionId: string): boolean => {
    if (!profile || !role) return false;
    
    // Super admin and finance can access all divisions
    if (role === 'super_admin' || role === 'finance') return true;
    
    // Others can only access their own division
    return profile.division_id === divisionId;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isLoading,
        signIn,
        signUp,
        signOut,
        verifyOtp,
        hasRole,
        canAccessDivision,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
