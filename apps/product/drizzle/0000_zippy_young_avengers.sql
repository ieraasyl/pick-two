CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rooms_status_check" CHECK("rooms"."status" IN ('draft', 'open', 'closed')),
	CONSTRAINT "rooms_question_not_empty" CHECK(length(trim("rooms"."question")) > 0)
);
