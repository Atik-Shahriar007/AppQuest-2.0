/**
 * Mirrors the on-device state to the NutriScan API while a user is signed in:
 * - health profile, goals, language, Halal/Child Safe modes -> profiles (Nouri reads these)
 * - scan history and favorites -> history/favorites (recall alerts are matched against them)
 * The screens keep reading local state, so the app still works offline and for guests.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { useAuth } from "./auth";
import { useNutriScan } from "./nutriscan-state";
import { trpc } from "./trpc";

const HISTORY_CURSOR_KEY = "nutriscan-history-synced-at";

export function ServerSync() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const {
    healthProfile,
    language,
    halalMode,
    childSafeMode,
    profile,
    history,
    favorites,
    setIsPremium,
  } = useNutriScan();

  // Premium badge always reflects the server, never a locally stored flag.
  const access = trpc.premium.access.useQuery(undefined, {
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!userId) setIsPremium(false);
    else if (access.data) setIsPremium(access.data.premium);
  }, [userId, access.data, setIsPremium]);

  const updateProfile = trpc.me.updateProfile.useMutation();
  const addHistory = trpc.me.addHistory.useMutation();
  const setFavorite = trpc.me.setFavorite.useMutation();

  // Profile and modes, debounced.
  const profileKey = JSON.stringify({
    healthProfile,
    language,
    halalMode,
    childSafeMode,
    name: profile.displayName,
  });
  const lastSentProfile = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || lastSentProfile.current === `${userId}:${profileKey}`)
      return;
    const id = setTimeout(() => {
      updateProfile.mutate(
        {
          displayName: profile.displayName.trim() || null,
          language,
          health: {
            age: healthProfile.age,
            gender: healthProfile.gender,
            conditions: healthProfile.healthConditions,
            dietaryRestrictions: healthProfile.dietaryRestrictions,
            allergies: healthProfile.foodAllergies,
            intolerances: healthProfile.foodIntolerances,
            avoidFoods: healthProfile.avoidFoods,
          },
          goals: { nutritionGoals: healthProfile.nutritionGoals },
          modes: { halalMode, childSafeMode },
        },
        {
          onSuccess: () =>
            (lastSentProfile.current = `${userId}:${profileKey}`),
        },
      );
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profileKey]);

  // History: send entries newer than the last synced one, oldest first.
  const historyBusy = useRef(false);
  useEffect(() => {
    if (!userId || historyBusy.current || history.length === 0) return;
    historyBusy.current = true;
    (async () => {
      const key = `${HISTORY_CURSOR_KEY}:${userId}`;
      const cursor = (await AsyncStorage.getItem(key)) ?? "";
      const fresh = history
        .filter((h) => h.scannedAt > cursor)
        .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
        .slice(-50);
      for (const h of fresh) {
        try {
          await addHistory.mutateAsync({
            productId: h.productId,
            source: "scan",
          });
          await AsyncStorage.setItem(key, h.scannedAt);
        } catch {
          break; // offline or unknown product: retry on the next change
        }
      }
    })().finally(() => {
      historyBusy.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, history]);

  // Favorites: idempotent on the server, so send the whole set when it changes.
  const lastFavorites = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const key = `${userId}:${[...favorites].sort().join(",")}`;
    if (lastFavorites.current === key) return;
    const previous = new Set(
      lastFavorites.current?.split(":")[1]?.split(",").filter(Boolean) ?? [],
    );
    const current = new Set(favorites);
    lastFavorites.current = key;
    for (const id of current)
      if (!previous.has(id)) setFavorite.mutate({ productId: id, on: true });
    for (const id of previous)
      if (!current.has(id)) setFavorite.mutate({ productId: id, on: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, favorites]);

  return null;
}
