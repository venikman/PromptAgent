export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter((value): value is string => Boolean(value)).join(" ");
