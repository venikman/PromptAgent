import type { Sheet } from "twind";
import twindConfig from "./twind.config.ts";
import {
  type Options,
  setup,
  STATE_ELEMENT_ID,
  STYLE_ELEMENT_ID,
} from "./twind_shared.ts";

type State = Array<string | [string, string]>;

const readState = (): State => {
  const el = document.getElementById(STATE_ELEMENT_ID);
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as State;
  } catch {
    return [];
  }
};

const ensureStyleElement = () => {
  const existing = document.getElementById(STYLE_ELEMENT_ID) as
    | HTMLStyleElement
    | null;
  if (existing) return existing;

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  document.head.appendChild(style);
  return style;
};

const hydrate = (options: Options, state: State) => {
  const styleEl = ensureStyleElement();
  const rules = new Set<string>();
  const precedences: number[] = [];
  const mappings = new Map(
    state.map((value) => (typeof value === "string" ? [value, value] : value)),
  );

  const sheetState: unknown[] = [precedences, rules, mappings, true];
  const target = styleEl.sheet!;
  const ruleText = Array.from(target.cssRules).map((rule) => rule.cssText);
  for (const rule of ruleText) {
    const marker = rule.lastIndexOf("/*");
    const precedence = parseInt(rule.slice(marker + 2, -2), 36);
    const rawRule = rule.slice(0, marker);
    rules.add(rawRule);
    precedences.push(precedence);
  }

  const sheet: Sheet = {
    target,
    insert: (rule, index) => target.insertRule(rule, index),
    init: (cb) => cb(sheetState.shift()),
  };

  setup(options, sheet);
};

if (typeof document !== "undefined") {
  hydrate(twindConfig, readState());
}
