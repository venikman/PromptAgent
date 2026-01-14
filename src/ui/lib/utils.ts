type SignalLike<T> = { value: T };
type ClassValue = string | false | null | undefined | SignalLike<string | undefined>;

const resolveClassValue = (value: ClassValue) => {
  if (value && typeof value === "object" && "value" in value) {
    return (value as SignalLike<string | undefined>).value;
  }
  return value;
};

export const cn = (...classes: ClassValue[]) =>
  classes
    .map(resolveClassValue)
    .filter((value): value is string => Boolean(value))
    .join(" ");
