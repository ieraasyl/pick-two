import { z } from "zod";

export const roomInput = z
  .object({
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(4).max(12),
  })
  .refine((value) => new Set(value.options).size === value.options.length, {
    message: "Provide 4–12 unique options",
  });
export type RoomInput = z.infer<typeof roomInput>;
export const roomRecord = z.object({
  id: z.string(),
  ownerId: z.string(),
  shareToken: z.string().nullable(),
  question: z.string(),
  status: z.enum(["draft", "open", "closed"]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export const roomList = z.object({ rooms: z.array(roomRecord) });
export const roomDetail = z.object({
  room: roomRecord,
  options: z.array(z.object({ id: z.string(), label: z.string(), position: z.number() })),
});
export const createdRoom = z.object({ room: z.object({ id: z.string() }) });
export const roomStatus = z.object({ status: z.enum(["draft", "open", "closed"]) });
