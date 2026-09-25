# Mesa Viva

A mobile-first, browser-based No-Limit Texas Hold'em game against computer-controlled opponents. The UI is in Brazilian Portuguese. No real money is involved.

The full specification is in [`AGENTS.md`](AGENTS.md). Current status is in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Development

Requires Node.js 22.18 or newer (see `.nvmrc`).

```sh
npm install
npx playwright install chromium   # once, for end-to-end tests
npm run dev                       # local dev server
npm run check                     # format, lint, typecheck, unit tests, build and e2e
```

| Script               | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `npm run dev`        | Vite dev server                                                   |
| `npm run build`      | Typecheck and production build into `dist/`                       |
| `npm run preview`    | Serve the production build                                        |
| `npm run test`       | Fast unit, property and statistical tests (Vitest)                |
| `npm run test:long`  | Exhaustive and long-running tests (manual CI workflow)            |
| `npm run bench:eval` | Hand-evaluator throughput benchmark                               |
| `npm run e2e`        | Build, then run Playwright on phone, tablet and desktop viewports |
| `npm run lint`       | ESLint, including the architectural rules                         |
| `npm run typecheck`  | `tsc -b` across app, tests and tooling                            |
| `npm run format`     | Prettier write                                                    |
| `npm run icons`      | Regenerate the PWA PNG icons                                      |
| `npm run check`      | Everything above that runs fast, in order                         |

Every push to `main` deploys to GitHub Pages.
