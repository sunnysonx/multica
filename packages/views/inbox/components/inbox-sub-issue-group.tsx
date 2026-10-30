"use client";

import { useRef, useState } from "react";
import { useIssueStatuses } from "@multica/core/issue-statuses/hooks";
import { issueBehavesAs } from "@multica/core/issues";
import { useCreateComment } from "@multica/core/issues/mutations";
import type { NestedSubIssue } from "@multica/core/inbox/hierarchy";
import type { InboxItem, Issue } from "@multica/core/types";
import { isImeComposing } from "@multica/core/utils";
import { ArrowUp, AtSign, ChevronDown, ChevronRight } from "@multica/ui/icons";
import { IconButton } from "@multica/ui/components/common/icon-button";
import { DeferredTooltip } from "../../common/deferred-tooltip";
import { handleRowActivationKey } from "../../common/row-actions-menu";
import { StatusIcon } from "../../issues/components";
import { IssueAgentActivityIndicator } from "../../issues/components/issue-agent-activity-indicator";
import { useT } from "../../i18n";
import { useInboxContextMenu } from "./inbox-context-menu";
import { InboxDetailLabel } from "./inbox-detail-label";
import { useTimeAgo } from "./inbox-list-item";
import type { InboxView } from "./inbox-view";

/** Turns `@MUL-12` typed in the reply into an issue mention for the listed sub-issues. */
export function linkSubIssueMentions(text: string, issues: readonly Pick<Issue, "id" | "identifier">[]) {
  return issues.reduce((content, issue) => {
    const identifier = issue.identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return content.replace(
      new RegExp(`(^|\\s)@${identifier}(?![\\w-])`, "g"),
      `$1[${issue.identifier}](mention://issue/${issue.id})`,
    );
  }, text);
}

export function InboxSubIssueToggle({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t: tIssues } = useT("issues");
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={tIssues(($) => $.table.toggle_sub_issues)}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="flex items-center gap-0.5 rounded-xs px-0.5 text-caption tabular-nums text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Chevron className="size-3" />
      {count}
    </button>
  );
}

/** Sub-issue rows under their parent's inbox row, with a reply box for the parent. */
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
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const createComment = useCreateComment(parent.issue_id ?? "");
  const showUnread = view !== "archived";

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
        <span className="truncate">
          {tIssues(($) => $.detail.sub_issues_nav_progress, { done, total: subIssues.length })}
          {unread > 0 && ` · ${t(($) => $.hierarchy.unread_count, { count: unread })}`}
        </span>
      </div>
    );
  }

  const mention = (issue: Issue) => {
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}@${issue.identifier} `);
    inputRef.current?.focus();
  };

  const send = async () => {
    const content = linkSubIssueMentions(
      draft.trim(),
      subIssues.map(({ issue }) => issue),
    );
    if (!content || createComment.isPending) return;
    try {
      await createComment.mutateAsync({ content });
      setDraft("");
    } catch {
      // The draft stays in place; the inline error offers the retry.
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
        <div className="ml-1 mt-1 flex items-end gap-1 rounded-md border border-border bg-background px-2 py-1 focus-within:border-ring">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={createComment.isPending}
            placeholder={t(($) => $.hierarchy.reply_placeholder)}
            aria-label={t(($) => $.hierarchy.reply_placeholder)}
            onChange={(e) => {
              setDraft(e.target.value);
              if (createComment.isError) createComment.reset();
            }}
            onKeyDown={(e) => {
              // Plain Enter sends, like the chat composer; Shift+Enter breaks the line.
              e.stopPropagation();
              if (e.key !== "Enter" || e.shiftKey || isImeComposing(e)) return;
              e.preventDefault();
              void send();
            }}
            className="field-sizing-content max-h-32 min-h-6 min-w-0 flex-1 resize-none bg-transparent py-0.5 text-body outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <IconButton
            variant="ghost"
            size="icon-xs"
            label={t(($) => $.hierarchy.send)}
            disabled={!draft.trim() || createComment.isPending}
            onClick={() => void send()}
          >
            <ArrowUp className="size-3.5" />
          </IconButton>
        </div>
      )}
      {createComment.isError && (
        <div role="alert" className="ml-1 mt-1 flex items-center gap-2 text-caption text-destructive">
          {tIssues(($) => $.comment.send_reply_failed)}
          <button
            type="button"
            onClick={() => void send()}
            className="rounded-xs px-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t(($) => $.list.retry)}
          </button>
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
                  className="hidden rounded-xs p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring [@media(hover:hover)]:group-hover/sub:inline-flex [@media(hover:hover)]:group-focus-within/sub:inline-flex"
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
