This is `@yuhua99/pi-web-codex`, a Pi extension for a Codex-style `web.run` tool. TypeScript runs directly, no build. Entry is `index.ts` via `package.json` `pi.extensions`.

## Architecture contract

One owner per file. Do not create catch-all modules (`utils.ts`, `helpers.ts`, `common.ts`, `shared.ts`); use domain names.

- `index.ts` — tool registration and event wiring only
- `test/` — `*.test.mjs` suites; import `.ts` directly under `node --test` (no build step, no runtime TS syntax: enums, namespaces, parameter properties)

Keep source files under ~600 LOC; split by ownership before adding more logic.

Reach for Pi built-ins first: check `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` exports and docs for an existing component, helper, or type before writing an equivalent.

## Quality gates

```bash
bun install
bun run lint       # oxlint
bun run typecheck  # oxlint --type-aware --type-check via tsgolint
bun run test       # node --test
```

Manual check: `pi -e .` · Publish check: `bun pm pack --dry-run`

## Commit format

`<type>: <imperative summary>`, sentence case. Types: `feat`, `fix`, `refactor`, `docs`, `chore`. One logical change per commit; no vague messages.
