/**
 * Unit tests for schema validation
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import {
  epicSchema,
  storyPackSchema,
  userStorySchema,
  adoFieldsSchema,
  type Epic,
  type StoryPack,
} from "./schema.ts";

// ─────────────────────────────────────────────────
// Epic Schema Tests
// ─────────────────────────────────────────────────

Deno.test("epicSchema - validates minimal epic", () => {
  const minimalEpic: Epic = {
    id: "E-001",
    title: "Test Epic",
    description: "A test epic for validation",
  };

  const result = epicSchema.safeParse(minimalEpic);
  assert(result.success, "Minimal epic should be valid");
  assertEquals(result.data?.id, "E-001");
});

Deno.test("epicSchema - validates full epic with all optional fields", () => {
  const fullEpic: Epic = {
    id: "E-002",
    title: "Full Epic",
    description: "An epic with all fields populated",
    businessValue: "Increase user engagement by 20%",
    successMetrics: ["Metric 1", "Metric 2"],
    constraints: ["Must use existing auth system"],
    nonFunctional: ["Response time < 200ms"],
    outOfScope: ["Mobile app support"],
    personas: ["Admin", "End User"],
    tags: ["priority:high", "team:platform"],
  };

  const result = epicSchema.safeParse(fullEpic);
  assert(result.success, "Full epic should be valid");
  assertEquals(result.data?.businessValue, "Increase user engagement by 20%");
  assertEquals(result.data?.successMetrics?.length, 2);
});

Deno.test("epicSchema - rejects epic without required fields", () => {
  const invalidEpic = {
    id: "E-003",
    // missing title and description
  };

  const result = epicSchema.safeParse(invalidEpic);
  assert(!result.success, "Epic without title/description should be invalid");
});

// ─────────────────────────────────────────────────
// ADO Fields Schema Tests
// ─────────────────────────────────────────────────

Deno.test("adoFieldsSchema - validates correct ADO fields", () => {
  const fields = {
    "System.Title": "User Story Title",
    "System.Description": "As a user, I want to do something so that I can achieve a goal",
    "Microsoft.VSTS.Common.AcceptanceCriteria": "Given X, When Y, Then Z",
    "Microsoft.VSTS.Scheduling.StoryPoints": 5,
  };

  const result = adoFieldsSchema.safeParse(fields);
  assert(result.success, "Valid ADO fields should pass");
});

Deno.test("adoFieldsSchema - rejects story points outside valid range", () => {
  const tooHigh = {
    "System.Title": "Story Title Here",
    "System.Description": "Description here that is long enough",
    "Microsoft.VSTS.Common.AcceptanceCriteria": "Criteria here that is long enough",
    "Microsoft.VSTS.Scheduling.StoryPoints": 100, // Invalid: max is 21
  };

  const result = adoFieldsSchema.safeParse(tooHigh);
  assert(!result.success, "Story points > 21 should be invalid");
});

Deno.test("adoFieldsSchema - rejects too short title", () => {
  const shortTitle = {
    "System.Title": "Hi", // Too short: min 5
    "System.Description": "Description here that is long enough",
    "Microsoft.VSTS.Common.AcceptanceCriteria": "Criteria here that is long enough",
  };

  const result = adoFieldsSchema.safeParse(shortTitle);
  assert(!result.success, "Title < 5 chars should be invalid");
});

// ─────────────────────────────────────────────────
// User Story Schema Tests
// ─────────────────────────────────────────────────

Deno.test("userStorySchema - validates complete user story", () => {
  const story = {
    title: "Add login functionality",
    asA: "registered user",
    iWant: "to log in with my email and password",
    soThat: "I can access my personalized dashboard",
    acceptanceCriteria: [
      "Given valid credentials, when I submit the form, then I am logged in",
      "Given invalid credentials, when I submit the form, then I see an error",
    ],
    ado: {
      fields: {
        "System.Title": "Add login functionality",
        "System.Description": "As a registered user, I want to log in...",
        "Microsoft.VSTS.Common.AcceptanceCriteria": "Given valid credentials...",
        "Microsoft.VSTS.Scheduling.StoryPoints": 8,
      },
    },
  };

  const result = userStorySchema.safeParse(story);
  assert(result.success, "Valid user story should pass");
});

Deno.test("userStorySchema - rejects story with < 2 acceptance criteria", () => {
  const story = {
    title: "Add login functionality",
    asA: "user",
    iWant: "to login",
    soThat: "I can access stuff",
    acceptanceCriteria: ["Only one criterion"], // Invalid: min 2
    ado: {
      fields: {
        "System.Title": "Add login functionality",
        "System.Description": "Description here that is long enough",
        "Microsoft.VSTS.Common.AcceptanceCriteria": "Criteria here",
      },
    },
  };

  const result = userStorySchema.safeParse(story);
  assert(!result.success, "Story with < 2 acceptance criteria should be invalid");
});

// ─────────────────────────────────────────────────
// Story Pack Schema Tests
// ─────────────────────────────────────────────────

Deno.test("storyPackSchema - validates complete story pack", () => {
  const storyPack: StoryPack = {
    epicId: "E-001",
    epicTitle: "Test Epic",
    userStories: [
      {
        title: "Story 1",
        asA: "user",
        iWant: "feature A",
        soThat: "benefit X",
        acceptanceCriteria: ["AC 1", "AC 2"],
        ado: {
          fields: {
            "System.Title": "Story 1 Title",
            "System.Description": "Story 1 Description here",
            "Microsoft.VSTS.Common.AcceptanceCriteria": "Criteria for Story 1",
          },
        },
      },
    ],
    assumptions: ["Users have internet"],
    risks: ["API rate limits"],
    followUps: ["Add caching layer"],
  };

  const result = storyPackSchema.safeParse(storyPack);
  assert(result.success, "Valid story pack should pass");
  assertExists(result.data);
  assertEquals(result.data.epicId, "E-001");
  assertEquals(result.data.userStories.length, 1);
});

Deno.test("storyPackSchema - rejects empty user stories array", () => {
  const emptyPack = {
    epicId: "E-001",
    epicTitle: "Test Epic",
    userStories: [], // Invalid: min 1
  };

  const result = storyPackSchema.safeParse(emptyPack);
  assert(!result.success, "Story pack with no stories should be invalid");
});

Deno.test("storyPackSchema - provides defaults for optional arrays", () => {
  const minimalPack = {
    epicId: "E-001",
    epicTitle: "Test Epic",
    userStories: [
      {
        title: "Story 1",
        asA: "user",
        iWant: "feature",
        soThat: "benefit",
        acceptanceCriteria: ["AC 1", "AC 2"],
        ado: {
          fields: {
            "System.Title": "Story 1 Title",
            "System.Description": "Story 1 Description here",
            "Microsoft.VSTS.Common.AcceptanceCriteria": "Criteria here",
          },
        },
      },
    ],
    // assumptions, risks, followUps omitted
  };

  const result = storyPackSchema.safeParse(minimalPack);
  assert(result.success, "Minimal story pack should pass");
  assertExists(result.data);
  assertEquals(result.data.assumptions, []);
  assertEquals(result.data.risks, []);
  assertEquals(result.data.followUps, []);
});
