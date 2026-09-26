# profile-web node_modules 补丁归档

DSH web profile（默认 `C:/Users/Administrator/.dsh/profiles/web`）依赖树中的手工补丁。每次 profile 内 `pnpm install` 都会还原原始文件，必须重新应用。

## 用法

```sh
node patches/profile-web/apply.mjs --check    # 只检查
node patches/profile-web/apply.mjs            # 应用补丁
node patches/profile-web/apply.mjs --shims    # 同时恢复 file: shim 包
node patches/profile-web/verify-source-kinds.mjs [profileRoot]
```

`apply.mjs` 从补丁所在包的根目录执行 `git apply -p1`；已应用的补丁经反向检查后报告 `ALREADY`，不会失败。`--profile` 可指向其他 profile 根。

## 补丁一览

| 补丁 | 作用 |
| --- | --- |
| `@opencode2dsh__dsh-plugin@0.3.3.patch` | `lib/index.js`：`DEFAULT_CONTEXT_WINDOW` 262144→1048576、`DEFAULT_MAX_TOKENS` 32768→65536、`toPiModel` 增加 `compat.maxTokensField: "max_tokens"`（修复 mimo 免费模型输出 token 截断）。`lib/catalog-4gwZT9We.js`：models.dev 与 Zen 模型列表改走 `node:https`（内置 fetch 在本环境返回空响应头）。 |
| `@earendil-works__pi-ai@0.82.1.patch` | `dist/api/openai-completions.js`：OpenAI 客户端注入 `globalThis.__dshUndiciFetch`（Node 22.18 内置 undici 对外部 HTTPS 返回空响应头/二进制体）。 |
| `dsh-free-search@0.4.35.patch` | `lib/index.js`：移除对 `SettingsProvider` 的导入（0.1.7 该服务已从 Client 面移除，导入导致加载失败）。 |
| `dsh-gungnir@0.2.1.patch` | `dist/index.js`、`dist/surfaces.js`：steering/followup 的 `source.kind` 由 `'plugin'` 改为 `'plugin:gungnir'`。 |
| `dsh-loop-continue@0.2.0.patch` | `lib/index.js`：`source.kind` 改为 `plugin:${name}` 模板。 |
| `dsh-answer-reviewer@0.7.2.patch` | `lib/review.js`：`source.kind` 改为 `plugin:${PLUGIN_NAME}` 模板。已从 profile 卸载；补丁仅作归档，重新安装该包后手动应用。 |
| `dsh-quality-review@0.1.0.patch` | `lib/index.js`：`source.kind` 改为 `'plugin:quality-review'`，steer 消息增加 `id`。依赖为 `github:CAI-MH/dsh-quality-review` @ `7c5a67d`。已从 profile 卸载；补丁仅作归档，重新安装该包后手动应用。 |
| `dsh-soul@0.5.0.patch` | `index.mjs`：`source.kind` 改为 `'plugin:dsh-soul'`。已从 profile 卸载；补丁仅作归档，重新安装该包后手动应用。 |
| `dsh-engram@0.4.0.patch` | `lib/context-gc.js`：`source.kind` 改为 `'plugin:dsh-engram'`。 |

## shims/

profile 根目录 `file:` 依赖的完整快照（非 diff，源码即安装态）：

- `settings-scope-shim`（`dsh-settings-scope-shim`）：恢复 0.1.7 从 Client 面移除的 `settingsScope` 服务，使 dsh-loop-continue 等插件卡片可激活。
- `fetch-shim`（`dsh-fetch-shim`）：用 profile 的 undici 8.11 替换 Node 22.18 内置 `globalThis.fetch`，并发布 `globalThis.__dshUndiciFetch`。

## 构建与校验

- `build.mjs`：把 harvest 产出的绝对路径 diff 规范化为包相对 `a/` `b/` 头并按包合并。用法：`node build.mjs [diffsDir]`。
- `harvest.mjs`：`npm pack` 拉取原始包并生成 diff（需要网络）。
- `manifest.json`：`apply.mjs` 消费的包清单。
- `verify-source-kinds.mjs`：校验 7 处 source-kind 标记，并全树扫描旧式 `kind: 'plugin'` 字面量（期望 0）。
