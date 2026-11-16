# SpaceFront

A browser-first 2D real-time territory-conquest game set in our solar system (later also on Steam via Electron).

Read before working:

- [docs/GAMEPLAY_PLAN.md](docs/GAMEPLAY_PLAN.md): what the game is
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organized
- [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md): rules (follow them)
- [docs/CODING_PLAN.md](docs/CODING_PLAN.md): milestones and tasks; tick off `☐` → `☑` as tasks land

Most important rules:

- `src/core` is a **deterministic** simulation. No `Math.random`, `Date`, timers, transcendental `Math.*`, or DOM. Integers/fixed-point for state.
- All changes to game state go through **commands**. The client only sends commands and renders deltas.
- Every balance number lives in `src/data/balance.ts`.
- Run `npm run check` before committing. Use Conventional Commits.
