CREATE TABLE `session_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`url` text NOT NULL,
	`hostname` text NOT NULL,
	`title` text,
	`visited_at` text DEFAULT (datetime('now')) NOT NULL,
	`category` text,
	`distraction_score` integer,
	`summary` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `focus_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_urls_session_visited_idx` ON `session_urls` (`session_id`,`visited_at`);--> statement-breakpoint
CREATE INDEX `session_urls_user_visited_idx` ON `session_urls` (`user_id`,`visited_at`);--> statement-breakpoint
CREATE TABLE `url_classifications` (
	`hostname` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
