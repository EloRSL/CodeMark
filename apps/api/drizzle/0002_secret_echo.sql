CREATE TABLE `score_history` (
	`id` text PRIMARY KEY NOT NULL,
	`score_record_id` text NOT NULL,
	`old_points` real,
	`new_points` real,
	`old_state` text,
	`new_state` text NOT NULL,
	`actor_id` text,
	`at` integer NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `score_history_score_record_id_idx` ON `score_history` (`score_record_id`);--> statement-breakpoint
CREATE TABLE `score_records` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`state` text NOT NULL,
	`points` real,
	`suggested_points` real,
	`reason` text,
	`quotes` text,
	`source` text,
	`flagged` integer DEFAULT false NOT NULL,
	`ai_request_id` text,
	`new_suggestion` integer DEFAULT false NOT NULL,
	`comment` text,
	`confirmed_by` text,
	`confirmed_at` integer,
	`released_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_records_submission_id_criterion_id_unique` ON `score_records` (`submission_id`,`criterion_id`);