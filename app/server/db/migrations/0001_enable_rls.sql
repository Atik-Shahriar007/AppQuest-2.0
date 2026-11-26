-- Only the NutriScan API (database owner role) may read or write. With RLS on and no policies,
-- Supabase's anon and authenticated roles get nothing through the auto-generated REST API.
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alert_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applink_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nouri_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nouri_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "otp_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "phone_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recalls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ussd_sessions" ENABLE ROW LEVEL SECURITY;
