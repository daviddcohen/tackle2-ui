import { Application } from "@app/api/models";

/**
 * The prototype inventory: 13 of the fixture applications (one or more per
 * archetype), plus any application created during the session. Every
 * application that appears in a seeded plan run is part of it. Batch
 * Settlement (14) joined so that a Legacy Java application can be in Run #7
 * while Branch Operations (13) stays free to start in the configured world.
 */
export const PORTFOLIO_APPLICATION_IDS: readonly number[] = [
  1, 2, 3, 4, 5, 7, 8, 12, 13, 14, 15, 16, 18,
];

/** Applications created in the session get ids >= 1000 (see applications.ts). */
const FIRST_SESSION_APPLICATION_ID = 1000;

export const selectPortfolio = <T extends Application>(
  applications: T[]
): T[] =>
  applications.filter(
    (application) =>
      PORTFOLIO_APPLICATION_IDS.includes(application.id) ||
      application.id >= FIRST_SESSION_APPLICATION_ID
  );
