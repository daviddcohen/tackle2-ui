/**
 * The archetype drawer's tabs, in order; the URL stores the number
 * (`archetypes:tab`).
 */
export enum ArchetypeDrawerTab {
  Details = 0,
  TargetProfiles = 1,
  // 2 was the Skills tab; its skills are a fact on Details now. The number
  // stays unused so an old link opens Details, not another tab.
  Reviews = 3,
}
