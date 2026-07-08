import type { BookingOptions, BookingResult } from "./base";
import { BrownsMillForePassAutomation } from "./courses/city-of-atlanta/browns-mill-fore-pass";

interface Automation {
  attempt(opts: BookingOptions): Promise<BookingResult>;
}

const REGISTRY: Record<string, () => Automation> = {
  "browns-mill-fore-pass": () => new BrownsMillForePassAutomation(),
};

export function getAutomation(courseSlug: string): Automation {
  const factory = REGISTRY[courseSlug];
  if (!factory) throw new Error(`No automation registered for course: ${courseSlug}`);
  return factory();
}
