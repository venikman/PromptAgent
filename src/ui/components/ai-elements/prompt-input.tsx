import type { ComponentProps } from "preact";
import { cn } from "../../lib/utils.ts";

export type PromptInputProps = ComponentProps<"form">;

export const PromptInput = ({ class: className, ...props }: PromptInputProps) => (
  <form
    class={cn(
      "rounded-2xl border border-border/60 bg-white/80 shadow-sm transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
      className,
    )}
    {...props}
  />
);

export type PromptInputBodyProps = ComponentProps<"div">;

export const PromptInputBody = ({ class: className, ...props }: PromptInputBodyProps) => (
  <div class={cn("px-4 py-3", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<"textarea">;

export const PromptInputTextarea = ({
  class: className,
  ...props
}: PromptInputTextareaProps) => (
  <textarea
    class={cn(
      "min-h-[120px] w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
      className,
    )}
    {...props}
  />
);

export type PromptInputFooterProps = ComponentProps<"div">;

export const PromptInputFooter = ({
  class: className,
  ...props
}: PromptInputFooterProps) => (
  <div
    class={cn(
      "flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground",
      className,
    )}
    {...props}
  />
);

export type PromptInputSubmitProps = ComponentProps<"button">;

export const PromptInputSubmit = ({
  class: className,
  type = "submit",
  ...props
}: PromptInputSubmitProps) => (
  <button
    class={cn(
      "rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow shadow-primary/30 transition hover:translate-y-[-1px] hover:shadow-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    type={type}
    {...props}
  />
);
