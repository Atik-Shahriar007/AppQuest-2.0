/**
 * NutriScan Premium: backend-managed 30-day trial, BDT 29/month through AppLink Subscription,
 * and three CaaS passes. Access is only ever granted by the server after AppLink confirms
 * payment; this screen just starts flows and shows the server's state.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  AppText,
  Card,
  DemoNotice,
  PageHeader,
  Pill,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionHeading,
  usePalette,
} from "@/components/nutriscan-ui";
import { useAuth } from "@/lib/auth";
import { useNutriScan } from "@/lib/nutriscan-state";
import { trpc } from "@/lib/trpc";

type Sku = "compare_pass" | "nouri_pass" | "day_pass";
type Flow =
  | { kind: "idle" }
  | { kind: "number"; target: "subscription" | Sku }
  | { kind: "sub_code"; requestId: string }
  | { kind: "pay_code"; purchaseId: string }
  | { kind: "pay_wait"; purchaseId: string };

const FINAL = new Set(["CHARGED", "FAILED", "EXPIRED", "PARTIAL"]);

export default function PremiumScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { language, setIsPremium } = useNutriScan();
  const auth = useAuth();
  const en = language === "en";
  const signedIn = Boolean(auth.session);

  const offers = trpc.premium.offers.useQuery();
  const access = trpc.premium.access.useQuery(undefined, { enabled: signedIn });
  const utils = trpc.useUtils();
  const refresh = () => utils.premium.access.invalidate();

  const startTrial = trpc.premium.startTrial.useMutation({
    onSuccess: refresh,
  });
  const subRequest = trpc.premium.subscription.request.useMutation();
  const subVerify = trpc.premium.subscription.verify.useMutation({
    onSuccess: refresh,
  });
  const subCancel = trpc.premium.subscription.cancel.useMutation({
    onSuccess: refresh,
  });
  const payStart = trpc.premium.purchase.start.useMutation();
  const payConfirm = trpc.premium.purchase.confirm.useMutation();

  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [msisdn, setMsisdn] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);

  // Poll the server while a payment waits for Banglalink's confirmation.
  const purchaseId = flow.kind === "pay_wait" ? flow.purchaseId : null;
  const purchase = trpc.premium.purchase.get.useQuery(
    { id: purchaseId ?? "" },
    {
      enabled: Boolean(purchaseId),
      refetchInterval: (q) =>
        q.state.data && FINAL.has(q.state.data.status) ? false : 2000,
    },
  );
  const paymentDone =
    flow.kind === "pay_wait" &&
    purchase.data !== undefined &&
    FINAL.has(purchase.data.status);
  useEffect(() => {
    if (paymentDone) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentDone]);

  // Other screens read the local flag; keep it equal to what the server says.
  useEffect(() => {
    if (access.data) setIsPremium(access.data.premium);
  }, [access.data, setIsPremium]);

  const caps = offers.data?.capabilities;
  const a = access.data;
  const reset = () => {
    setFlow({ kind: "idle" });
    setCode("");
    setAgreed(false);
  };
  const fail = (err: unknown) =>
    setMessage({
      tone: "bad",
      text: err instanceof Error ? err.message : String(err),
    });

  const disclosureFor = (target: "subscription" | Sku) =>
    target === "subscription"
      ? offers.data?.subscription.disclosure
      : offers.data?.passes.find((p) => p.sku === target)?.disclosure;

  const submitNumber = async () => {
    if (flow.kind !== "number" || !agreed) return;
    setMessage(null);
    try {
      if (flow.target === "subscription") {
        const r = await subRequest.mutateAsync({
          msisdn,
          acceptedDisclosure: true,
        });
        setFlow({ kind: "sub_code", requestId: r.requestId });
      } else {
        const r = await payStart.mutateAsync({
          sku: flow.target,
          msisdn,
          acceptedDisclosure: true,
        });
        if (r.status === "OTP_SENT")
          setFlow({ kind: "pay_code", purchaseId: r.id });
        else {
          setMessage({ tone: "bad", text: r.message });
          reset();
        }
      }
      setCode("");
    } catch (err) {
      fail(err);
    }
  };

  const submitCode = async () => {
    setMessage(null);
    try {
      if (flow.kind === "sub_code") {
        const r = await subVerify.mutateAsync({
          requestId: flow.requestId,
          otp: code,
        });
        if (r.ok) {
          setMessage({
            tone: "good",
            text: en
              ? "Number verified. Premium starts as soon as Banglalink confirms."
              : "নম্বর যাচাই হয়েছে। বাংলালিংক নিশ্চিত করলেই প্রিমিয়াম শুরু হবে।",
          });
          reset();
        } else {
          const text = {
            wrong_code: en
              ? `Wrong code. ${r.attemptsLeft} tries left.`
              : `ভুল কোড। আর ${r.attemptsLeft} বার চেষ্টা করা যাবে।`,
            expired: en
              ? "The code expired. Please start again."
              : "কোডের মেয়াদ শেষ। আবার শুরু করুন।",
            too_many_attempts: en
              ? "Too many wrong codes. Please start again."
              : "অনেকবার ভুল কোড। আবার শুরু করুন।",
            failed: en
              ? "Verification failed. Please try again."
              : "যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
          }[r.reason];
          setMessage({ tone: "bad", text });
          if (r.reason !== "wrong_code") reset();
        }
      } else if (flow.kind === "pay_code") {
        const r = await payConfirm.mutateAsync({
          id: flow.purchaseId,
          otp: code,
        });
        if (r.status === "OTP_SENT")
          setMessage({
            tone: "bad",
            text: en
              ? `Wrong code. ${r.otpAttemptsLeft} tries left.`
              : `ভুল কোড। আর ${r.otpAttemptsLeft} বার চেষ্টা করা যাবে।`,
          });
        else if (r.status === "VERIFYING" || r.status === "UNKNOWN")
          setFlow({ kind: "pay_wait", purchaseId: flow.purchaseId });
        else {
          setMessage({
            tone: r.status === "CHARGED" ? "good" : "bad",
            text: r.message,
          });
          reset();
        }
      }
      setCode("");
    } catch (err) {
      fail(err);
    }
  };

  const input = {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    paddingHorizontal: 12,
    color: palette.ink,
    fontSize: 15,
  } as const;

  const statusLine = (() => {
    if (!a?.premium)
      return en ? "You are on the free plan." : "আপনি ফ্রি প্ল্যানে আছেন।";
    const until = a.premiumEndsAt
      ? new Date(a.premiumEndsAt).toLocaleDateString(en ? "en-GB" : "bn-BD")
      : null;
    if (a.premiumSource === "subscription")
      return en
        ? "Premium is active (monthly subscription)."
        : "প্রিমিয়াম চালু (মাসিক সাবস্ক্রিপশন)।";
    if (a.premiumSource === "trial")
      return en
        ? `Free trial active until ${until}.`
        : `ফ্রি ট্রায়াল চালু, ${until} পর্যন্ত।`;
    return en
      ? `24-hour pass active until ${until}.`
      : `২৪ ঘণ্টার পাস চালু, ${until} পর্যন্ত।`;
  })();

  const features = en
    ? [
        "Advanced food comparison",
        "Detailed ingredient and nutrition analysis",
        "Extended Nouri chat (20 messages a day)",
        "Personalised food insights",
        "Advanced food safety reports",
      ]
    : [
        "উন্নত খাবার তুলনা",
        "বিস্তারিত উপাদান ও পুষ্টি বিশ্লেষণ",
        "বেশি নৌরি চ্যাট (দিনে ২০টি বার্তা)",
        "ব্যক্তিগত খাদ্য পরামর্শ",
        "উন্নত খাদ্য নিরাপত্তা রিপোর্ট",
      ];

  const busy =
    subRequest.isPending ||
    subVerify.isPending ||
    payStart.isPending ||
    payConfirm.isPending;

  return (
    <Screen contentStyle={{ gap: 16 }}>
      <PageHeader
        title={en ? "NutriScan Premium" : "নিউট্রিস্ক্যান প্রিমিয়াম"}
        back={() => router.back()}
      />

      <Card
        style={{
          backgroundColor: palette.green,
          borderColor: palette.green,
          gap: 8,
          paddingVertical: 20,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MaterialCommunityIcons
            name="crown"
            size={28}
            color={palette.onGreen}
          />
          <AppText
            weight="bold"
            style={{ fontSize: 18, color: palette.onGreen }}
          >
            {signedIn
              ? statusLine
              : en
                ? "Sign in to use Premium"
                : "প্রিমিয়ামের জন্য সাইন ইন করুন"}
          </AppText>
        </View>
        {a && !a.premium && (a.comparePassUses > 0 || a.nouriPassUses > 0) ? (
          <AppText style={{ color: palette.onGreen, fontSize: 12 }}>
            {en
              ? `Passes: ${a.comparePassUses} comparisons, ${a.nouriPassUses} Nouri messages left.`
              : `পাস: ${a.comparePassUses}টি তুলনা, ${a.nouriPassUses}টি নৌরি বার্তা বাকি।`}
          </AppText>
        ) : null}
        {a ? (
          <AppText style={{ color: palette.onGreen, fontSize: 12 }}>
            {en
              ? `Nouri today: ${a.nouriUsedToday} of ${a.nouriDailyLimit} messages.`
              : `আজ নৌরি: ${a.nouriDailyLimit}টির মধ্যে ${a.nouriUsedToday}টি বার্তা।`}
          </AppText>
        ) : null}
      </Card>

      {!signedIn ? (
        <PrimaryButton
          title={
            en ? "Sign in or create account" : "সাইন ইন বা অ্যাকাউন্ট খুলুন"
          }
          icon="login"
          onPress={() => router.push("/onboarding")}
        />
      ) : null}

      {message ? (
        <Card
          style={{
            backgroundColor:
              message.tone === "good" ? palette.greenSoft : palette.claySoft,
            gap: 4,
          }}
        >
          <AppText
            style={{
              fontSize: 13,
              color: message.tone === "good" ? palette.green : palette.clay,
            }}
          >
            {message.text}
          </AppText>
        </Card>
      ) : null}

      <SectionHeading
        title={en ? "What Premium includes" : "প্রিমিয়ামে যা আছে"}
      />
      <Card style={{ gap: 8 }}>
        {features.map((f) => (
          <View
            key={f}
            style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
          >
            <MaterialCommunityIcons
              name="check-circle"
              size={16}
              color={palette.green}
            />
            <AppText style={{ fontSize: 13, flex: 1 }}>{f}</AppText>
          </View>
        ))}
      </Card>

      {signedIn && a?.trialAvailable && !a.premium ? (
        <Card style={{ gap: 10 }}>
          <AppText weight="bold" style={{ fontSize: 15 }}>
            {en
              ? `${offers.data?.trialDays ?? 30}-day free trial`
              : `${offers.data?.trialDays ?? 30} দিনের ফ্রি ট্রায়াল`}
          </AppText>
          <AppText style={{ fontSize: 12, color: palette.muted }}>
            {en
              ? "Free. No phone number or payment needed. One trial per account."
              : "বিনামূল্যে। ফোন নম্বর বা পেমেন্ট লাগবে না। প্রতি অ্যাকাউন্টে একবার।"}
          </AppText>
          <PrimaryButton
            title={
              startTrial.isPending
                ? "..."
                : en
                  ? "Start free trial"
                  : "ফ্রি ট্রায়াল শুরু করুন"
            }
            icon="gift-outline"
            onPress={() => startTrial.mutate()}
          />
        </Card>
      ) : null}

      {offers.isError ? (
        <DemoNotice>
          {en
            ? "Cannot reach the NutriScan server right now. Check your connection and try again."
            : "এখন নিউট্রিস্ক্যান সার্ভারে সংযোগ করা যাচ্ছে না। ইন্টারনেট দেখে আবার চেষ্টা করুন।"}
        </DemoNotice>
      ) : null}

      {offers.data && (!caps?.payments || !caps?.phoneLink) ? (
        <DemoNotice>
          {en
            ? "Paid plans open once Banglalink approves NutriScan on AppLink. Until then nothing can be charged."
            : "বাংলালিংক অ্যাপলিংকে নিউট্রিস্ক্যান অনুমোদন দিলে পেইড প্ল্যান চালু হবে। তার আগে কোনো চার্জ হবে না।"}
        </DemoNotice>
      ) : null}

      <SectionHeading title={en ? "Monthly Premium" : "মাসিক প্রিমিয়াম"} />
      <Card style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <AppText weight="bold" style={{ fontSize: 15 }}>
            {en ? "Premium" : "প্রিমিয়াম"}
          </AppText>
          <Pill tone="green">{en ? "৳29 / month" : "৳২৯ / মাস"}</Pill>
        </View>
        <AppText style={{ fontSize: 12, color: palette.muted }}>
          {en
            ? "Charged to your Banglalink balance. Cancel anytime."
            : "বাংলালিংক ব্যালেন্স থেকে কাটা হবে। যেকোনো সময় বাতিল করা যায়।"}
        </AppText>
        {a?.premiumSource === "subscription" ? (
          <SecondaryButton
            title={en ? "Cancel subscription" : "সাবস্ক্রিপশন বাতিল করুন"}
            icon="close-circle-outline"
            onPress={() => subCancel.mutate(undefined, { onError: fail })}
          />
        ) : (
          <PrimaryButton
            title={en ? "Subscribe" : "সাবস্ক্রাইব করুন"}
            icon="crown-outline"
            onPress={() => {
              if (!signedIn) return router.push("/onboarding");
              setMessage(null);
              setFlow({ kind: "number", target: "subscription" });
            }}
          />
        )}
      </Card>

      <SectionHeading title={en ? "One-time passes" : "এককালীন পাস"} />
      {(offers.data?.passes ?? []).map((p) => (
        <Card key={p.sku} style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText weight="bold" style={{ fontSize: 14 }}>
              {p.name}
            </AppText>
            <Pill tone="amber">{`৳${Number(p.amountBdt).toFixed(0)}`}</Pill>
          </View>
          <AppText style={{ fontSize: 12, color: palette.muted }}>
            {p.disclosure}
          </AppText>
          <SecondaryButton
            title={en ? "Buy" : "কিনুন"}
            icon="cart-outline"
            onPress={() => {
              if (!signedIn) return router.push("/onboarding");
              setMessage(null);
              setFlow({ kind: "number", target: p.sku as Sku });
            }}
          />
        </Card>
      ))}

      {flow.kind === "number" ? (
        <Card style={{ gap: 10, borderColor: palette.green, borderWidth: 2 }}>
          <AppText weight="bold" style={{ fontSize: 14 }}>
            {en ? "Your Banglalink number" : "আপনার বাংলালিংক নম্বর"}
          </AppText>
          <TextInput
            value={msisdn}
            onChangeText={setMsisdn}
            keyboardType="phone-pad"
            placeholder="019XXXXXXXX"
            placeholderTextColor={palette.muted}
            style={input}
          />
          <AppText style={{ fontSize: 12 }}>
            {disclosureFor(flow.target)}
          </AppText>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed(!agreed)}
            style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
          >
            <MaterialCommunityIcons
              name={agreed ? "checkbox-marked" : "checkbox-blank-outline"}
              size={20}
              color={palette.green}
            />
            <AppText style={{ fontSize: 12, flex: 1 }}>
              {en ? "I agree to this charge." : "আমি এই চার্জে সম্মত।"}
            </AppText>
          </Pressable>
          <PrimaryButton
            title={busy ? "..." : en ? "Send code" : "কোড পাঠান"}
            icon="message-text-outline"
            onPress={() => void submitNumber()}
          />
          <SecondaryButton title={en ? "Cancel" : "বাতিল"} onPress={reset} />
        </Card>
      ) : null}

      {flow.kind === "sub_code" || flow.kind === "pay_code" ? (
        <Card style={{ gap: 10, borderColor: palette.green, borderWidth: 2 }}>
          <AppText weight="bold" style={{ fontSize: 14 }}>
            {flow.kind === "pay_code"
              ? en
                ? "Enter the payment code from the SMS"
                : "এসএমএসের পেমেন্ট কোড লিখুন"
              : en
                ? "Enter the code from the SMS"
                : "এসএমএসের কোড লিখুন"}
          </AppText>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={8}
            placeholder="123456"
            placeholderTextColor={palette.muted}
            style={input}
          />
          <PrimaryButton
            title={busy ? "..." : en ? "Confirm" : "নিশ্চিত করুন"}
            icon="check"
            onPress={() => void submitCode()}
          />
          <SecondaryButton title={en ? "Cancel" : "বাতিল"} onPress={reset} />
        </Card>
      ) : null}

      {flow.kind === "pay_wait" ? (
        <Card style={{ gap: 8 }}>
          <AppText
            weight="semibold"
            style={{
              color: paymentDone
                ? purchase.data?.status === "CHARGED"
                  ? palette.green
                  : palette.clay
                : palette.ink,
            }}
          >
            {purchase.data?.message ??
              (en
                ? "Confirming your payment..."
                : "পেমেন্ট নিশ্চিত করা হচ্ছে...")}
          </AppText>
          {paymentDone ? (
            <PrimaryButton
              title={en ? "Done" : "ঠিক আছে"}
              icon="check"
              onPress={reset}
            />
          ) : (
            <AppText style={{ fontSize: 12, color: palette.muted }}>
              {en
                ? "Do not pay again. This updates automatically."
                : "আবার পেমেন্ট করবেন না। এটি নিজে থেকেই আপডেট হবে।"}
            </AppText>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
