CREATE TABLE `media_bucket_files` (
	`id` text PRIMARY KEY NOT NULL,
	`mime_type` text NOT NULL,
	`data_base64` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_bucket_files_created_idx` ON `media_bucket_files` (`created_at`);--> statement-breakpoint
CREATE TABLE `user_media_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_id` text NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `media_bucket_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `focus_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_media_refs_user_kind_created_idx` ON `user_media_refs` (`user_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_media_refs_session_created_idx` ON `user_media_refs` (`session_id`,`created_at`);