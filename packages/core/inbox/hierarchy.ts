import type { InboxItem, Issue } from "../types";

export interface NestedSubIssue {
  item: InboxItem;
  issue: Issue;
}

export interface NestedInboxItems {
  /** Rows that stay at the top level, in list order. */
  items: InboxItem[];
  /** Rows nested under a top-level row, keyed by that row's issue id. */
  subIssues: Map<string, NestedSubIssue[]>;
}

/**
 * Nests inbox rows for sub-issues under the row of their parent issue when the
 * parent is in the same list. A sub-issue whose parent has no row stays at the
 * top level. Deeper levels collapse onto the top-most ancestor in the list.
 *
 * A group takes the list position of its first member, so with the list sorted
 * newest first, a parent rises to its freshest sub-issue.
 */
export function nestInboxSubIssues(
  items: InboxItem[],
  childrenByParent: ReadonlyMap<string, readonly Issue[]> | undefined,
): NestedInboxItems {
  const parentOf = new Map<string, string>();
  const issueById = new Map<string, Issue>();
  for (const [parentId, children] of childrenByParent ?? []) {
    for (const child of children) {
      parentOf.set(child.id, parentId);
      issueById.set(child.id, child);
    }
  }
  const rowByIssue = new Map<string, InboxItem>();
  for (const item of items) {
    if (item.issue_id) rowByIssue.set(item.issue_id, item);
  }

  const rootOf = (issueId: string) => {
    const seen = new Set([issueId]);
    let current = issueId;
    for (;;) {
      const parentId = parentOf.get(current);
      if (!parentId || !rowByIssue.has(parentId)) return current;
      if (seen.has(parentId)) return issueId;
      seen.add(parentId);
      current = parentId;
    }
  };

  const topLevel: InboxItem[] = [];
  const subIssues = new Map<string, NestedSubIssue[]>();
  const placedRoots = new Set<string>();
  for (const item of items) {
    if (!item.issue_id) {
      topLevel.push(item);
      continue;
    }
    const rootId = rootOf(item.issue_id);
    if (!placedRoots.has(rootId)) {
      placedRoots.add(rootId);
      topLevel.push(rowByIssue.get(rootId)!);
    }
    if (rootId !== item.issue_id) {
      const nested = subIssues.get(rootId) ?? [];
      nested.push({ item, issue: issueById.get(item.issue_id)! });
      subIssues.set(rootId, nested);
    }
  }

  return subIssues.size === 0 ? { items, subIssues } : { items: topLevel, subIssues };
}
