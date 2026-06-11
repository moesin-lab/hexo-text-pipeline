[English](README.md) | **简体中文**

# hexo-text-pipeline

Hexo 渲染管线的通用 hooks 总线。

Hexo 渲染过程中所有"文本进、文本出"的执行点都被暴露为 stage。你用纯声明式配置往 stage 上挂东西——自己的脚本、shell 命令、或打包好的 preset。checker 系统全程兜底：配置错误在第一篇文章被处理之前就被发现，单个节点失败只会被跳过，构建永远不炸。

设计目标：绝大多数小型 Hexo 插件做的事，本质都是"在管线的某个点变换一段文本"。这不该需要写插件、发包——一段脚本加一行配置就该够了，而且改完脚本下一次渲染就生效，即改即用。

```yaml
text_pipeline:
  presets:
    - obsidian                       # 打包好的 node 集（"插件的插件"）
  hooks:
    - script: scripts/lazy-img.js    # 你的 JS：module.exports = (text, ctx) => text
      stage: after_post_render
    - command: python scripts/furigana.py   # 任何语言：stdin 进，stdout 出
      stage: before_post_render
      priority: 20
```

## Stage 表

| Stage | 流经的文本 |
|-------|-----------|
| `before_post_render` | 单篇文章的 **markdown**（渲染前） |
| `after_post_render` | 单篇文章的 **HTML 片段**（渲染后） |
| `after_render:html` | 模板套完后的**完整页面 HTML** |
| `after_render:css` / `after_render:js` | 生成的静态资源 |

与 [Hexo filter API](https://hexo.io/api/filter) 一一对应。非文本的 filter（`template_locals`、`server_middleware` 等）刻意不在范围内。

## 三种挂载方式

**1. 本地脚本** —— `module.exports = (text, ctx) => text`，相对 Hexo 根目录解析，每次执行重新加载。改完文件，下一次渲染就生效。不用重启，不用安装。

```yaml
hooks:
  - script: scripts/minify.js
    stage: after_render:html
```

**2. 外部命令** —— 正文从 stdin 进，变换结果从 stdout 出，任何语言。上下文走环境变量 `HTP_STAGE` / `HTP_POST_SOURCE` / `HTP_POST_PATH` / `HTP_POST_TITLE`。

```yaml
hooks:
  - command: python scripts/furigana.py
    stage: before_post_render   # 默认 stage
    name: furigana              # 可选，日志标识
    priority: 20                # 可选，默认 10，小者先跑
    timeout: 10000              # 可选，毫秒
    match: '\\{furigana'        # 可选正则：文本不命中直接跳过（command 可省一次 spawn）
```

**3. 程序化注册** —— 其他插件（或站点 `scripts/` 目录里的脚本）可以直接注册 node：

```js
hexo.textPipeline.register({
  name: 'exclaim',
  stage: 'before_post_render',
  priority: 5,
  convert: (text, ctx) => text + '!'
});
```

`ctx` 为 `{ hexo, post, stage, config, presetConfig, pluginConfig, utils, log }`；`ctx.utils` 自带 `replaceOutsideCode` / `segmentInlineCode`，在 markdown 阶段做行内替换时安全跳过代码块。

### 执行顺序

同一 stage 内按 `priority` 升序执行（默认 10），同级按注册顺序（preset 先于 hook 加载）。`hexo pipeline` 会打印最终解析出的精确顺序，永远不用猜。

## Checker 系统（兜底）

1. **注册期静态检查**——在任何文章被处理之前：未知配置键（带 did-you-mean 建议）、非法 stage、node 重名、priority 类型错误、脚本文件缺失、不同来源的 node 共享同一 priority 的顺序歧义提示。
2. **运行期防护**——每次执行都过守卫：抛错或返回非字符串的 node 被跳过并告警，原文继续流向下一环；连续失败 3 次的 node 整轮熔断；可疑输出（非空输入被清空、体积膨胀 20 倍）会被标记但放行。
3. **`hexo pipeline` 诊断命令**——打印每个 stage 解析后的 node 顺序（priority + 来源）和全部检查结果，冲突在部署前就能看见。

默认策略是 warn-and-skip：构建永远不会因为一个坏 hook 失败。`strict: true`（给 CI 用）则把配置错误和节点失败变成构建失败。

## 开发 hook（调试模式）

两个工具回答"我的 hook 在这个 stage 到底收到什么"：

**`hexo pipeline --dry-run source/_posts/x.md`**——对单个文件跑 `before_post_render` 链，逐 node 打印效果（跳过 / 无变化 / 变更行级 diff / 失败），不生成任何东西。

**tap（管线抽头）**——在真实 `hexo generate` / `hexo s` 过程中，把每个 stage 流过的文本落盘成快照：

```yaml
text_pipeline:
  tap:
    enable: true
    match: my-post        # 强烈建议设置：只抓匹配的文章/页面
    dir: .text-pipeline-tap
```

```
.text-pipeline-tap/_posts_my-post.md/after_post_render/
├── 00-input.txt              ← 挂在该 stage 的 hook 收到的就是这个
├── 01-obsidian_mdlink.txt    ← 每个改动了文本的 node 改完后的样子
└── 02-hook_my-hook.txt       ← 最后一个文件即该 stage 的最终输出
```

每轮渲染替换上一轮快照。tap 目录记得加进 `.gitignore`，正常构建时关掉 `enable`。

## 内置 preset：`obsidian`

把 Obsidian Flavored Markdown 编译为 Hexo 友好输出。`presets: [obsidian]` 启用。

| Node | 语法 | 默认 | 行为 |
|------|------|------|------|
| `comment` | `%%行内%%`、跨行 `%% … %%` | 开 | 渲染前剥离（代码内为字面量） |
| `wikilink` | `[[目标#锚点\|别名]]` | 开 | 重写为文章永久链接（`abbrlink` 优先，回退 `post.path`） |
| `mdlink` | HTML 里残留的 `.md` 链接 | 开 | 兜底重写为文章永久链接 |
| `mermaid` | ` ```mermaid ` 围栏块 | 开 | 换成 `<pre class="mermaid">` 绕开语法高亮；按需注入懒加载 CDN 脚本 |
| `callout` | `> [!type] 标题` | **关** | `<div class="callout callout-type">`；主流渲染器/主题已多自带支持，所以默认关 |

```yaml
presets:
  - name: obsidian
    config:
      domain_prefix: ''                  # wikilink/mdlink 的链接前缀
      callout: { enable: true }          # 按需打开
      mermaid: { theme: dark, priority: 15 }   # 任意 node：子配置 + priority 覆盖
```

## 安装

```bash
npm install hexo-text-pipeline --save
```

## 完整配置参考

```yaml
text_pipeline:
  enable: true       # 总开关
  debug: false       # 详细日志
  strict: false      # 配置错误 / 节点失败让构建失败（CI 用）
  inject_css: true   # node 的默认样式（如 callout）
  inject_js: true    # node 的前端脚本（如 mermaid 加载器）
  presets: []        # 内置名 | npm 包 | ./本地路径 | { name, config }
  hooks: []          # { script | command, stage, priority, name, timeout, match, enable }
  tap:               # 调试模式：落盘每个 stage 的文本快照（见"开发 hook"）
    enable: false
    match: ''
    dir: .text-pipeline-tap
```

## 开发

零运行时依赖，Node >= 16。

```bash
npm test   # node --test
```

- 架构、stage 表、node 契约：[docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md)
- 扩展指南：hook vs preset node vs 新 preset：[docs/EXTENDING.zh-CN.md](docs/EXTENDING.zh-CN.md)

## 许可证

MIT
