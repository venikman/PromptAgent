import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type SiteHeaderProps = {
  healthLabel: string;
  healthTone: string;
  inFlightLabel: string;
  inFlightTone: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

export function SiteHeader({
  healthLabel,
  healthTone,
  inFlightLabel,
  inFlightTone,
  theme,
  onToggleTheme,
}: SiteHeaderProps) {
  const nextThemeLabel = theme === "dark" ? "light" : "dark";
  const ThemeIcon = theme === "dark" ? Moon : Sun;

  return (
    <header className="flex min-h-16 items-center gap-4 border-b bg-background px-4 lg:px-8">
      <div className="flex flex-col">
        <span className="text-base font-semibold text-foreground">
          PromptAgent Studio
        </span>
        <span className="text-sm text-muted-foreground">
          Prompt evolution control room
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${healthTone}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span>{healthLabel}</span>
        </span>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${inFlightTone}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span>{inFlightLabel}</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleTheme}
          aria-pressed={theme === "dark"}
          aria-label={`Switch to ${nextThemeLabel} mode`}
          title={`Switch to ${nextThemeLabel} mode`}
        >
          <ThemeIcon className="size-4" />
          <span className="hidden text-xs font-semibold sm:inline">
            {theme === "dark" ? "Dark" : "Light"}
          </span>
        </Button>
      </div>
    </header>
  );
}
