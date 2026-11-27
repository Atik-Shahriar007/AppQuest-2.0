import Constants from "expo-constants";
import { Platform } from "react-native";

const isLocal = (url: string) =>
  /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);

/**
 * Base URL of the NutriScan API.
 * - EXPO_PUBLIC_API_URL wins, except that "localhost" is useless on a phone: in development the
 *   phone reaches the computer at the same address it loads the app from (Expo's hostUri).
 * - Web without the variable: same host, port 3000.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (Platform.OS !== "web" && (!fromEnv || isLocal(fromEnv))) {
    const host = Constants.expoConfig?.hostUri?.split(":")[0];
    if (host)
      return `http://${host}:${fromEnv ? new URL(fromEnv).port || "3000" : "3000"}`;
  }
  if (fromEnv) return fromEnv;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return "http://localhost:3000";
}
