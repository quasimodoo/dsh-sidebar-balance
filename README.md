# dsh-plugin-sidebar-balance

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) plugin: shows the signed-in DeepSeek account balance in the left sidebar footer, directly above the account entry.

```
余额                    ¥12.34 +¥2.00
```

- The primary figure is the recharge balance (`normal_wallets`).
- `+¥2.00` is the granted bonus balance (`bonus_wallets`), shown only at ¥0.01 or more.
- The tooltip itemizes recharge, bonus, and total; the collapsed 56 px rail hides the bonus figure.

The value comes from the same Application Remote the Account settings page uses, so it always matches 设置 → 账号与余额.

## Install

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

### From the app, without a command line

**侧边栏 →「插件」→「添加插件」** accepts a package name (`dsh-plugin-sidebar-balance`), a Git address, a tarball, or a local absolute path. Either way you can also grab `dsh-plugin-sidebar-balance-1.0.0.tgz` (about 16 KB) from the [Releases page](https://github.com/quasimodoo/dsh-sidebar-balance/releases) and paste its full path, for example `C:\Users\<user>\Downloads\dsh-plugin-sidebar-balance-1.0.0.tgz`. The npm source selector in that dialog only affects dependency downloads; this package pulls nothing from a registry.

### Then

**Reload the page** (Ctrl+R): the browser module table is assembled into `window.__DSH_BOOT__` at page load, and without `pnpm run dev:web` the client HMR chain does nothing. The balance appears in the sidebar footer, directly above the account entry. If the row shows `—` with a reason code, hover it and check the console for `[sidebar-balance]` diagnostics.

Installing a changed package name (rather than a new version of the same name) additionally needs an app restart, because the Host-side loader rows are assembled at startup.

To upgrade later, install the new version the same way; the previous version is replaced.

If the install fails with `EPERM: operation not permitted, rename`, a previous copy is still registered and the app is holding the folder. Uninstall the old entry first, or fully quit the app (including the tray icon) and install from the command line:

```sh
dsh plugin --profile desktop add "C:\Users\<user>\Downloads\dsh-plugin-sidebar-balance-1.0.0.tgz"
```

## Install from source (maintainers)

Building the tarball yourself, or installing the checkout directly:

```sh
pnpm pack                                                              # produces dsh-plugin-sidebar-balance-1.0.0.tgz
dsh plugin --profile <name> add ./dsh-plugin-sidebar-balance-1.0.0.tgz # then install it
dsh plugin --profile <name> add ./                                    # or link the checkout itself
```

`dsh plugin add github:quasimodoo/dsh-sidebar-balance` installs the repository root as the dependency, which is why the package sits at the root of this repository: a nested `packages/` layout would install a manifest-less directory and the plugin would never activate.

Releases are cut from this checkout with `npm publish`; see [NOTES.zh.md](NOTES.zh.md) for the runbook and the publish-time checks.

The profile's `link:` path should stay ASCII. A path containing characters such as `×` or non-Latin directory names has been observed to survive a byte-level misreading during troubleshooting, and an ASCII path under `C:\Users\<user>\project\` avoids the whole question.

## Distribution

| Channel | Command for the user | State |
|---|---|---|
| Tarball (`pnpm pack`) | `dsh plugin --profile <name> add ./dsh-plugin-sidebar-balance-1.0.0.tgz` | **Verified end to end, including reading a real balance.** No git, no registry, no proxy, no SSH key. This is the recommended channel; attach the file to a GitHub Release so users get a download link. |
| Git repository | `dsh plugin --profile <name> add github:<user>/<repo>` | The package installs and activates. Depends on the user's git network and credentials: pnpm may resolve the GitHub remote over SSH (needs a key on the account) or over HTTPS (needs to reach port 443). On a network where port 22 is filtered, the shorthand fails with `Permission denied (publickey)`; use the explicit `https://` URL, or add these two rewrite rules once: `git config --global url."https://github.com/".insteadOf "git@github.com:"` and the same with `ssh://git@github.com/`. |
| npm | `dsh plugin --profile <name> add dsh-plugin-sidebar-balance` | **The headline channel.** The name was changed from `dsh-sidebar-balance` because that name on npm belongs to an unrelated project (`latest` 0.1.1); `dsh-plugin-sidebar-balance` is free and follows the ecosystem's `dsh-plugin-*` convention. Publishing itself is a maintainer step, recorded in [NOTES.zh.md](NOTES.zh.md). |

Two packaging rules this repository follows because of how the plugin manager installs things:

- **The package must stay at the repository root.** `dsh plugin add github:<user>/<repo>` installs the repository root as the dependency; with the package nested in `packages/`, the install produced `declares no dsh.bundle — installed as a plain dependency, not a profile layer`, i.e. the plugin never activates.
- **A git install needs no build authorization.** There is no `prepare` script and no build output, so no `allowBuilds` entry is required.

A tarball install can fail with `EPERM: operation not permitted, rename .../node_modules/<package>` when a copy of the plugin is already registered and the app has the folder open. Uninstall the old entry first, or quit the app completely (tray icon included) and install from the command line.

> If you fork this repository, update `repository.url` in `package.json` before publishing.

## Refresh policy

| Trigger | Forced | Notes |
|---|---|---|
| Component mount | Yes | Reads immediately |
| Window focus | No | Skipped within 15 s of the previous read, so Alt-Tab does not hammer the endpoint |
| Every 5 minutes | No | Heartbeat |

Every poll is a real request: browser → local Host → DeepSeek Platform `get_user_summary`. The Account page does not poll at all; this plugin is deliberately more eager, which is the price of keeping the figure permanently visible.

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
├── client.js           # Client half: the sidebar row
├── locale/{en,zh}.json # Plugin Manager card title and description
├── icon.svg            # Plugin Manager card artwork
├── NOTES.zh.md         # verified internals and known risks
├── CHANGELOG.md        # released versions and the DSH build each was verified against
└── README.md / README.zh.md
```

The package sits at the repository root on purpose: `dsh plugin add github:<user>/<repo>` installs the
repository root as the dependency, so a nested `packages/` layout would install a manifest-less directory and
the plugin would never activate.

Machine-specific notes (real local paths, profile backups, author identity) live in `.local-notes.md`, which is
ignored by Git and never published; this documentation uses placeholder paths only.

## License

[MIT](LICENSE)
