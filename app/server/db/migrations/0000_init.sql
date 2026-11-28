CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"recall_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"request_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applink_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"body" jsonb NOT NULL,
	"source_ip" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"external_trx_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subscriber_id" text NOT NULL,
	"sku" text NOT NULL,
	"amount_bdt" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"request_correlator" text,
	"internal_trx_id" text,
	"paid_amount_bdt" numeric(10, 2),
	"status_code" text,
	"status_detail" text,
	"otp_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text_shown" text NOT NULL,
	"amount_bdt" numeric(10, 2),
	"channel" text NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reviewer_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"uses_total" integer,
	"uses_left" integer,
	"source_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nouri_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nouri_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"msisdn_hash" text NOT NULL,
	"reference_no" text,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"subscriber_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"language" text DEFAULT 'en' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"goals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sms_alerts_opt_in" boolean DEFAULT false NOT NULL,
	"sms_alerts_opt_in_at" timestamp with time zone,
	"trial_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "recalls" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"short_text" text NOT NULL,
	"source_url" text NOT NULL,
	"product_ids" text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text,
	"label" text NOT NULL,
	"expires_on" date NOT NULL,
	"notify_days_before" integer DEFAULT 2 NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"subscriber_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"status" text NOT NULL,
	"frequency" text,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ussd_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"screen" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id","feature","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_sends_once_uq" ON "alert_sends" USING btree ("recall_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "alert_sends_request_idx" ON "alert_sends" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applink_events_dedupe_uq" ON "applink_events" USING btree ("kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "charges_user_idx" ON "charges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "charges_status_idx" ON "charges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contributions_user_idx" ON "contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contributions_status_idx" ON "contributions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_source_uq" ON "entitlements" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "favorites_product_idx" ON "favorites" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "history_user_idx" ON "history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "history_product_idx" ON "history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "nouri_conv_user_idx" ON "nouri_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "nouri_conv_summary_fts" ON "nouri_conversations" USING gin (to_tsvector('simple', coalesce("summary", '')));--> statement-breakpoint
CREATE INDEX "nouri_msg_conv_idx" ON "nouri_messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "otp_msisdn_idx" ON "otp_requests" USING btree ("msisdn_hash","created_at");--> statement-breakpoint
CREATE INDEX "otp_ip_idx" ON "otp_requests" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_links_subscriber_uq" ON "phone_links" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "user_memories_user_idx" ON "user_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ussd_sessions_expiry_idx" ON "ussd_sessions" USING btree ("expires_at");