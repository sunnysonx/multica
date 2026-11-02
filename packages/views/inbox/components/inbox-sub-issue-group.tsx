"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentTaskSnapshotOptions } from "@multica/core/agents";
import { useWorkspaceId } from "@multica/core/hooks";
import { useIssueStatuses } from "@multica/core/issue-statuses/hooks";
import { issueBehavesAs } from "@multica/core/issues";
import { useCreateComment } from "@multica/core/issues/mutations";
import { useCommentDraftStore } from "@multica/core/issues/stores";
import type { NestedSubIssue } from "@multica/core/inbox/hierarchy";
import type { AgentTask, InboxItem, Issue } from "@multica/core/types";
import { AtSign, ChevronDown, ChevronRight } from "@multica/ui/icons";
import { ShimmerText } from "@multica/ui/components/common/shimmer-text";
import { AgentAvatarStack } from "../../agents/components/agent-avatar-stack";
import { DeferredTooltip } from "../../common/deferred-tooltip";
import { handleRowActivationKey } from "../../common/row-actions-menu";
import { StatusIcon } from "../../issues/components";
import { CommentInput } from "../../issues/components/comment-input";
import { IssueAgentActivityIndicator } from "../../issues/components/issue-agent-activity-indicator";
import { selectIssueTasks } from "../../issues/surface/activity";
import { useT } from "../../i18n";
import { useInboxContextMenu } from "./inbox-context-menu";
import { InboxDetailLabel } from "./inbox-detail-label";
import { useTimeAgo } from "./inbox-list-item";
import type { InboxView } from "./inbox-view";

const NOT_WORKING = { issueCount: 0, agentIds: [] as string[] };

export function InboxSubIssueToggle({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useT("inbox");
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="flex h-4.5 shrink-0 items-center gap-0.5 rounded-full bg-muted pl-0.5 pr-1.5 text-micro font-medium text-muted-foreground outline-none hover:bg-surface-selected hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Chevron className="size-3" />
      {t(($) => $.hierarchy.sub_issue_count, { count })}
    </button>
  );
}

/** Sub-issue rows under their parent's inbox row, with a comment box for the parent. */
export function InboxSubIssueGroup({
  parent,
  subIssues,
  view,
  expanded,
  selectedKey,
  onSelect,
}: {
  parent: InboxItem;
  subIssues: NestedSubIssue[];
  view: InboxView;
  expanded: boolean;
  selectedKey: string;
  onSelect: (item: InboxItem) => void;
}) {
  const { t } = useT("inbox");
  const { t: tIssues } = useT("issues");
  const wsId = useWorkspaceId();
  const parentIssueId = parent.issue_id ?? "";
  const draftKey = `new:inbox:${parentIssueId}` as const;
  const { mutateAsync: createComment } = useCreateComment(parentIssueId);
  const showUnread = view !== "archived";
  const selectWorking = useCallback(
    (snapshot: AgentTask[]) => {
      const agentIds = new Set<string>();
      let issueCount = 0;
      for (const { issue } of subIssues) {
        const { running } = selectIssueTasks(snapshot, issue.id);
        if (running.length === 0) continue;
        issueCount += 1;
        for (const task of running) agentIds.add(task.agent_id);
      }
      return issueCount === 0 ? NOT_WORKING : { issueCount, agentIds: [...agentIds] };
    },
    [subIssues],
  );
  const { data: working = NOT_WORKING } = useQuery({
    ...agentTaskSnapshotOptions(wsId),
    select: selectWorking,
    enabled: !expanded,
  });

  if (!expanded) {
    const done = subIssues.filter(({ issue }) => issueBehavesAs(issue, "done")).length;
    const unread = showUnread ? subIssues.filter(({ item }) => item.read !== true).length : 0;
    return (
      <div className="ml-6 flex items-center gap-2 border-l border-border py-1 pl-3 text-caption text-muted-foreground">
        <span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-info"
            style={{ width: `${(done / subIssues.length) * 100}%` }}
          />
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate">
          {tIssues(($) => $.detail.sub_issues_nav_progress, { done, total: subIssues.length })}
          {working.issueCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <AgentAvatarStack agentIds={working.agentIds} size="xs" max={3} />
              <ShimmerText active className="text-caption text-muted-foreground">
                {t(($) => $.hierarchy.working_count, { count: working.issueCount })}
              </ShimmerText>
            </>
          )}
          {unread > 0 && ` · ${t(($) => $.hierarchy.unread_count, { count: unread })}`}
        </span>
      </div>
    );
  }

  // Writing to the draft store is how a mention reaches the open composer, and
  // it keeps an unsent reply when the row scrolls out of the list.
  const mention = (issue: Issue) => {
    const drafts = useCommentDraftStore.getState();
    const current = drafts.getDraft(draftKey) ?? "";
    const separator = current && !/\s$/.test(current) ? " " : "";
    drafts.setDraft(draftKey, `${current}${separator}[${issue.identifier}](mention://issue/${issue.id}) `);
  };

  const submit = async (
    content: string,
    attachmentIds?: string[],
    suppressAgentIds?: string[],
    steerTaskIds?: string[],
  ) => {
    try {
      const comment = await createComment({ content, attachmentIds, suppressAgentIds, steerTaskIds });
      return comment.id;
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : tIssues(($) => $.comment.send_failed));
      return false;
    }
  };

  return (
    <div className="ml-6 border-l border-border pb-1 pl-1">
      {subIssues.map(({ item, issue }) => (
        <SubIssueRow
          key={item.id}
          item={item}
          issue={issue}
          showUnread={showUnread && item.read !== true}
          isSelected={item.issue_id === selectedKey}
          onSelect={() => onSelect(item)}
          onMention={() => mention(issue)}
        />
      ))}
      {view !== "archived" && parent.issue_id && (
        <div className="ml-1 mt-1">
          <CommentInput
            issueId={parent.issue_id}
            onSubmit={submit}
            placeholder={t(($) => $.hierarchy.reply_placeholder)}
            draftKey={draftKey}
            compact
          />
        </div>
      )}
    </div>
  );
}

function SubIssueRow({
  item,
  issue,
  showUnread,
  isSelected,
  onSelect,
  onMention,
}: {
  item: InboxItem;
  issue: Issue;
  showUnread: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onMention: () => void;
}) {
  const { t } = useT("inbox");
  const timeAgo = useTimeAgo();
  const openContextMenu = useInboxContextMenu();
  const { categoryOf, colorOf, iconOf } = useIssueStatuses(item.workspace_id);
  const status = item.issue_status ?? issue.status;
  const mentionLabel = t(($) => $.hierarchy.mention, { identifier: issue.identifier });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => handleRowActivationKey(e, onSelect)}
      onContextMenu={openContextMenu ? (e) => openContextMenu(item, e) : undefined}
      className={`group/sub flex w-full cursor-default select-none items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring ${
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <StatusIcon
        status={status}
        category={categoryOf(status)}
        color={colorOf(status)}
        icon={iconOf(status)}
        className="mt-0.5 size-3.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-body ${showUnread ? "font-medium" : "text-muted-foreground"}`}>
            {issue.title}
          </span>
          <span className="shrink-0 text-caption text-muted-foreground">{timeAgo(item.created_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-caption text-muted-foreground">
            <InboxDetailLabel item={item} />
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <DeferredTooltip
              content={mentionLabel}
              trigger={
                <button
                  type="button"
                  aria-label={mentionLabel}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMention();
                  }}
                  className="-my-px hidden rounded-xs p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring [@media(hover:hover)]:group-hover/sub:inline-flex [@media(hover:hover)]:group-focus-within/sub:inline-flex"
                >
                  <AtSign className="size-3.5" />
                </button>
              }
            />
            {item.issue_id && <IssueAgentActivityIndicator issueId={item.issue_id} hoverCard={false} />}
            {showUnread && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
          </div>
        </div>
      </div>
    </div>
  );
}
