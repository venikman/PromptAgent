import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { StoryPack, UserStory } from "@/types";
import { IconCheck, IconUser, IconWand, IconTarget } from "@tabler/icons-react";

type StoryCardProps = {
  story: UserStory;
  index: number;
};

function StoryCard({ story, index }: StoryCardProps) {
  // Defensive: handle missing fields from LLM response
  const adoFields = story.ado?.fields ?? {};
  const storyPoints = adoFields["Microsoft.VSTS.Scheduling.StoryPoints"];
  const acceptanceCriteria = story.acceptanceCriteria ?? [];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className="shrink-0">
            Story {index + 1}
          </Badge>
          {storyPoints !== undefined && (
            <Badge variant="secondary" className="shrink-0">
              {storyPoints} pts
            </Badge>
          )}
        </div>
        <CardTitle className="text-base leading-snug">{story.title ?? "Untitled Story"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User Story Narrative */}
        <div className="space-y-2 text-sm">
          {story.asA && (
            <div className="flex items-start gap-2">
              <IconUser className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">As a</span> {story.asA}
              </span>
            </div>
          )}
          {story.iWant && (
            <div className="flex items-start gap-2">
              <IconWand className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">I want</span> {story.iWant}
              </span>
            </div>
          )}
          {story.soThat && (
            <div className="flex items-start gap-2">
              <IconTarget className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">So that</span> {story.soThat}
              </span>
            </div>
          )}
        </div>

        {acceptanceCriteria.length > 0 && (
          <>
            <Separator />
            {/* Acceptance Criteria */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Acceptance Criteria
              </p>
              <ul className="space-y-1.5">
                {acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* ADO Fields (collapsible) - only show if we have ADO data */}
        {story.ado && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="ado" className="border-0">
              <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                Azure DevOps Fields
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 rounded-md bg-muted/50 p-3 font-mono text-xs">
                  {adoFields["System.Title"] && (
                    <div>
                      <span className="text-muted-foreground">System.Title:</span>
                      <br />
                      {adoFields["System.Title"]}
                    </div>
                  )}
                  {adoFields["System.Description"] && (
                    <div>
                      <span className="text-muted-foreground">
                        System.Description:
                      </span>
                      <br />
                      <span className="line-clamp-3">
                        {adoFields["System.Description"]}
                      </span>
                    </div>
                  )}
                  {adoFields["System.Tags"] && (
                    <div>
                      <span className="text-muted-foreground">System.Tags:</span>
                      <br />
                      {adoFields["System.Tags"]}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

type StoryPackDisplayProps = {
  storyPack: StoryPack;
};

export function StoryPackDisplay({ storyPack }: StoryPackDisplayProps) {
  // Defensive: handle missing fields from LLM response
  const stories = storyPack.userStories ?? [];
  const assumptions = storyPack.assumptions ?? [];
  const risks = storyPack.risks ?? [];
  const followUps = storyPack.followUps ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{storyPack.epicId ?? "Unknown"}</Badge>
          <Badge>{stories.length} stories</Badge>
        </div>
        <h3 className="text-lg font-semibold">{storyPack.epicTitle ?? "Generated Stories"}</h3>
      </div>

      {/* User Stories Grid */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="grid gap-4 md:grid-cols-2">
          {stories.map((story, index) => (
            <StoryCard key={index} story={story} index={index} />
          ))}
        </div>

        {/* Metadata sections */}
        {(assumptions.length > 0 ||
          risks.length > 0 ||
          followUps.length > 0) && (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {assumptions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Assumptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {risks.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Risks</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {followUps.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Follow-ups</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {followUps.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
