# dsh-plugin-sidebar-balance

中文 | [English](README.en.md)

[DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 插件：在左侧边栏底部、账号入口正上方显示已登录账号的 DeepSeek 余额。

```
余额                    ¥12.34 +¥2.00
```

- 主数字 = 充值余额（`normal_wallets`）
- `+¥2.00` = 赠金余额（`bonus_wallets`），仅当 ≥ ¥0.01 时显示
- 悬停提示分别列出充值、赠金与合计；侧边栏折叠成 56px 导轨时隐藏赠金

数据来自官方账号页所用的同一个 Application Remote，因此始终与 设置 → 账号与余额 一致。

## 安装

### 在 App 里装

1. 打开 **侧边栏 →「插件」→「添加插件」**；
2. 填入包名 **`dsh-plugin-sidebar-balance`**，确认；
3. 安装完成后**刷新页面**（Ctrl+R）。

这个入口是官方且事务性的：它自己写 profile 的依赖与组合包列表、跑安装、必要时提示重启。对话框也接受 Git 地址、压缩包和本地绝对路径——如果填包名走不通（例如那台机器连不上 npm），就改用下一节的任意一种。

### npm（一条命令）

```sh
dsh plugin --profile <名字> add dsh-plugin-sidebar-balance
```

本包是纯 JavaScript，没有依赖、没有构建步骤、没有 `prepare`，所以不会编译任何东西，除包本身外也不从 registry 下载任何内容。

### 从本仓库装（一条命令，不碰 registry）

```sh
dsh plugin --profile <名字> add github:quasimodoo/dsh-sidebar-balance
```

Git 安装取的是**源码**而不是构建产物——这里恰好无所谓，因为没有东西需要构建。如果简写走了 SSH 而你的网络挡了 22 端口，改用显式地址 `https://github.com/quasimodoo/dsh-sidebar-balance.git`。

### 装完之后

**刷新页面**（Ctrl+R）：浏览器模块表在页面加载时组装进 `window.__DSH_BOOT__`，而没有 `pnpm run dev:web` 时 client-hmr 那条链是空转的。余额会出现在侧边栏底部、账号入口正上方。如果那一行显示 `—` 加一段原因码，悬停它，并到控制台看 `[sidebar-balance]` 的诊断信息。

如果这次装的是**改了包名的新包**（而不只是同一个包的新版本），还需要重启 App：Host 侧的加载器行是启动时组装的。

以后升级：用同样方式安装新版本即可覆盖旧版本。

如果安装报 `EPERM: operation not permitted, rename`，说明旧的一份仍登记在 profile 里、且 App 占着该目录。先卸载旧条目，或**完全退出 App**（含托盘图标）后用命令行安装：

```sh
dsh plugin --profile desktop add dsh-plugin-sidebar-balance
```

## 余额是怎么来的、多久更新一次

### 取数链路

余额不是插件自己去调某个接口，而是**把 App 已有的那条已认证 Remote 通道再读一次**：

```
侧边栏组件（client.js）
   │  ctx.remote.account.getBalance({ version, locale, timezoneOffsetSeconds })
   ▼
App 的 Remote 网关（浏览器 ↔ 本机 Host 的同源通道）
   │  account/getBalance
   ▼
DeepSeek 平台  /api/v0/users/get_user_summary
   │  { status, value: normal_wallets[], bonusWallets: bonus_wallets[] }
   ▼
插件取 CNY 钱包 → 主数字；取 bonus_wallets → “+¥X.XX”（≥ ¥0.01 才显示）
```

要点：

- **和「设置 → 账号与余额」读的是同一个方法、同一份数据**，所以两处不应出现不一致；官方账号页打开时也会读它。
- **请求带的身份**：`version`（客户端版本，优先取运行时注入的 `DSH_CLIENT_VERSION`，取不到才回退到 `client.js` 里的常量）、`locale`（由浏览器语言决定 zh / en）、`timezoneOffsetSeconds`（本机时区偏移）。这些由 Host 侧补齐，插件本身不构造 HTTP 请求。
- **插件不接触任何 token**：没有密钥、没有 Cookie、没有自建网络请求，全部走 App 自身的已认证通道；插件拿到的只是钱包数组里的十进制字符串。
- **币种**：按钱包数组里第一个条目的币种显示（CNY → `¥`，USD → `$`）。若只有赠金钱包，则用赠金的币种。
- **格式化**是复刻平台规则：两位小数、正数截断到分、正数不足一分显示 `<¥0.01`。官方实现用 big.js，插件没有复用它。

### 刷新时机

| 触发 | 是否强制绕过节流 | 说明 |
|---|---|---|
| 组件挂载 | 是 | 打开/刷新页面后立刻取一次 |
| 窗口获得焦点 | 否 | **距上次读取不足 15 秒则跳过**，防止 Alt-Tab 连打接口 |
| 每 5 分钟 | 否 | 兜底心跳，保证长时间挂着也会跟上游变化 |

- **没有手动刷新按钮**：想让数字立刻变化，切走再切回来（超过 15 秒）或直接刷新页面。
- **每次刷新都是一次真实请求**：浏览器 → 本机 Host → DeepSeek 平台 `get_user_summary`。官方账号页**完全不轮询**（只在打开、登录、重连时读），本插件比它主动——这是刻意换来「常驻可见」的代价。
- 读失败时**保留上一次的数字**并把它置灰，悬停显示原因（例如 `E401`、`status:…`、`no-account`），控制台另有一行 `[sidebar-balance]` 日志。
- **没有本地缓存文件**：数字只存在这个组件的内存里，随页面卸载而消失，不写入磁盘。

### 想改节奏

轮询间隔与焦点节流是 `client.js` 顶部的两个常量：`REFRESH_MS`（默认 `5 * 60 * 1000`）与 `MIN_GAP_MS`（默认 `15 * 1000`）。改完刷新页面即生效。

## 从源码安装（维护者）

自己打包，或直接安装工作区：

```sh
pnpm pack                                                              # 生成 dsh-plugin-sidebar-balance-<版本>.tgz
dsh plugin --profile <名字> add ./dsh-plugin-sidebar-balance-<版本>.tgz # 然后安装
dsh plugin --profile <名字> add ./                                    # 或直接链接这个工作区
```

`dsh plugin add github:quasimodoo/dsh-sidebar-balance` 把**仓库根**当成依赖安装，这也是包放在仓库根的原因：如果嵌在 `packages/` 子目录里，装到的是一个没有清单的目录，插件永远不会激活。

发布新版本就在这个工作区执行 `npm publish`；命令与发布前检查见 [NOTES.zh.md](NOTES.zh.md)。

profile 的 `link:` 路径请保持 ASCII。含 `×` 或中文目录名的路径曾出现过被按字节误读的排查过程，统一放在 `C:\Users\<用户名>\project\` 这类纯 ASCII 路径下可以完全避开这件事。

## 分发渠道

| 渠道 | 用户的命令 | 状态 |
|---|---|---|
| App 内添加插件 | **侧边栏 →「插件」→「添加插件」**，填包名 | **已端到端验证**（在另一台机器、另一个账号上实测成功）。不用命令行、不用管 npm 源，安装与组合包登记由插件管理器完成。 |
| npm | `dsh plugin --profile <名字> add dsh-plugin-sidebar-balance` | **首选命令行渠道**，装的是预构建好的纯 JS 包。原名 `dsh-sidebar-balance` 在 npm 上属于另一个无关项目，因此改名为 `dsh-plugin-sidebar-balance`——未被占用，也符合生态的 `dsh-plugin-*` 惯例。 |
| Tarball（`pnpm pack`） | `dsh plugin --profile <名字> add ./dsh-plugin-sidebar-balance-<版本>.tgz` | **已端到端验证，包括真的读出余额。** 不碰 git、不碰 registry、不需要代理、不需要 SSH key。适合无法访问 npm 的机器：把文件挂到 GitHub Release 上即可。 |
| Git 仓库 | `dsh plugin --profile <名字> add github:<用户>/<仓库>` | 包能装上并激活。取决于对方的 git 网络与凭据：pnpm 可能用 SSH 解析远端（需要账号上有 key），也可能用 HTTPS（需要能连 443）。若网络屏蔽了 22 端口，简写会以 `Permission denied (publickey)` 失败——改用显式 `https://` 地址，或一次性加上这两条改写规则：`git config --global url."https://github.com/".insteadOf "git@github.com:"`，以及把 `git@github.com:` 换成 `ssh://git@github.com/` 的同样一条。 |

为了让插件管理器能正确安装，本仓库遵守两条打包规则：

- **包必须留在仓库根。** `dsh plugin add github:<用户>/<仓库>` 把仓库根当成依赖安装；早期把包放在 `packages/` 里，实测得到 `declares no dsh.bundle — installed as a plain dependency, not a profile layer`——也就是插件永远不会激活。
- **Git 安装不需要构建授权。** 没有 `prepare`、没有构建产物，因此不需要 `allowBuilds` 条目。

Tarball 安装可能报 `EPERM: operation not permitted, rename .../node_modules/<包名>`：那说明已经有一份登记在 profile 里、且 App 占着该目录。先卸载旧条目，或完全退出 App（含托盘图标）后用命令行安装。

> 如果你 fork 了这个仓库，发布前请把 `package.json` 里的 `repository.url` 改成自己的地址。

## 风险

> **本包完全依赖内部扩展点。** 插槽名、`remote.<命名空间>` 服务键约定、`window.__ModuleLoader__`、`getBalance` 的返回结构都不是稳定的公共 API，DSH 升级后可能直接失效。

- 验证环境：DSH `0.2.0-rc.2`（构建 `0.2.0-rc.2-04f392c`，Windows 桌面端）。
- 本包**没有任何 `dependencies` 与 `peerDependencies`**，安装过程不涉及包自身以外的任何东西：Host 半侧不 import 任何 Harness 模块（只声明 `apply()`），Client 半侧的 React 来自浏览器模块表，没有需要包管理器解析的东西。若声明 `@deepseek-ai/dsh*` 对等依赖，还会顺带启用运行时的兼容性预检——已装 DSH 一旦不满足范围就会拒绝这一行（或要求精确版本豁免）。DSH 适配版本改由此处与 `NOTES.zh.md` 记录。
- 账号调用带有 `version` 字段。编译产物会内联 `DSH_CLIENT_VERSION`，纯 JS 包做不到，所以插件优先读取外壳暴露的全局量，取不到时回退到 `client.js` 里的 `CLIENT_VERSION` 常量。**每次升级 DSH 后请更新该常量。**
- 余额格式化是复刻平台规则（两位小数、正数截断到分、正数不足一分显示 `<X.01`）。官方实现用 big.js，不能保证浏览器模块表里有它。
- 插件不接触任何 token；余额经 App 自身的已认证 Remote 读取。
- `NOTES.zh.md` 记录了实证得到的内幕约定与编写时踩到的坑，DSH 升级后应先复查它。

## 目录

```
.
├── package.json        # dsh.bundle + dsh.client 清单与发布字段
├── cordis.patch.yml    # 这个组合包贡献给 profile 的层
├── index.js            # Host 半侧：无需准备
├── client.js           # Client 半侧：侧边栏那一行、取数与刷新都在这里
├── locale/{en,zh}.json # 插件管理器卡片标题与描述
├── icon.svg            # 插件管理器卡片图标
├── NOTES.zh.md         # 实证内幕与已知风险
├── CHANGELOG.md        # 已发布版本，以及各版本验证过的 DSH 构建
├── README.en.md        # 英文文档
└── LICENSE
```

本文档（`README.md`）同时是 GitHub 默认说明与 npm 包页面。npm 会挑文件清单里排在最前的
README，所以另一份必须排在 `README.md` 之后（`README.en.md` 满足这一点）。

包刻意放在仓库根：`dsh plugin add github:<用户>/<仓库>` 装的是**仓库根**这个依赖，如果把包嵌在
`packages/` 子目录里，装到的会是一个没有清单的目录，插件永远不会激活。

本机-专属的备注（真实路径、profile 备份、作者信息）保存在 `.local-notes.md`，它被 Git 忽略、也不会
发布；本文档一律使用占位路径。

## 许可证

[MIT](LICENSE)
