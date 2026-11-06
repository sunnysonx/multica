import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TimelineEntry } from "@multica/core/types";
import { renderWithI18n } from "../../test/i18n";

vi.mock("@multica/core/api", () => ({
  api: { uploadFile: vi.fn() },
  dispatchReasonCode: () => undefined,
  errorCode: () => undefined,
}));

vi.mock("../../navigation", () => ({
  useNavigation: () => ({
    push: vi.fn(),
    pathname: "/acme/issues",
    getShareableUrl: (p: string) => `https://app.example${p}`,
  }),
}));

vi.mock("@multica/core/workspace/hooks", () => ({
  useActorName: () => ({ getActorName: () => "Ada" }),
}));

vi.mock("../../common/actor-avatar", () => ({
  ActorAvatar: () => null,
}));

vi.mock("../hooks/use-comment-trigger-preview", () => ({
  useCommentTriggerPreview: () => ({ agents: [], blocked: [] }),
}));

vi.mock("../../editor", async () => ({
  ...(await vi.importActual<typeof import("../../editor/use-upload-gate")>("../../editor/use-upload-gate")),
  ...(await vi.importActual<typeof import("../../editor/use-lazy-editor")>("../../editor/use-lazy-editor")),
  ...(await vi.importActual<typeof import("../../editor/use-composer-submit")>("../../editor/use-composer-submit")),
  useEditorUpload: () => ({ uploadWithToast: vi.fn(), upload: vi.fn(), uploading: false }),
  useFileDropZone: () => ({ isDragOver: false, dropZoneProps: {} }),
  FileDropOverlay: () => null,
  ReadonlyContent: ({ content }: { content: string }) => <div>{content}</div>,
  Attachment: () => null,
  AttachmentDownloadProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContentEditor: forwardRef(function MockContentEditor() {
    return <textarea data-testid="editor" />;
  }),
}));


import { CommentCard } from "./comment-card";

function comment(index: number, parentId: string | null): TimelineEntry {
  const minute = String(index).padStart(2, "0");
  return {
    type: "comment",
    id: `c${index}`,
    actor_type: "member",
    actor_id: "user-1",
    content: `body ${index}`,
    parent_id: parentId,
    comment_type: "comment",
    reactions: [],
    attachments: [],
    created_at: `2026-09-11T07:${minute}:00Z`,
    updated_at: `2026-09-11T07:${minute}:00Z`,
    revision: 1,
  };
}

function renderThread(replyCount: number, highlightedCommentId: string | null = null) {
  const root = comment(0, null);
  const replies = Array.from({ length: replyCount }, (_, index) => comment(index + 1, root.id));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <CommentCard
        issueId="issue-1"
        entry={root}
        replies={replies}
        currentUserId="user-1"
        highlightedCommentId={highlightedCommentId}
        onReply={vi.fn().mockResolvedValue(true)}
        onEdit={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
        onToggleReaction={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("CommentCard — long threads", () => {
  it("shows every reply when the thread has five or fewer", () => {
    renderThread(5);

    expect(screen.getByText("body 1")).toBeTruthy();
    expect(screen.queryByText(/comments? from Ada/)).toBeNull();
  });

  it("folds older replies and keeps the newest five", () => {
    renderThread(18);

    expect(screen.getByText("body 0")).toBeTruthy();
    expect(screen.queryByText("body 13")).toBeNull();
    expect(screen.getByText("body 14")).toBeTruthy();
    expect(screen.getByText("body 18")).toBeTruthy();
    expect(screen.getByText("13 comments from Ada")).toBeTruthy();
  });

  it("unfolds ten more replies per click", () => {
    renderThread(18);

    fireEvent.click(screen.getByText("13 comments from Ada"));
    expect(screen.getByText("body 4")).toBeTruthy();
    expect(screen.queryByText("body 3")).toBeNull();

    fireEvent.click(screen.getByText("3 comments from Ada"));
    expect(screen.getByText("body 1")).toBeTruthy();
    expect(screen.queryByText(/comments? from Ada/)).toBeNull();
  });

  it("unfolds down to a highlighted reply", () => {
    renderThread(18, "c3");

    expect(screen.getByText("body 3")).toBeTruthy();
    expect(screen.queryByText("body 2")).toBeNull();
    expect(screen.getByText("2 comments from Ada")).toBeTruthy();
  });
});
