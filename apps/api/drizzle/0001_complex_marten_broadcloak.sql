CREATE TABLE `exam_versions` (
	`exam_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`student_view` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`exam_id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`join_code` text NOT NULL,
	`opens_at` integer NOT NULL,
	`closes_at` integer,
	`phase` text NOT NULL,
	`practice` integer DEFAULT false NOT NULL,
	`settings` text NOT NULL,
	`draft` text NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`closed_at` integer,
	`released_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exams_join_code_unique` ON `exams` (`join_code`);--> statement-breakpoint
CREATE INDEX `exams_phase_closed_at_idx` ON `exams` (`phase`,`closed_at`);--> statement-breakpoint
CREATE TABLE `task_adjustments` (
	`exam_id` text NOT NULL,
	`task_id` text NOT NULL,
	`removed` integer NOT NULL,
	`keep_as_bonus` integer NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` integer NOT NULL,
	PRIMARY KEY(`exam_id`, `task_id`)
);
