import { BaseAutomation } from "./base";
import { BrownsMillAutomation } from "./courses/browns-mill";

const REGISTRY: Record<string, () => BaseAutomation> = {
  "browns-mill": () => new BrownsMillAutomation(),
};

export function getAutomation(courseSlug: string): BaseAutomation {
  const factory = REGISTRY[courseSlug];
  if (!factory) throw new Error(`No automation registered for course: ${courseSlug}`);
  return factory();
}
