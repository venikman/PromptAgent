import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Epic } from "@/types";
import { IconBook2 } from "@tabler/icons-react";

type EpicInputProps = {
  selectedEpic: Epic | null;
  onEpicChange: (epic: Epic | null) => void;
  disabled?: boolean;
};

export function EpicInput({
  selectedEpic,
  onEpicChange,
  disabled,
}: EpicInputProps) {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEpics = async () => {
      try {
        const res = await fetch("/epics");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setEpics(data.epics || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load epics");
      } finally {
        setLoading(false);
      }
    };
    fetchEpics();
  }, []);

  const handleSelect = (epicId: string) => {
    const epic = epics.find((e) => e.id === epicId) || null;
    onEpicChange(epic);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error loading epics</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit" variant="outline">
          <IconBook2 className="h-3.5 w-3.5" />
          Step 1
        </Badge>
        <CardTitle>Select an Epic</CardTitle>
        <CardDescription>
          Choose from the evaluation dataset or view the epic details below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="epic-select">Epic</Label>
          <Select
            value={selectedEpic?.id || ""}
            onValueChange={handleSelect}
            disabled={disabled}
          >
            <SelectTrigger id="epic-select">
              <SelectValue placeholder="Select an epic..." />
            </SelectTrigger>
            <SelectContent>
              {epics.map((epic) => (
                <SelectItem key={epic.id} value={epic.id}>
                  {epic.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedEpic && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Title</Label>
              <p className="text-sm font-medium">{selectedEpic.title}</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                readOnly
                value={selectedEpic.description}
                className="min-h-[120px] resize-none"
              />
            </div>
            {selectedEpic.tags && selectedEpic.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEpic.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
