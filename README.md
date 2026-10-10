# dsh-sidebar-balance

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

The most reliable channel is a **tarball**: it needs no git, no SSH key, no proxy and no registry access.

```sh
pnpm pack                                                              # produces dsh-sidebar-balance-1.0.0.tgz
dsh plugin --profile <name> add ./dsh-sidebar-balance-1.0.0.tgz        # then install it
```

```sh
dsh plugin --profile <name> add github:quasimodoo/dsh-sidebar-balance  # from this repository
dsh plugin --profile <name> add https://github.com/quasimodoo/dsh-sidebar-balance.git  # same, explicit HTTPS
```

In the desktop app the same install is available from **侧边栏 →「插件」→「添加插件」**, which accepts a package name, a Git address, a tarball, or a local absolute path. The npm source selector in that dialog only affects dependency downloads; this package pulls nothing from a registry, so either source works.

`dsh plugin --profile <name> add dsh-sidebar-balance` (by package name) does **not** work today: that name on the npm registry belongs to an unrelated package. See [Distribution](#distribution).

This package is plain JavaScript with no build step and no `prepare` script, so a git install needs no `allowBuilds` authorization and no build output.

After installing or updating the Client half, **reload the page** (Ctrl+R): the browser module table is assembled into `window.__DSH_BOOT__` at page load, and without `pnpm run dev:web` the client HMR chain does nothing.

The profile's `link:` path should stay ASCII. A path containing characters such as `×` or non-Latin directory names has been observed to survive a byte-level misreading during troubleshooting, and an ASCII path under `C:\Users\<user>\project\` avoids the whole question.

## Distribution

| Channel | Command for the user | State |
|---|---|---|
| Tarball (`pnpm pack`) | `dsh plugin --profile <name> add ./dsh-sidebar-balance-1.0.0.tgz` | **Verified end to end.** No git, no registry, no proxy. The file is ~15 KB; attach it to a GitHub Release so users get a direct download link. |
| Git repository | `dsh plugin --profile <name> add github:<user>/<repo>` | Verified that the package installs and activates. Depends on the user's git network and credentials: pnpm may resolve the GitHub remote over SSH (needs a key) or HTTPS (needs to reach 443). |
| npm | `dsh plugin --profile <name> add <package-name>` | **Blocked on the name.** `dsh-sidebar-balance` already exists on npm (`latest` 0.1.1, unrelated project), so publishing needs a different name or a scope such as `@<user>/dsh-sidebar-balance`. |

Two packaging rules this repository follows because of how the plugin manager installs things:

- **The package must stay at the repository root.** `dsh plugin add github:<user>/<repo>` installs the repository root as the dependency; with the package nested in `packages/`, the install produced `declares no dsh.bundle — installed as a plain dependency, not a profile layer`, i.e. the plugin never activates.
- **A git install needs no build authorization.** There is no `prepare` script and no build output, so no `allowBuilds` entry is required.


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
├── NOTES.zh.md         # verified internals and known risks
└── README.md / README.zh.md
```

The package sits at the repository root on purpose: `dsh plugin add github:<user>/<repo>` installs the
repository root as the dependency, so a nested `packages/` layout would install a manifest-less directory and
the plugin would never activate.

Machine-specific notes (real local paths, profile backups, author identity) live in `.local-notes.md`, which is
ignored by Git and never published; this documentation uses placeholder paths only.

## License

[MIT](LICENSE)
