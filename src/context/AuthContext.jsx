import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null);
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);

  // Load profile row for the logged-in user
  async function loadProfile(userId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) { console.error("Profile load error:", error); return null; }
    setProfile(data);
    return data;
  }

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      if (sess?.user) await loadProfile(sess.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Auth actions ──────────────────────────────────────────────────────────
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error && session?.user) {
      // Clear the must_reset flag
      await supabase.from("profiles").update({ must_reset_pw: false }).eq("id", session.user.id);
      await loadProfile(session.user.id);
    }
    return { error };
  };

  const sendResetEmail = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error };
  };

  const refreshProfile = () => session?.user && loadProfile(session.user.id);

  return (
    <AuthContext.Provider value={{ session, profile, loading, login, logout, resetPassword, sendResetEmail, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
