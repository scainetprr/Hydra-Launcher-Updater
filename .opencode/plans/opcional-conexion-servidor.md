# Plan: Hacer opcional la conexión al servidor en el launcher Hydra

**Repo:** `E:\Launcher` (Electron + React + Tailwind)
**Plan file:** `E:\Launcher\.opencode\plans\opcional-conexion-servidor.md`
**Status:** plan-only (no code edits yet)

---

## Context & goals

**Problem:** The hero "JUGAR EN HYPERHARD" button (`src/pages/Home.tsx` L145) always calls
`launchGame({ ip: principal.ip, port: principal.port || 25565 })`, which triggers `quickPlay`
(`electron/main.ts` L1300-1303) → Minecraft joins `mc.hyperhard.space` on launch → crashes if the
server is offline.

**Goal:** Clicking "Jugar" opens Minecraft only (main menu). Connecting to a server becomes a
separate, explicit, optional action.

**Already supported (no main.ts change needed):**
- `src/launch.ts` L5: `export async function launchGame(server: QuickServer = null)` — `server` defaults
  to `null`.
- `src/launch.ts` L20: passes `server: server ? {...} : null` to `window.api.launch`.
- `electron/main.ts` L1300: `if (opts.server?.ip)` — `quickPlay` is only set when a server IP exists.
  So `launchGame()` with no args → `server=null` → skips `quickPlay` → Minecraft opens to main menu.

---

## Scope of changes

### 1. `E:\Launcher\src\pages\Home.tsx` (primary edits)

| Location | Current | Planned change |
|---|---|---|
| L145 | `onClick={()=>launchGame({ ip: principal.ip, port: principal.port || 25565 })}` | Change to `onClick={()=>launchGame()}` (no args → direct launch to main menu). Keep `disabled={launching}`, green primary gradient style, `h-[58px]`, `flex items-center gap-4`. |
| L150 | Label `JUGAR EN HYPERHARD` | Relabel to `JUGAR`. Keep the subtitle line L151 `{selectedVersion} • {loader} • {acct?.name}` unchanged. Keep the `▶`/`⏳` icon and `LANZANDO...`/`DESCARGANDO` states. |
| After L159 (inside the same `flex flex-wrap items-center gap-3 mt-6` container, L143-164) | No secondary button exists here. | Add a NEW outlined/secondary button immediately after the hero play button (and after the version-dropdown button, or right after the play button — same flex row). Label: `Conectar a HyperHard`. `onClick={()=>launchGame({ ip: principal.ip, port: principal.port || 25565 })}`. `disabled={launching}`. Distinct outlined style (e.g. `border border-white/20 bg-white/5 hover:bg-white/10 text-white` instead of the green gradient) to signal it's optional. Same `h-[58px]` height for visual alignment. |
| L134 | Hero description: `...conexión directa a <b>HyperHard</b>. Sin saltos, sin configuración manual.` | Optionally soften to remove the implication that joining HyperHard is the default/only path (e.g. `...y conexión opcional a <b>HyperHard</b>.`). Low-risk copy edit. |
| L241 | "Entrar al Nido →" button (`launchGame({ ip: principal.ip, port: principal.port || 25565 })`) | **No change.** It lives in the server stats card and is contextually a server join. |
| L289 | "Como empezar (30s)" step 3: `<b>JUGAR EN HYPERHARD</b> → descarga y entra directo al servidor.` | Update to reflect the new behavior: "Jugar" abre Minecraft (menú principal); conectar a un servidor es opcional. Example: `<b>JUGAR</b> → abre Minecraft (menú principal). <b>Conectar a HyperHard</b> → entra al servidor (opcional).` |

### 2. `E:\Launcher\src\pages\Servers.tsx` — NO CHANGE

Per-server "Entrar →" buttons (L108, L159) already call `launchGame` with an explicit server — that is
the intended explicit per-server join. Leave as-is.

### 3. `E:\Launcher\src\electron/main.ts` — NO CHANGE

`quickPlay` is gated on `opts.server?.ip` (L1300-1303). `server=null` already skips it. No edit required.

### 4. `E:\Launcher\src\launch.ts` — NO CHANGE

`launchGame(server = null)` default already handles the no-args direct-launch path (L5, L20). No edit required.

### Out of scope (do NOT touch)
- Landing files, git, version bump, release, `package.json`, `electron/main.ts`, `src/launch.ts`,
  `src/pages/Servers.tsx`, `dist/`, `dist-electron/`, asar packaging logic.

---

## Phased approach

**Phase 1 — Edit Home.tsx hero button (L145-153)**
- Switch hero primary `onClick` to `launchGame()` (no args).
- Relabel to `JUGAR`.
- Verify `disabled={launching}` and subtitle retained.

**Phase 2 — Add secondary "Conectar a HyperHard" button**
- Insert outlined secondary button in the same hero flex container (after the play/version buttons).
- `onClick` keeps the original `{ ip: principal.ip, port: principal.port || 25565 }` call.
- `disabled={launching}`.
- Distinct outlined style (not green gradient).

**Phase 3 — Update copy**
- L289 "Como empezar (30s)" step 3 → new two-step wording.
- Optional L134 hero description softening.

**Phase 4 — Verification (no code change)**
- `tsc --noEmit` → 0 errors.
- `npm run build` → 0 errors.
- Runtime `--hydra-test` → no ERR_FILE_NOT_FOUND/Uncaught/TypeError; app opens.
- Behavior check: hero "JUGAR" → Minecraft main menu (no quickPlay); "Conectar a HyperHard" → quickPlay to mc.hyperhard.space.

---

## Risks / rollback considerations

| Risk | Mitigation / rollback |
|---|---|
| `launchGame()` with no args somehow not reaching main menu | Confirmed by code: `launch.ts` L5 default `null`, L20 passes `server: null`; `main.ts` L1300 skips `quickPlay` when no `server.ip`. Rollback: revert L145 `onClick` to the original `{ ip, port }` call. |
| New secondary button breaks hero flex layout | Keep same `h-[58px]` height and place inside existing `flex flex-wrap items-center gap-3 mt-6` container. Tailwind `flex-wrap` handles wrapping. Rollback: remove the added `<button>` block. |
| `tsc` strict-mode error on new button (event handler typing) | Follow existing pattern exactly (inline arrow `onClick`, `disabled={launching}`). `launchGame` returns `Promise<boolean>` — inline handler is fine as in existing code. |
| Copy change at L289 references removed label | Ensure wording no longer says "JUGAR EN HYPERHARD → entra directo al servidor". |
| Asar repack layout (dist\ subdirectory, no root app.html) | This is a build/packaging concern, unaffected by source edits. `vite.config.ts` build input is `app.html` → default `dist` outDir. No plan change needed; verification step only. |

---

## Testing & verification playbook

1. **Typecheck:** `npx tsc --noEmit` (or `npm run build` which runs `tsc && vite build`) → expect 0 errors.
2. **Build:** `npm run build` → expect 0 errors, `dist/` produced.
3. **Runtime:** launch with `--hydra-test`; scan logs for `ERR_FILE_NOT_FOUND`, `Uncaught`, `TypeError`; confirm app window opens.
4. **Behavior — hero "JUGAR":** click → Minecraft launches to main menu; no `quickPlay → ...` log line; no server join attempt.
5. **Behavior — "Conectar a HyperHard":** click → `quickPlay → mc.hyperhard.space:25565` log line; Minecraft attempts server join.
6. **Disabled state:** while `launching` is true, both buttons show `disabled:opacity-60` and "LANZANDO..." / "Lanzando..." states.
7. **Regression:** "Entrar al Nido →" (L241) and Servers.tsx "Entrar →" buttons still join their servers as before.

---

## Acceptance criteria

- [ ] `tsc --noEmit` → 0 errors.
- [ ] `npm run build` → 0 errors.
- [ ] Asar repack layout OK (`dist\` subdirectory, no root `app.html`).
- [ ] Runtime `--hydra-test` → no `ERR_FILE_NOT_FOUND`/`Uncaught`/`TypeError` in logs; app opens.
- [ ] Hero primary button relabeled to `JUGAR`, `onClick` is `launchGame()` with no server args → Minecraft opens to main menu (no `quickPlay`).
- [ ] New secondary button `Conectar a HyperHard` present, outlined/secondary style, `disabled={launching}`, `onClick` calls `launchGame({ ip: principal.ip, port: principal.port || 25565 })` → quickPlay to mc.hyperhard.space.
- [ ] `src/pages/Servers.tsx` unchanged.
- [ ] `electron/main.ts` and `src/launch.ts` unchanged.
- [ ] L289 "Como empezar (30s)" updated to reflect optional connection.
- [ ] Landing files, git, version, release untouched.
