# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

DSH itself is not covered by these version guarantees: this package talks to
internal extension points, so a DSH upgrade can require a new release with no
change on the user's side. The DSH build each release was verified against is
recorded per entry.

## [1.1.0] - 2026-10-10

Documentation release; the plugin code is unchanged from 1.0.0.

### Changed

- **The default README is now Chinese.** `README.md` is the Chinese documentation
  and serves as both the GitHub landing page and the npm package page; the
  English translation moved to `README.en.md`, which had to sort after
  `README.md` because npm picks the first README in the file listing.
- The install section now leads with the in-app path — **侧边栏 →「插件」→
  「添加插件」**, then the package name — which was verified end to end on
  another machine and another account, with no command line involved.

### Added

- A **"How the balance is read and how often it refreshes"** section in both
  languages: the full request path (sidebar component → `remote.account.getBalance`
  → the app's Remote gateway → Platform `get_user_summary`), the request identity
  fields, the reason the plugin never touches a token or builds an HTTP request,
  the currency and formatting rules, the three refresh triggers with their
  throttling, the failure behaviour, the absence of any local cache, and the two
  constants (`REFRESH_MS`, `MIN_GAP_MS`) that change the cadence.

## [1.0.1] - 2026-10-10

Documentation and packaging fix; no behavior change on the DSH side.

### Fixed

- The npm package page showed the Chinese documentation to every visitor. The
  registry picks the first README in the file listing, so `README.zh.md` (which
  sorts before `README.md`) won; the Chinese file is now `README.zh-CN.md` and
  the English `README.md` is the page. GitHub links were updated accordingly.

## [1.0.0] - 2026-10-10

First published release. Verified against DSH `0.2.0-rc.2` (build
`0.2.0-rc.2-04f392c`, Windows Desktop).

### Added

- Sidebar balance row in `sidebar.footer.action`, directly above the account
  entry: recharge balance as the primary figure, granted bonus (`+¥2.00`) when
  it is at least ¥0.01, and a tooltip itemizing recharge, bonus, and total.
- Balanced refresh policy: a forced read on mount, a throttled read on window
  focus, and a five-minute heartbeat.
- Failure visibility: while no balance is available the row shows a short
  reason code instead of a silent blank, and diagnostics go to the console
  (`[sidebar-balance] ...`).
- Plugin Manager card metadata in `locale/zh.json` and `locale/en.json`, plus
  `icon.svg` declared through `package.json.icon`.
- `NOTES.zh.md`, recording the verified internals and the traps hit while
  writing this (slot name, `remote.<namespace>` service keys, the Client module
  loader contract, and the `/plugins/<id>/<file>` route).

### Notes

- The package name is `dsh-plugin-sidebar-balance`; the original
  `dsh-sidebar-balance` was already taken on npm by an unrelated project.
  The repository keeps the shorter name.
- No `dependencies`, no `peerDependencies`, no build step, and no `prepare`
  script: a git install needs no `allowBuilds` authorization and the package
  pulls nothing from a registry at install time.

[1.0.0]: https://github.com/quasimodoo/dsh-sidebar-balance/releases/tag/v1.0.0
