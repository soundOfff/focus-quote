CREATE TABLE `ai_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `ai_chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_chat_messages_thread_created_idx` ON `ai_chat_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`passage` text,
	`source_url` text,
	`goal` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_chat_threads_user_kind_updated_idx` ON `ai_chat_threads` (`user_id`,`kind`,`updated_at`);--> statement-breakpoint
CREATE TABLE `recall_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`question_index` integer NOT NULL,
	`user_answer` text NOT NULL,
	`verdict` text NOT NULL,
	`feedback` text NOT NULL,
	`graded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `focus_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recall_attempts_session_graded_idx` ON `recall_attempts` (`session_id`,`graded_at`);--> statement-breakpoint
CREATE INDEX `recall_attempts_user_graded_idx` ON `recall_attempts` (`user_id`,`graded_at`);--> statement-breakpoint
CREATE TABLE `toolbar_runtime_state` (
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `name`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_privacy` (
	`user_id` text PRIMARY KEY NOT NULL,
	`track_urls` integer DEFAULT false NOT NULL,
	`blocklist` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`headline` text DEFAULT '' NOT NULL,
	`photo_media_file_id` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`hint` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_secrets_user_kind_idx` ON `user_secrets` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'dark' NOT NULL,
	`default_duration_minutes` integer DEFAULT 25 NOT NULL,
	`default_break_minutes` integer DEFAULT 5 NOT NULL,
	`translate_from_lang` text DEFAULT 'auto' NOT NULL,
	`translate_to_lang` text DEFAULT 'en' NOT NULL,
	`today_goal` text,
	`debug_overlay_enabled` integer DEFAULT false NOT NULL,
	`notifications_blocked` integer DEFAULT false NOT NULL,
	`toolbar_side` text DEFAULT 'right' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
