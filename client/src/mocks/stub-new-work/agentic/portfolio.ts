import { Application } from "@app/api/models";

/**
 * The prototype inventory: 12 of the fixture applications (one or more per
 * archetype), plus any application created during the session. Every
 * application that appears in a seeded plan run is part of it.
 */
export const PORTFOLIO_APPLICATION_IDS: readonly number[] = [
  1, 2, 3, 4, 5, 7, 8, 12, 13, 15, 16, 18,
];

/**
 * The target profile each portfolio application migrates to (one of its
 * archetype's profiles). Mock stand-in for the application's migration target;
 * the Hub would know it, for example from the target profile it was analyzed
 * with. Applications not listed use their archetype's first profile.
 */
export const APPLICATION_TARGET_PROFILE_IDS: Readonly<Record<number, number>> =
  {
    1: 12,
    2: 11,
    3: 12,
    4: 21,
    5: 22,
    7: 12,
    8: 11,
    12: 21,
    13: 31,
    15: 41,
    16: 42,
    18: 51,
  };

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
