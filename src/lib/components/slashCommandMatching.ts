/** Rank command names without requiring query characters to be adjacent or ordered. */
function matchRank(name: string, query: string): number {
  const normalized = name.toLowerCase();
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.includes(query)) return 2;

  const remaining = [...normalized];
  for (const character of query) {
    const index = remaining.indexOf(character);
    if (index < 0) return -1;
    remaining.splice(index, 1);
  }
  return 3;
}

export function filterSlashCommands<T extends { name: string }>(commands: T[], query: string): T[] {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) return commands;
  return commands
    .map((command) => ({ command, rank: matchRank(command.name, normalizedQuery) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ command }) => command);
}
