/**
 * Team tools (ADMIN_USER_IDS only; the server enforces it):
 * - review community contributions with their package photos
 * - create a recall from an official source, and approve another member's recall
 *   (the server refuses self-approval and only then sends alerts)
 */
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import {
  AppText,
  Card,
  PageHeader,
  Pill,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionHeading,
  usePalette,
} from "@/components/nutriscan-ui";
import { products } from "@/lib/nutriscan-data";
import { useNutriScan } from "@/lib/nutriscan-state";
import { trpc } from "@/lib/trpc";

function Photo({ id, side }: { id: number; side: "front" | "back" }) {
  const q = trpc.community.admin.contributionPhoto.useQuery({ id, side });
  if (!q.data) return null;
  return (
    <Image
      source={{ uri: `data:${q.data.mimeType};base64,${q.data.base64}` }}
      style={{ width: 120, height: 120, borderRadius: 10 }}
      resizeMode="cover"
    />
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { language } = useNutriScan();
  const en = language === "en";
  const utils = trpc.useUtils();

  const queue = trpc.community.admin.contributions.useQuery({});
  const review = trpc.community.admin.reviewContribution.useMutation({
    onSuccess: () => utils.community.admin.contributions.invalidate(),
  });
  const recalls = trpc.community.admin.recalls.useQuery();
  const createRecall = trpc.community.admin.createRecall.useMutation({
    onSuccess: () => utils.community.admin.recalls.invalidate(),
  });
  const approve = trpc.community.admin.approveRecall.useMutation({
    onSuccess: () => utils.community.admin.recalls.invalidate(),
  });

  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shortText, setShortText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("https://");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [isTest, setIsTest] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q.length < 2
      ? []
      : products
          .filter((p) =>
            `${p.name.en} ${p.brand.en} ${p.barcode}`.toLowerCase().includes(q),
          )
          .slice(0, 6);
  }, [search]);

  const input = {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    paddingHorizontal: 10,
    color: palette.ink,
    fontSize: 13,
  } as const;

  return (
    <Screen contentStyle={{ gap: 16 }}>
      <PageHeader
        title={en ? "Team tools" : "টিম টুলস"}
        back={() => router.back()}
      />
      {message ? (
        <Card>
          <AppText style={{ fontSize: 12 }}>{message}</AppText>
        </Card>
      ) : null}

      <SectionHeading
        title={en ? "Contributions to review" : "পর্যালোচনার জন্য অবদান"}
      />
      {(queue.data ?? []).map((c) => (
        <Card key={c.id} style={{ gap: 8 }}>
          <Pressable
            onPress={() => setOpenId(openId === c.id ? null : c.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <AppText weight="semibold" style={{ flex: 1, fontSize: 13 }}>
              {c.name}
            </AppText>
            <Pill
              tone={
                c.status === "approved"
                  ? "green"
                  : c.status === "rejected"
                    ? "clay"
                    : "amber"
              }
            >
              {c.status}
            </Pill>
          </Pressable>
          <AppText
            style={{ fontSize: 11, color: palette.muted }}
          >{`${c.brand ?? ""} · ${c.barcode}`}</AppText>
          {openId === c.id ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Photo id={c.id} side="front" />
                <Photo id={c.id} side="back" />
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={
                  en
                    ? "Note to the contributor (optional)"
                    : "অবদানকারীর জন্য নোট (ঐচ্ছিক)"
                }
                placeholderTextColor={palette.muted}
                style={input}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={en ? "Approve" : "অনুমোদন"}
                    icon="check"
                    onPress={() =>
                      review.mutate({
                        id: c.id,
                        status: "approved",
                        note: note || undefined,
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    title={en ? "Reject" : "বাতিল"}
                    icon="close"
                    onPress={() =>
                      review.mutate({
                        id: c.id,
                        status: "rejected",
                        note: note || undefined,
                      })
                    }
                  />
                </View>
              </View>
            </View>
          ) : null}
        </Card>
      ))}
      {queue.data?.length === 0 ? (
        <Card>
          <AppText style={{ fontSize: 12, color: palette.muted }}>
            {en ? "Nothing to review." : "পর্যালোচনার কিছু নেই।"}
          </AppText>
        </Card>
      ) : null}

      <SectionHeading
        title={
          en
            ? "New recall (needs a second team member to approve)"
            : "নতুন প্রত্যাহার (অন্য সদস্যের অনুমোদন লাগবে)"
        }
      />
      <Card style={{ gap: 8 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={en ? "Title" : "শিরোনাম"}
          placeholderTextColor={palette.muted}
          style={input}
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          placeholder={
            en ? "What happened and what to do" : "কী হয়েছে ও কী করতে হবে"
          }
          placeholderTextColor={palette.muted}
          style={[
            input,
            { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
          ]}
        />
        <TextInput
          value={shortText}
          onChangeText={setShortText}
          maxLength={140}
          placeholder={
            en
              ? "Short text for SMS and USSD (English, max 140)"
              : "এসএমএস ও ইউএসএসডির জন্য ছোট লেখা (ইংরেজি, সর্বোচ্চ ১৪০)"
          }
          placeholderTextColor={palette.muted}
          style={input}
        />
        <TextInput
          value={sourceUrl}
          onChangeText={setSourceUrl}
          autoCapitalize="none"
          placeholder="https://official-source"
          placeholderTextColor={palette.muted}
          style={input}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={en ? "Find affected products" : "প্রভাবিত পণ্য খুঁজুন"}
          placeholderTextColor={palette.muted}
          style={input}
        />
        {matches.map((p) => (
          <Pressable
            key={p.id}
            onPress={() =>
              setPicked((cur) => (cur.includes(p.id) ? cur : [...cur, p.id]))
            }
          >
            <AppText style={{ fontSize: 12, color: palette.green }}>
              + {p.name.en}
            </AppText>
          </Pressable>
        ))}
        {picked.map((id) => (
          <Pressable
            key={id}
            onPress={() => setPicked((cur) => cur.filter((x) => x !== id))}
          >
            <AppText style={{ fontSize: 12 }}>
              ✓ {products.find((p) => p.id === id)?.name.en} (tap to remove)
            </AppText>
          </Pressable>
        ))}
        <Pressable onPress={() => setIsTest(!isTest)}>
          <AppText
            style={{
              fontSize: 12,
              color: isTest ? palette.amberInk : palette.clay,
            }}
          >
            {isTest
              ? en
                ? "TEST recall: only team members are alerted (tap to make it real)"
                : "পরীক্ষামূলক: শুধু টিম সদস্যরা সতর্কতা পাবে (আসল করতে ট্যাপ করুন)"
              : en
                ? "REAL recall: every matched user is alerted (tap for test)"
                : "আসল: সব মিলে যাওয়া ব্যবহারকারী সতর্কতা পাবে (পরীক্ষার জন্য ট্যাপ করুন)"}
          </AppText>
        </Pressable>
        <PrimaryButton
          title={
            createRecall.isPending
              ? "..."
              : en
                ? "Save as draft"
                : "খসড়া সংরক্ষণ"
          }
          icon="content-save-outline"
          onPress={() =>
            createRecall.mutate(
              { title, body, shortText, sourceUrl, productIds: picked, isTest },
              {
                onSuccess: () => {
                  setMessage(
                    en
                      ? "Draft saved. Another team member must approve it before any alert is sent."
                      : "খসড়া সংরক্ষিত। কোনো সতর্কতা পাঠানোর আগে অন্য সদস্যকে অনুমোদন দিতে হবে।",
                  );
                  setTitle("");
                  setBody("");
                  setShortText("");
                  setPicked([]);
                },
                onError: (e) => setMessage(e.message),
              },
            )
          }
        />
      </Card>

      <SectionHeading title={en ? "Recalls" : "প্রত্যাহার"} />
      {(recalls.data ?? []).map((r) => (
        <Card key={r.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <AppText weight="semibold" style={{ flex: 1, fontSize: 13 }}>
              {r.isTest ? `[TEST] ${r.title}` : r.title}
            </AppText>
            <Pill tone={r.status === "approved" ? "green" : "amber"}>
              {r.status}
            </Pill>
          </View>
          <AppText style={{ fontSize: 11, color: palette.muted }}>
            {r.sourceUrl}
          </AppText>
          {r.status === "draft" ? (
            <SecondaryButton
              title={en ? "Approve and send alerts" : "অনুমোদন ও সতর্কতা পাঠান"}
              icon="send-check-outline"
              onPress={() =>
                approve.mutate(
                  { id: r.id },
                  {
                    onSuccess: (out) =>
                      setMessage(
                        en
                          ? `Sent: ${out.inapp} in-app, ${out.push} push, ${out.sms} SMS.`
                          : `পাঠানো হয়েছে: অ্যাপে ${out.inapp}, পুশ ${out.push}, এসএমএস ${out.sms}।`,
                      ),
                    onError: (e) => setMessage(e.message),
                  },
                )
              }
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
