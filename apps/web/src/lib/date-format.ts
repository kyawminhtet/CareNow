import { businessRules } from "@carenow/design-tokens";

export function formatYangonDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: businessRules.defaultTimeZone }).format(date);
}
