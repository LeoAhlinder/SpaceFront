/** Compact number for the HUD: 950, 12.3K, 4.5M. */
export function formatCount(n: number): string {
  if (n < 1_000) return String(Math.floor(n));
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
