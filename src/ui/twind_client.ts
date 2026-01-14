import type { Sheet } from "twind";
import twindConfig from "./twind.config.ts";
import {
  type Options,
  setup,
  STATE_ELEMENT_ID,
  STYLE_ELEMENT_ID,
} from "./twind_shared.ts";

type State = Array<string | [string, string]>;
type SheetHydrateState = [
  string[],
  number[],
  Set<string>,
  Map<string, string>,
  boolean,
];

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
  const normalizedRules: string[] = [];
  const rules = new Set<string>();
  const precedences: number[] = [];
  const mappings = new Map(
    state.map((value) => (typeof value === "string" ? [value, value] : value)),
  );

  const target = styleEl.sheet;
  if (!target) return;

  const ruleText = Array.from(target.cssRules).map((rule) => rule.cssText);
  for (const rule of ruleText) {
    const marker = rule.lastIndexOf("/*");
    const rawRule = marker === -1 ? rule : rule.slice(0, marker);
    const precedence = marker === -1
      ? 0
      : parseInt(rule.slice(marker + 2, -2), 36);
    const normalizedPrecedence = Number.isFinite(precedence) ? precedence : 0;
    normalizedRules.push(rawRule);
    rules.add(rawRule);
    precedences.push(normalizedPrecedence);
  }

  const sheetState: SheetHydrateState = [
    normalizedRules,
    precedences,
    rules,
    mappings,
    true,
  ];
  const initCallbacks: Array<(value: unknown) => unknown> = [];
  const sheet: Sheet = {
    target,
    insert: (rule, index) => target.insertRule(rule, index),
    init: <T>(cb: (state?: T) => T) => {
      const index = initCallbacks.push(cb) - 1;
      sheetState[index] = cb(sheetState[index] as T) as SheetHydrateState[number];
    },
  };

  setup(options, sheet);
};

if (typeof document !== "undefined") {
  hydrate(twindConfig, readState());
}
