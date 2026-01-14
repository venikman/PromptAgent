import type { JSX, VNode } from "preact";
import { options as preactOptions } from "preact";
import { type Configuration, setup as twSetup, type Sheet, tw } from "twind";

type PreactOptions = typeof preactOptions & { __b?: (vnode: VNode) => void };

export const STYLE_ELEMENT_ID = "__FRSH_TWIND";
export const STATE_ELEMENT_ID = "__FRSH_TWIND_STATE";

export interface Options extends Omit<Configuration, "mode" | "sheet"> {
  /** The import.meta.url of the module defining these options. */
  selfURL: string;
}

declare module "preact" {
  namespace JSX {
    interface DOMAttributes<Target extends EventTarget> {
      class?: string;
      className?: string;
    }
  }
}

export function setup(options: Options, sheet: Sheet) {
  const config: Configuration = {
    ...options,
    mode: "silent",
    sheet,
  };
  twSetup(config);

  const originalHook = (preactOptions as PreactOptions).__b;
  (preactOptions as PreactOptions).__b = (
    // deno-lint-ignore no-explicit-any
    vnode: VNode<JSX.DOMAttributes<any>>,
  ) => {
    if (typeof vnode.type === "string" && typeof vnode.props === "object") {
      const { props } = vnode;
      const classes: string[] = [];
      if (props.class) {
        classes.push(tw(props.class));
        props.class = undefined;
      }
      if (props.className) {
        classes.push(tw(props.className));
        props.className = undefined;
      }
      if (classes.length) {
        props.class = classes.join(" ");
      }
    }

    originalHook?.(vnode);
  };
}
