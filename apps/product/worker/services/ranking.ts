// Win percentage is independent of vote arrival order. Uncompared options remain unranked.
export function rankOptions(
  options: { id: string; label: string; position: number }[],
  votes: { winnerId: string; loserId: string }[],
) {
  const counts = new Map(options.map((option) => [option.id, { wins: 0, losses: 0 }]));
  for (const vote of votes) {
    counts.get(vote.winnerId)!.wins++;
    counts.get(vote.loserId)!.losses++;
  }
  const rows = options
    .map((option) => {
      const { wins, losses } = counts.get(option.id)!;
      return {
        ...option,
        wins,
        losses,
        score: wins + losses ? (100 * wins) / (wins + losses) : null,
      };
    })
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        a.position - b.position ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.score !== rows[index - 1].score) rank = index + 1;
    return {
      id: row.id,
      label: row.label,
      wins: row.wins,
      losses: row.losses,
      score: row.score,
      rank: row.score === null ? null : rank,
    };
  });
}
