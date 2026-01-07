/**
 * Shared export utilities for story packs.
 * Supports CSV (Azure DevOps format) and JSON exports.
 */

import type { StoryPack } from "@/types";

/**
 * Download a file with the given content and filename.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Escape a CSV field value properly.
 */
export function escapeCsvField(value: string): string {
  if (!value) return '""';
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
    return `"${escaped}"`;
  }
  return escaped;
}

/**
 * Export a StoryPack to CSV format (Azure DevOps import compatible).
 */
export function exportToCSV(storyPack: StoryPack) {
  const headers = [
    "Work Item Type",
    "Title",
    "Description",
    "Acceptance Criteria",
    "Story Points",
    "Tags",
  ];

  const rows = storyPack.userStories.map((story) => {
    const fields = story.ado?.fields ?? {};
    return [
      "User Story",
      escapeCsvField(fields["System.Title"] || story.title || ""),
      escapeCsvField(fields["System.Description"] || ""),
      escapeCsvField(fields["Microsoft.VSTS.Common.AcceptanceCriteria"] || ""),
      fields["Microsoft.VSTS.Scheduling.StoryPoints"]?.toString() || "",
      escapeCsvField(fields["System.Tags"] || ""),
    ];
  });

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const filename = `${storyPack.epicId || "stories"}-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename, "text/csv;charset=utf-8");
}

/**
 * Export a StoryPack to JSON format.
 */
export function exportToJSON(storyPack: StoryPack) {
  const json = JSON.stringify(storyPack, null, 2);
  const filename = `${storyPack.epicId || "stories"}-${new Date().toISOString().slice(0, 10)}.json`;
  downloadFile(json, filename, "application/json");
}
