[English](USING-PRESETS.md) | **简体中文**

# 使用 preset

preset 是打包好的一组管线 node——"插件的插件"。一条配置就能挂载整组；本文讲启用、配置和验证。（自己写 preset 见 [EXTENDING.zh-CN.md 第 3 级](EXTENDING.zh-CN.md)。）

下面所有配置都写在站点 `_config.yml`（Hexo 根目录那份，不是主题的）的 `text_pipeline:` 键下。

## 快速开始

```bash
npm install hexo-text-pipeline --save
```

```yaml
# _config.yml
text_pipeline:
  presets:
    - obsidian
```

就这些——`hexo clean && hexo generate` 后 preset 的 node 就生效了。验证：

```bash
hexo pipeline
```

会打印每个 stage 的最终 node 顺序；preset 的 node 带命名空间，如 `obsidian:wikilink`。

> 直接写在 `_config.yml` 顶层的 `presets:` 不会生效——必须嵌在 `text_pipeline:` 下。

## preset 可以来自哪里

| 写法 | 解析为 |
|------|--------|
| `obsidian` | 本包内置 preset（`lib/presets/<name>`） |
| `some-npm-package` | 站点里安装的 npm 包 |
| `./pipeline/my-preset` | 站点本地目录或文件，相对 Hexo 根目录 |

裸名字先查内置、再查 npm。加载失败的 preset 由 checker 报告并跳过（`strict: true` 时改为构建失败），其余 node 照常运行。

## 配置 preset

完整条目形态是 `{ name, config }`。`config` 里的键按含义分两层：

- **与某个 node 短名同名的键**（`callout`、`mermaid` 等）是该 node 的子配置。三个保留键控制挂载——`enable`、`slot`、`priority`——其余原样进 node 的 `ctx.config`。
- **其他所有键**是 preset 级配置，所有 node 都能通过 `ctx.presetConfig` 拿到（如 obsidian 的 `domain_prefix`）。

```yaml
text_pipeline:
  presets:
    - name: obsidian
      config:
        domain_prefix: ''                        # preset 级 → ctx.presetConfig
        callout: { enable: true }                # node 级：按需打开
        embed: { asset_prefix: /images }         # node 级子配置 → ctx.config
        mermaid: { theme: dark, priority: 15 }   # 子配置 + 挂载覆盖
```

每个 node 的 enable 解析顺序：**用户配置 > node 自带的 `enabledByDefault` > 默认开**。所以 obsidian 的 `callout`（出厂 `enabledByDefault: false`）需要上面那行显式 `enable: true`；关掉任何默认开的 node 则写 `<node>: { enable: false }`。

注意：顶层的 `plugins:` 配置节只管 `text-pipeline/` 目录里的单文件插件；preset 的 node 一律通过上面的 `presets[].config.<node>` 配置。

## 挂载位置与顺序

preset node 默认挂在每个 stage 的 **early 挂点**（它们需要 Hexo 内置 filter 处理前的原始文本），`priority` 默认 10；可在 node 子配置里用 `slot` / `priority` 逐个覆盖。配置多个 preset 时按列表顺序注册，同 stage 同挂点同 priority 时也按此顺序执行。细节见 [ARCHITECTURE.zh-CN.md](ARCHITECTURE.zh-CN.md)。

## 调试

- `hexo pipeline`——每个 stage 的最终 node 顺序 + 全部 checker 结果。
- `hexo pipeline --dry-run source/_posts/x.md`——对单个文件跑 markdown 链，逐 node 显示 diff。
- `tap` 配置——真实渲染时把流经每个 stage 的文本落成快照。见 [README](../README.zh-CN.md) 的"开发 hook（调试模式）"。

## 内置 preset：`obsidian`

把 Obsidian Flavored Markdown 编译为 Hexo 友好输出：wikilink、嵌入、注释、高亮、block id、mermaid、callout、残留 `.md` 链接。完整 node 表和各 node 配置见 [README](../README.zh-CN.md#内置-presetobsidian)。
