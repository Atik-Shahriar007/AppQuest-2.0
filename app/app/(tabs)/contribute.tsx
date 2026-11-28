import { useState } from "react";
import { Image, Platform, Pressable, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AppText,
  Card,
  PageHeader,
  Pill,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionHeading,
  fontFamily,
  usePalette,
} from "@/components/nutriscan-ui";
import { categoryLabel, t } from "@/lib/nutriscan-data";
import type { Category } from "@/lib/nutriscan-data";
import { useNutriScan } from "@/lib/nutriscan-state";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";

const categories: Category[] = ["food", "personalCare", "household"];

export default function ContributeScreen() {
  const params = useLocalSearchParams<{ barcode?: string }>();
  const { language } = useNutriScan();
  const router = useRouter();
  const auth = useAuth();
  const mine = trpc.community.myContributions.useQuery(undefined, {
    enabled: Boolean(auth.session),
  });
  const submitContribution = trpc.community.submitContribution.useMutation({
    onSuccess: () => mine.refetch(),
  });
  type Photo = {
    uri: string;
    base64: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  };
  const [frontPhoto, setFrontPhoto] = useState<Photo>();
  const [backPhoto, setBackPhoto] = useState<Photo>();
  const [error, setError] = useState("");
  const palette = usePalette();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState(
    typeof params.barcode === "string" ? params.barcode : "",
  );
  const [category, setCategory] = useState<Category>("food");
  const frontPhotoUri = frontPhoto?.uri;
  const backPhotoUri = backPhoto?.uri;
  const [notice, setNotice] = useState("");

  const addPhoto = async (side: "front" | "back") => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (Platform.OS === "web") {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.5,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.5,
          base64: true,
        });
        if (result.canceled) return;
      }
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset?.uri && asset.base64) {
        if (asset.base64.length > 2_000_000) {
          setError(
            language === "en"
              ? "That photo is too large. Please take it a little further away."
              : "ছবিটি অনেক বড়। একটু দূর থেকে তুলুন।",
          );
          return;
        }
        const mimeType =
          asset.mimeType === "image/png"
            ? "image/png"
            : asset.mimeType === "image/webp"
              ? "image/webp"
              : "image/jpeg";
        const photo = {
          uri: asset.uri,
          base64: asset.base64,
          mimeType,
        } as const;
        if (side === "front") setFrontPhoto(photo);
        else setBackPhoto(photo);
      }
    } catch {
      setNotice(
        language === "en"
          ? "Photo access is unavailable here. You can still explore the form."
          : "এখানে ছবির সুবিধা পাওয়া যাচ্ছে না। ফর্মটি দেখতে পারেন।",
      );
    }
  };

  const submit = async () => {
    const cleanName = name.trim();
    const code = barcode.replace(/\D/g, "");
    setError("");
    setNotice("");
    if (!auth.session) return router.push("/onboarding");
    if (!cleanName || !frontPhoto || !backPhoto) return;
    if (code.length < 8 || code.length > 14) {
      setError(
        language === "en"
          ? "Enter the 8 to 13 digit barcode number."
          : "৮ থেকে ১৩ অঙ্কের বারকোড নম্বর লিখুন।",
      );
      return;
    }
    try {
      await submitContribution.mutateAsync({
        barcode: code,
        name: cleanName,
        brand: brand.trim() || undefined,
        category,
        photos: [
          {
            side: "front",
            mimeType: frontPhoto.mimeType,
            base64: frontPhoto.base64,
          },
          {
            side: "back",
            mimeType: backPhoto.mimeType,
            base64: backPhoto.base64,
          },
        ],
      });
      setNotice(t(language, "submissionSuccess"));
      setName("");
      setBrand("");
      setBarcode("");
      setFrontPhoto(undefined);
      setBackPhoto(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const canSubmit = Boolean(name.trim() && frontPhotoUri && backPhotoUri);
  const fieldStyle = {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    paddingHorizontal: 13,
    color: palette.ink,
    fontFamily: fontFamily(language),
    fontSize: 12,
  } as const;

  return (
    <Screen contentStyle={{ gap: 16 }}>
      <PageHeader
        title={t(language, "contribute")}
        subtitle={t(language, "contributeTitle")}
      />
      <AppText style={{ color: palette.muted, fontSize: 12, lineHeight: 19 }}>
        {t(language, "contributeBody")}
      </AppText>
      {!auth.session ? (
        <Card style={{ gap: 8 }}>
          <AppText style={{ fontSize: 12 }}>
            {language === "en"
              ? "Sign in to send products for review and earn points on the leaderboard."
              : "পর্যালোচনার জন্য পণ্য পাঠাতে ও লিডারবোর্ডে পয়েন্ট পেতে সাইন ইন করুন।"}
          </AppText>
          <SecondaryButton
            title={language === "en" ? "Sign in" : "সাইন ইন"}
            icon="login"
            onPress={() => router.push("/onboarding")}
          />
        </Card>
      ) : null}
      <View style={{ gap: 10 }}>
        <SectionHeading title={t(language, "frontPhoto")} />
        <PhotoSlot
          language={language}
          label={t(language, "frontPhoto")}
          uri={frontPhotoUri}
          onPress={() => addPhoto("front")}
          action={t(language, "addPhoto")}
        />
        <SectionHeading title={t(language, "backPhoto")} />
        <PhotoSlot
          language={language}
          label={t(language, "backPhoto")}
          uri={backPhotoUri}
          onPress={() => addPhoto("back")}
          action={t(language, "addPhoto")}
        />
        <AppText style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>
          {t(language, "uploadHint")}
        </AppText>
      </View>
      <Card style={{ gap: 11 }}>
        <Field
          label={t(language, "productName")}
          value={name}
          onChangeText={setName}
          placeholder={
            language === "en"
              ? "e.g. product name on pack"
              : "যেমন প্যাকেটের পণ্যের নাম"
          }
          fieldStyle={fieldStyle}
        />
        <Field
          label={t(language, "brandName")}
          value={brand}
          onChangeText={setBrand}
          placeholder={
            language === "en"
              ? "Brand / maker, if known"
              : "ব্র্যান্ড / প্রস্তুতকারক, জানা থাকলে"
          }
          fieldStyle={fieldStyle}
        />
        <Field
          label={t(language, "barcode")}
          value={barcode}
          onChangeText={setBarcode}
          placeholder={t(language, "barcodePlaceholder")}
          fieldStyle={fieldStyle}
          keyboardType="number-pad"
        />
        <AppText weight="semibold" style={{ fontSize: 12 }}>
          {t(language, "category")}
        </AppText>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {categories.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityLabel={categoryLabel(item, language)}
              accessibilityState={{ selected: item === category }}
              onPress={() => setCategory(item)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: item === category ? palette.green : palette.line,
                backgroundColor:
                  item === category ? palette.green : palette.paper,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 5,
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <AppText
                weight="semibold"
                style={{
                  color: item === category ? palette.white : palette.ink,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {categoryLabel(item, language)}
              </AppText>
            </Pressable>
          ))}
        </View>
        <PrimaryButton
          title={
            submitContribution.isPending ? "..." : t(language, "submitReview")
          }
          icon="send-outline"
          onPress={() => void submit()}
          disabled={!canSubmit || submitContribution.isPending}
        />
        {error ? (
          <AppText
            style={{ color: palette.clay, fontSize: 12, textAlign: "center" }}
          >
            {error}
          </AppText>
        ) : null}
        {!canSubmit ? (
          <AppText
            style={{
              color: palette.muted,
              fontSize: 12,
              lineHeight: 17,
              textAlign: "center",
            }}
          >
            {language === "en"
              ? "Add a product name and both package photos to save this draft."
              : "ড্রাফট সংরক্ষণ করতে পণ্যের নাম ও প্যাকেটের দুই পাশের ছবি যোগ করুন।"}
          </AppText>
        ) : null}
        <AppText
          style={{ color: palette.muted, fontSize: 12, textAlign: "center" }}
        >
          {t(language, "pointsAfterReview")}
        </AppText>
      </Card>
      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            backgroundColor: palette.greenSoft,
            borderRadius: 13,
            padding: 12,
          }}
        >
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={18}
            color={palette.green}
          />
          <AppText style={{ flex: 1, color: palette.green, fontSize: 12 }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <SectionHeading title={t(language, "mySubmissions")} />
        {mine.data?.length ? (
          mine.data.map((c) => {
            const statusLabel: Record<
              string,
              [string, string, "amber" | "green" | "clay" | "neutral"]
            > = {
              submitted: ["Submitted", "জমা হয়েছে", "amber"],
              in_review: ["In review", "পর্যালোচনায়", "amber"],
              approved: ["Approved", "অনুমোদিত", "green"],
              rejected: ["Not accepted", "গৃহীত হয়নি", "clay"],
            };
            const [en, bn, tone] = statusLabel[c.status] ?? [
              c.status,
              c.status,
              "neutral",
            ];
            return (
              <Card
                key={c.id}
                style={{ flexDirection: "row", gap: 11, alignItems: "center" }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 13,
                    backgroundColor: palette.paper,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <MaterialCommunityIcons
                    name="package-variant-closed"
                    size={23}
                    color={palette.green}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText weight="semibold" style={{ fontSize: 12 }}>
                    {c.name}
                  </AppText>
                  <AppText style={{ color: palette.muted, fontSize: 12 }}>
                    {c.brand || c.barcode}
                  </AppText>
                  {c.reviewerNote ? (
                    <AppText style={{ color: palette.muted, fontSize: 12 }}>
                      {c.reviewerNote}
                    </AppText>
                  ) : null}
                </View>
                <Pill tone={tone}>{language === "en" ? en : bn}</Pill>
              </Card>
            );
          })
        ) : (
          <Card>
            <AppText style={{ color: palette.muted, fontSize: 12 }}>
              {t(language, "noSubmissions")}
            </AppText>
          </Card>
        )}
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  fieldStyle,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  fieldStyle: object;
  keyboardType?: "default" | "number-pad";
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: 5 }}>
      <AppText weight="semibold" style={{ fontSize: 12 }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={fieldStyle}
      />
    </View>
  );
}

function PhotoSlot({
  language,
  label,
  uri,
  onPress,
  action,
}: {
  language: "en" | "bn";
  label: string;
  uri?: string;
  onPress: () => void;
  action: string;
}) {
  const palette = usePalette();
  const hint = uri
    ? language === "en"
      ? "Tap to replace this photo"
      : "ছবিটি বদলাতে ট্যাপ করুন"
    : language === "en"
      ? "Tap to add a package photo"
      : "প্যাকেটের ছবি যোগ করতে ট্যাপ করুন";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${label}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 122,
        borderRadius: 17,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: uri ? palette.green : palette.line,
        backgroundColor: uri ? palette.greenSoft : palette.card,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        opacity: pressed ? 0.82 : 1,
      })}
    >
      {uri ? (
        <>
          <Image
            source={{ uri }}
            resizeMode="cover"
            style={{ width: "100%", height: 150 }}
          />
          <View
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              backgroundColor: palette.card,
              paddingHorizontal: 9,
              paddingVertical: 6,
              borderRadius: 11,
            }}
          >
            <AppText
              weight="semibold"
              style={{ color: palette.green, fontSize: 12 }}
            >
              {action}
            </AppText>
          </View>
        </>
      ) : (
        <>
          <MaterialCommunityIcons
            name="image-plus-outline"
            size={25}
            color={palette.green}
          />
          <AppText weight="semibold" style={{ fontSize: 12, marginTop: 7 }}>
            {action}
          </AppText>
          <AppText style={{ fontSize: 12, color: palette.muted, marginTop: 2 }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
