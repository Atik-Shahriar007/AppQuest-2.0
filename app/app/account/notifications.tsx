/**
 * Notifications: verified food safety alerts (public) plus the signed-in user's own
 * notifications (recalls that match their scans or favorites, expiry reminders).
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Linking, Pressable, View } from "react-native";
import {
  AppText,
  Card,
  PageHeader,
  Pill,
  Screen,
  SecondaryButton,
  SectionHeading,
  usePalette,
} from "@/components/nutriscan-ui";
import { useAuth } from "@/lib/auth";
import { productById } from "@/lib/nutriscan-data";
import { useNutriScan } from "@/lib/nutriscan-state";
import { trpc } from "@/lib/trpc";

export default function NotificationsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { language } = useNutriScan();
  const en = language === "en";
  const auth = useAuth();
  const recalls = trpc.community.activeRecalls.useQuery();
  const mine = trpc.me.notifications.useQuery(undefined, {
    enabled: Boolean(auth.session),
  });
  const markRead = trpc.me.markNotificationsRead.useMutation();
  const utils = trpc.useUtils();

  // Opening the screen marks everything as read.
  const unread = (mine.data ?? []).filter((n) => !n.readAt).length;
  useEffect(() => {
    if (unread > 0)
      markRead.mutate(undefined, {
        onSuccess: () => utils.me.notifications.invalidate(),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  const date = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString(en ? "en-GB" : "bn-BD") : "";

  return (
    <Screen contentStyle={{ gap: 16 }}>
      <PageHeader
        title={en ? "Notifications" : "নোটিফিকেশন"}
        back={() => router.back()}
      />

      <SectionHeading title={en ? "Your notifications" : "আপনার নোটিফিকেশন"} />
      {!auth.session ? (
        <Card style={{ gap: 8 }}>
          <AppText style={{ fontSize: 12 }}>
            {en
              ? "Sign in to get alerts when a product you scanned or saved is recalled, and reminders before food expires."
              : "আপনার স্ক্যান বা সংরক্ষিত পণ্য প্রত্যাহার হলে সতর্কবার্তা এবং মেয়াদ শেষের আগে রিমাইন্ডার পেতে সাইন ইন করুন।"}
          </AppText>
          <SecondaryButton
            title={en ? "Sign in" : "সাইন ইন"}
            icon="login"
            onPress={() => router.push("/onboarding")}
          />
        </Card>
      ) : mine.data?.length ? (
        mine.data.map((n) => (
          <Card key={n.id} style={{ gap: 6 }}>
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <MaterialCommunityIcons
                name={
                  n.kind === "recall"
                    ? "alert-octagon-outline"
                    : n.kind === "expiry"
                      ? "calendar-clock"
                      : "bell-outline"
                }
                size={18}
                color={n.kind === "recall" ? palette.clay : palette.green}
              />
              <AppText weight="semibold" style={{ flex: 1, fontSize: 13 }}>
                {n.title}
              </AppText>
              {!n.readAt ? (
                <Pill tone="amber">{en ? "New" : "নতুন"}</Pill>
              ) : null}
            </View>
            <AppText style={{ fontSize: 12, color: palette.muted }}>
              {n.body}
            </AppText>
            <AppText style={{ fontSize: 12, color: palette.muted }}>
              {date(n.createdAt)}
            </AppText>
          </Card>
        ))
      ) : (
        <Card>
          <AppText style={{ fontSize: 12, color: palette.muted }}>
            {en ? "Nothing new." : "নতুন কিছু নেই।"}
          </AppText>
        </Card>
      )}

      <SectionHeading
        title={
          en
            ? "Verified food safety alerts"
            : "যাচাইকৃত খাদ্য নিরাপত্তা সতর্কতা"
        }
      />
      {recalls.data?.length ? (
        recalls.data.map((r) => (
          <Card key={r.id} style={{ gap: 6, borderColor: palette.clay }}>
            <AppText weight="semibold" style={{ fontSize: 13 }}>
              {r.title}
            </AppText>
            <AppText style={{ fontSize: 12, color: palette.muted }}>
              {r.body}
            </AppText>
            {r.productIds.map((id) => {
              const p = productById(id);
              return p ? (
                <Pressable
                  key={id}
                  onPress={() => router.push(`/product/${id}`)}
                >
                  <AppText style={{ fontSize: 12, color: palette.green }}>
                    {p.name[language]}
                  </AppText>
                </Pressable>
              ) : null;
            })}
            <Pressable onPress={() => void Linking.openURL(r.sourceUrl)}>
              <AppText style={{ fontSize: 12, color: palette.green }}>
                {en ? "Source" : "উৎস"}: {r.sourceUrl}
              </AppText>
            </Pressable>
            <AppText style={{ fontSize: 12, color: palette.muted }}>
              {date(r.approvedAt)}
            </AppText>
          </Card>
        ))
      ) : (
        <Card>
          <AppText style={{ fontSize: 12, color: palette.muted }}>
            {en
              ? "No active recalls. NutriScan only shows alerts verified by our team from an official source."
              : "কোনো সক্রিয় প্রত্যাহার নেই। নিউট্রিস্ক্যান শুধু সরকারি উৎস থেকে টিম-যাচাইকৃত সতর্কতা দেখায়।"}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}
