CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`user_edited` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_user_idx` ON `tags` (`user_id`);--> statement-breakpoint
CREATE TABLE `tag_edges` (
	`user_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	`user_edited` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`parent_id`, `child_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_edges_user_idx` ON `tag_edges` (`user_id`);--> statement-breakpoint
CREATE INDEX `tag_edges_child_idx` ON `tag_edges` (`child_id`);--> statement-breakpoint
CREATE TABLE `quote_tags` (
	`user_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`user_edited` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`quote_id`, `tag_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quote_tags_user_idx` ON `quote_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `quote_tags_tag_idx` ON `quote_tags` (`tag_id`);--> statement-breakpoint
DROP INDEX `quotes_user_tag_idx`;--> statement-breakpoint
ALTER TABLE `quotes` ADD `categorization_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` DROP COLUMN `tag`;--> statement-breakpoint
CREATE INDEX `quotes_user_status_idx` ON `quotes` (`user_id`,`categorization_status`);
