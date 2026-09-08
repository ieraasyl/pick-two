CREATE TABLE `ballot_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`ballot_id` text NOT NULL,
	`left_id` text NOT NULL,
	`right_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`ballot_id`) REFERENCES `ballots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`left_id`) REFERENCES `options`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`right_id`) REFERENCES `options`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comparison_distinct_options" CHECK("ballot_comparisons"."left_id" < "ballot_comparisons"."right_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comparisons_ballot_position_unique` ON `ballot_comparisons` (`ballot_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `comparisons_ballot_pair_unique` ON `ballot_comparisons` (`ballot_id`,`left_id`,`right_id`);--> statement-breakpoint
CREATE TABLE `ballots` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ballots_room_participant_unique` ON `ballots` (`room_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `pairwise_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` text NOT NULL,
	`winner_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `ballot_comparisons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`winner_id`) REFERENCES `options`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairwise_votes_comparison_id_unique` ON `pairwise_votes` (`comparison_id`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_share_token_unique` ON `rooms` (`share_token`);