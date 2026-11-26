/**
 * Server configuration, validated once at boot. Secrets live only here (server environment),
 * never in the app bundle.
 */
import "dotenv/config";
import { z } from "zod";

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  /** Public HTTPS origin of this API, used to print callback URLs for AppLink provisioning. */
  PUBLIC_API_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),

  // Supabase Auth: the API verifies the user's access token against the project's JWKS.
  SUPABASE_URL: optionalUrl,
  /** Only for local development and tests: HS256 secret to verify locally signed tokens. */
  DEV_JWT_SECRET: z.string().optional(),

  // AI through OpenRouter. Comma-separated model lists, tried in order: free first, a cheap
  // paid model last so Nouri keeps working when free models are rate-limited.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_CHAT_MODELS: z.string().default("google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free,deepseek/deepseek-v4.1-flash"),
  OPENROUTER_DEEP_MODELS: z.string().default("qwen/qwen3.7-plus,deepseek/deepseek-v4.1-flash"),
  OPENROUTER_VISION_MODELS: z.string().default("google/gemma-4-31b-it:free,qwen/qwen3.7-flash"),
  /** "deny" keeps health-profile text away from providers that store or train on prompts. */
  OPENROUTER_DATA_COLLECTION: z.enum(["deny", "allow"]).default("deny"),
  /** Hard monthly AI budget in US dollars. Calls stop when it is reached. */
  AI_MONTHLY_BUDGET_USD: z.coerce.number().default(5),

  // AppLink (names identical to the official AppLink templates)
  APPLINK_APP_ID: z.string().optional(),
  APPLINK_PASSWORD: z.string().optional(),
  APPLINK_SMS_SEND_URL: optionalUrl,
  APPLINK_USSD_SEND_URL: optionalUrl,
  APPLINK_SUBSCRIPTION_SEND_URL: optionalUrl,
  APPLINK_SUBSCRIPTION_QUERY_BASE_URL: optionalUrl,
  APPLINK_SUBSCRIPTION_CHARGING_INFO_URL: optionalUrl,
  APPLINK_OTP_REQUEST_URL: optionalUrl,
  APPLINK_OTP_VERIFY_URL: optionalUrl,
  APPLINK_CAAS_DEBIT_URL: optionalUrl,
  APPLINK_CAAS_OTP_VERIFY_URL: optionalUrl,
  /** Comma-separated source IPs allowed to post callbacks. Empty = allow all (development only). */
  APPLINK_CALLBACK_ALLOWED_IPS: z.string().default(""),
  /** SMS shortcode shown to users (e.g. 21213), once AppLink provisions one. */
  APPLINK_SMS_SHORTCODE: z.string().default(""),
  APPLINK_USSD_CODE: z.string().default(""),

  /** Comma-separated user ids allowed to approve recalls and review contributions. */
  ADMIN_USER_IDS: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${fields}`);
  }
  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    if (env.DEV_JWT_SECRET) throw new Error("DEV_JWT_SECRET must not be set in production");
    if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL is required in production");
    // The local AppLink mock must never receive production traffic: a payment against it is not real.
    for (const [k, v] of Object.entries(env)) {
      if (k.startsWith("APPLINK_") && k.endsWith("_URL") && typeof v === "string" && /localhost|127\.0\.0\.1/.test(v)) {
        throw new Error(`${k} points at a local mock in production`);
      }
    }
  }
  // CaaS is a pair: a charge you can start but not complete strands the user with an OTP.
  if (Boolean(env.APPLINK_CAAS_DEBIT_URL) !== Boolean(env.APPLINK_CAAS_OTP_VERIFY_URL)) {
    throw new Error("Set both APPLINK_CAAS_DEBIT_URL and APPLINK_CAAS_OTP_VERIFY_URL, or neither");
  }
  if (Boolean(env.APPLINK_OTP_REQUEST_URL) !== Boolean(env.APPLINK_OTP_VERIFY_URL)) {
    throw new Error("Set both APPLINK_OTP_REQUEST_URL and APPLINK_OTP_VERIFY_URL, or neither");
  }
  return env;
}

export const env = load();

export const adminIds = new Set(
  env.ADMIN_USER_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
