import { useMemo } from "react";
import { scoreTone } from "@/lib/nutrition-utils";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AppText,
  Card,
  DemoNotice,
  EmptyState,
  PageHeader,
  Pill,
  PrimaryButton,
  ProductRow,
  Screen,
  SectionHeading,
  SecondaryButton,
  usePalette,
} from "@/components/nutriscan-ui";
import {
  filterProductsByChildSafe,
  filterProductsByHalal,
  productById,
  productName,
  products,
  t,
} from "@/lib/nutriscan-data";
import type { Category } from "@/lib/nutriscan-data";
import { dailyTips } from "@/lib/nutrifacts";
import { useNutriScan } from "@/lib/nutriscan-state";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";

const nutriScanMark = require("../../assets/images/nutriscan-mark.png");

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const notificationsQuery = trpc.me.notifications.useQuery(undefined, {
    enabled: Boolean(auth.session),
    refetchInterval: 60_000,
  });
  const { language, halalMode, childSafeMode, history } =
    useNutriScan();
  const palette = usePalette();

  const categoryStyles: Record<
    Category,
    {
      icon: "food-apple-outline" | "bottle-tonic-outline" | "spray-bottle";
      tint: string;
    }
  > = {
    food: { icon: "food-apple-outline", tint: palette.greenSoft },
    personalCare: { icon: "bottle-tonic-outline", tint: palette.amberSoft },
    household: { icon: "spray-bottle", tint: palette.claySoft },
  };

  const visibleProducts = useMemo(
    () =>
      filterProductsByChildSafe(
        filterProductsByHalal(products, halalMode),
        childSafeMode,
      ),
    [halalMode, childSafeMode],
  );
  const featuredProducts = useMemo(
    () =>
      visibleProducts
        .filter((product) => product.category === "food")
        .slice(0, 3),
    [visibleProducts],
  );

  const recentProducts = useMemo(
    () =>
      history
        .slice(0, 5)
        .map((entry) => productById(entry.productId))
        .filter((p): p is NonNullable<typeof p> => p !== undefined),
    [history],
  );

  const tip = dailyTips[0];

  const openProduct = (productId: string) => {
    router.push({ pathname: "/product/[id]", params: { id: productId } });
  };
  const categories: Category[] = ["food", "personalCare", "household"];
  const unreadCount = (notificationsQuery.data ?? []).filter(
    (n) => !n.readAt,
  ).length;

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <PageHeader
        title={language === "en" ? "Product guide" : "পণ্য নির্দেশিকা"}
        subtitle={t(language, "tagline")}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              language === "en" ? "Notifications" : "বিজ্ঞপ্তি"
            }
            onPress={() => router.push("/account/notifications" as never)}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.line,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <MaterialCommunityIcons
              name={unreadCount > 0 ? "bell-badge-outline" : "bell-outline"}
              size={18}
              color={unreadCount > 0 ? palette.clay : palette.green}
            />
          </Pressable>
        }
      />

      <Card style={{ padding: 16, gap: 16, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <BarcodeScanIllustration />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText weight="semibold" style={{ fontSize: 16, lineHeight: 22 }}>
              {t(language, "scannerTitle")}
            </AppText>
            <AppText
              style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}
            >
              {t(language, "scannerHint")}
            </AppText>
          </View>
        </View>
        <PrimaryButton
          title={t(language, "openScanner")}
          icon="barcode-scan"
          onPress={() => router.push("/scan")}
        />
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          language === "en" ? "Search products" : "পণ্য খুঁজুন"
        }
        onPress={() => router.push("/(tabs)/discover")}
        style={({ pressed }) => ({
          minHeight: 48,
          borderRadius: 12,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.line,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <MaterialCommunityIcons
          name="magnify"
          size={18}
          color={palette.muted}
        />
        <AppText style={{ color: palette.muted, fontSize: 14 }}>
          {language === "en" ? "Search" : "খুঁজুন"}
        </AppText>
      </Pressable>

      <View style={{ gap: 12 }}>
        <SectionHeading
          title={t(language, "categories")}
          action={t(language, "seeAll")}
          onAction={() => router.push("/(tabs)/discover")}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {categories.map((category) => {
            const item = categoryStyles[category];
            const count = visibleProducts.filter(
              (product) => product.category === category,
            ).length;
            const label =
              category === "food"
                ? t(language, "food")
                : category === "personalCare"
                  ? t(language, "personalCare")
                  : t(language, "household");
            return (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={
                  language === "en" ? `Browse ${label}` : `${label} দেখুন`
                }
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/discover",
                    params: { category },
                  })
                }
                style={({ pressed }) => [
                  {
                    flex: 1,
                    minHeight: 100,
                    borderRadius: 16,
                    padding: 12,
                    backgroundColor: palette.card,
                    borderColor: palette.line,
                    borderWidth: 1,
                    justifyContent: "space-between",
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: item.tint,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={18}
                    color={palette.green}
                  />
                </View>
                <View style={{ gap: 4 }}>
                  <AppText weight="semibold" style={{ fontSize: 12 }}>
                    {label}
                  </AppText>
                  <AppText
                    style={{
                      color: palette.muted,
                      fontSize: 12,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {count} {language === "en" ? "products" : "পণ্য"}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeading
          title={t(language, "tipOfDay")}
          action={t(language, "seeAll")}
          onAction={() => router.push("/(tabs)/profile")}
        />
        <Card
          style={{
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: palette.greenSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons
                name="lightbulb-on-outline"
                size={18}
                color={palette.green}
              />
            </View>
            <AppText weight="semibold" style={{ flex: 1, fontSize: 14 }}>
              {tip.title[language]}
            </AppText>
          </View>
          <AppText
            style={{ color: palette.muted, fontSize: 13, lineHeight: 20 }}
          >
            {tip.body[language]}
          </AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(tip.sourceUrl);
            }}
            style={({ pressed }) => ({
              minHeight: 36,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: "flex-start",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <MaterialCommunityIcons
              name="open-in-new"
              size={14}
              color={palette.green}
            />
            <AppText
              weight="medium"
              style={{ color: palette.green, fontSize: 12 }}
            >
              {t(language, "readSource")}: {tip.sourceTitle}
            </AppText>
          </Pressable>
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeading
          title={t(language, "recentScans")}
          action={t(language, "seeAll")}
          onAction={() => router.push("/(tabs)/history")}
        />
        {recentProducts.length === 0 ? (
          <Card style={{ paddingVertical: 8 }}>
            <EmptyState
              icon="barcode-scan"
              title={t(language, "emptyHistory")}
              body={t(language, "emptyHistoryBody")}
            />
          </Card>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {recentProducts.map((product) => (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                accessibilityLabel={productName(product, language)}
                onPress={() => openProduct(product.id)}
                style={({ pressed }) => ({
                  width: 120,
                  borderRadius: 18,
                  padding: 10,
                  backgroundColor: palette.card,
                  borderWidth: 1,
                  borderColor: palette.line,
                  gap: 8,
                  alignItems: "center",
                  opacity: pressed ? 0.86 : 1,
                })}
              >
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 14,
                    backgroundColor: palette.photo,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <Image
                    source={product.image}
                    resizeMode="contain"
                    style={{ width: 64, height: 64 }}
                  />
                </View>
                <AppText
                  weight="semibold"
                  numberOfLines={2}
                  style={{ fontSize: 12, lineHeight: 16, textAlign: "center" }}
                >
                  {productName(product, language)}
                </AppText>
                {product.category === "food" && product.score !== undefined ? (
                  <Pill tone={scoreTone(product.score)}>
                    {product.score}/100
                  </Pill>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ gap: 7 }}>
        <SectionHeading
          title={language === "en" ? "From the Catalog" : "ক্যাটালগ থেকে"}
          action={t(language, "seeAll")}
          onAction={() => router.push("/(tabs)/discover")}
        />
        <Card style={{ paddingHorizontal: 13, paddingVertical: 2, gap: 0 }}>
          {featuredProducts.length ? (
            featuredProducts.map((product, index) => (
              <View key={product.id}>
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: palette.line }} />
                ) : null}
                <ProductRow
                  product={product}
                  onPress={() => openProduct(product.id)}
                  aside={
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={palette.muted}
                    />
                  }
                />
              </View>
            ))
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 22, gap: 7 }}>
              <MaterialCommunityIcons
                name="shield-off-outline"
                size={25}
                color={palette.muted}
              />
              <AppText weight="semibold" style={{ fontSize: 12 }}>
                {t(language, "halalEmptyTitle")}
              </AppText>
              <AppText
                style={{
                  color: palette.muted,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {t(language, "halalEmptyBody")}
              </AppText>
              <SecondaryButton
                title={t(language, "turnOffHalalMode")}
                icon="shield-off-outline"
                onPress={() => router.push("/(tabs)/profile")}
                style={{ alignSelf: "stretch", marginTop: 4 }}
              />
            </View>
          )}
        </Card>
      </View>

      <DemoNotice>{t(language, "demoProductCaveat")}</DemoNotice>
    </Screen>
  );
}

function BarcodeScanIllustration() {
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityLabel="NutriScan barcode mark"
      style={{
        width: 80,
        height: 80,
        borderRadius: 12,
        backgroundColor: palette.greenSoft,
        borderWidth: 1,
        borderColor: palette.line,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Image
        source={nutriScanMark}
        resizeMode="contain"
        style={{ width: 64, height: 64, borderRadius: 8 }}
      />
    </View>
  );
}
