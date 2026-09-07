import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.js";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey().notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    index("rooms_owner_id_idx").on(table.ownerId),
    check("rooms_status_check", sql`${table.status} IN ('draft', 'open', 'closed')`),
    check("rooms_question_not_empty", sql`length(trim(${table.question})) > 0`),
  ],
);

export const options = sqliteTable(
  "options",
  {
    id: text("id").primaryKey().notNull(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("options_room_id_idx").on(table.roomId),
    check("options_label_not_empty", sql`length(trim(${table.label})) > 0`),
  ],
);

export { user, session, account, verification, authRateLimits } from "./auth-schema.js";
