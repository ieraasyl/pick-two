import type { z } from "zod";
import {
  createdRoom,
  roomDetail,
  roomList,
  roomStatus,
  type RoomInput,
} from "../../shared/contracts/rooms";

async function request<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Unable to save changes. Please try again.");
  }
  return schema.parse(await response.json());
}
const json = (method: string, data: RoomInput) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
export const roomQueries = {
  list: { queryKey: ["rooms"], queryFn: () => request("/api/rooms", roomList), retry: false },
  detail: (id: string) => ({
    queryKey: ["room", id],
    queryFn: () => request(`/api/rooms/${encodeURIComponent(id)}`, roomDetail),
    retry: false,
  }),
};
export const createRoom = (data: RoomInput) =>
  request("/api/rooms", createdRoom, json("POST", data));
export const editRoom = (id: string, data: RoomInput) =>
  request(`/api/rooms/${encodeURIComponent(id)}`, roomStatus, json("PUT", data));
export const transitionRoom = (id: string, action: "publish" | "close") =>
  request(`/api/rooms/${encodeURIComponent(id)}/${action}`, roomStatus, { method: "POST" });
