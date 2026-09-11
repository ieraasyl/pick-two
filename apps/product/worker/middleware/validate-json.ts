import { validator } from "hono/validator";
import type { z } from "zod";

export function validateJson<T>(schema: z.ZodType<T>, code: string, message: string) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return c.json({ error: { code, message } }, 400);
    return parsed.data;
  });
}
