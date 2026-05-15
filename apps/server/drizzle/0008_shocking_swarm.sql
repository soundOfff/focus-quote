CREATE TABLE `topic_media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`file_id` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `media_bucket_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `topic_media_user_topic_created_idx` ON `topic_media` (`user_id`,`topic`,`created_at`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `recall_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `recall_question_count` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `recall_depth` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `recall_auto_generate` integer DEFAULT true NOT NULL;