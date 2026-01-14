import type { ComponentChildren, ComponentProps } from "preact";
import { cn } from "../../lib/utils.ts";

type StreamdownProps = {
  className?: string;
  children?: ComponentChildren;
  mode?: "static" | "streaming";
};

export type MessageProps = ComponentProps<"div"> & {
  from: "user" | "assistant";
};

export const Message = ({ class: className, from, ...props }: MessageProps) => (
  <div
    class={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = ComponentProps<"div">;

export const MessageContent = ({ class: className, ...props }: MessageContentProps) => (
  <div
    class={cn(
      "flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  />
);

export type MessageResponseProps = StreamdownProps;

export const MessageResponse = ({ className, ...props }: MessageResponseProps) => {
  const mergedClassName = cn(
    "size-full whitespace-pre-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
    className,
  );

  return <div class={mergedClassName}>{props.children}</div>;
};
