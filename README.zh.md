# dsh-sidebar-balance

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 插件：在左侧边栏底部、账号入口正上方显示已登录账号的 DeepSeek 余额。

```
余额                    ¥12.34 +¥2.00
```

- 主数字 = 充值余额（`normal_wallets`）
- `+¥2.00` = 赠金余额（`bonus_wallets`），仅当 ≥ ¥0.01 时显示
- 悬停提示分别列出充值、赠金与合计；侧边栏折叠成 56px 导轨时隐藏赠金

数据来自官方账号页所用的同一个 Application Remote，因此始终与 设置 → 账号与余额 一致。

## 安装

最可靠的渠道是 **tarball**：不需要 git、不需要 SSH key、不需要代理、也不需要 registry。

```sh
pnpm pack                                                              # 生成 dsh-sidebar-balance-1.0.0.tgz
dsh plugin --profile <名字> add ./dsh-sidebar-balance-1.0.0.tgz        # 然后安装
```

```sh
dsh plugin --profile <名字> add github:quasimodoo/dsh-sidebar-balance  # 从本仓库
dsh plugin --profile <名字> add https://github.com/quasimodoo/dsh-sidebar-balance.git  # 同上，显式 HTTPS
```

桌面端也可以用 **侧边栏 →「插件」→「添加插件」**，它接受「包名 / Git 地址 / 压缩包 / 本地绝对路径」。那个对话框里的 npm 源选择只影响依赖下载；本包不从 registry 拉任何东西，所以选哪个源都可以。

按包名安装（`dsh plugin --profile <名字> add dsh-sidebar-balance`）**目前不可用**：npm 上这个包名属于另一个无关项目。见[分发渠道](#分发渠道)。

本包是纯 JavaScript，没有构建步骤也没有 `prepare`，所以 Git 安装既不需要 `allowBuilds` 授权，也不依赖构建产物。

安装或更新客户端半侧后**必须刷新页面**（Ctrl+R）：浏览器模块表在页面加载时组装进 `window.__DSH_BOOT__`，而没有 `pnpm run dev:web` 时 client-hmr 那条链是空转的。

profile 的 `link:` 路径请保持 ASCII。含 `×` 或中文目录名的路径曾出现过被按字节误读的排查过程，统一放在 `C:\Users\<用户名>\project\` 这类纯 ASCII 路径下可以完全避开这件事。

## 分发渠道

| 渠道 | 用户的命令 | 状态 |
|---|---|---|
| Tarball（`pnpm pack`） | `dsh plugin --profile <名字> add ./dsh-sidebar-balance-1.0.0.tgz` | **已端到端验证。** 不碰 git、不碰 registry、不需要代理。文件约 15 KB，建议挂到 GitHub Release 上给用户一个直接下载链接。 |
| Git 仓库 | `dsh plugin --profile <名字> add github:<用户>/<仓库>` | 已验证包能装上并激活。取决于用户的 git 网络与凭据：pnpm 可能用 SSH 解析远端（需要 key），也可能用 HTTPS（需要能连 443）。 |
| npm | `dsh plugin --profile <名字> add <包名>` | **卡在包名上。** `dsh-sidebar-balance` 在 npm 上已存在（`latest` 0.1.1，无关项目），要发布得换名或使用 scope，例如 `@<用户>/dsh-sidebar-balance`。 |

为了让插件管理器能正确安装，本仓库遵守两条打包规则：

- **包必须留在仓库根。** `dsh plugin add github:<用户>/<仓库>` 把仓库根当成依赖安装；早期把包放在 `packages/` 里，实测得到 `declares no dsh.bundle — installed as a plain dependency, not a profile layer`——也就是插件永远不会激活。
- **Git 安装不需要构建授权。** 没有 `prepare`、没有构建产物，因此不需要 `allowBuilds` 条目。

> 如果你 fork 了这个仓库，发布前请把 `package.json` 里的 `repository.url` 改成自己的地址。

## 刷新策略

| 触发 | 强制 | 说明 |
|---|---|---|
| 组件挂载 | 是 | 立即取一次 |
| 窗口获得焦点 | 否 | 距上次读取 < 15s 则跳过，防止 Alt-Tab 连打接口 |
| 每 5 分钟 | 否 | 兜底心跳 |

每次轮询都是一次真实请求：浏览器 → 本机 Host → DeepSeek 平台 `get_user_summary`。官方账号页完全不轮询；本插件比它更主动，这是刻意换取「常驻可见」的代价。

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
├── client.js           # Client 半侧：侧边栏那一行
├── locale/{en,zh}.json # 插件管理器卡片标题与描述
├── NOTES.zh.md         # 实证内幕与已知风险
└── README.md / README.zh.md
```

包刻意放在仓库根：`dsh plugin add github:<用户>/<仓库>` 装的是**仓库根**这个依赖，如果把包嵌在
`packages/` 子目录里，装到的会是一个没有清单的目录，插件永远不会激活。

本机-专属的备注（真实路径、profile 备份、作者信息）保存在 `.local-notes.md`，它被 Git 忽略、也不会
发布；本文档一律使用占位路径。

## 许可证

[MIT](LICENSE)
