CREATE TABLE `glucose_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`value` integer NOT NULL,
	`context` text NOT NULL,
	`custom_context` text,
	`meal_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_readings_owner_occurred` ON `glucose_readings` (`owner_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_readings_owner_meal` ON `glucose_readings` (`owner_id`,`meal_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`meal_type` text NOT NULL,
	`foods_json` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_meals_owner_occurred` ON `meals` (`owner_id`,`occurred_at`);