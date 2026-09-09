import { expect, test } from "vite-plus/test";
import { rankOptions } from "../worker/services/ranking.js";
const options = ["a", "b", "c", "d"].map((id, position) => ({ id, label: id, position }));
test("ranking is independent of input order and keeps equal win rates tied", () => {
  const votes = [
    { winnerId: "a", loserId: "b" },
    { winnerId: "b", loserId: "c" },
    { winnerId: "c", loserId: "a" },
  ];
  const result = rankOptions(options, votes);
  expect(rankOptions([...options].reverse(), [...votes].reverse())).toEqual(result);
  expect(result.map((row) => [row.rank, row.score])).toEqual([
    [1, 50],
    [1, 50],
    [1, 50],
    [null, null],
  ]);
});
test("ranking handles no votes, wins, losses, and untested options", () => {
  expect(rankOptions(options, []).every((row) => row.rank === null && row.score === null)).toBe(
    true,
  );
  const result = rankOptions(options, [
    { winnerId: "b", loserId: "a" },
    { winnerId: "b", loserId: "c" },
  ]);
  expect(result.map((row) => [row.id, row.rank, row.score])).toEqual([
    ["b", 1, 100],
    ["a", 2, 0],
    ["c", 2, 0],
    ["d", null, null],
  ]);
  expect(result[0]).toMatchObject({ wins: 2, losses: 0 });
});
