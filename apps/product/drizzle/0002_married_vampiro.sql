CREATE TABLE `options` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "options_label_not_empty" CHECK(length(trim("options"."label")) > 0)
);
--> statement-breakpoint
CREATE INDEX `options_room_id_idx` ON `options` (`room_id`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `owner_id` text NOT NULL REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `rooms_owner_id_idx` ON `rooms` (`owner_id`);
