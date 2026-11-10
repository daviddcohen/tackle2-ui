# Navigation context handoff

Breadcrumbs use the existing PatternFly component and React Router 5 history state. The frontend needs no new backend endpoint or navigation service.

`useBreadcrumbs(title, fallback)` returns the displayed `breadcrumbs`, the current page's `linkCrumbs`, and a `to(path, search?)` descriptor for related entity links. Child tables receive `linkCrumbs` instead of reconstructing their parent's context. `BreadCrumbPath` restores the ancestor's URL and carries only the preceding trail. Navigating to an entity already in the trail truncates descendants and restores that entity's previous view.

History state stores a flat array of `{ title, path }` entries under `breadcrumbs`. Paths retain tab, filter, sorting, pagination, drawer selection, and fragment parameters. They contain no nested history state or entity records. The current breadcrumb is plain text with `aria-current="page"`. Browser Back, Forward, and reload use their own native history entries. Sidebar navigation starts a new trail.

The shared URL persistence hook preserves unrelated location state and fragments when updating tabs or table controls. Agentic lists now use the existing URL-backed table-controls behavior. The prototype provider also preserves location state while canonicalizing demonstration parameters. Explicit scenario changes update saved return URLs so breadcrumbs do not reset the current demonstration scenario.

Explicit persona changes and Reset start a fresh trail and clear the previous view parameters. Starting a migration captures the Inventory URL after its scenario transition. Detail error states retain the originating trail so an unavailable association still has a return path.

The `history` dependency is declared directly because the shared helper uses its path parser and formatter. Its version matches the existing React Router dependency.

## Entity destinations

- Agents, Plans, Runs, Skills, Collections, and Applications use existing detail routes and actual resource IDs.
- Archetypes use the existing `ar:activeItem` drawer selection. The table can resolve the selected entity from its full local dataset, including entities outside the current page or filters.
- A selected Archetype's breadcrumb appears in its drawer header. The existing overlay drawer can cover the page header, so the entity trail belongs in the visible detail surface. Closing the drawer restores the list's header.
- Drawer cleanup runs before the next page is painted, preventing an outgoing drawer from retaining a second breadcrumb while navigating. Target-profile cells use PatternFly's responsive labels and header widths, with related links grouped in a single cell body.
- Target profiles use the existing owning archetype route with a `target-profile-ID` fragment. The referenced row is selected, scrolled into view, and focused. Target profile ownership comes from query data.
- Application details fetch the item by ID rather than searching the sampled inventory. Valid associated applications remain reachable even when they are absent from the inventory's current page or demonstration sample.
- Prototype application reference labels and Agent Skill references derive from their canonical fixtures, preventing an ID from linking to a differently named entity.

`useEntityBreadcrumbs` preserves compatibility with existing `from=agent-ID`, `plan-ID`, `skill-ID`, `collection-ID`, `run-ID`, `app-ID`, and `fromAgent=ID` URLs. It fetches only the referenced origin when a complete history trail is absent. A copied URL or a newly opened tab has its own browser history, so it uses the canonical hierarchy or the single origin encoded in that URL. Full trails are intentionally not serialized into URLs or global storage.

Resolved Skill provenance currently provides scope names without stable source-resource IDs. Those provenance labels remain text; the Skill itself is navigable. Production APIs must supply source IDs before those labels can safely become links. No routing by display name is introduced.

## Verification

`e2e/navigation/navigation-context.spec.ts` discovers entity data through the running MSW transport. It visits the available list/detail/tab/drawer surfaces, clicks each unique rendered internal entity destination, checks its name and breadcrumb context, and returns through the breadcrumb to the exact source URL. Additional cases exercise long journeys, cycles, refresh, Back/Forward, list filters, tabs, scenario changes, fresh tabs, loading/error/missing entities, and keyboard navigation at desktop, tablet, and mobile widths. Screenshots are attached to the responsive cases.

Responsive cases check mouse actionability for every breadcrumb link, including the Archetype drawer and selected target profile. Visibility and bounding boxes alone do not detect a drawer covering a link.

The focused Jest suite verifies ancestor truncation, drawer identity, target profile fragments, malformed history entries, flat trail storage, URL state preservation, canonical fixture labels, and existing breadcrumb rendering.

### Repeatable checks

The navigation suite runs with the rest of the Playwright suite:

```sh
npm run test -w client -- --runInBand
npm run build -w client
npm run test:e2e:prototype
```

The suite reads IDs and relationships from the running mock API instead of maintaining a separate navigation fixture.
