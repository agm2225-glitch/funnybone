"use client";

import { ChevronUp, ChevronDown } from "lucide-react";

type VoteButtonsProps = {
  count: number;
  userVote: 1 | -1 | null;
  onVote: (value: 1 | -1) => void;
};

export function VoteButtons({ count, userVote, onVote }: VoteButtonsProps) {
  const base =
    "flex h-11 w-11 items-center justify-center rounded-full transition-all " +
    "duration-150 active:scale-90 focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-primary";

  const inactive =
    "text-gray-500 dark:text-gray-400 hover:bg-primary/10 hover:text-primary";
  const active = "bg-primary text-primary-foreground shadow-sm";

  return (
    <div
      className="flex items-center rounded-full border border-gray-200 dark:border-white/10"
      onClick={(event) => event.stopPropagation()}
      role="group"
      aria-label="Vote on this caption"
    >
      <button
        type="button"
        onClick={() => onVote(1)}
        aria-label="Upvote"
        aria-pressed={userVote === 1}
        className={`${base} ${userVote === 1 ? active : inactive}`}
      >
        <ChevronUp className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <span
        key={count}
        className={`min-w-[2ch] text-center text-sm font-semibold tabular-nums
          animate-in zoom-in-75 duration-150 ${
            userVote ? "text-primary" : "text-gray-900 dark:text-white"
          }`}
      >
        {count}
      </span>

      <button
        type="button"
        onClick={() => onVote(-1)}
        aria-label="Downvote"
        aria-pressed={userVote === -1}
        className={`${base} ${userVote === -1 ? active : inactive}`}
      >
        <ChevronDown className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}