import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { AppText, Card, IconTile, PageHeader, PrimaryButton, Screen, SecondaryButton, usePalette } from "@/components/nutriscan-ui";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/nutriscan-data";
import { useNutriScan } from "@/lib/nutriscan-state";
import { trpc } from "@/lib/trpc";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const bn = (n: number | string) => String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

export default function CommunityScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { language } = useNutriScan();
  const en = language === "en";
  const auth = useAuth();
  const board = trpc.community.leaderboard.useQuery();
  const mine = trpc.community.myPoints.useQuery(undefined, { enabled: Boolean(auth.session) });
  const num = (n: number) => (en ? String(n) : bn(n));

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <PageHeader title={t(language, "community")} subtitle={t(language, "leaderboardTitle")} />
      <View style={{ flexDirection: "row", gap: 11, alignItems: "center" }}>
        <IconTile icon="trophy-outline" tone="amber" />
        <View style={{ flex: 1, gap: 3 }}>
          <AppText weight="semibold" style={{ fontSize: 14 }}>{t(language, "leaderboardTitle")}</AppText>
          <AppText style={{ color: palette.muted, fontSize: 11 }}>
            {en ? "10 points for every product the team approves." : "টিম অনুমোদিত প্রতিটি পণ্যের জন্য ১০ পয়েন্ট।"}
          </AppText>
        </View>
      </View>

      <Card style={{ gap: 0, paddingVertical: 5 }}>
        {board.data?.length ? (
          board.data.map((person, index) => (
            <View
              key={`${person.rank}-${person.name}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 13,
                borderBottomWidth: index === board.data.length - 1 ? 0 : 1,
                borderBottomColor: palette.line,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  backgroundColor: index === 0 ? palette.amberSoft : palette.neutralSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText weight="bold" style={{ color: palette.green, fontSize: 11 }}>{num(person.rank)}</AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={{ fontSize: 13 }}>{person.name}</AppText>
                <AppText style={{ color: palette.muted, fontSize: 10 }}>
                  {en ? `${person.approved} approved` : `${bn(person.approved)}টি অনুমোদিত`}
                </AppText>
              </View>
              <AppText weight="semibold" style={{ color: palette.green, fontSize: 12 }}>
                {num(person.points)} {en ? "pts" : "পয়েন্ট"}
              </AppText>
            </View>
          ))
        ) : (
          <AppText style={{ color: palette.muted, fontSize: 12, paddingVertical: 13 }}>
            {board.isLoading
              ? en ? "Loading..." : "লোড হচ্ছে..."
              : en ? "No approved contributions yet. Be the first!" : "এখনো কোনো অনুমোদিত অবদান নেই। প্রথম হন!"}
          </AppText>
        )}
      </Card>

      <Card style={{ backgroundColor: palette.greenSoft, borderColor: palette.line, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MaterialCommunityIcons name="account-check-outline" size={18} color={palette.green} />
          <AppText weight="semibold" style={{ color: palette.green, fontSize: 13 }}>{t(language, "yourPoints")}</AppText>
        </View>
        {auth.session ? (
          <>
            <AppText weight="bold" style={{ color: palette.green, fontSize: 32 }}>{num(mine.data?.points ?? 0)}</AppText>
            <AppText style={{ color: palette.green, fontSize: 11 }}>
              {en
                ? `${mine.data?.approved ?? 0} approved · ${mine.data?.pending ?? 0} waiting for review`
                : `${bn(mine.data?.approved ?? 0)}টি অনুমোদিত · ${bn(mine.data?.pending ?? 0)}টি পর্যালোচনার অপেক্ষায়`}
            </AppText>
          </>
        ) : (
          <SecondaryButton title={en ? "Sign in to earn points" : "পয়েন্ট পেতে সাইন ইন করুন"} icon="login" onPress={() => router.push("/onboarding")} />
        )}
      </Card>

      <PrimaryButton
        title={en ? "Add a missing product" : "নেই এমন পণ্য যোগ করুন"}
        icon="camera-plus-outline"
        onPress={() => router.push("/(tabs)/contribute")}
      />
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <IconTile icon="shield-check-outline" />
        <View style={{ flex: 1, gap: 5 }}>
          <AppText weight="semibold" style={{ fontSize: 13 }}>{en ? "Recognition, not influence" : "স্বীকৃতি, প্রভাব নয়"}</AppText>
          <AppText style={{ color: palette.muted, fontSize: 11, lineHeight: 18 }}>
            {en
              ? "Points celebrate useful approved label data. They never change a product score, verification status, or search ranking."
              : "গৃহীত ও উপকারী লেবেল তথ্যের জন্য পয়েন্ট। এগুলো পণ্যের স্কোর, যাচাইয়ের অবস্থা বা সার্চের ক্রম বদলায় না।"}
          </AppText>
        </View>
      </Card>
    </Screen>
  );
}
