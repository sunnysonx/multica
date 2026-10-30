import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIssueStatusCatalog } from "@multica/core/issue-statuses";
import type { NestedSubIssue } from "@multica/core/inbox/hierarchy";
import type { InboxItem, Issue } from "@multica/core/types";
import { renderWithI18n } from "../../test/i18n";
import { InboxSubIssueGroup, linkSubIssueMentions } from "./inbox-sub-issue-group";

const createComment = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock("@multica/core/issues/mutations", () => ({
  useCreateComment: () => createComment,
}));
vi.mock("@multica/core/issue-statuses/hooks", () => ({
  useIssueStatuses: () => buildIssueStatusCatalog(undefined),
}));
vi.mock("../../issues/components", () => ({
  StatusIcon: ({ status }: { status: string }) => <span data-testid="status-icon" data-status={status} />,
}));
vi.mock("../../issues/components/issue-agent-activity-indicator", () => ({
  IssueAgentActivityIndicator: () => null,
}));
vi.mock("./inbox-detail-label", () => ({
  InboxDetailLabel: ({ item }: { item: InboxItem }) => <>{item.body}</>,
}));

function row(id: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    workspace_id: "ws-1",
    recipient_type: "member",
    recipient_id: "member-1",
    actor_type: "agent",
    actor_id: "agent-1",
    type: "new_comment",
    severity: "info",
    issue_id: `issue-${id}`,
    title: id,
    body: null,
    issue_status: "in_progress",
    read: true,
    archived: false,
    created_at: "2026-10-30T08:00:00Z",
    details: null,
    ...overrides,
  };
}

function subIssue(id: string, identifier: string, title: string, overrides: Partial<InboxItem> = {}): NestedSubIssue {
  return {
    item: row(id, overrides),
    issue: { id: `issue-${id}`, identifier, title, status: "in_progress" } as Issue,
  };
}

const parent = row("parent");
const SUB_ISSUES = [
  subIssue("web", "ACME-121", "Ship the new checkout page behind the rollout flag", {
    body: "Preview is up",
    read: false,
  }),
  subIssue("ios", "ACME-122", "Update the payment sheet to the new design"),
];

function renderGroup(expanded = true, onSelect = vi.fn()) {
  renderWithI18n(
    <InboxSubIssueGroup
      parent={parent}
      subIssues={SUB_ISSUES}
      view="inbox"
      expanded={expanded}
      selectedKey=""
      onSelect={onSelect}
    />,
  );
  return { onSelect, input: screen.queryByRole("textbox", { name: "Reply on the parent issue..." }) };
}

beforeEach(() => {
  createComment.mutateAsync.mockReset().mockResolvedValue({});
  createComment.isError = false;
});

afterEach(() => {
  cleanup();
});

describe("linkSubIssueMentions", () => {
  it("links only whole mentions of the listed sub-issues", () => {
    const issues = [{ id: "uuid-1", identifier: "ACME-1" }];
    expect(linkSubIssueMentions("@ACME-1 and @ACME-12, mail@ACME-1, @ACME-1.", issues)).toBe(
      "[ACME-1](mention://issue/uuid-1) and @ACME-12, mail@ACME-1, [ACME-1](mention://issue/uuid-1).",
    );
  });
});

describe("InboxSubIssueGroup", () => {
  it("shows each sub-issue's full title and latest message", () => {
    const { onSelect } = renderGroup();

    expect(screen.getByText("Ship the new checkout page behind the rollout flag")).toBeInTheDocument();
    expect(screen.getByText("Preview is up")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Update the payment sheet to the new design"));
    expect(onSelect).toHaveBeenCalledWith(SUB_ISSUES[1]!.item);
  });

  it("sends a reply to the parent with mentioned sub-issues linked", async () => {
    const { input } = renderGroup();

    fireEvent.click(screen.getByRole("button", { name: "Mention ACME-121 in the reply" }));
    fireEvent.change(input!, { target: { value: `${(input as HTMLTextAreaElement).value}please merge` } });
    fireEvent.keyDown(input!, { key: "Enter" });

    await waitFor(() =>
      expect(createComment.mutateAsync).toHaveBeenCalledWith({
        content: "[ACME-121](mention://issue/issue-web) please merge",
      }),
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps the draft when the reply fails", async () => {
    createComment.mutateAsync.mockRejectedValue(new Error("offline"));
    const { input } = renderGroup();

    fireEvent.change(input!, { target: { value: "status?" } });
    fireEvent.keyDown(input!, { key: "Enter" });

    await waitFor(() => expect(createComment.mutateAsync).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("status?");
  });

  it("shows a failed reply with a retry", async () => {
    createComment.isError = true;
    const { input } = renderGroup();
    fireEvent.change(input!, { target: { value: "status?" } });
    createComment.mutateAsync.mockClear();

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to send reply");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(createComment.mutateAsync).toHaveBeenCalledWith({ content: "status?" }));
  });

  it("shows the progress instead of the rows when collapsed", () => {
    const { input } = renderGroup(false);

    expect(screen.getByText("0/2 completed · 1 unread")).toBeInTheDocument();
    expect(screen.queryByText("Preview is up")).toBeNull();
    expect(input).toBeNull();
  });
});
