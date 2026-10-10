# 开发笔记（内部实现要点）

本文件记录编写这个插件时**实证**得到的 DSH 内部约定，以及已知风险。所有结论都来自对已安装构建产物（`app.asar`）与官方包文档的核对，不是猜测。DSH 升级后这些点最可能变化，排查时请优先复查这里。

## 插件做了什么

包名 `dsh-plugin-sidebar-balance`（原名 `dsh-sidebar-balance`，因 npm 重名而改；仓库名仍是后者）。在左侧边栏底部、账号入口正上方显示 DeepSeek 账号余额：

```
余额                    ¥12.34 +¥2.00
```

- 主数字 = 充值余额（`normal_wallets`）
- `+¥2.00` = 赠金余额（`bonus_wallets`），仅当 ≥ ¥0.01 时显示
- 悬停提示 = `充值余额 ¥12.34 · 赠金余额 ¥2.00 · 合计余额 ¥14.34`
- 侧边栏折叠时隐藏赠金（56px 导轨放不下）

## 挂载点

`sidebar.footer.action`，由 `@deepseek-ai/dsh-client-ui-sidebar` 声明，规格为：

```js
"sidebar.footer.action": { kind: "list", scope: "root" }
```

它在侧边栏渲染树里位于 `.footerActions`，紧随其后的 `.settingsArea` 才是账号入口（`sidebar.settings`，`kind: "single"`）。父级传给条目的 props 是 `{ wide }`。

其他相关插槽（同一声明）：`sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.toggle.badge`、`sidebar.panellist`、`sidebar.workspaces`、`sidebar.settings`。

折叠时 Windows 标题栏模式下 `.footArea` 被 CSS 隐藏（`[data-windows-titlebar] .collapsed .footArea { display:none }`），组件仍挂载。

## 余额数据来源

```js
const result = await ctx.remote.account.getBalance({ version, locale, timezoneOffsetSeconds });
```

- `result` 是 `RemoteResult`：`{ ok: true, value }` 或 `{ ok: false, error }`
- `result.value` 形如 `{ status: 'ready', value: Wallet[], bonusWallets: Wallet[] }`
- `Wallet = { currency: 'CNY' | 'USD', balance: <十进制字符串> }`

依据：

```js
// dsh-deepseek-account-platform/lib/types/details.js
const wallet  = z.object({ currency: z.enum(['CNY','USD']), balance: z.string().regex(decimal) });
const summary = z.object({ normal_wallets: z.array(wallet), bonus_wallets: z.array(wallet) });
balance: { path: '/api/v0/users/get_user_summary', parse: (value) =>
  ({ status: 'ready', value: parsed.data.normal_wallets, bonusWallets: parsed.data.bonus_wallets }) }
```

```js
// dsh-client-ui-settings-account/lib/client.js —— 官方账号页的消费方式
const read = async (field, query) => { ... details: { ...details, [field]: value } };  // 存 result.value
const wallets = details?.balance?.status === "ready" ? details.balance.value : void 0;   // 再取 .value
```

所以真实钱包数组在 `result.value.value`（`normalizeWallets()` 同时兼容 `normal_wallets` / `value` / `wallets`）。

## 最容易踩的坑：命名空间是独立服务

**Remote 的每个命名空间不是 `remote` 服务上的属性**，而是一个独立 Cordis 服务：

```js
// dsh-api-gateway/lib/client.js
function remoteServiceKey(namespace) { return `remote.${namespace}`; }
var RemoteNamespaceService = class extends Service {
  constructor(ctx, name, invokeRemote) { super(ctx, remoteServiceKey(name)); ... }
};
```

因此：

- ✅ 正确：`ctx.remote.account`（经 ctx 代理按 `remote.account` 点名解析）
- ✅ 正确：`ctx.get('remote.account')`
- ❌ 错误：`ctx.get('remote').account` —— 基础实例上没有该属性，**访问即抛错**（不会返回 undefined）

插件里 `resolveAccount()` 按上述顺序依次尝试，失败时把每条路径标成 `:none` / `:threw` 便于定位。

## 客户端插件契约

```js
window.__ModuleLoader__.load({ id: '<包名>', factory(require) { ... } });
```

- `id` 必须**恰好等于包名**（`dsh-client-modules` 只把浏览器半侧挂在说明符等于包名的 Loader 行上）
- `require('react')` 可用；`dsh.client.external` 声明其他非基线运行时依赖
- 不要 `require` 任何 `@deepseek-ai/dsh-client-*` 包（会随版本变化且无类型检查）

## 安装与生效

- profile：`<用户目录>\.dsh\profiles\desktop`
- 安装 = `dependencies` 里加 `link:<绝对路径>` + `dsh.profile.bundles` 里加包名
- App 内**侧边栏 →「插件」→「添加插件」**接受「包名 / Git 地址 / 压缩包 / 本地绝对路径」，是官方且事务性的安装入口
- **客户端模块表在页面加载时组装进 `window.__DSH_BOOT__`**，模块由 node 半侧按 `/plugins/<包名>/<文件名>` 路由提供（`dsh-client-modules` 注册的前缀路由，按插件 id 找文件）；而 `client-hmr` 那条链在没有 `pnpm run dev:web` 时**空转**。所以新装或改动客户端插件后，**必须刷新页面**（Ctrl+R）。
- 路由的可核对细节：`/plugins/<id>/<fileName>` 里 `id` 就是包名（可与 `?rev=` 组合），另有一条组合路由 `/plugins/??<ids>&rev=...`。用命令行直接 curl 这两个地址会得到 404（本机实测 `http://127.0.0.1:19387/` 未带凭据时返回 401），所以**验证要走应用界面或在页面里看 Network/控制台**，不要用命令行探测下结论。
- **改了包名之后必须重启 App，而不只是刷新页面**：Host 侧的加载器行与模块表都是启动时组装的，只刷新页面拿到的仍是旧包名那一行（本机实测：改名后 `/plugins/<新旧包名>/client.js` 都返回 404，直到重启）。
- 警告：profile 的 `package.json` 里 `link:` 路径**不要含非 ASCII 字符**（如 `×`、中文目录名）。实测带这类字符的目录能正确写入 UTF-8，但这条路径经历过一次被误判为乱码的排查，改用纯 ASCII 路径（例如统一放在 `C:\Users\<用户名>\project\` 下）更省事。

## 刷新策略

| 触发 | 强制 | 说明 |
|---|---|---|
| 组件挂载 | 是 | 立即取一次 |
| 窗口获得焦点 | 否 | 距上次读取 < 15s 则跳过（防 Alt-Tab 连打接口） |
| 每 5 分钟 | 否 | 兜底心跳 |

每次轮询都是一次真实请求：客户端 → 本机 host → DeepSeek 平台 `get_user_summary`。官方账号页**不轮询**（仅在打开、登录、重连时读），本插件比它更主动，这是刻意换取"常驻可见"的代价。

## 已知风险

1. **全部依赖内部扩展点**：插槽名、`remote.<ns>` 命名约定、`window.__ModuleLoader__`、`getBalance` 返回结构，都不是稳定的公共 API，DSH 升级后可能失效。当前验证版本：`0.2.0-rc.2`（桌面端构建 `0.2.0-rc.2-04f392c`）。
2. **`CLIENT_VERSION` 仍是常量**：编译产物会把 `DSH_CLIENT_VERSION` 内联进客户端包，纯 JS 包做不到，所以 `client.js` 里的 `clientVersion()` 先读 `globalThis.DSH_CLIENT_VERSION`、再读 `window.__DSH_BOOT__.clientVersion`，都取不到才回退到常量 `'0.2.0-rc.2'`。**每次升级 DSH 后请同步该常量**，否则账号请求会带上过期身份。
3. **余额格式化是复刻**平台规则（两位小数、正数截断到分、正数不足一分显示 `<X.01`），没有复用官方实现（官方用 big.js，浏览器模块表里不一定可用）。
4. 插件不接触任何 token；余额经 App 自身的已认证 Remote 读取。
5. **包内文档与代码一律用占位路径**（`C:\Users\<用户名>\project\...`、`<用户目录>\.dsh\...`、`github.com/example-user/...`）。不要把自己的工作区真实路径、目录名或个人主页地址写回来；本机-专属的备注留在仓库根、已被 `.gitignore` 忽略的 `.local-notes.md` 里。

## 发布到 GitHub / npm 的清单

依据官方 [打包与安装插件](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/user/develop/basic/publish.zh.md?plain=1)：

- [x] 包名改为可发布的 `dsh-plugin-sidebar-balance`（`@local/*` 不可发布；原名被 npm 占用，见下）
- [x] 加 `files` 字段（`index.js`、`client.js`、`cordis.patch.yml`、`icon.svg`、`locale/*.json`、两个 README、`NOTES.zh.md`、`LICENSE`）
- [x] 加 `LICENSE`（MIT）
- [x] 加 `README.md` / `README.zh.md`（含风险声明与适配版本）
- [x] 加 `repository` 字段（`url` 指向实际远端 `github.com/quasimodoo/dsh-sidebar-balance`；包已在仓库根，无需 `directory`）
- [x] 加 `locale/zh.json`、`locale/en.json` 的 `meta.title` / `meta.description`
- [x] 加 `exports` 的 `./package.json` 与 `./locale/*.json`（展示元信息读取走 Node exports，缺了就读不到卡片标题）
- [x] `CLIENT_VERSION` 改为「运行时优先、常量兜底」
- [x] `icon.svg`：`package.json` 顶层写 `"icon": "./icon.svg"` 并加进 `files`；36×36 viewBox、复用内置组合包的青蓝渐变（`#58BCC8`→`#658EFF`→`#4A65E8`）。缺省时管理器用默认插画
- [x] ~~npm 发布前改名~~ 已改名：`package.json` → `dsh-plugin-sidebar-balance`，`client.js` 的 Loader id、`cordis.patch.yml` 的 `name:`、两个 README 与 LICENSE 同步。**尚未 `npm publish`**（`repository.url` 是实际远端，无需改）

### npm 名字冲突（实测，已通过改名解决）

`registry.npmjs.org/dsh-sidebar-balance` 返回 200：已有 `0.1.0` / `0.1.1` 两个版本，属主 `zck2046`，是另一个 DSH 余额插件（`github.com/zhouchengke2046/dsh-sidebar-balance`；它挂在 `settings.trigger` 槽、另带 OpenCode Go 用量）。原来的包名与其**完全相同**，因此：

- 本包不可能发布到那个名字；用户执行 `dsh plugin add dsh-sidebar-balance` 装到的是**别人的**插件，不是本包。
- 改为 `dsh-plugin-sidebar-balance`（生态惯例前缀，实测 404 可用）后这个问题消失。
- 改名同步了四处：`package.json` 的 `name`、`client.js` 里 `window.__ModuleLoader__.load({ id })`（**必须等于包名**）、`cordis.patch.yml` 的 `name:`，以及 profile 的依赖键与 `dsh.profile.bundles` 条目。
- **仓库名仍是 `dsh-sidebar-balance`**（`repository.url`、两个 README 的 Releases 链接都指向它），包名与仓库名不一致是刻意的：改仓库名会打断已有链接，且 `github:<用户>/<仓库>` 安装用的是仓库名。
- 装机路径不受注册表影响：GitHub、tarball、本地路径安装都不查注册表。

包在仓库根，`pnpm pack` 打进去的就是根目录这一份（`README.md` / `README.zh-CN.md` / `NOTES.zh.md` / `CHANGELOG.md` 都在 `files` 里）。

**npm 页面用哪份 README 由文件名排序决定**：注册表取清单里排在最前的那一个。原来中文版叫 `README.zh.md`（排在 `README.md` 之前），于是 **npm 页面长期显示中文**给所有人——包括英文用户；1.0.1 起中文版改名 `README.zh-CN.md`，`README.md` 才是页面。**改文件名的修正无法在已发布的版本上生效**（版本内容不可变），必须发新版本。

### npm 发布操作手册（本机实测）

包名在 npm 上**未被占用**：`npm view dsh-plugin-sidebar-balance` 返回 `E404`（真实请求，说明注册表可达且该名字自由）。发布前状态：

- `npm whoami` 返回 `ENEEDAUTH` —— 本机还没登录过 npm，`~/.npmrc` 不存在；
- 打包内容实测 12 个文件：`CHANGELOG.md`、`client.js`、`cordis.patch.yml`、`icon.svg`、`index.js`、`LICENSE`、`locale/{en,zh}.json`、`NOTES.zh.md`、`package.json`、`README.md`、`README.zh-CN.md`（1.0.0 时该文件还叫 `README.zh.md`）；
- `package.json` 已带 `publishConfig`（`access: public`、`registry: https://registry.npmjs.org/`）与 `engines.node >= 18`，无需额外开关。

发布步骤（本机实测走通的顺序）：

```sh
cd <工作区>
npm view dsh-plugin-sidebar-balance version   # 首次发布前应为 E404（本机确认过）
# 把 granular token 写进 ~/.npmrc 的那一行（见下），然后在 DSH 会话里就能发：
npm whoami                                    # 本机打印 swordd
npm publish                                   # 本机 1.0.0 / 1.0.1 都用这条发成功
npm view dsh-plugin-sidebar-balance dist-tags versions time --json   # 发布后核对
```

**实测踩到的坑（2026-10 本机）**：先用 `npm login`（网页授权）登录，`npm whoami` 正常，但 `npm publish` 被拒：

```
npm error code E403
npm error 403 Forbidden - PUT https://registry.npmjs.org/<包名>
npm error Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

这不是包的问题，而是 npm 现在的**发布时强制 2FA**策略：`npm login` 走网页授权拿到的是「可绕过 2FA」的会话令牌，而这类令牌**不允许直接发布**（登录时 npm 自己也会打印一句 *npm tokens that bypass 2FA are being restricted for account changes and direct publishing*）。

**注意：只加 `--otp=<验证码>` 并不能解决**——实测加了 `--otp` 后报错与不加完全一字不差，说明网页登录写入的 `~/.npmrc` 令牌与 `--otp` 这条路不兼容（令牌类型先被否掉，验证码根本用不上）。两条真正可行：

1. **换成自己生成的 granular access token（本机最终采用，实测可用）**：npm 网站 → Access Tokens → Generate New Token → **Granular Access Token**，勾 **Bypass two-factor authentication (2FA)**，权限 **Read and write (publish and stage)**，packages 选 **All packages** 或只勾本包；**Organizations 权限要选 No access**，否则因为「给了组织权限却没选组织」被表单拦住。生成后用新令牌**替换** `~/.npmrc` 里的 `_authToken` 行（`npm login` 留下的那条要删掉，只留一条）。
2. **改用经典登录**，让 npm 在发布时主动索要验证码：删掉 `~/.npmrc` 的 `_authToken` 后 `npm login --auth-type=legacy`，再 `npm publish`。

**时间线（趁早规划）**：Bypass-2FA 令牌的**直发**能力会在 **2027 年 1 月**被移除（npm 生成页上的黄条原文：*The ability to publish new versions directly with a granular access token will be removed in January 2027*，并建议改用 *Read and write (stage only)* + 发布时补一次 OTP，或改用 Trusted Publishing）。也就是说上面第 1 条只能用到 2027-01；到期后改用 Trusted Publishing，或 stage-only 令牌 + `npm stage publish` 后再走完发布。

### 发布后的实测情况（1.0.0 / 1.0.1）

- 注册表核对：`dist-tags.latest = 1.0.0`，`versions = ["0.0.0-stage", "1.0.0"]`，`dist.shasum`/`dist.integrity` 与 `npm publish` 输出一致，`maintainers = swordd`；
- 端到端验收：在临时目录 `pnpm add dsh-plugin-sidebar-balance`，装到的是 `1.0.0`，11 个预期文件齐全，`client.js` 的 Loader id、`cordis.patch.yml` 的行名、`icon` 与 `dsh.bundle` 都正确——**按包名安装这条路是通的**；
- **包里多出一个 `0.0.0-stage`**：这是 npm 的 *staged publishing* 占位版本（描述为 `Temporary package placeholder for staged publishing`，2 个文件 348 字节，创建时间比 1.0.0 早 34 秒，应该是网页上误触了 *Staged Packages* 流程）。它排在 `latest` 之外、不影响 `dsh plugin add`，但会让注册表上出现一个无意义的版本号；72 小时内可 `npm unpublish dsh-plugin-sidebar-balance@0.0.0-stage` 清掉。
- **页面 README 由文件名排序决定**，见上一节；`README.zh.md` → `README.zh-CN.md` 这个修正只能靠发新版本体现。

认证方式与开关见 npm 官方文档：[Requiring 2FA for package publishing and settings modification](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)、[Creating and viewing access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/)，以及收紧公告 [Restricting npm bypass-2FA granular access tokens](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)。

发布后：

```sh
npm view dsh-plugin-sidebar-balance version dist.tarball
git tag v1.0.0 && git push origin v1.0.0      # 顺手打标签
dsh plugin --profile <名字> add dsh-plugin-sidebar-balance   # 换个 profile 实测一次
```

注意：

- **首次发布即认领名字**，之后只有你的账号能发同名包；
- 发错了：72 小时内可 `npm unpublish <包名>@<版本>`，超时后只能发补丁版本并 `npm deprecate` 旧版本；
- **但 unpublish 需要另一类凭据**：实测用发布用的 bypass-2FA granular token 执行 `npm unpublish` 会被拒（`Granular access tokens that bypass two-factor authentication may not perform this action`）——npm 把删除已发布版本归为账户级破坏性操作。可行做法是另开一个终端用 `npm login --auth-type=legacy`（会提示 `Enter OTP:`，需要账号已绑定认证器）后执行；该次登录会往 `~/.npmrc` 写入另一个同名 `_authToken` 键，**会覆盖 granular token**，删完记得换回来；
- **`npm login --auth-type=legacy` 一定会要 OTP**，即使你认为账号没开 2FA——npm 对 CLI 密码登录本身强制 2FA。想确认账号状态就跑 `npm profile get`，看 `two-factor auth` 一栏；
- 以后每次发版：`package.json` 提版本 → 更新 `CHANGELOG.md` → `npm publish` → 打 `v<版本>` 标签推送；
- `npm pack --dry-run` 是发布前的最后一道校验，确认文件清单没有意外增删；
- 版本号只覆盖本包：DSH 升级后即使本包一行没改也需要发新版本，`CHANGELOG.md` 里逐版本记录验证过的 DSH 构建。

## 后续待办

1. ~~迁移源码到新工作区~~ 已完成：包直接在仓库根。
2. ~~修正 profile 指向~~ 已完成（本机）：`<用户目录>\.dsh\profiles\desktop\package.json` 的依赖改成 `"dsh-plugin-sidebar-balance": "link:<工作区绝对路径>"`（Windows 写法如 `link:C:/Users/<用户名>/project/dsh-plugin-sidebar-balance`），`dsh.profile.bundles` 同步，并在 profile 目录内重跑 `pnpm install`；改动前的 `package.json` / `pnpm-lock.yaml` 以同目录 `*.bak-<时间戳>` 备份。验证方式：从 profile 目录 `require.resolve('dsh-plugin-sidebar-balance/client')` 应指向工作区文件。**改完必须刷新页面**才会加载新的客户端模块。若要退回冻结副本，把依赖换回 `file:<tarball 绝对路径>` 再 `pnpm install` 即可。
3. **包必须留在仓库根**：`dsh plugin add github:<用户>/<仓库>` 把**仓库根**当成依赖安装。早期把包放在 `packages/dsh-sidebar-balance/` 时实测会得到一条警告——`declares no dsh.bundle — installed as a plain dependency, not a profile layer`——即根目录没有清单、插件永远不会激活。单包仓库摊平到根是唯一可靠的布局；多包仓库要走 npm 或 tarball 分发。
4. ~~完成上面的发布清单~~ 命名问题已解决（改名 `dsh-plugin-sidebar-balance`，见上一节）。**下一步：执行 npm 发布**，命令见上一条的「npm 发布操作手册」——本机尚未 `npm login`，这一步必须在自己终端里做（交互式授权在 DSH 会话里跑不了）。
5. `git init` + 首次提交已完成，`main` 已推到 `github.com/quasimodoo/dsh-sidebar-balance`（含图标与改名提交）。后续 `gh` CLI 未安装，远端操作需在网页或用本机 git 完成。**发布 npm 后记得 `git tag v1.0.0 && git push origin v1.0.0`。**
6. **旧的插件目录与旧 tarball 都可以删**：`<旧插件目录>` 已不再被任何地方引用；`C:/File/project/dstools/dsh-sidebar-balance-1.0.0.tgz` 在 profile 改成 `link:` 之后也不再被引用，可以删。如果迁移时把源码复制（而不是移动）到了新工作区，旧副本会连同原目录的权限一起被带过来，可能删不掉——那种情况下用管理员权限删除，或把会话切到完全权限后再处理。同理，**工作区根上的 `Everyone: Deny DeleteSubdirectoriesAndFiles` 会继承给子目录**，标准权限修复脚本按设计只补允许项、不动拒绝项。
7. **本会话实测：DSH 沙箱禁止写入工作区的 `.git` 目录**（连 `git commit` 需要的 `.git/index.lock` 都建不了，`git status` 也会因读不到而报 `not a repository`）。同一轮里工作区根目录曾出现 `SetNamedSecurityInfoW failed (Win32 5): grantWrite` —— 即沙箱无法为工作区授予写入权限，此时连列目录都会失败；用随包提供的 Windows 权限诊断脚本修好根目录后，普通文件读写恢复，但 `.git` 依然被拒。**提权运行 `git add/commit` 是可行的绕过方式**，但不要把它当成常态。
8. **网络实测（本机）**：`npm view` / `registry.npmjs.org` 可达（受限模式与提权模式都试过，`npm view dsh-plugin-sidebar-balance` 正常返回 404）；`api.github.com`（普通 HTTPS）在提权模式下可达，但**同一个 pnpm/npm 进程之外的 Git 流量被重置**——`git ls-remote origin` 报 `Recv failure: Connection was reset`，尽管远端用浏览器/网页访问一切正常。所以 **`git push` 与 `npm login` 这类交互式/长时间连接的操作，交给本机终端做最稳**。

