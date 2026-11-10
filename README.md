# dsh-profile-config

本机 DSH（DeepSeek Harness）运行时的**配置快照**：profile 组合、压缩策略与启动脚本。
目的是让这些原本散落在 `~/.dsh` 下、没有任何版本历史的文件，改动有据可查、可回滚、可迁移到另一台机器。

## 收录范围

| 路径 | 来源 | 作用 |
| --- | --- | --- |
| `start-dsh.bat` | `~/.dsh/start-dsh.bat` | web profile 启动脚本：日志追加 + 10 MB 轮转 + V8 堆上限 |
| `profiles/web/cordis.patch.yml` | `~/.dsh/profiles/web/cordis.patch.yml` | 宿主侧全部补丁：压缩策略、模型路由、preset 覆盖、插件配置 |
| `profiles/web/package.json` | `~/.dsh/profiles/web/package.json` | profile 依赖与 bundle 列表 |

## 不收录

- `sessions/` —— 会话数据，体积大且属隐私
- `node_modules/`、`storages/`、`logs/` —— 派生物
- 任何凭据：`cordis.patch.yml` 里只放 `apiKeyEnv` 之类的**环境变量引用**，真实的 key 走 `.env` 或环境变量
- 其它插件自己的状态目录（`our-free-model/`、`workbuddy-vault/` 等）

## 本机当前关键配置（以便判断这份快照代表什么状态）

- 运行版本：`0.2.0-rc.2`（源码启动，`apps/cli/lib/bin.js`）
- 压缩目标：`codearts/deepseek-v4.1-flash-1017`（显式指定；不再跟随会话模型）
- 保留策略：`thresholdRatio: 0.7` / `retainRatio: 0.15`（三处 preset 一致）
- 工具结果剪枝：`thresholdChars: 2048` / `headChars: 1024` / `tailChars: 512`
- 启动脚本：`--max-old-space-size=2048`，日志 `dsh-boot.log` 追加、超 10 MB 轮转为 `dsh-boot.prev.log`

## 恢复到一台新机器

1. 装好 DSH 源码检出，`pnpm install`。
2. 把本仓的 `profiles/web/*` 覆盖到 `~/.dsh/profiles/web/`，`start-dsh.bat` 覆盖到 `~/.dsh/`。
3. 在该 profile 目录跑 `pnpm install` 补齐依赖（注意 `package.json` 里的 `link:` 条目指向本机绝对路径，需改成新机器的路径）。
4. 按当时版本决定是否把 `{{cwd}}` 用法迁移到 `working_directory` —— DSH ≥ 0.2.1 的提示词模板不再提供 `{{cwd}}`，未解析的占位符会让请求在发出前失败。

## 注意

`cordis.patch.yml` 含个人化内容（persona 文本、本机绝对路径、插件清单），**建议仓库保持私有**。