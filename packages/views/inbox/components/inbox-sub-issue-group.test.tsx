import { cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentTaskSnapshotOptions } from "@multica/core/agents";
import { buildIssueStatusCatalog } from "@multica/core/issue-statuses";
import { useCommentDraftStore } from "@multica/core/issues/stores";
import type { NestedSubIssue } from "@multica/core/inbox/hierarchy";
import type { AgentTask, InboxItem, Issue } from "@multica/core/types";
import { renderWithI18n } from "../../test/i18n";
import { InboxSubIssueGroup, InboxSubIssueToggle } from "./inbox-sub-issue-group";

const createComment = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const composer = vi.hoisted(() => ({
  props: null as null | {
    issueId: string;
    placeholder?: string;
    onSubmit: (content: string, attachmentIds?: string[]) => Promise<string | boolean>;
  },
}));

vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@multica/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@multica/core/issues/mutations", () => ({
  useCreateComment: () => ({ mutateAsync: createComment }),
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
vi.mock("../../issues/components/comment-input", () => ({
  CommentInput: (props: NonNullable<typeof composer.props>) => {
    composer.props = props;
    return <div data-testid="composer">{props.placeholder}</div>;
  },
}));
vi.mock("../../agents/components/agent-avatar-stack", () => ({
  AgentAvatarStack: ({ agentIds }: { agentIds: string[] }) => <span data-testid="agents">{agentIds.join(",")}</span>,
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

function renderGroup({ expanded = true, tasks = [] as AgentTask[] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(agentTaskSnapshotOptions("ws-1").queryKey, tasks);
  const onSelect = vi.fn();
  renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <InboxSubIssueGroup
        parent={parent}
        subIssues={SUB_ISSUES}
        view="inbox"
        expanded={expanded}
        selectedKey=""
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );
  return { onSelect };
}

beforeEach(() => {
  createComment.mockReset().mockResolvedValue({ id: "comment-1" });
  toastError.mockClear();
  composer.props = null;
  useCommentDraftStore.setState({ drafts: {} });
});

afterEach(() => {
  cleanup();
});

describe("InboxSubIssueToggle", () => {
  it("labels the sub-issue count and toggles without selecting the row", () => {
    const onToggle = vi.fn();
    const onRowClick = vi.fn();
    renderWithI18n(
      <div onClick={onRowClick}>
        <InboxSubIssueToggle count={5} expanded={false} onToggle={onToggle} />
      </div>,
    );

    const toggle = screen.getByRole("button", { name: "5 sub-issues" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
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

  it("comments on the parent issue with the issue composer", async () => {
    renderGroup();

    expect(composer.props).toMatchObject({ issueId: "issue-parent", draftKey: "new:inbox:issue-parent", compact: true });
    expect(screen.getByTestId("composer")).toHaveTextContent("Reply on the parent issue...");
    await expect(composer.props!.onSubmit("Ship it", ["file-1"])).resolves.toBe("comment-1");
    expect(createComment).toHaveBeenCalledWith(expect.objectContaining({ content: "Ship it", attachmentIds: ["file-1"] }));
  });

  it("reports a failed comment and keeps the draft", async () => {
    createComment.mockRejectedValue(new Error("offline"));
    renderGroup();

    await expect(composer.props!.onSubmit("Ship it")).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith("offline");
  });

  it("adds a sub-issue mention to the parent's draft", () => {
    useCommentDraftStore.getState().setDraft("new:inbox:issue-parent", "Please check");
    renderGroup();

    fireEvent.click(screen.getByRole("button", { name: "Mention ACME-121 in the reply" }));

    expect(useCommentDraftStore.getState().getDraft("new:inbox:issue-parent")).toBe(
      "Please check [ACME-121](mention://issue/issue-web) ",
    );
  });

  it("shows progress, working sub-issues and unread count when collapsed", () => {
    renderGroup({
      expanded: false,
      tasks: [
        { id: "task-1", issue_id: "issue-web", agent_id: "agent-builder", status: "running" } as AgentTask,
        { id: "task-2", issue_id: "issue-other", agent_id: "agent-other", status: "running" } as AgentTask,
      ],
    });

    expect(screen.getByText(/0\/2 completed/)).toBeInTheDocument();
    expect(screen.getAllByText("1 working").length).toBeGreaterThan(0);
    expect(screen.getByTestId("agents")).toHaveTextContent("agent-builder");
    expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("omits the working count when no agent runs on a sub-issue", () => {
    renderGroup({ expanded: false });

    expect(screen.queryByText(/working/)).toBeNull();
  });
});
