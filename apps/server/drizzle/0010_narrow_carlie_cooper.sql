CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_user_name_unique` ON `topics` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `focus_sessions` ADD `topic_id` text REFERENCES topics(id);--> statement-breakpoint
ALTER TABLE `topic_media` ADD `topic_id` text REFERENCES topics(id);