import { z } from "zod";
export const shareToken = z.string().regex(/^[a-f0-9]{48}$/);
export const voteInput = z.object({ comparisonId: z.uuid(), winnerId: z.uuid() });
export const ballotState = z.object({
  question: z.string(),
  state: z.enum(["ready", "voting", "complete", "closed"]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  comparison: z
    .object({
      id: z.uuid(),
      choices: z.tuple([
        z.object({ id: z.uuid(), label: z.string() }),
        z.object({ id: z.uuid(), label: z.string() }),
      ]),
    })
    .nullable(),
});
export type BallotState = z.infer<typeof ballotState>;
