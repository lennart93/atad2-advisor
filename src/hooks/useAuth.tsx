import { useState, useEffect, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Heartbeat: stamp profiles.last_seen_at via a security-definer RPC.
  // Throttled to once every 5 min via localStorage so we don't hammer
  // the DB on every render.
  useEffect(() => {
    if (!user) return;
    const HEARTBEAT_KEY = `last_seen_at:${user.id}`;
    const FIVE_MIN = 5 * 60 * 1000;
    const lastPing = Number(localStorage.getItem(HEARTBEAT_KEY) ?? 0);
    if (Date.now() - lastPing < FIVE_MIN) return;
    void supabase.rpc("mark_user_seen").then(({ error }) => {
      if (error) {
        console.warn("[useAuth] mark_user_seen failed", error);
        return;
      }
      localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
    });
  }, [user]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      // Always clear local auth state regardless of API success/failure
      setSession(null);
      setUser(null);
    }
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};