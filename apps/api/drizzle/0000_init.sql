CREATE TABLE `class_list` (
	`exam_id` text NOT NULL,
	`enrolment_no` text NOT NULL,
	PRIMARY KEY(`exam_id`, `enrolment_no`)
);
--> statement-breakpoint
CREATE TABLE `exam_members` (
	`exam_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`enrolment_no` text,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`exam_id`, `user_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_members_exam_id_enrolment_no_unique` ON `exam_members` (`exam_id`,`enrolment_no`);--> statement-breakpoint
CREATE INDEX `exam_members_user_id_idx` ON `exam_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `provider_user_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`enrolment_no` text,
	`locale` text DEFAULT 'sl' NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`run_after` integer NOT NULL,
	`locked_until` integer,
	`last_error` text,
	`dedupe_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_run_after_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notices_exam_id_id_idx` ON `notices` (`exam_id`,`id`);