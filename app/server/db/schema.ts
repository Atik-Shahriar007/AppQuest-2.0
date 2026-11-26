/**
 * NutriScan database (Supabase Postgres). Products are NOT stored here: the catalog is a
 * versioned, read-only snapshot loaded into memory (67 products), so user tables reference
 * products by their stable text id. Money and entitlement tables are written only by the API.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------- Accounts and personal data ----------

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name"),
  language: text("language").notNull().default("en"),
  theme: text("theme").notNull().default("system"),
  /** Health profile: age group, conditions, allergies, diet, pregnancy, etc. */
  health: jsonb("health").$type<Record<string, unknown>>().notNull().default({}),
  goals: jsonb("goals").$type<Record<string, unknown>>().notNull().default({}),
  /** App modes: halalMode, childSafeMode. */
  modes: jsonb("modes").$type<{ halalMode?: boolean; childSafeMode?: boolean }>().notNull().default({}),
  smsAlertsOptIn: boolean("sms_alerts_opt_in").notNull().default(false),
  smsAlertsOptInAt: timestamp("sms_alerts_opt_in_at", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const history = pgTable(
  "history",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    productId: text("product_id").notNull(),
    source: text("source").notNull(), // scan | search | view | ussd
    createdAt: createdAt(),
  },
  (t) => [index("history_user_idx").on(t.userId, t.createdAt), index("history_product_idx").on(t.productId)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id").notNull(),
    productId: text("product_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] }), index("favorites_product_idx").on(t.productId)],
);

export const reactions = pgTable(
  "reactions",
  {
    userId: uuid("user_id").notNull(),
    productId: text("product_id").notNull(),
    value: smallint("value").notNull(), // 1 like, -1 dislike
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    productId: text("product_id"),
    label: text("label").notNull(),
    expiresOn: date("expires_on").notNull(),
    notifyDaysBefore: integer("notify_days_before").notNull().default(2),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("reminders_due_idx").on(t.expiresOn)],
);

export const pushTokens = pgTable("push_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull(),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull(), // recall | expiry | premium | contribution
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const contributions = pgTable(
  "contributions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    barcode: text("barcode").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    /** Reviewed label values (from OCR or typed), ingredients, image path. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("submitted"), // submitted | in_review | approved | rejected
    reviewerNote: text("reviewer_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contributions_user_idx").on(t.userId), index("contributions_status_idx").on(t.status)],
);

// ---------- Nouri ----------

export const nouriConversations = pgTable(
  "nouri_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title"),
    summary: text("summary"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("nouri_conv_user_idx").on(t.userId, t.updatedAt),
    index("nouri_conv_summary_fts").using("gin", sql`to_tsvector('simple', coalesce(${t.summary}, ''))`),
  ],
);

export const nouriMessages = pgTable(
  "nouri_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role").notNull(), // user | assistant
    /** Plain text shown in the UI. Tool calls are not stored. */
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("nouri_msg_conv_idx").on(t.conversationId, t.id)],
);

/** Preferences Nouri proposed and the user confirmed. Nothing is stored without confirmation. */
export const userMemories = pgTable(
  "user_memories",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    text: text("text").notNull(),
    status: text("status").notNull().default("proposed"), // proposed | confirmed | rejected
    createdAt: createdAt(),
  },
  (t) => [index("user_memories_user_idx").on(t.userId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id"),
    feature: text("feature").notNull(), // nouri | ocr | summary | explain
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt), index("ai_usage_user_idx").on(t.userId, t.feature, t.createdAt)],
);

// ---------- AppLink: identity, consent, money ----------

export const phoneLinks = pgTable(
  "phone_links",
  {
    userId: uuid("user_id").primaryKey(),
    /** AppLink subscriberId, stored exactly as returned (may be masked). Opaque. */
    subscriberId: text("subscriber_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("phone_links_subscriber_uq").on(t.subscriberId)],
);

export const otpRequests = pgTable(
  "otp_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /** SHA-256 of the normalised number, for rate limits without storing the number. */
    msisdnHash: text("msisdn_hash").notNull(),
    /** AppLink referenceNo. Server-side only, never returned to the app. */
    referenceNo: text("reference_no"),
    purpose: text("purpose").notNull(), // subscribe | recover
    status: text("status").notNull().default("pending"), // pending | verified | failed | expired
    attempts: integer("attempts").notNull().default(0),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("otp_msisdn_idx").on(t.msisdnHash, t.createdAt), index("otp_ip_idx").on(t.ip, t.createdAt)],
);

export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(), // subscription | charge | sms_alerts
  /** The exact words the user saw, including price and frequency. */
  textShown: text("text_shown").notNull(),
  amountBdt: numeric("amount_bdt", { precision: 10, scale: 2 }),
  channel: text("channel").notNull(), // app | ussd | sms
  ref: text("ref"),
  createdAt: createdAt(),
});

/** Local mirror of AppLink subscription state. The subscription notification is the authority. */
export const subscriptions = pgTable("subscriptions", {
  subscriberId: text("subscriber_id").primaryKey(),
  userId: uuid("user_id"),
  status: text("status").notNull(), // INITIAL | REG_PENDING | TRIAL | REGISTERED | UNREGISTERED | TEMPORARY_BLOCKED
  frequency: text("frequency"),
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedBy: text("confirmed_by").notNull(), // api_response | notification | sweep
});

export const charges = pgTable(
  "charges",
  {
    /** Our idempotency key, persisted BEFORE the AppLink call. */
    externalTrxId: text("external_trx_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    subscriberId: text("subscriber_id").notNull(),
    sku: text("sku").notNull(),
    amountBdt: numeric("amount_bdt", { precision: 10, scale: 2 }).notNull(),
    // PENDING | OTP_SENT | VERIFYING | CHARGED | FAILED | EXPIRED | UNKNOWN
    status: text("status").notNull().default("PENDING"),
    requestCorrelator: text("request_correlator"),
    internalTrxId: text("internal_trx_id"),
    paidAmountBdt: numeric("paid_amount_bdt", { precision: 10, scale: 2 }),
    statusCode: text("status_code"),
    statusDetail: text("status_detail"),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("charges_user_idx").on(t.userId, t.createdAt), index("charges_status_idx").on(t.status)],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull(), // trial | premium | day_pass | compare_pass | nouri_pass
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usesTotal: integer("uses_total"),
    usesLeft: integer("uses_left"),
    /** What created it: charge:<externalTrxId>, trial:<userId>, sub:<subscriberId>. Unique = no double grants. */
    sourceRef: text("source_ref").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entitlements_source_uq").on(t.sourceRef), index("entitlements_user_idx").on(t.userId, t.kind)],
);

/** Every AppLink callback, password removed. The unique key makes redelivery a no-op. */
export const applinkEvents = pgTable(
  "applink_events",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // caas_notify | subscription_notify | sms_report | sms_receive | ussd_receive
    dedupeKey: text("dedupe_key").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    sourceIp: text("source_ip"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("applink_events_dedupe_uq").on(t.kind, t.dedupeKey)],
);

export const ussdSessions = pgTable(
  "ussd_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    screen: text("screen").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("ussd_sessions_expiry_idx").on(t.expiresAt)],
);

// ---------- Food safety ----------

export const recalls = pgTable("recalls", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Shortest version for SMS and USSD, ASCII. */
  shortText: text("short_text").notNull(),
  sourceUrl: text("source_url").notNull(),
  productIds: text("product_ids").array().notNull(),
  status: text("status").notNull().default("draft"), // draft | approved | withdrawn
  isTest: boolean("is_test").notNull().default(false),
  createdBy: uuid("created_by").notNull(),
  approvedBy: uuid("approved_by"),
  createdAt: createdAt(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const alertSends = pgTable(
  "alert_sends",
  {
    id: serial("id").primaryKey(),
    recallId: integer("recall_id").notNull(),
    userId: uuid("user_id").notNull(),
    channel: text("channel").notNull(), // inapp | push | sms
    requestId: text("request_id"),
    status: text("status").notNull().default("queued"), // queued | sent | DELIVERED | failed | ...
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("alert_sends_once_uq").on(t.recallId, t.userId, t.channel),
    index("alert_sends_request_idx").on(t.requestId),
  ],
);
