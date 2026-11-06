// @vitest-environment node
import { describe, expect, it } from "vitest";
import { splitThreadRows } from "./thread-reply-window";

const rows = ["a", "b", "x", "c", "d", "e"];
const isShown = (row: string) => row !== "x";

describe("splitThreadRows", () => {
  it("keeps the newest shown rows and folds the rest", () => {
    expect(splitThreadRows(rows, 3, isShown)).toEqual({ hidden: ["a", "b", "x"], visible: ["c", "d", "e"] });
  });

  it("does not count rows that render nothing", () => {
    expect(splitThreadRows(rows, 4, isShown)).toEqual({ hidden: ["a"], visible: ["b", "x", "c", "d", "e"] });
  });

  it("folds nothing when the limit covers every row", () => {
    expect(splitThreadRows(rows, 10, isShown).hidden).toEqual([]);
  });

  it("never folds the pinned row", () => {
    expect(splitThreadRows(rows, 2, isShown, 1)).toEqual({ hidden: ["a"], visible: ["b", "x", "c", "d", "e"] });
  });
});
