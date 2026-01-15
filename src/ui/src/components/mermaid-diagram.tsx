import mermaid from "mermaid";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

type MermaidDiagramProps = {
  code: string;
  title?: string;
  subtitle?: string;
  className?: string;
  theme?: "light" | "dark";
};

const mermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  flowchart: { curve: "basis" },
  sequence: { showSequenceNumbers: false },
};

export function MermaidDiagram({
  code,
  title,
  subtitle,
  className,
  theme = "light",
}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderId = useMemo(
    () => `mermaid-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    mermaid.initialize({
      ...mermaidConfig,
      theme: theme === "dark" ? "dark" : "neutral",
    });

    const render = async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      try {
        const { svg, bindFunctions } = await mermaid.render(renderId, code);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
      } catch (_error) {
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = "Diagram failed to render.";
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [code, renderId, theme]);

  return (
    <div
      className={cn("rounded-none border border-border bg-card p-4", className)}
    >
      {(title || subtitle) && (
        <div className="space-y-1">
          {title && (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              {title}
            </p>
          )}
          {subtitle && (
            <p className="text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="mermaid-diagram mt-3 w-full overflow-x-auto text-xs text-muted-foreground"
      />
    </div>
  );
}
