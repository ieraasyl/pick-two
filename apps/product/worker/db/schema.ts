import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey().notNull(),
    question: text("question").notNull(),
    status: text("status", {
      enum: ["draft", "open", "closed"],
    })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("rooms_status_check", sql`${table.status} IN ('draft', 'open', 'closed')`),
    check("rooms_question_not_empty", sql`length(trim(${table.question})) > 0`),
  ],
);
