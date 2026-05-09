"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { LoginModal } from "@/components/LoginModal";

// List of admin emails that get Pro and Admin features automatically
const ADMIN_EMAILS = [
  "georg@example.com", 
  "georg@gmail.com", 
  "viralauthoritypro@admin.com", 
  "georgejoelconcepcionlopez@gmail.com"
];

interface UserContextType {
  user: User | null;
  session: Session | null;
  isPremium: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setPremiumStatusInDB: (status: boolean) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Check active sessions and sets the user
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleUserSession(session);
      setIsLoading(false);
    };
    initSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("[ViralAuthority PRO PREMIUM Auth] State Change:", _event);
      await handleUserSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /* 
    SQL for your Supabase project (Authentication > SQL Editor):
    
    CREATE TABLE profiles (
      id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
      is_premium BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
    );
    
    -- Function to create profile on signup
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger AS $$
    BEGIN
      INSERT INTO public.profiles (id)
      VALUES (new.id);
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  */

  const handleUserSession = async (session: Session | null) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);

    if (currentUser) {
      console.log("[ViralAuthority PRO PREMIUM Auth] User identified:", currentUser.email);
      // Check if user is in admin list
      const userEmail = currentUser.email?.toLowerCase();
      const isSuperAdmin = userEmail ? ADMIN_EMAILS.includes(userEmail) : false;
      
      setIsAdmin(isSuperAdmin);
      
      if (isSuperAdmin) {
        console.log("[ViralAuthority PRO PREMIUM Auth] Welcome Admin:", userEmail);
        setIsPremium(true);
      } else {
        console.log("[ViralAuthority PRO PREMIUM Auth] Checking Pro status for common user...");
        // Strict Mode: Check premium status immediately
        const { data, error } = await supabase
          .from('profiles')
          .select('is_premium')
          .eq('id', currentUser.id)
          .single();
        
        if (error) {
          console.warn("[ViralAuthority PRO PREMIUM Auth] Profile check error (Table might not exist):", error);
        }

        if (data?.is_premium) {
          console.log("[ViralAuthority PRO PREMIUM Auth] User is PRO!");
          setIsPremium(true);
        } else {
          console.warn("[ViralAuthority PRO PREMIUM Auth] User is not Pro yet. Redirect to /premium suggested.");
          setIsPremium(false);
          // We no longer sign out automatically to allow payment flow
        }
      }
    } else {
      setIsPremium(false);
      setIsAdmin(false);
    }

    // Check for pending Pro activation from a guest payment
    if (currentUser && typeof window !== "undefined") {
      const pendingPro = localStorage.getItem("pending_pro");
      if (pendingPro) {
        console.log("[ViralAuthority PRO PREMIUM Auth] 💎 Found pending Pro activation! Synchronizing with account...");
        try {
          // Give the DB a moment to settle after login
          setTimeout(async () => {
            try {
              await setPremiumStatusInDB(true);
              localStorage.removeItem("pending_pro");
              console.log("[ViralAuthority PRO PREMIUM Auth] ✅ Pro status successfully applied to account.");
              // Force refresh the page to update all UI components
              window.location.reload();
            } catch (err) {
              console.error("[ViralAuthority PRO PREMIUM Auth] ❌ Error applying Pro status to DB:", err);
            }
          }, 1000);
        } catch (err) {
          console.error("[ViralAuthority PRO PREMIUM Auth] ❌ Failed to initiate pending Pro status application:", err);
        }
      }
    }
  };

  const checkPremiumStatus = async (userId: string) => {
    if (isAdmin) return; // SuperAdmins are already Pro
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', userId)
        .single();
      
      if (data) {
        setIsPremium(data.is_premium);
      }
    } catch (err) {
      console.error("Error checking premium status:", err);
    }
  };

  const setPremiumStatusInDB = async (status: boolean) => {
    if (!user) return;
    
    console.log("[ViralAuthority PRO PREMIUM Auth] Updating Pro status in DB to:", status);
    const { error } = await supabase
      .from('profiles')
      .upsert({ 
        id: user.id,
        is_premium: status 
      });
    
    if (error) {
      console.error("[ViralAuthority PRO PREMIUM Auth] Error updating status:", error);
      throw error;
    }
    
    setIsPremium(status);
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setIsPremium(false);
    setIsAdmin(false);
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      session, 
      isPremium, 
      isAdmin, 
      isLoading, 
      isLoginModalOpen,
      openLoginModal,
      closeLoginModal,
      loginWithGoogle, 
      logout,
      setPremiumStatusInDB
    }}>
      {children}
      <LoginModal isOpen={isLoginModalOpen} onClose={closeLoginModal} />
    </UserContext.Provider>
  );
}

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
