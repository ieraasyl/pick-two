import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { ballotState, type voteInput } from "../../shared/contracts/voting.js";
import { api, readResponse } from "./api.js";

const voting = api.api.voting[":token"];
export const ballotQuery = (token: string) =>
  queryOptions({
    queryKey: ["ballot", token] as const,
    queryFn: ({ signal }) =>
      readResponse(
        voting.$get({ param: { token: encodeURIComponent(token) } }, { init: { signal } }),
        ballotState,
      ),
    retry: false,
  });
export const ballotMutation = (client: QueryClient, token: string) =>
  mutationOptions({
    mutationFn: (vote: z.infer<typeof voteInput> | undefined) =>
      readResponse(
        vote
          ? voting.votes.$post({ param: { token: encodeURIComponent(token) }, json: vote })
          : voting.ballot.$post({ param: { token: encodeURIComponent(token) } }),
        ballotState,
      ),
    retry: false,
    onMutate: () => client.cancelQueries({ queryKey: ballotQuery(token).queryKey }),
    onSuccess: (data) => {
      client.setQueryData(ballotQuery(token).queryKey, data);
    },
    // A lost response may still have committed; recover the server's assignment before retrying.
    onError: () => client.invalidateQueries({ queryKey: ballotQuery(token).queryKey }),
  });
