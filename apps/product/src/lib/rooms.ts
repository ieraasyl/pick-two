import { queryOptions, mutationOptions, type QueryClient } from "@tanstack/react-query";
import {
  roomArchive,
  createdRoom,
  roomDetail,
  roomList,
  roomStatus,
  type RoomInput,
} from "../../shared/contracts/rooms.js";
import { visibilityInput } from "../../shared/contracts/results.js";
import type { z } from "zod";
import { api, readResponse } from "./api.js";

const rooms = api.api.rooms;
export const roomKeys = {
  all: ["rooms"] as const,
  list: ["rooms", "list"] as const,
  detail: (id: string) => ["rooms", "detail", id] as const,
};
export const roomQueries = {
  list: queryOptions({
    queryKey: roomKeys.list,
    queryFn: ({ signal }) => readResponse(rooms.$get({}, { init: { signal } }), roomList),
    retry: false,
  }),
  detail: (id: string) =>
    queryOptions({
      queryKey: roomKeys.detail(id),
      queryFn: ({ signal }) =>
        readResponse(
          rooms[":id"].$get({ param: { id: encodeURIComponent(id) } }, { init: { signal } }),
          roomDetail,
        ),
      retry: false,
    }),
};

export const roomMutations = {
  create: (client: QueryClient) =>
    mutationOptions({
      mutationFn: (json: RoomInput) => readResponse(rooms.$post({ json }), createdRoom),
      retry: false,
      onSuccess: () => client.invalidateQueries({ queryKey: roomKeys.list }),
    }),
  edit: (client: QueryClient, id: string) =>
    mutationOptions({
      mutationFn: (json: RoomInput) =>
        readResponse(
          rooms[":id"].$put({ param: { id: encodeURIComponent(id) }, json }),
          roomStatus,
        ),
      retry: false,
      onSettled: () => client.invalidateQueries({ queryKey: roomKeys.all }),
    }),
  transition: (client: QueryClient, id: string) =>
    mutationOptions({
      mutationFn: async (action: "publish" | "close" | "archive" | "restore") => {
        const route = rooms[":id"];
        const args = { param: { id: encodeURIComponent(id) } };
        switch (action) {
          case "publish":
            return readResponse(route.publish.$post(args), roomStatus);
          case "close":
            return readResponse(route.close.$post(args), roomStatus);
          case "archive":
            return readResponse(route.archive.$post(args), roomArchive);
          case "restore":
            return readResponse(route.restore.$post(args), roomArchive);
        }
      },
      retry: false,
      // A failed response can still have committed a write. Refresh before allowing another action.
      onSettled: () => client.invalidateQueries({ queryKey: roomKeys.all }),
    }),
  visibility: (client: QueryClient, id: string) =>
    mutationOptions({
      mutationFn: (json: z.infer<typeof visibilityInput>) =>
        readResponse(
          rooms[":id"]["results-visibility"].$put({ param: { id: encodeURIComponent(id) }, json }),
          visibilityInput,
        ),
      retry: false,
      onSettled: () => client.invalidateQueries({ queryKey: roomKeys.all }),
    }),
};
