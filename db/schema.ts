import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    mealType: text("meal_type").notNull(),
    foodsJson: text("foods_json").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_meals_owner_occurred").on(table.ownerId, table.occurredAt)],
);

export const glucoseReadings = sqliteTable(
  "glucose_readings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    value: integer("value").notNull(),
    context: text("context").notNull(),
    customContext: text("custom_context"),
    mealId: text("meal_id").references(() => meals.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_readings_owner_occurred").on(table.ownerId, table.occurredAt),
    index("idx_readings_owner_meal").on(table.ownerId, table.mealId),
  ],
);
