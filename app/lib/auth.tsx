/**
 * Account state from Supabase Auth (email + password now; Google once the provider is enabled
 * in the Supabase dashboard). Keeps the prototype's NutriScan state in sync so existing screens
 * that read `isAuthenticated` and the account name keep working.
 */
import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNutriScan } from "./nutriscan-state";
import { supabase } from "./supabase";

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; message: string };

type AuthValue = {
  available: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message))
    return "Wrong email or password.";
  if (/email not confirmed/i.test(message))
    return "Please confirm your email first. Check your inbox.";
  if (/already registered|already exists/i.test(message))
    return "An account with this email already exists. Sign in instead.";
  if (/rate limit/i.test(message))
    return "Too many attempts. Please wait a few minutes.";
  if (/password/i.test(message))
    return "Password must be at least 6 characters.";
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const { setIsAuthenticated, setDemoAccount } = useNutriScan();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Mirror the real session into the prototype state the screens read.
  useEffect(() => {
    if (!ready) return;
    setIsAuthenticated(Boolean(session));
    if (session?.user) {
      const name =
        (session.user.user_metadata?.name as string | undefined) ??
        session.user.email?.split("@")[0] ??
        "";
      setDemoAccount({ name, email: session.user.email ?? "" });
    }
  }, [ready, session, setIsAuthenticated, setDemoAccount]);

  const value = useMemo<AuthValue>(
    () => ({
      available: Boolean(supabase),
      ready,
      session,
      email: session?.user.email ?? null,
      async signIn(email, password) {
        if (!supabase)
          return { ok: false, message: "Sign-in is not configured." };
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return error
          ? { ok: false, message: friendly(error.message) }
          : { ok: true };
      },
      async signUp(name, email, password) {
        if (!supabase)
          return { ok: false, message: "Sign-in is not configured." };
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (error) return { ok: false, message: friendly(error.message) };
        return { ok: true, needsEmailConfirmation: !data.session };
      },
      async resetPassword(email) {
        if (!supabase)
          return { ok: false, message: "Sign-in is not configured." };
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
        );
        return error
          ? { ok: false, message: friendly(error.message) }
          : { ok: true };
      },
      async signOut() {
        await supabase?.auth.signOut();
      },
    }),
    [ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
