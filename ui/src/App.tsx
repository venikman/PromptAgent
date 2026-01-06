import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  IconSparkles,
  IconHeartbeat,
  IconPlayerPlay,
  IconChartBar,
  IconDna,
  IconBrandGithub,
  IconBook,
  IconExternalLink,
} from "@tabler/icons-react";
import { Playground } from "@/components/playground";
import { EvalDashboard } from "@/components/evaluation";
import { EvolutionLab } from "@/components/evolution";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function App() {
  const [healthStatus, setHealthStatus] = useState<
    "loading" | "ok" | "error"
  >("loading");
  const [healthError, setHealthError] = useState<string>("");
  const [activeTab, setActiveTab] = useState("playground");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/health");
        if (cancelled) return;
        setHealthStatus(res.ok ? "ok" : "error");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setHealthError(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        if (cancelled) return;
        setHealthStatus("error");
        setHealthError(err instanceof Error ? err.message : String(err));
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <IconSparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold">PromptAgent</span>
            <Badge variant="outline" className="ml-2 text-xs">
              Interactive Docs
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {healthStatus === "loading" ? (
              <Skeleton className="h-6 w-20" />
            ) : healthStatus === "ok" ? (
              <Badge variant="outline" className="text-green-600 border-green-500/30 gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <IconHeartbeat className="h-3 w-3" />
                Offline
              </Badge>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="container space-y-4 py-4">
          {/* Hero Section - Compact */}
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">Interactive Docs</h1>
              <div className="hidden sm:flex items-center gap-1.5">
                <Badge variant="outline" className="gap-1 text-xs">
                  <IconPlayerPlay className="h-3 w-3" />
                  Generate
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <IconChartBar className="h-3 w-3" />
                  Evaluate
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <IconDna className="h-3 w-3" />
                  Evolve
                </Badge>
              </div>
            </div>
          </div>

          {/* Connection Error */}
          {healthStatus === "error" && (
            <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>
                {healthError || "Unable to connect to the API. Please check that the server is running."}
              </AlertDescription>
            </Alert>
          )}

          {/* Main Content Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="playground" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <IconPlayerPlay className="h-4 w-4" />
                <span className="hidden sm:inline">Playground</span>
              </TabsTrigger>
              <TabsTrigger value="evaluation" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <IconChartBar className="h-4 w-4" />
                <span className="hidden sm:inline">Evaluation</span>
              </TabsTrigger>
              <TabsTrigger value="evolution" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <IconDna className="h-4 w-4" />
                <span className="hidden sm:inline">Evolution</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="playground" className="animate-in fade-in-50 duration-300">
              <Playground />
            </TabsContent>

            <TabsContent value="evaluation" className="animate-in fade-in-50 duration-300">
              <EvalDashboard />
            </TabsContent>

            <TabsContent value="evolution" className="animate-in fade-in-50 duration-300">
              <EvolutionLab />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconSparkles className="h-4 w-4" />
              <span>PromptAgent - Automated Prompt Engineering</span>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" asChild>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <IconBrandGithub className="h-4 w-4" />
                  <span className="hidden sm:inline">GitHub</span>
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" asChild>
                <a href="#" target="_blank" rel="noopener noreferrer">
                  <IconBook className="h-4 w-4" />
                  <span className="hidden sm:inline">Docs</span>
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" asChild>
                <a href="#" target="_blank" rel="noopener noreferrer">
                  <IconExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">API</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
