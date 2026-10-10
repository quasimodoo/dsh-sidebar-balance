# dsh-plugin-sidebar-balance

[中文](README.md) | English

A [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) plugin: shows the signed-in DeepSeek account balance in the left sidebar footer, directly above the account entry.

```
余额                    ¥12.34 +¥2.00
```

- The primary figure is the recharge balance (`normal_wallets`).
- `+¥2.00` is the granted bonus balance (`bonus_wallets`), shown only at ¥0.01 or more.
- The tooltip itemizes recharge, bonus, and total; the collapsed 56 px rail hides the bonus figure.

The value comes from the same Application Remote the Account settings page uses, so it always matches 设置 → 账号与余额.

## Install

### From the app (no command line — the easiest path)

1. Open **侧边栏 →「插件」→「添加插件」** (sidebar → Plugins → Add plugin);
2. Enter the package name **`dsh-plugin-sidebar-balance`** and confirm;
3. **Reload the page** (Ctrl+R) once the install finishes.

That dialog is the official, transactional entry point: it writes the profile dependency and the bundle list itself, runs the install, and prompts for a restart when one is needed. It also accepts a Git address, a tarball, or a local absolute path — use one of the sections below if the package name cannot be resolved on that machine (for example, no reachable npm registry).

### From npm (one command)

```sh
dsh plugin --profile <name> add dsh-plugin-sidebar-balance
```

The package is plain JavaScript with no dependencies, no build step, and no `prepare` script, so nothing is compiled and nothing is downloaded from a registry beyond the package itself.

### From this repository (one command, no registry)

```sh
dsh plugin --profile <name> add github:quasimodoo/dsh-sidebar-balance
```

A git install fetches source, not build output — which is fine here, because there is nothing to build. Use the explicit `https://github.com/quasimodoo/dsh-sidebar-balance.git` form if the shorthand tries SSH and your network blocks port 22.

### Then

**Reload the page** (Ctrl+R): the browser module table is assembled into `window.__DSH_BOOT__` at page load, and without `pnpm run dev:web` the client HMR chain does nothing. The balance appears in the sidebar footer, directly above the account entry. If the row shows `—` with a reason code, hover it and check the console for `[sidebar-balance]` diagnostics.

Installing a changed package name (rather than a new version of the same name) additionally needs an app restart, because the Host-side loader rows are assembled at startup.

To upgrade later, install the new version the same way; the previous version is replaced.

If the install fails with `EPERM: operation not permitted, rename`, a previous copy is still registered and the app is holding the folder. Uninstall the old entry first, or fully quit the app (including the tray icon) and install from the command line:

```sh
dsh plugin --profile desktop add dsh-plugin-sidebar-balance
```

## How the balance is read and how often it refreshes

### The data path

The plugin does not call an endpoint of its own. It re-reads the authenticated Remote channel the app already has:

```
sidebar component (client.js)
   │  ctx.remote.account.getBalance({ version, locale, timezoneOffsetSeconds })
   ▼
the app's Remote gateway (same-origin channel, browser ↔ local Host)
   │  account/getBalance
   ▼
DeepSeek Platform  /api/v0/users/get_user_summary
   │  { status, value: normal_wallets[], bonusWallets: bonus_wallets[] }
   ▼
the plugin takes the CNY wallet → primary figure; bonus_wallets → "+¥X.XX" (only at ≥ ¥0.01)
```

What follows from that:

- **Same method, same data as 设置 → 账号与余额** (Settings → Account & balance), so the two should never disagree; the official account page reads the same call when it opens.
- **Request identity**: `version` (client version — the runtime-injected `DSH_CLIENT_VERSION` when the shell exposes it, otherwise the constant in `client.js`), `locale` (from the browser language, zh / en), and `timezoneOffsetSeconds` (the machine's offset). The Host fills these in; the plugin builds no HTTP request itself.
- **The plugin never touches a token**: no key, no cookie, no network call of its own. Everything travels the app's own authenticated channel, and all the plugin receives is the decimal strings inside the wallet arrays.
- **Currency**: taken from the first wallet entry the response carries (CNY → `¥`, USD → `$`); if only a bonus wallet exists, its currency is used.
- **Formatting** reimplements the Platform's rules: two decimals, positives truncated to the cent, `<¥0.01` below one cent. The official implementation uses `big.js`, which the plugin does not reuse.

### Refresh triggers

| Trigger | Bypasses throttling | Notes |
|---|---|---|
| Component mount | Yes | One read right after the page loads or reloads |
| Window focus | No | **Skipped when the previous read was under 15 s ago**, so Alt-Tab does not hammer the endpoint |
| Every 5 minutes | No | Heartbeat, so a long-running window still tracks upstream changes |

- **There is no manual refresh button**: to make the number move immediately, switch away and back (more than 15 s later) or reload the page.
- **Every refresh is a real request**: browser → local Host → DeepSeek Platform `get_user_summary`. The official account page **does not poll at all** (it reads on open, on sign-in, and on reconnect); this plugin is deliberately more eager, which is the price of keeping the figure permanently visible.
- **On failure the previous figure is kept** and greyed out, the tooltip shows the reason (for example `E401`, `status:…`, `no-account`), and the console gets a `[sidebar-balance]` line.
- **No local cache file**: the value lives in component memory only, disappears with the page, and is never written to disk.

### Changing the cadence

The interval and the focus throttle are the two constants at the top of `client.js`: `REFRESH_MS` (default `5 * 60 * 1000`) and `MIN_GAP_MS` (default `15 * 1000`). Reload the page after editing them.

## Install from source (maintainers)

Building the tarball yourself, or installing the checkout directly:

```sh
pnpm pack                                                              # produces dsh-plugin-sidebar-balance-<version>.tgz
dsh plugin --profile <name> add ./dsh-plugin-sidebar-balance-<version>.tgz # then install it
dsh plugin --profile <name> add ./                                    # or link the checkout itself
```

`dsh plugin add github:quasimodoo/dsh-sidebar-balance` installs the repository root as the dependency, which is why the package sits at the root of this repository: a nested `packages/` layout would install a manifest-less directory and the plugin would never activate.

Releases are cut from this checkout with `npm publish`; see [NOTES.zh.md](NOTES.zh.md) for the runbook and the publish-time checks.

The profile's `link:` path should stay ASCII. A path containing characters such as `×` or non-Latin directory names has been observed to survive a byte-level misreading during troubleshooting, and an ASCII path under `C:\Users\<user>\project\` avoids the whole question.

## Distribution

| Channel | Command for the user | State |
|---|---|---|
| Add plugin in the app | **侧边栏 →「插件」→「添加插件」**, enter the package name | **Verified end to end** — installed and working on a different machine and a different account. No command line, no npm source to pick: the plugin manager performs the install and the bundle registration. |
| npm | `dsh plugin --profile <name> add dsh-plugin-sidebar-balance` | **The headline command-line channel**, installing the prebuilt plain-JS package. The name was changed from `dsh-sidebar-balance` because that name on npm belongs to an unrelated project; `dsh-plugin-sidebar-balance` was free and follows the ecosystem's `dsh-plugin-*` convention. |
| Tarball (`pnpm pack`) | `dsh plugin --profile <name> add ./dsh-plugin-sidebar-balance-<version>.tgz` | **Verified end to end, including reading a real balance.** No git, no registry, no proxy, no SSH key. Best for machines that cannot reach npm: attach the file to a GitHub Release so users get a download link. |
| Git repository | `dsh plugin --profile <name> add github:<user>/<repo>` | The package installs and activates. Depends on the user's git network and credentials: pnpm may resolve the GitHub remote over SSH (needs a key on the account) or over HTTPS (needs to reach port 443). On a network where port 22 is filtered, the shorthand fails with `Permission denied (publickey)`; use the explicit `https://` URL, or add these two rewrite rules once: `git config --global url."https://github.com/".insteadOf "git@github.com:"` and the same with `ssh://git@github.com/`. |

Two packaging rules this repository follows because of how the plugin manager installs things:

- **The package must stay at the repository root.** `dsh plugin add github:<user>/<repo>` installs the repository root as the dependency; with the package nested in `packages/`, the install produced `declares no dsh.bundle — installed as a plain dependency, not a profile layer`, i.e. the plugin never activates.
- **A git install needs no build authorization.** There is no `prepare` script and no build output, so no `allowBuilds` entry is required.

A tarball install can fail with `EPERM: operation not permitted, rename .../node_modules/<package>` when a copy of the plugin is already registered and the app has the folder open. Uninstall the old entry first, or quit the app completely (tray icon included) and install from the command line.

> If you fork this repository, update `repository.url` in `package.json` before publishing.

## Risks

> **This package depends entirely on internal extension points.** The slot name, the `remote.<namespace>` service-key convention, `window.__ModuleLoader__`, and the shape of `getBalance` are not stable public APIs. A DSH upgrade can break this plugin without notice.

- Verified against DSH `0.2.0-rc.2` (build `0.2.0-rc.2-04f392c`, Windows Desktop).
- This package declares **no `dependencies` and no `peerDependencies`**, so an install touches nothing outside the package itself. The Host half imports no Harness module (it only declares `apply()`), and the Client half takes React from the browser module table, so there is nothing for a package manager to resolve. Declaring a `@deepseek-ai/dsh*` peer would additionally arm the runtime's compatibility preflight, which denies the row (or demands an exact-version exemption) once the installed DSH no longer satisfies the range. DSH compatibility is recorded here and in `NOTES.zh.md` instead.
- Account calls carry a `version` field. Compiled bundles inline `DSH_CLIENT_VERSION`; a plain-JS bundle cannot, so the plugin reads the global when the shell exposes it and otherwise falls back to the `CLIENT_VERSION` constant in `client.js`. **Update that constant after a DSH upgrade.**
- Balance formatting reimplements the Platform's rules (two decimals, truncate positives to the cent, `<X.01` below one cent). The official implementation uses `big.js`, which is not guaranteed to exist in the browser module table.
- The plugin never touches tokens; the balance is read through the app's own authenticated Remote.
- `NOTES.zh.md` records the verified internals and the traps hit while writing this, and is the first file to re-read after a DSH upgrade.

## Layout

```
.
├── package.json        # dsh.bundle + dsh.client manifest, publishing fields
├── cordis.patch.yml    # the layer this bundle contributes to a profile
├── index.js            # Host half: nothing to prepare
├── client.js           # Client half: the sidebar row, reading and refresh cadence
├── locale/{en,zh}.json # Plugin Manager card title and description
├── icon.svg            # Plugin Manager card artwork
├── NOTES.zh.md         # verified internals and known risks
├── CHANGELOG.md        # released versions and the DSH build each was verified against
├── README.en.md        # this file
└── LICENSE
```

`README.md` is the Chinese documentation and serves as both the GitHub landing page and the npm package page. npm picks the first README in that listing order, so the English file has to sort after it — which `README.en.md` does.

The package sits at the repository root on purpose: `dsh plugin add github:<user>/<repo>` installs the
repository root as the dependency, so a nested `packages/` layout would install a manifest-less directory and
the plugin would never activate.

Machine-specific notes (real local paths, profile backups, author identity) live in `.local-notes.md`, which is
ignored by Git and never published; this documentation uses placeholder paths only.

## License

[MIT](LICENSE)
