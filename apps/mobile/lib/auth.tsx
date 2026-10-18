import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { api } from "./api";
import { unregisterPush } from "./push";

type AuthValue = { session: Session | null; loading: boolean; displayName: string; refresh: () => Promise<void>; signOut: () => Promise<void> };
const Context = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const refresh = async () => {
    const { data } = await supabase.auth.getSession(); setSession(data.session);
    if (data.session) {
      try {
        const result = await api<{ user: { role: string; displayName: string } }>("/auth/session");
        if (result.user.role !== "PATIENT") throw new Error("PATIENT_ACCOUNT_REQUIRED");
        setDisplayName(result.user.displayName);
      } catch (error) {
        if (error instanceof Error && error.message === "ACCOUNT_NOT_PROVISIONED") {
          const { data: userData } = await supabase.auth.getUser();
          const name = String(userData.user?.user_metadata?.full_name || userData.user?.email?.split("@")[0] || "Patient");
          await api("/patient/register", { method: "POST", body: JSON.stringify({ displayName: name, phoneNumber: userData.user?.user_metadata?.phone_number }) });
          setDisplayName(name);
        } else if (error instanceof Error && error.message === "PATIENT_ACCOUNT_REQUIRED") {
          await supabase.auth.signOut(); setSession(null); throw error;
        } else throw error;
      }
    }
  };
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      try { if (data.session) await refresh(); } catch { /* The screen will surface recovery on next sign-in. */ }
      if (mounted) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (!next) setDisplayName(""); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  const signOut = async () => { try { await unregisterPush(); } catch { /* A failed device cleanup must not prevent sign out. */ } await supabase.auth.signOut(); setSession(null); setDisplayName(""); };
  return <Context.Provider value={{ session, loading, displayName, refresh, signOut }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("AuthProvider is missing"); return value; }
