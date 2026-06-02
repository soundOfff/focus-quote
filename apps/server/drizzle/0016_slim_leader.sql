CREATE TABLE `session_vault_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`title` text,
	`media_file_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `focus_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_bucket_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `session_vault_items_user_session_created_idx` ON `session_vault_items` (`user_id`,`session_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `topic_vault_items` ADD `media_file_id` text REFERENCES media_bucket_files(id);
