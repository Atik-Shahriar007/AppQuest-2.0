CREATE TABLE "contribution_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribution_id" integer NOT NULL,
	"side" text NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_photos_side_uq" ON "contribution_photos" USING btree ("contribution_id","side");--> statement-breakpoint
ALTER TABLE "contribution_photos" ENABLE ROW LEVEL SECURITY;
