// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { InboxItem, Issue } from "../types";
import { nestInboxSubIssues } from "./hierarchy";

function row(issueId: string | null, id = `row-${issueId}`): InboxItem {
  return {
    id,
    workspace_id: "ws-1",
    recipient_type: "member",
    recipient_id: "member-1",
    actor_type: null,
    actor_id: null,
    type: "mentioned",
    severity: "info",
    issue_id: issueId,
    title: id,
    body: null,
    issue_status: issueId ? "todo" : null,
    read: false,
    archived: false,
    created_at: "2026-10-30T00:00:00Z",
    details: null,
  };
}

function issue(id: string, parentId: string): Issue {
  return { id, identifier: id.toUpperCase(), parent_issue_id: parentId } as Issue;
}

function ids(items: InboxItem[]) {
  return items.map((item) => item.issue_id ?? item.id);
}

describe("nestInboxSubIssues", () => {
  it("returns the list unchanged when no parent is in it", () => {
    const items = [row("a"), row("b")];
    const result = nestInboxSubIssues(items, new Map([["x", [issue("a", "x")]]]));
    expect(result.items).toBe(items);
    expect(result.subIssues.size).toBe(0);
  });

  it("nests sub-issues under their parent at the position of the freshest member", () => {
    const items = [row("other"), row("child-2"), row("parent"), row(null, "system"), row("child-1")];
    const result = nestInboxSubIssues(
      items,
      new Map([["parent", [issue("child-1", "parent"), issue("child-2", "parent")]]]),
    );
    expect(ids(result.items)).toEqual(["other", "parent", "system"]);
    expect(result.subIssues.get("parent")?.map((entry) => entry.issue.id)).toEqual([
      "child-2",
      "child-1",
    ]);
  });

  it("collapses deeper levels onto the top-most ancestor in the list", () => {
    const items = [row("grandchild"), row("child"), row("parent")];
    const result = nestInboxSubIssues(
      items,
      new Map([
        ["parent", [issue("child", "parent")]],
        ["child", [issue("grandchild", "child")]],
      ]),
    );
    expect(ids(result.items)).toEqual(["parent"]);
    expect(result.subIssues.get("parent")?.map((entry) => entry.item.issue_id)).toEqual([
      "grandchild",
      "child",
    ]);
  });

  it("skips a parent that has no row", () => {
    const items = [row("grandchild"), row("parent")];
    const result = nestInboxSubIssues(
      items,
      new Map([
        ["parent", [issue("child", "parent")]],
        ["child", [issue("grandchild", "child")]],
      ]),
    );
    expect(ids(result.items)).toEqual(["grandchild", "parent"]);
    expect(result.subIssues.size).toBe(0);
  });

  it("leaves a parent cycle flat", () => {
    const items = [row("a"), row("b")];
    const result = nestInboxSubIssues(
      items,
      new Map([
        ["a", [issue("b", "a")]],
        ["b", [issue("a", "b")]],
      ]),
    );
    expect(result.items).toBe(items);
    expect(result.subIssues.size).toBe(0);
  });
});
