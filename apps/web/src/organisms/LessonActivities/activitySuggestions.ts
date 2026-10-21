import type { ActivityDescriptor, ActivityType } from "@wordinator/contracts/lesson-activities";

export type ActivitySuggestion = { source: ActivityDescriptor; type: ActivityType };

// The suggested next activities (docs/lesson-activities.md#completion-and-progress): the model's follow-ups first (guided grammar only), then the
// next source's activity types in document order with guided grammar first. Shared by Up next and the Skip link so the two cannot drift.
export function suggestedActivities(descriptors: readonly ActivityDescriptor[], descriptor: ActivityDescriptor, followUps?: readonly ActivityType[]): ActivitySuggestion[] {
  const index = descriptors.findIndex((entry) => entry.sourceId === descriptor.sourceId);
  const offering = (type: ActivityType) => descriptors.slice(index + 1).find((entry) => entry.activityTypes.includes(type)) ?? descriptors.find((entry) => entry.activityTypes.includes(type));
  const next = descriptors.slice(index + 1).find((entry) => entry.activityTypes.length > 0);
  const nextTypes = next ? [...next.activityTypes].sort((a, b) => Number(b === "guided_grammar") - Number(a === "guided_grammar")) : [];
  const suggestions: ActivitySuggestion[] = [];
  for (const type of followUps ?? []) { const source = offering(type); if (source) suggestions.push({ source, type }); }
  if (next) for (const type of nextTypes) suggestions.push({ source: next, type });
  return suggestions;
}
