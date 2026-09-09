import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.js";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey().notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    shareToken: text("share_token").unique(),
    question: text("question").notNull(),
    resultsVisibility: text("results_visibility", { enum: ["private", "after_close", "always"] })
      .notNull()
      .default("private"),
    status: text("status", {
      enum: ["draft", "open", "closed"],
    })
      .notNull()
      .default("draft"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("rooms_owner_id_idx").on(table.ownerId),
    check("rooms_status_check", sql`${table.status} IN ('draft', 'open', 'closed')`),
    check("rooms_archived_not_open", sql`${table.archivedAt} IS NULL OR ${table.status} != 'open'`),
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

export const ballots = sqliteTable(
  "ballots",
  {
    id: text("id").primaryKey().notNull(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("ballots_room_participant_unique").on(table.roomId, table.participantId)],
);

export const ballotComparisons = sqliteTable(
  "ballot_comparisons",
  {
    id: text("id").primaryKey().notNull(),
    ballotId: text("ballot_id")
      .notNull()
      .references(() => ballots.id, { onDelete: "cascade" }),
    leftId: text("left_id")
      .notNull()
      .references(() => options.id, { onDelete: "cascade" }),
    rightId: text("right_id")
      .notNull()
      .references(() => options.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("comparisons_ballot_position_unique").on(table.ballotId, table.position),
    uniqueIndex("comparisons_ballot_pair_unique").on(table.ballotId, table.leftId, table.rightId),
    check("comparison_distinct_options", sql`${table.leftId} < ${table.rightId}`),
  ],
);

export const pairwiseVotes = sqliteTable("pairwise_votes", {
  id: text("id").primaryKey().notNull(),
  comparisonId: text("comparison_id")
    .notNull()
    .unique()
    .references(() => ballotComparisons.id, { onDelete: "cascade" }),
  winnerId: text("winner_id")
    .notNull()
    .references(() => options.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
});
