import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  IconPlayerPlay,
  IconChartBar,
  IconDna,
  IconBook,
} from "@tabler/icons-react";
import { Playground } from "@/components/playground";
import { EvalDashboard } from "@/components/evaluation";
import { EvolutionLab } from "@/components/evolution";
import { MethodologyPanel } from "@/components/methodology";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function App() {
  const [healthStatus, setHealthStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  );
  const [healthError, setHealthError] = useState<string>("");
  const [activeTab, setActiveTab] = useState("playground");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const check = async () => {
      try {
        const res = await fetch("/health", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (cancelled) return;
        setHealthStatus(res.ok ? "ok" : "error");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setHealthError(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (cancelled) return;
        setHealthStatus("error");
        if (err instanceof Error && err.name === "AbortError") {
          setHealthError("Health check timed out");
        } else {
          setHealthError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    check();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container space-y-4 py-4">
        {/* Theme toggle in corner */}
        <div className="flex justify-end">
          <ThemeToggle />
        </div>

        {/* Connection Error */}
        {healthStatus === "error" && (
          <Alert
            variant="destructive"
            className="animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>
              {healthError ||
                "Unable to connect to the API. Please check that the server is running."}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-4 h-12">
            <TabsTrigger
              value="playground"
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              <IconPlayerPlay className="h-4 w-4" />
              <span className="hidden sm:inline">Playground</span>
            </TabsTrigger>
            <TabsTrigger
              value="evaluation"
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              <IconChartBar className="h-4 w-4" />
              <span className="hidden sm:inline">Evaluation</span>
            </TabsTrigger>
            <TabsTrigger
              value="evolution"
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              <IconDna className="h-4 w-4" />
              <span className="hidden sm:inline">Evolution</span>
            </TabsTrigger>
            <TabsTrigger
              value="methodology"
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              <IconBook className="h-4 w-4" />
              <span className="hidden sm:inline">Methodology</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="playground"
            className="animate-in fade-in-50 duration-300"
          >
            <Playground />
          </TabsContent>

          <TabsContent
            value="evaluation"
            className="animate-in fade-in-50 duration-300"
          >
            <EvalDashboard />
          </TabsContent>

          <TabsContent
            value="evolution"
            className="animate-in fade-in-50 duration-300"
          >
            <EvolutionLab />
          </TabsContent>

          <TabsContent
            value="methodology"
            className="animate-in fade-in-50 duration-300"
          >
            <MethodologyPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
