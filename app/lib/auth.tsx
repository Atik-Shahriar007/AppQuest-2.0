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
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

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
  signInWithGoogle: () => Promise<AuthResult>;
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
      async signInWithGoogle() {
        if (!supabase)
          return { ok: false, message: "Sign-in is not configured." };
        const notEnabled = (m: string) =>
          /provider is not enabled|unsupported provider/i.test(m)
            ? "Google sign-in is not enabled yet. Use email for now."
            : friendly(m);
        // Ask Supabase whether Google is enabled before sending anyone to an error page.
        try {
          const res = await fetch(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
            {
              headers: {
                apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
              },
            },
          );
          const settings = (await res.json()) as {
            external?: Record<string, boolean>;
          };
          if (!settings.external?.google)
            return {
              ok: false,
              message: "Google sign-in is not enabled yet. Use email for now.",
            };
        } catch {
          // If the check fails, try anyway; Supabase will report a real error.
        }
        if (Platform.OS === "web") {
          // Full-page redirect; the session is read from the URL when the app loads again.
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin },
          });
          return error
            ? { ok: false, message: notEnabled(error.message) }
            : { ok: true };
        }
        // Phones: open Google in an auth session and come back through nutriscan://auth-callback.
        const redirectTo = Linking.createURL("auth-callback");
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url)
          return {
            ok: false,
            message: notEnabled(error?.message ?? "No sign-in URL"),
          };
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
        );
        if (result.type !== "success")
          return { ok: false, message: "Google sign-in was cancelled." };
        const url = new URL(result.url);
        const params = new URLSearchParams(
          url.hash.replace(/^#/, "") || url.search,
        );
        const code = params.get("code");
        if (code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(code);
          return e ? { ok: false, message: friendly(e.message) } : { ok: true };
        }
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (!access_token || !refresh_token)
          return { ok: false, message: "Google sign-in did not complete." };
        const { error: e } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        return e ? { ok: false, message: friendly(e.message) } : { ok: true };
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
