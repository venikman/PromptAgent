import mermaid from "mermaid";
import { nanoid } from "nanoid";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    mermaid.initialize({
      ...mermaidConfig,
      theme: theme === "dark" ? "dark" : "neutral",
    });
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const renderId = `mermaid-${nanoid(8)}`;
    const render = async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      try {
        const { svg, bindFunctions } = await mermaid.render(renderId, code);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
      } catch (error) {
        console.error("Failed to render Mermaid diagram", {
          renderId,
          code,
          error,
        });
        if (!cancelled && containerRef.current) {
          const message = error instanceof Error && error.message
            ? `Diagram failed to render: ${error.message}`
            : "Diagram failed to render. Please check the diagram syntax.";
          containerRef.current.textContent = message;
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [code, theme]);

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
