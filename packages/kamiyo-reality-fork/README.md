# `@kamiyo/reality-fork`

Public package for the Reality Fork surface.

It does three jobs:

- loads bundled fixture scenarios
- adapts authenticated Companion control-room cases into the public Reality Fork shape
- provides replay and share-card utilities so apps can render the same scenario in fixture or live mode

The public UI lives in `kamiyo-app`. This package stays in `kamiyo-protocol` because the control-room engine, fixture exports, and canonical public scenario shape are owned here.

## Exports

- `loadFixtureScenario(id)`
- `listFixtureScenarios()`
- `createCompanionControlRoomClient(config)`
- `adaptCompanionCaseToScenario(detail, metadata?)`
- `createRealityForkFixtureBundle(detail, metadata?)`
- `replayScenarioEvents(events, branchLabels, options?)`

## Notes

- Fixture loading uses Node filesystem APIs and is intended for server-side use.
- Live Companion auth tokens should stay server-side. `NEXT_PUBLIC_COMPANION_TOKEN` is supported only as a last-resort local demo fallback.
