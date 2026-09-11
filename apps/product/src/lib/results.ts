import { queryOptions } from "@tanstack/react-query";
import { resultsContract } from "../../shared/contracts/results.js";
import { api, ApiError, readResponse } from "./api.js";

export type ResultsSource = { roomId: string } | { shareToken: string };
export const resultsQuery = (source: ResultsSource) =>
  queryOptions({
    queryKey:
      "roomId" in source
        ? (["rooms", "detail", source.roomId, "results"] as const)
        : (["public-results", source.shareToken] as const),
    queryFn: async ({ signal }) => {
      try {
        return await readResponse(
          "roomId" in source
            ? api.api.rooms[":id"].results.$get(
                { param: { id: encodeURIComponent(source.roomId) } },
                { init: { signal } },
              )
            : api.api.voting[":token"].results.$get(
                { param: { token: encodeURIComponent(source.shareToken) } },
                { init: { signal } },
              ),
          resultsContract,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404)
          throw new ApiError(
            "Results are not available. The creator may have kept them private or scheduled them for after voting closes.",
            error.status,
            error.code,
            error.requestId,
          );
        throw error;
      }
    },
    retry: false,
  });
