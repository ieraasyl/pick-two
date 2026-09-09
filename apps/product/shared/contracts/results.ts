import { z } from "zod";
export const visibilityInput = z.object({
  resultsVisibility: z.enum(["private", "after_close", "always"]),
});
export const resultsContract = z.object({
  question: z.string(),
  status: z.enum(["draft", "open", "closed"]),
  ballots: z.number(),
  completedBallots: z.number(),
  comparisons: z.number(),
  ranking: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      rank: z.number().nullable(),
      score: z.number().nullable(),
      wins: z.number(),
      losses: z.number(),
    }),
  ),
});
export type Results = z.infer<typeof resultsContract>;
