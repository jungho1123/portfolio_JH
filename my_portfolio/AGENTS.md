<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
## Git Commits
Conventional Commits: type: summary without scope. The summary should be a short, specific sentence that explains what changed and where or why, not a vague phrase. Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert. BREAKING CHANGE: footer when needed.

## React
No useMemo/`useCallback` (React compiler handles it). Avoid useEffect.
Single props param with inline type; access as props.foo (no destructuring).
Use React.ReactNode, not ReactNode.
Inline short event handlers; extract only when complex.

## Client lifecycle rules

- Use effects only to synchronize with external systems: subscriptions, requests, timers, IndexedDB, and Activity activation. Keep request and timer helpers outside hooks when they do not need React state.
- Editor identity is the account/document key. Each Activity activation owns its subscriptions and UI callbacks. Keep submitted mutation promises and acknowledgements across activation cleanup; reconcile them with an authoritative read before resuming writes.
- Activate the editor and recovery scope in layout effects so hydration replay cannot drop early input/actions. Listing scroll cleanup and dialog cleanup also use layout effects before Activity hides the DOM.
- Keep document data in the editor reducer. Its transition function updates the immediate async snapshot and rendered state together. Advance saved generations only for confirmed writes; preserve newer input and generation-guard recovery deletion.
- Guard async UI results with the initiating activation and request generation. Cleanup must cancel owned timers and subscriptions. Never automatically replay publishing or destructive mutations.
- Use `useEffectEvent` only inside effects and their callbacks for current values; never return it as a user handler or use it to omit semantic configuration dependencies.
- No manual memoization exceptions remain. Listing request ownership uses activation/cursor state, not callback identity. The sentinel ref is forwarded in a commit callback through `attachElementRef`; it never reads `.current` during render and keeps compiler diagnostics enabled.
