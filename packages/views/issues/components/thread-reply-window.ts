export const THREAD_VISIBLE_REPLIES = 5;
export const THREAD_REVEAL_STEP = 10;

/**
 * Splits a thread's rows into the older ones folded behind a "show more" bar
 * and the newest `limit` shown rows. Rows that render nothing (tombstones) do
 * not count toward the limit. A pinned row, such as a jump target, is never
 * folded.
 */
export function splitThreadRows<Row>(
  rows: readonly Row[],
  limit: number,
  isShown: (row: Row) => boolean,
  pinnedIndex = -1,
): { hidden: Row[]; visible: Row[] } {
  let start = rows.length;
  let shownCount = 0;
  while (start > 0 && shownCount < limit) {
    start -= 1;
    if (isShown(rows[start]!)) shownCount += 1;
  }
  if (pinnedIndex >= 0 && pinnedIndex < start) start = pinnedIndex;
  return { hidden: rows.slice(0, start), visible: rows.slice(start) };
}
