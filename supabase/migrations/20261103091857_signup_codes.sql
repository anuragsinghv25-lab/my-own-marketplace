CREATE TABLE "signup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sends" integer DEFAULT 1 NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signup_codes_user_key" ON "signup_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signup_codes_email_idx" ON "signup_codes" USING btree ("email");--> statement-breakpoint
ALTER TABLE "signup_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signup_codes" ADD CONSTRAINT "signup_codes_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
